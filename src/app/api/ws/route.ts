import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const MESSAGE_TTL = 300; // 5 minutes

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = Redis.fromEnv();
  }
  return _redis;
}

// POST: Send a message to the room
export async function POST(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get("room");
  if (!roomId) {
    return NextResponse.json(
      { error: "Missing room parameter" },
      { status: 400 },
    );
  }

  const body = await request.json();
  const key = `room:${roomId}:messages`;
  const entry = JSON.stringify({ ...body, _ts: Date.now() });

  await getRedis().lpush(key, entry);
  await getRedis().expire(key, MESSAGE_TTL);

  return NextResponse.json({ ok: true });
}

// GET: Poll for messages since a given timestamp
export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get("room");
  const since = Number(request.nextUrl.searchParams.get("since") || "0");

  if (!roomId) {
    return NextResponse.json(
      { error: "Missing room parameter" },
      { status: 400 },
    );
  }

  const key = `room:${roomId}:messages`;
  const raw = (await getRedis().lrange(key, 0, 49)) as string[];

  const messages = raw
    .map((entry) => {
      const parsed = typeof entry === "string" ? JSON.parse(entry) : entry;
      return parsed;
    })
    .filter((m) => m._ts > since)
    .reverse(); // oldest first

  return NextResponse.json({ messages, timestamp: Date.now() });
}
