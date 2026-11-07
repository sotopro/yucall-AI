import { NextRequest, NextResponse } from "next/server";

// Translation on the VPS: LibreTranslate on the internal network.
const LIBRETRANSLATE_URL =
  process.env.LIBRETRANSLATE_URL ?? "http://libretranslate.internal.evsn:5000";

// Map internal lang codes to LibreTranslate codes
const LANG_MAP: Record<string, string> = {
  es: "es",
  en: "en",
  zh: "zh-Hans",
};

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const text = searchParams.get("text");
  const source = searchParams.get("source");
  const target = searchParams.get("target");

  if (!text || !source || !target) {
    return NextResponse.json(
      { error: "Missing text, source, or target" },
      { status: 400 },
    );
  }

  const srcCode = LANG_MAP[source] || source;
  const tgtCode = LANG_MAP[target] || target;

  try {
    const res = await fetch(`${LIBRETRANSLATE_URL}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, source: srcCode, target: tgtCode, format: "text" }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`LibreTranslate returned ${res.status}`);
    }

    const data = (await res.json()) as { translatedText?: string };
    if (typeof data.translatedText !== "string") {
      throw new Error("Translation failed");
    }

    return NextResponse.json({ translatedText: data.translatedText });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Translation failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
