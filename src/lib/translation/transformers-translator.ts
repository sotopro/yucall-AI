import type { Translator } from "./translator";

type TranslationPipeline = (text: string) => Promise<Array<{ translation_text: string }>>;

const MODEL_MAP: Record<string, string> = {
  "en-es": "Xenova/opus-mt-en-es",
  "es-en": "Xenova/opus-mt-es-en",
  "en-zh": "Xenova/opus-mt-en-zh",
  "zh-en": "Xenova/opus-mt-zh-en",
  "es-zh": "Xenova/opus-mt-es-en", // es→en→zh (two-step)
  "zh-es": "Xenova/opus-mt-zh-en", // zh→en→es (two-step)
};

export class TransformersTranslator implements Translator {
  private pipeline: TranslationPipeline | null = null;
  private secondPipeline: TranslationPipeline | null = null;
  private ready = false;
  private sourceLang: string;
  private targetLang: string;
  private needsTwoStep: boolean;
  private onProgress?: (loaded: number, total: number) => void;

  constructor(
    sourceLang: string,
    targetLang: string,
    onProgress?: (loaded: number, total: number) => void,
  ) {
    this.sourceLang = sourceLang;
    this.targetLang = targetLang;
    this.needsTwoStep =
      (sourceLang === "es" && targetLang === "zh") ||
      (sourceLang === "zh" && targetLang === "es");
    this.onProgress = onProgress;
  }

  async init(): Promise<void> {
    const { pipeline } = await import("@huggingface/transformers");

    if (this.needsTwoStep) {
      // es↔zh requires two-step through English
      if (this.sourceLang === "es") {
        // es → en → zh
        this.onProgress?.(0, 2);
        this.pipeline = (await pipeline(
          "translation",
          "Xenova/opus-mt-es-en",
          { dtype: "q8" },
        )) as unknown as TranslationPipeline;
        this.onProgress?.(1, 2);
        this.secondPipeline = (await pipeline(
          "translation",
          "Xenova/opus-mt-en-zh",
          { dtype: "q8" },
        )) as unknown as TranslationPipeline;
        this.onProgress?.(2, 2);
      } else {
        // zh → en → es
        this.onProgress?.(0, 2);
        this.pipeline = (await pipeline(
          "translation",
          "Xenova/opus-mt-zh-en",
          { dtype: "q8" },
        )) as unknown as TranslationPipeline;
        this.onProgress?.(1, 2);
        this.secondPipeline = (await pipeline(
          "translation",
          "Xenova/opus-mt-en-es",
          { dtype: "q8" },
        )) as unknown as TranslationPipeline;
        this.onProgress?.(2, 2);
      }
    } else {
      const modelKey = `${this.sourceLang}-${this.targetLang}`;
      const model = MODEL_MAP[modelKey];
      if (!model) {
        throw new Error(`No model for ${modelKey}`);
      }
      this.onProgress?.(0, 1);
      this.pipeline = (await pipeline("translation", model, {
        dtype: "q8",
      })) as unknown as TranslationPipeline;
      this.onProgress?.(1, 1);
    }

    this.ready = true;
  }

  async translate(text: string): Promise<string> {
    if (!this.pipeline) {
      throw new Error("Translator not initialized");
    }

    const result = await this.pipeline(text);
    let translated = result[0]?.translation_text || text;

    if (this.needsTwoStep && this.secondPipeline) {
      const secondResult = await this.secondPipeline(translated);
      translated = secondResult[0]?.translation_text || translated;
    }

    return translated;
  }

  isReady(): boolean {
    return this.ready;
  }
}
