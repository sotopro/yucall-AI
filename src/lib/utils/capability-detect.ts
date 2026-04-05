export interface BrowserCapabilities {
  webSpeechApi: boolean;
  chromeTranslatorApi: boolean;
  getUserMedia: boolean;
}

export function detectCapabilities(): BrowserCapabilities {
  const webSpeechApi =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const chromeTranslatorApi =
    typeof window !== "undefined" &&
    "ai" in window &&
    !!(window as unknown as Record<string, unknown>).ai &&
    "translator" in
      ((window as unknown as Record<string, unknown>).ai as Record<string, unknown>);

  const getUserMedia =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  return {
    webSpeechApi,
    chromeTranslatorApi,
    getUserMedia,
  };
}
