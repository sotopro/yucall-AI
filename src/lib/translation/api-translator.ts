import type { Translator } from "./translator";

export class ApiTranslator implements Translator {
  private sourceLang: string;
  private targetLang: string;

  constructor(sourceLang: string, targetLang: string) {
    this.sourceLang = sourceLang;
    this.targetLang = targetLang;
  }

  async translate(text: string): Promise<string> {
    const params = new URLSearchParams({
      text,
      source: this.sourceLang,
      target: this.targetLang,
    });

    const res = await fetch(`/api/translate?${params}`);

    if (!res.ok) {
      throw new Error(`Translation API returned ${res.status}`);
    }

    const data = await res.json();

    if (data.error) {
      throw new Error(data.error);
    }

    return data.translatedText;
  }

  isReady(): boolean {
    return true;
  }
}
