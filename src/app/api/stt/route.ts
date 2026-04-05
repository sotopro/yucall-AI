import { NextRequest, NextResponse } from "next/server";

const DEEPGRAM_API_URL = "https://api.deepgram.com/v1/listen";

// Map internal lang codes to Deepgram codes
const LANG_MAP: Record<string, string> = {
  es: "es",
  en: "en",
  zh: "zh",
  "zh-CN": "zh",
  "es-ES": "es",
  "en-US": "en",
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPGRAM_API_KEY not configured" },
      { status: 500 },
    );
  }

  const lang = req.nextUrl.searchParams.get("lang") || "zh";
  const dgLang = LANG_MAP[lang] || lang;

  try {
    const audioBuffer = await req.arrayBuffer();

    if (audioBuffer.byteLength === 0) {
      return NextResponse.json({ transcript: "" });
    }

    const contentType = req.headers.get("content-type") || "audio/webm";

    const params = new URLSearchParams({
      language: dgLang,
      model: "nova-3",
      punctuate: "true",
      smart_format: "true",
    });

    const res = await fetch(`${DEEPGRAM_API_URL}?${params}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": contentType,
      },
      body: audioBuffer,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Deepgram API error:", res.status, errText);
      throw new Error(`Deepgram returned ${res.status}`);
    }

    const data = await res.json();
    const transcript =
      data.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

    return NextResponse.json({ transcript });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "STT failed";
    console.error("STT error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
