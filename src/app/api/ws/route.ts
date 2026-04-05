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

  try {
    const body = await request.json();
    const key = `room:${roomId}:messages`;
    const entry = JSON.stringify({ ...body, _ts: Date.now() });

    const redis = getRedis();
    await redis.lpush(key, entry);
    await redis.expire(key, MESSAGE_TTL);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/ws error:", e);
    return NextResponse.json(
      { error: "Internal server error", detail: String(e) },
      { status: 500 },
    );
  }
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

  try {
    const key = `room:${roomId}:messages`;
    const raw = await getRedis().lrange(key, 0, 49);

    const messages = (Array.isArray(raw) ? raw : [])
      .map((entry) => {
        if (typeof entry === "string") {
          try {
            return JSON.parse(entry);
          } catch {
            return null;
          }
        }
        return entry;
      })
      .filter((m) => m && m._ts > since)
      .reverse(); // oldest first

    return NextResponse.json({ messages, timestamp: Date.now() });
  } catch (e) {
    console.error("GET /api/ws error:", e);
    return NextResponse.json(
      { error: "Internal server error", detail: String(e) },
      { status: 500 },
    );
  }
}
