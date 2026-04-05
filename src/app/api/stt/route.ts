import { NextRequest, NextResponse } from "next/server";

const DEEPGRAM_API_URL = "https://api.deepgram.com/v1/listen";

/** Minimum confidence to accept a transcript (filters hallucinations) */
const MIN_CONFIDENCE = 0.65;

/** Minimum transcript length to accept (single chars are usually noise) */
const MIN_TRANSCRIPT_LENGTH = 2;

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

    if (audioBuffer.byteLength < 4000) {
      return NextResponse.json({ transcript: "" });
    }

    const contentType = req.headers.get("content-type") || "audio/webm";

    const params = new URLSearchParams({
      model: "nova-3",
      punctuate: "true",
      smart_format: "true",
      // Auto-detect language to catch echo (e.g., Spanish coming through
      // speaker when we expect Chinese) — discard if wrong language
      detect_language: "true",
      // Detect actual speech utterances to avoid transcribing noise
      utterances: "true",
      // End-of-speech detection — helps ignore trailing noise
      endpointing: "300",
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
      // 400 = corrupt/short audio, just return empty transcript
      if (res.status === 400) {
        return NextResponse.json({ transcript: "" });
      }
      const errText = await res.text();
      console.error("Deepgram API error:", res.status, errText);
      throw new Error(`Deepgram returned ${res.status}`);
    }

    const data = await res.json();
    const channel = data.results?.channels?.[0];
    const alt = channel?.alternatives?.[0];
    const transcript = alt?.transcript || "";
    const confidence = alt?.confidence ?? 0;
    const detectedLang = channel?.detected_language || alt?.languages?.[0] || "";

    // Filter: wrong language detected (echo from partner's speaker)
    if (detectedLang && dgLang) {
      const expected = dgLang.split("-")[0]; // "zh-CN" → "zh"
      const detected = detectedLang.split("-")[0];
      if (detected !== expected) {
        return NextResponse.json({ transcript: "" });
      }
    }

    // Filter: low confidence or very short text (hallucinations/noise)
    if (confidence < MIN_CONFIDENCE || transcript.trim().length < MIN_TRANSCRIPT_LENGTH) {
      return NextResponse.json({ transcript: "" });
    }

    return NextResponse.json({ transcript });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "STT failed";
    console.error("STT error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
