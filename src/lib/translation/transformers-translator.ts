import type { Translator } from "./translator";

type TranslationPipeline = (
  text: string,
) => Promise<Array<{ translation_text: string }>>;

const MODEL_MAP: Record<string, string> = {
  "en-es": "Xenova/opus-mt-en-es",
  "es-en": "Xenova/opus-mt-es-en",
  "en-zh": "Xenova/opus-mt-en-zh",
  "zh-en": "Xenova/opus-mt-zh-en",
};

export class TransformersTranslator implements Translator {
  private pipeline: TranslationPipeline | null = null;
  private secondPipeline: TranslationPipeline | null = null;
  private ready = false;
  private sourceLang: string;
  private targetLang: string;
  private needsTwoStep: boolean;
  private onStatus?: (message: string) => void;

  constructor(
    sourceLang: string,
    targetLang: string,
    onStatus?: (message: string) => void,
  ) {
    this.sourceLang = sourceLang;
    this.targetLang = targetLang;
    this.needsTwoStep =
      (sourceLang === "es" && targetLang === "zh") ||
      (sourceLang === "zh" && targetLang === "es");
    this.onStatus = onStatus;
  }

  private async loadModel(
    modelName: string,
    label: string,
  ): Promise<TranslationPipeline> {
    const { pipeline, env } = await import("@huggingface/transformers");

    // Disable local model check to avoid errors on mobile
    env.allowLocalModels = false;

    this.onStatus?.(`Downloading ${label}...`);

    const translator = await pipeline("translation", modelName, {
      progress_callback: (progress: {
        status: string;
        progress?: number;
        file?: string;
      }) => {
        if (progress.status === "progress" && progress.progress != null) {
          const pct = Math.round(progress.progress);
          this.onStatus?.(`Downloading ${label}: ${pct}%`);
        } else if (progress.status === "done") {
          this.onStatus?.(`${label} loaded`);
        } else if (progress.status === "initiate") {
          this.onStatus?.(`Preparing ${label}...`);
        }
      },
    });

    return translator as unknown as TranslationPipeline;
  }

  async init(): Promise<void> {
    try {
      if (this.needsTwoStep) {
        if (this.sourceLang === "es") {
          // es → en → zh
          this.pipeline = await this.loadModel(
            "Xenova/opus-mt-es-en",
            "Spanish→English",
          );
          this.secondPipeline = await this.loadModel(
            "Xenova/opus-mt-en-zh",
            "English→Chinese",
          );
        } else {
          // zh → en → es
          this.pipeline = await this.loadModel(
            "Xenova/opus-mt-zh-en",
            "Chinese→English",
          );
          this.secondPipeline = await this.loadModel(
            "Xenova/opus-mt-en-es",
            "English→Spanish",
          );
        }
      } else {
        const modelKey = `${this.sourceLang}-${this.targetLang}`;
        const model = MODEL_MAP[modelKey];
        if (!model) {
          throw new Error(`No translation model available for ${modelKey}`);
        }
        const label = `${this.sourceLang.toUpperCase()}→${this.targetLang.toUpperCase()}`;
        this.pipeline = await this.loadModel(model, label);
      }

      this.ready = true;
      this.onStatus?.("Ready");
    } catch (e) {
      const errorMsg =
        e instanceof Error ? e.message : "Unknown error loading model";
      console.error("TransformersTranslator init failed:", e);
      this.onStatus?.(`Error: ${errorMsg}`);
      throw e;
    }
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
