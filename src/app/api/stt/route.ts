import { NextRequest, NextResponse } from "next/server";

const DEEPGRAM_API_URL = "https://api.deepgram.com/v1/listen";

/** Minimum confidence to accept a transcript (filters hallucinations) */
const MIN_CONFIDENCE = 0.5;

/** Minimum transcript length to accept (single chars are usually noise) */
const MIN_TRANSCRIPT_LENGTH = 2;

// Languages that need Whisper (supports Cantonese, dialects, etc.)
const WHISPER_LANGS = new Set(["zh", "zh-CN", "zh-HK"]);

// Map internal lang codes to Deepgram base codes
const LANG_MAP: Record<string, string> = {
  es: "es",
  en: "en",
  zh: "zh",
  "zh-CN": "zh",
  "zh-HK": "zh",
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
  const useWhisper = WHISPER_LANGS.has(lang) || WHISPER_LANGS.has(dgLang);

  try {
    const audioBuffer = await req.arrayBuffer();

    if (audioBuffer.byteLength < 4000) {
      return NextResponse.json({ transcript: "" });
    }

    const contentType = req.headers.get("content-type") || "audio/webm";

    const params = new URLSearchParams({
      // Whisper for Chinese (handles Mandarin + Cantonese + dialects)
      // Nova-3 for everything else (faster, but Mandarin only)
      model: useWhisper ? "whisper-large" : "nova-3",
      punctuate: "true",
      smart_format: "true",
      // Auto-detect language to catch echo from partner's speaker
      detect_language: "true",
      utterances: "true",
      endpointing: "300",
    });

    const res = await fetch(`${DEEPGRAM_API_URL}?${params}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": contentType,
      },
      body: audioBuffer,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
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
    const detectedLang =
      channel?.detected_language ||
      data.results?.channels?.[0]?.alternatives?.[0]?.languages?.[0] ||
      "";

    // Filter: wrong language detected (echo from partner's speaker)
    // For Chinese, accept zh, yue (Cantonese), wuu, nan, etc.
    if (detectedLang) {
      const detected = detectedLang.split("-")[0];
      const isChinese = ["zh", "yue", "wuu", "nan", "hak", "cmn"].includes(detected);

      if (useWhisper && !isChinese) {
        // Expected Chinese but got something else → echo
        return NextResponse.json({ transcript: "" });
      }
      if (!useWhisper && detected !== dgLang.split("-")[0]) {
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
