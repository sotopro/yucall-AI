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
    const ts = Date.now();
    const entry = JSON.stringify({ ...body, _ts: ts });

    const redis = getRedis();
    // Use sorted set with timestamp as score for reliable range queries
    await redis.zadd(key, { score: ts, member: entry });
    await redis.expire(key, MESSAGE_TTL);

    // Trim old messages (keep last 200)
    const count = await redis.zcard(key);
    if (count > 200) {
      await redis.zremrangebyrank(key, 0, count - 201);
    }

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

    // Capture timestamp BEFORE reading Redis to avoid missing messages
    const timestamp = Date.now();

    // Fetch messages with score > since (exclusive) using sorted set
    const raw = await getRedis().zrange(key, `(${since}`, "+inf", {
      byScore: true,
    });

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
      .filter((m) => m != null);

    return NextResponse.json({ messages, timestamp });
  } catch (e) {
    console.error("GET /api/ws error:", e);
    return NextResponse.json(
      { error: "Internal server error", detail: String(e) },
      { status: 500 },
    );
  }
}
