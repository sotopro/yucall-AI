import type { TranscriptSegment } from "@/types";
import type { SttStatus } from "./web-speech-engine";

/** Interval in ms between sending audio chunks to the server */
const CHUNK_INTERVAL_MS = 3000;

export class ServerSttEngine {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private sendTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
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
    this.isRunning = true;
    this.onStatusChange?.("starting");

    // Pick a supported MIME type
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "audio/webm";

    try {
      this.mediaRecorder = new MediaRecorder(stream, { mimeType });
    } catch {
      // If preferred mime fails, try without specifying
      this.mediaRecorder = new MediaRecorder(stream);
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.onerror = () => {
      this.onError?.("Audio recording failed. Try refreshing.");
      this.onStatusChange?.("error");
      this.stop();
    };

    this.mediaRecorder.start(CHUNK_INTERVAL_MS);
    this.onStatusChange?.("listening");

    // Periodically send accumulated audio to server
    this.sendTimer = setInterval(() => this.sendChunks(), CHUNK_INTERVAL_MS + 200);
  }

  stop(): void {
    this.isRunning = false;
    if (this.sendTimer) {
      clearInterval(this.sendTimer);
      this.sendTimer = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
    this.chunks = [];
    this.onStatusChange?.("stopped");
  }

  private async sendChunks(): Promise<void> {
    if (this.chunks.length === 0 || !this.isRunning) return;

    const chunksToSend = this.chunks.splice(0);
    const blob = new Blob(chunksToSend, {
      type: this.mediaRecorder?.mimeType || "audio/webm",
    });

    // Skip tiny blobs (mostly silence)
    if (blob.size < 1000) return;

    this.onStatusChange?.("processing");

    try {
      const res = await fetch(`/api/stt?lang=${encodeURIComponent(this.lang)}`, {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });

      if (!res.ok) {
        console.warn("STT API returned", res.status);
        this.onStatusChange?.("listening");
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

      this.onStatusChange?.("listening");
    } catch (e) {
      console.warn("STT request failed:", e);
      this.onStatusChange?.("listening");
    }
  }

  setLang(lang: string): void {
    this.lang = lang;
  }
}
