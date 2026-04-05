import { NextRequest, NextResponse } from "next/server";

const MYMEMORY_API = "https://api.mymemory.translated.net/get";

// Map internal lang codes to MyMemory codes
const LANG_MAP: Record<string, string> = {
  es: "es",
  en: "en",
  zh: "zh-CN",
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
    const url = `${MYMEMORY_API}?${new URLSearchParams({
      q: text,
      langpair: `${srcCode}|${tgtCode}`,
    })}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!res.ok) {
      throw new Error(`MyMemory API returned ${res.status}`);
    }

    const data = await res.json();

    if (data.responseStatus !== 200) {
      throw new Error(data.responseDetails || "Translation failed");
    }

    return NextResponse.json({
      translatedText: data.responseData.translatedText,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Translation failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
