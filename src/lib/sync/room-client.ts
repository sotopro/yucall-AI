import type { RoomMessage, TranscriptSegment } from "@/types";

type MessageHandler = (message: RoomMessage) => void;

export class RoomClient {
  private handlers: MessageHandler[] = [];
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastTimestamp = 0;
  private roomId: string;
  private _isConnected = false;

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  connect(): void {
    this._isConnected = true;
    this.lastTimestamp = Date.now();
    this.startPolling();
  }

  private startPolling(): void {
    if (this.pollInterval) return;

    this.pollInterval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/ws?room=${encodeURIComponent(this.roomId)}&since=${this.lastTimestamp}`,
        );
        if (!res.ok) return;

        const data = await res.json();
        this.lastTimestamp = data.timestamp;

        for (const msg of data.messages) {
          const { _timestamp, ...message } = msg;
          void _timestamp;
          this.handlers.forEach((handler) => handler(message as RoomMessage));
        }
      } catch {
        // Silently retry on next poll
      }
    }, 500);
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  sendTranscript(segment: TranscriptSegment): void {
    this.send({
      type: "transcript",
      payload: { segment },
    });
  }

  sendUserJoined(userId: string, userName: string): void {
    this.send({
      type: "user-joined",
      payload: { userId, userName },
    });
  }

  sendLanguageSet(userId: string, lang: string): void {
    this.send({
      type: "language-set",
      payload: { userId, lang },
    });
  }

  private send(message: RoomMessage): void {
    if (!this._isConnected) return;

    fetch(`/api/ws?room=${encodeURIComponent(this.roomId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    }).catch(() => {
      // Silently fail, message will be missed
    });
  }

  disconnect(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this._isConnected = false;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }
}
