import type { Translator } from "./translator";

const MODEL_MAP: Record<string, string> = {
  "en-es": "Xenova/opus-mt-en-es",
  "es-en": "Xenova/opus-mt-es-en",
  "en-zh": "Xenova/opus-mt-en-zh",
  "zh-en": "Xenova/opus-mt-zh-en",
};

let messageId = 0;

function nextId(): number {
  return ++messageId;
}

export class TransformersTranslator implements Translator {
  private worker: Worker | null = null;
  private ready = false;
  private sourceLang: string;
  private targetLang: string;
  private needsTwoStep: boolean;
  private firstPipelineId = "p1";
  private secondPipelineId = "p2";
  private pendingCallbacks = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
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

  private sendMessage(
    type: string,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = nextId();
      this.pendingCallbacks.set(id, { resolve, reject });
      this.worker!.postMessage({ type, id, data });
    });
  }

  private handleMessage(event: MessageEvent): void {
    const { type, id, data } = event.data;

    if (type === "status") {
      this.onStatus?.(data.status);
      return;
    }

    const callback = this.pendingCallbacks.get(id);
    if (!callback) return;
    this.pendingCallbacks.delete(id);

    if (type === "error") {
      callback.reject(new Error(data.error));
    } else {
      callback.resolve(data);
    }
  }

  async init(): Promise<void> {
    try {
      this.onStatus?.("Starting translation engine...");

      this.worker = new Worker(
        new URL("./translation-worker.js", import.meta.url),
        { type: "module" },
      );

      this.worker.onmessage = (e) => this.handleMessage(e);
      this.worker.onerror = (e) => {
        console.error("Translation worker error:", e);
        this.onStatus?.("Translation engine crashed. Try refreshing.");
        this.ready = false;
      };

      if (this.needsTwoStep) {
        if (this.sourceLang === "es") {
          await this.sendMessage("load", {
            model: "Xenova/opus-mt-es-en",
            label: "Spanish→English",
            pipelineId: this.firstPipelineId,
          });
          await this.sendMessage("load", {
            model: "Xenova/opus-mt-en-zh",
            label: "English→Chinese",
            pipelineId: this.secondPipelineId,
          });
        } else {
          await this.sendMessage("load", {
            model: "Xenova/opus-mt-zh-en",
            label: "Chinese→English",
            pipelineId: this.firstPipelineId,
          });
          await this.sendMessage("load", {
            model: "Xenova/opus-mt-en-es",
            label: "English→Spanish",
            pipelineId: this.secondPipelineId,
          });
        }
      } else {
        const modelKey = `${this.sourceLang}-${this.targetLang}`;
        const model = MODEL_MAP[modelKey];
        if (!model) {
          throw new Error(`No translation model available for ${modelKey}`);
        }
        const label = `${this.sourceLang.toUpperCase()}→${this.targetLang.toUpperCase()}`;
        await this.sendMessage("load", {
          model,
          label,
          pipelineId: this.firstPipelineId,
        });
      }

      this.ready = true;
      this.onStatus?.("Ready");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error("TransformersTranslator init failed:", e);
      this.onStatus?.(`Error: ${msg}`);
      this.terminate();
      throw e;
    }
  }

  async translate(text: string): Promise<string> {
    if (!this.worker || !this.ready) {
      throw new Error("Translator not initialized");
    }

    try {
      const result = (await this.sendMessage("translate", {
        pipelineId: this.firstPipelineId,
        text,
      })) as { translated: string };

      let translated = result.translated;

      if (this.needsTwoStep) {
        const secondResult = (await this.sendMessage("translate", {
          pipelineId: this.secondPipelineId,
          text: translated,
        })) as { translated: string };
        translated = secondResult.translated;
      }

      return translated;
    } catch {
      return text;
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  private terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.pendingCallbacks.clear();
  }
}
