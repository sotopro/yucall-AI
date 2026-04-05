import type { TranscriptSegment } from "@/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export class WebSpeechEngine {
  private recognition: SpeechRecognitionInstance | null = null;
  private isRunning = false;
  private userId: string;
  private userName: string;
  private onSegment: (segment: TranscriptSegment) => void;

  constructor(
    userId: string,
    userName: string,
    onSegment: (segment: TranscriptSegment) => void,
  ) {
    this.userId = userId;
    this.userName = userName;
    this.onSegment = onSegment;
  }

  start(lang: string): void {
    if (this.isRunning) return;

    const SpeechRecognitionClass =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      throw new Error("Web Speech API not supported");
    }

    this.recognition = new SpeechRecognitionClass();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = lang;

    this.recognition.onresult = (event: {
      resultIndex: number;
      results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } };
    }) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const segment: TranscriptSegment = {
          id: `${this.userId}-${Date.now()}-${i}`,
          text: result[0].transcript,
          isFinal: result.isFinal,
          timestamp: Date.now(),
          lang,
          userId: this.userId,
          userName: this.userName,
        };
        this.onSegment(segment);
      }
    };

    this.recognition.onerror = (event: { error: string }) => {
      if (event.error === "no-speech") return;
      console.error("Speech recognition error:", event.error);
    };

    this.recognition.onend = () => {
      if (this.isRunning) {
        this.recognition?.start();
      }
    };

    this.recognition.start();
    this.isRunning = true;
  }

  stop(): void {
    this.isRunning = false;
    this.recognition?.stop();
    this.recognition = null;
  }

  setLang(lang: string): void {
    if (this.isRunning) {
      this.stop();
      this.start(lang);
    }
  }
}
