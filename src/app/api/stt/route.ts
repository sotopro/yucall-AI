import { NextRequest, NextResponse } from "next/server";

// Speech to text on the VPS: a Whisper server (speaches, OpenAI-compatible API) on the internal
// network. The model is set by the server stack; WHISPER_MODEL can override it.
const WHISPER_URL = process.env.WHISPER_URL ?? "http://whisper.internal.evsn:8000";
const WHISPER_MODEL = process.env.WHISPER_MODEL ?? "Systran/faster-whisper-small";

/** Whisper's own hallucination limits: below this average log probability a segment is noise. */
const MIN_AVG_LOGPROB = -1.0;
/** A segment Whisper thinks is silence. */
const MAX_NO_SPEECH_PROB = 0.6;

/** Minimum transcript length to accept (single chars are usually noise) */
const MIN_TRANSCRIPT_LENGTH = 2;

// Whisper reports either the code or the English name of the language.
const LANGUAGE_NAMES: Record<string, string> = {
  spanish: "es",
  english: "en",
  chinese: "zh",
  cantonese: "yue",
};
const CHINESE = new Set(["zh", "yue", "wuu", "nan", "hak", "cmn"]);

type Segment = { text: string; avg_logprob: number; no_speech_prob: number };
type Verbose = { text?: string; language?: string; segments?: Segment[] };

function extension(contentType: string): string {
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("ogg")) return "ogg";
  if (contentType.includes("wav")) return "wav";
  return "webm";
}

export async function POST(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang") || "zh";
  const expected = lang.split("-")[0];

  try {
    const audioBuffer = await req.arrayBuffer();

    if (audioBuffer.byteLength < 4000) {
      return NextResponse.json({ transcript: "" });
    }

    const contentType = req.headers.get("content-type") || "audio/webm";
    const form = new FormData();
    form.append(
      "file",
      new Blob([audioBuffer], { type: contentType }),
      `chunk.${extension(contentType)}`,
    );
    form.append("model", WHISPER_MODEL);
    // No language hint: detection catches echo from the partner's speaker (filtered below).
    form.append("response_format", "verbose_json");

    const res = await fetch(`${WHISPER_URL}/v1/audio/transcriptions`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      if (res.status === 400 || res.status === 422) {
        return NextResponse.json({ transcript: "" });
      }
      const errText = await res.text();
      console.error("Whisper error:", res.status, errText.slice(0, 300));
      throw new Error(`Whisper returned ${res.status}`);
    }

    const data = (await res.json()) as Verbose;
    const segments = (data.segments ?? []).filter(
      (s) => s.avg_logprob >= MIN_AVG_LOGPROB && s.no_speech_prob <= MAX_NO_SPEECH_PROB,
    );
    const transcript = segments.map((s) => s.text).join("").trim();

    // Filter: wrong language detected (echo from partner's speaker)
    const raw = (data.language ?? "").toLowerCase();
    const detected = LANGUAGE_NAMES[raw] ?? raw.split("-")[0];
    if (detected) {
      if (expected === "zh" ? !CHINESE.has(detected) : detected !== expected) {
        return NextResponse.json({ transcript: "" });
      }
    }

    // Filter: very short text (hallucinations/noise)
    if (transcript.length < MIN_TRANSCRIPT_LENGTH) {
      return NextResponse.json({ transcript: "" });
    }

    return NextResponse.json({ transcript });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "STT failed";
    console.error("STT error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
