export class MicrophoneCapture {
  private stream: MediaStream | null = null;

  async start(): Promise<MediaStream> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    return this.stream;
  }

  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  getStream(): MediaStream | null {
    return this.stream;
  }
}
