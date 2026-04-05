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
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Max consecutive rapid restarts before giving up */
const MAX_RESTARTS = 5;
/** Restarts within this window count as "rapid" */
const RESTART_COOLDOWN_MS = 2000;
/** Base delay before restart — doubles on each consecutive failure */
const BASE_RESTART_DELAY_MS = 300;
const MAX_RESTART_DELAY_MS = 5000;

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
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
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
    this.isRunning = true;
    this.restartCount = 0;
    this.onStatusChange?.("starting");
    this.createAndStart(SpeechRecognitionClass);
  }

  private createAndStart(
    Ctor?: new () => SpeechRecognitionInstance,
  ): void {
    const SpeechRecognitionClass =
      Ctor || window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) return;

    // Tear down previous instance completely
    if (this.recognition) {
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
      this.recognition.onaudiostart = null;
      this.recognition.onspeechstart = null;
      this.recognition.onspeechend = null;
      this.recognition = null;
    }

    const recognition = new SpeechRecognitionClass();
    this.recognition = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = this.lang;

    recognition.onaudiostart = () => {
      // Successfully started — reset restart counter
      this.restartCount = 0;
      this.onStatusChange?.("listening");
    };

    recognition.onspeechstart = () => {
      this.onStatusChange?.("speech-detected");
    };

    recognition.onspeechend = () => {
      this.onStatusChange?.("processing");
    };

    recognition.onresult = (event: {
      resultIndex: number;
      results: {
        length: number;
        [i: number]: { isFinal: boolean; 0: { transcript: string } };
      };
    }) => {
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

    recognition.onerror = (event: { error: string }) => {
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
        console.error("Speech recognition fatal error:", event.error);
        this.isRunning = false;
        this.onStatusChange?.("error");
        this.onError?.(
          event.error === "not-allowed"
            ? "Microphone access denied. Please allow microphone permissions."
            : event.error === "service-not-available"
              ? "Speech recognition service unavailable. Check your internet connection."
              : `Language "${this.lang}" is not supported for speech recognition.`,
        );
        return;
      }

      // Network/aborted errors are transient — onend will handle restart
      // Don't log every occurrence to avoid console spam
    };

    recognition.onend = () => {
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
        console.warn(
          `Speech recognition stopped after ${MAX_RESTARTS} rapid restarts`,
        );
        this.isRunning = false;
        this.onStatusChange?.("error");
        this.onError?.(
          "Speech recognition keeps stopping. Try refreshing the page.",
        );
        return;
      }

      // Exponential backoff: 300ms, 600ms, 1200ms, 2400ms, 5000ms
      const delay = Math.min(
        BASE_RESTART_DELAY_MS * Math.pow(2, this.restartCount),
        MAX_RESTART_DELAY_MS,
      );

      this.onStatusChange?.("starting");
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        if (!this.isRunning) return;
        try {
          // Create a fresh instance to avoid stale state
          this.createAndStart();
        } catch (e) {
          console.error("Failed to restart recognition:", e);
          this.isRunning = false;
          this.onStatusChange?.("error");
          this.onError?.("Failed to restart speech recognition.");
        }
      }, delay);
    };

    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to start recognition:", e);
      this.isRunning = false;
      this.onStatusChange?.("error");
      this.onError?.("Failed to start speech recognition.");
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.recognition) {
      this.recognition.onend = null; // prevent restart on intentional stop
      try {
        this.recognition.abort();
      } catch {
        // already stopped
      }
      this.recognition = null;
    }
    this.onStatusChange?.("stopped");
  }

  setLang(lang: string): void {
    if (this.isRunning) {
      this.stop();
      this.start(lang);
    }
  }
}
