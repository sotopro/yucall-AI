export interface TranscriptSegment {
  id: string;
  text: string;
  isFinal: boolean;
  timestamp: number;
  lang: string;
  userId: string;
  userName: string;
}

export interface TranslatedSegment {
  id: string;
  originalText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  timestamp: number;
  userName: string;
}

export interface RoomMessage {
  type: "transcript" | "user-joined" | "user-left" | "language-set";
  payload: TranscriptPayload | UserPayload | LanguagePayload;
}

export interface TranscriptPayload {
  segment: TranscriptSegment;
}

export interface UserPayload {
  userId: string;
  userName: string;
}

export interface LanguagePayload {
  userId: string;
  lang: string;
}

export interface RoomUser {
  userId: string;
  userName: string;
  lang: string;
  isConnected: boolean;
}

export type SupportedLang = "es" | "en" | "zh";

export const LANGUAGES: Record<SupportedLang, string> = {
  es: "Español",
  en: "English",
  zh: "中文",
};

export const LANG_SPEECH_CODES: Record<SupportedLang, string> = {
  es: "es-ES",
  en: "en-US",
  zh: "zh-CN",
};
