export interface Translator {
  translate(text: string): Promise<string>;
  isReady(): boolean;
}

interface AITranslator {
  translate(text: string): Promise<string>;
}

interface AITranslatorFactory {
  capabilities(): Promise<{ languagePairAvailable(src: string, tgt: string): string }>;
  create(opts: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (m: { addEventListener(event: string, cb: (e: { loaded: number; total: number }) => void): void }) => void;
  }): Promise<AITranslator>;
}

interface AI {
  translator: AITranslatorFactory;
}

declare global {
  interface Window {
    ai?: AI;
  }
}

export class ChromeTranslator implements Translator {
  private translator: AITranslator | null = null;
  private ready = false;
  private sourceLang: string;
  private targetLang: string;
  private onProgress?: (loaded: number, total: number) => void;

  constructor(
    sourceLang: string,
    targetLang: string,
    onProgress?: (loaded: number, total: number) => void,
  ) {
    this.sourceLang = sourceLang;
    this.targetLang = targetLang;
    this.onProgress = onProgress;
  }

  async init(): Promise<void> {
    if (!window.ai?.translator) {
      throw new Error("Chrome Translator API not available");
    }

    const capabilities = await window.ai.translator.capabilities();
    const available = capabilities.languagePairAvailable(
      this.sourceLang,
      this.targetLang,
    );

    if (available === "no") {
      throw new Error(
        `Translation from ${this.sourceLang} to ${this.targetLang} not supported`,
      );
    }

    this.translator = await window.ai.translator.create({
      sourceLanguage: this.sourceLang,
      targetLanguage: this.targetLang,
      monitor: (m) => {
        if (this.onProgress) {
          m.addEventListener("downloadprogress", (e) => {
            this.onProgress!(e.loaded, e.total);
          });
        }
      },
    });

    this.ready = true;
  }

  async translate(text: string): Promise<string> {
    if (!this.translator) {
      throw new Error("Translator not initialized");
    }
    return this.translator.translate(text);
  }

  isReady(): boolean {
    return this.ready;
  }
}

export class FallbackTranslator implements Translator {
  async translate(text: string): Promise<string> {
    return text;
  }

  isReady(): boolean {
    return true;
  }
}
