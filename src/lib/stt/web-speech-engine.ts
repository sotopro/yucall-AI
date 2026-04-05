import type { TranscriptSegment } from "@/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
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

const MAX_RESTARTS = 10;
const RESTART_COOLDOWN_MS = 1000;

export type SttStatus =
  | "starting"
  | "listening"
  | "speech-detected"
  | "processing"
  | "error"
  | "stopped";

export class WebSpeechEngine {
  private recognition: SpeechRecognitionInstance | null = null;
  private isRunning = false;
  private userId: string;
  private userName: string;
  private lang = "";
  private segmentCounter = 0;
  private restartCount = 0;
  private lastRestartTime = 0;
  private onSegment: (segment: TranscriptSegment) => void;
  private onError: ((error: string) => void) | null = null;
  private onStatusChange: ((status: SttStatus) => void) | null = null;

  constructor(
    userId: string,
    userName: string,
    onSegment: (segment: TranscriptSegment) => void,
    onError?: (error: string) => void,
    onStatusChange?: (status: SttStatus) => void,
  ) {
    this.userId = userId;
    this.userName = userName;
    this.onSegment = onSegment;
    this.onError = onError || null;
    this.onStatusChange = onStatusChange || null;
  }

  start(lang: string): void {
    if (this.isRunning) return;

    const SpeechRecognitionClass =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      this.onError?.("Web Speech API not supported in this browser");
      this.onStatusChange?.("error");
      return;
    }

    this.lang = lang;
    this.onStatusChange?.("starting");
    this.recognition = new SpeechRecognitionClass();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = lang;

    this.recognition.onaudiostart = () => {
      this.onStatusChange?.("listening");
    };

    this.recognition.onspeechstart = () => {
      this.onStatusChange?.("speech-detected");
    };

    this.recognition.onspeechend = () => {
      this.onStatusChange?.("processing");
    };

    this.recognition.onresult = (event: {
      resultIndex: number;
      results: {
        length: number;
        [i: number]: { isFinal: boolean; 0: { transcript: string } };
      };
    }) => {
      this.restartCount = 0;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        this.segmentCounter++;
        const segment: TranscriptSegment = {
          id: `${this.userId}-${Date.now()}-${this.segmentCounter}`,
          text: result[0].transcript,
          isFinal: result.isFinal,
          timestamp: Date.now(),
          lang: this.lang,
          userId: this.userId,
          userName: this.userName,
        };
        this.onSegment(segment);
      }
    };

    this.recognition.onerror = (event: { error: string }) => {
      console.error("Speech recognition error:", event.error);

      // no-speech is normal — just means silence was detected
      if (event.error === "no-speech") {
        this.onStatusChange?.("listening");
        return;
      }

      // Fatal errors — stop and notify user
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-available" ||
        event.error === "language-not-supported"
      ) {
        this.isRunning = false;
        this.onStatusChange?.("error");
        this.onError?.(
          event.error === "not-allowed"
            ? "Microphone access denied. Please allow microphone permissions."
            : event.error === "service-not-available"
              ? "Speech recognition service unavailable. Check your internet connection."
              : `Language "${lang}" is not supported for speech recognition.`,
        );
        return;
      }

      // Network and other errors — report but allow restart
      if (event.error === "network") {
        this.onError?.(
          "Network error in speech recognition. Check your internet connection.",
        );
        this.onStatusChange?.("error");
        return;
      }

      // aborted, audio-capture, etc
      this.onStatusChange?.("error");
    };

    this.recognition.onend = () => {
      if (!this.isRunning) {
        this.onStatusChange?.("stopped");
        return;
      }

      const now = Date.now();
      if (now - this.lastRestartTime < RESTART_COOLDOWN_MS) {
        this.restartCount++;
      } else {
        this.restartCount = 0;
      }
      this.lastRestartTime = now;

      if (this.restartCount >= MAX_RESTARTS) {
        this.isRunning = false;
        this.onStatusChange?.("error");
        this.onError?.(
          "Speech recognition keeps stopping. Try refreshing the page.",
        );
        return;
      }

      this.onStatusChange?.("starting");
      try {
        this.recognition?.start();
      } catch (e) {
        console.error("Failed to restart recognition:", e);
        this.isRunning = false;
        this.onStatusChange?.("error");
        this.onError?.("Failed to restart speech recognition.");
      }
    };

    try {
      this.recognition.start();
      this.isRunning = true;
    } catch (e) {
      console.error("Failed to start recognition:", e);
      this.onStatusChange?.("error");
      this.onError?.("Failed to start speech recognition.");
    }
  }

  stop(): void {
    this.isRunning = false;
    this.recognition?.stop();
    this.recognition = null;
    this.onStatusChange?.("stopped");
  }

  setLang(lang: string): void {
    if (this.isRunning) {
      this.stop();
      this.start(lang);
    }
  }
}
