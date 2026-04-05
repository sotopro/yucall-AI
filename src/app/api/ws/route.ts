// WebSocket relay server for room-based messaging
// In production, this should be replaced with PartyKit or similar
// For now, we use a simple in-memory approach via polling with Server-Sent Events

import { NextRequest, NextResponse } from "next/server";

interface RoomData {
  messages: Array<{ data: string; timestamp: number }>;
  lastCleanup: number;
}

const rooms = new Map<string, RoomData>();

function getRoom(roomId: string): RoomData {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { messages: [], lastCleanup: Date.now() });
  }
  return rooms.get(roomId)!;
}

function cleanupOldMessages(room: RoomData): void {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  room.messages = room.messages.filter((m) => m.timestamp > fiveMinutesAgo);
  room.lastCleanup = Date.now();
}

// POST: Send a message to the room
export async function POST(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get("room");
  if (!roomId) {
    return NextResponse.json({ error: "Missing room parameter" }, { status: 400 });
  }

  const body = await request.json();
  const room = getRoom(roomId);

  room.messages.push({ data: JSON.stringify(body), timestamp: Date.now() });

  if (Date.now() - room.lastCleanup > 60_000) {
    cleanupOldMessages(room);
  }

  return NextResponse.json({ ok: true });
}

// GET: Poll for messages since a given timestamp
export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get("room");
  const since = Number(request.nextUrl.searchParams.get("since") || "0");

  if (!roomId) {
    return NextResponse.json({ error: "Missing room parameter" }, { status: 400 });
  }

  const room = getRoom(roomId);
  const newMessages = room.messages
    .filter((m) => m.timestamp > since)
    .map((m) => ({ ...JSON.parse(m.data), _timestamp: m.timestamp }));

  return NextResponse.json({ messages: newMessages, timestamp: Date.now() });
}
