import type { TranscriptSegment } from "@/types";
import type { SttStatus } from "./web-speech-engine";

/** Duration in ms for each recording chunk */
const CHUNK_DURATION_MS = 4000;
/** Minimum blob size in bytes to send (below this is likely silence/corrupt) */
const MIN_BLOB_SIZE = 4000;

export class ServerSttEngine {
  private isRunning = false;
  private stream: MediaStream | null = null;
  private mimeType = "";
  private userId: string;
  private userName: string;
  private lang = "";
  private segmentCounter = 0;
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

  start(lang: string, stream: MediaStream): void {
    if (this.isRunning) return;

    this.lang = lang;
    this.stream = stream;
    this.isRunning = true;

    // Pick a supported MIME type
    this.mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";

    this.onStatusChange?.("listening");
    this.recordLoop();
  }

  stop(): void {
    this.isRunning = false;
    this.stream = null;
    this.onStatusChange?.("stopped");
  }

  setLang(lang: string): void {
    this.lang = lang;
  }

  /**
   * Record-transcribe loop: each iteration creates a fresh MediaRecorder
   * so every chunk is a complete audio file with proper headers.
   */
  private async recordLoop(): Promise<void> {
    while (this.isRunning && this.stream) {
      try {
        const blob = await this.recordChunk(CHUNK_DURATION_MS);
        if (!this.isRunning) break;

        // Skip tiny blobs (mostly silence)
        if (blob && blob.size > MIN_BLOB_SIZE) {
          this.onStatusChange?.("processing");
          await this.transcribe(blob);
        }

        this.onStatusChange?.(this.isRunning ? "listening" : "stopped");
      } catch (e) {
        console.warn("Server STT recording error:", e);
        if (this.isRunning) {
          this.onStatusChange?.("listening");
        }
      }
    }
  }

  /** Record a complete audio chunk with proper container headers */
  private recordChunk(duration: number): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.stream || !this.isRunning) {
        resolve(null);
        return;
      }

      const chunks: Blob[] = [];
      let recorder: MediaRecorder;

      try {
        recorder = this.mimeType
          ? new MediaRecorder(this.stream, { mimeType: this.mimeType })
          : new MediaRecorder(this.stream);
      } catch {
        try {
          recorder = new MediaRecorder(this.stream);
        } catch {
          resolve(null);
          return;
        }
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        resolve(blob);
      };

      recorder.onerror = () => resolve(null);

      recorder.start();

      setTimeout(() => {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }, duration);
    });
  }

  /** Send audio to server for transcription */
  private async transcribe(blob: Blob): Promise<void> {
    try {
      const res = await fetch(`/api/stt?lang=${encodeURIComponent(this.lang)}`, {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });

      if (!res.ok) {
        console.warn("STT API returned", res.status);
        return;
      }

      const data = await res.json();
      const transcript = data.transcript?.trim();

      if (transcript) {
        this.segmentCounter++;
        const segment: TranscriptSegment = {
          id: `${this.userId}-server-${Date.now()}-${this.segmentCounter}`,
          text: transcript,
          isFinal: true,
          timestamp: Date.now(),
          lang: this.lang,
          userId: this.userId,
          userName: this.userName,
        };
        this.onSegment(segment);
      }
    } catch (e) {
      console.warn("STT request failed:", e);
    }
  }
}
