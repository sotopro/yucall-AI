"use client";

import { create } from "zustand";
import type {
  TranscriptSegment,
  TranslatedSegment,
  RoomUser,
  SupportedLang,
} from "@/types";

interface SessionState {
  // Room
  roomId: string | null;
  userId: string;
  userName: string;
  isConnected: boolean;
  partner: RoomUser | null;

  // Audio
  isListening: boolean;
  myLang: SupportedLang;

  // Transcripts
  myTranscripts: TranscriptSegment[];
  partnerTranscripts: TranscriptSegment[];
  translations: TranslatedSegment[];

  // Actions
  setRoomId: (roomId: string) => void;
  setUserName: (name: string) => void;
  setIsConnected: (connected: boolean) => void;
  setPartner: (partner: RoomUser | null) => void;
  setIsListening: (listening: boolean) => void;
  setMyLang: (lang: SupportedLang) => void;
  addMyTranscript: (segment: TranscriptSegment) => void;
  addPartnerTranscript: (segment: TranscriptSegment) => void;
  addTranslation: (segment: TranslatedSegment) => void;
  updateInterimTranscript: (segment: TranscriptSegment) => void;
  clearSession: () => void;
}

function generateUserId(): string {
  return `user-${Math.random().toString(36).slice(2, 9)}`;
}

export const useSessionStore = create<SessionState>((set) => ({
  roomId: null,
  userId: generateUserId(),
  userName: "",
  isConnected: false,
  partner: null,
  isListening: false,
  myLang: "es",
  myTranscripts: [],
  partnerTranscripts: [],
  translations: [],

  setRoomId: (roomId) => set({ roomId }),
  setUserName: (userName) => set({ userName }),
  setIsConnected: (isConnected) => set({ isConnected }),
  setPartner: (partner) => set({ partner }),
  setIsListening: (isListening) => set({ isListening }),
  setMyLang: (myLang) => set({ myLang }),

  addMyTranscript: (segment) =>
    set((state) => ({
      myTranscripts: [...state.myTranscripts.filter((s) => s.isFinal), segment],
    })),

  addPartnerTranscript: (segment) =>
    set((state) => ({
      partnerTranscripts: [
        ...state.partnerTranscripts.filter((s) => s.isFinal),
        segment,
      ],
    })),

  addTranslation: (segment) =>
    set((state) => ({
      translations: [...state.translations, segment],
    })),

  updateInterimTranscript: (segment) =>
    set((state) => {
      const isMyTranscript = segment.userId === state.userId;
      if (isMyTranscript) {
        const finals = state.myTranscripts.filter((s) => s.isFinal);
        return { myTranscripts: [...finals, segment] };
      }
      const finals = state.partnerTranscripts.filter((s) => s.isFinal);
      return { partnerTranscripts: [...finals, segment] };
    }),

  clearSession: () =>
    set({
      myTranscripts: [],
      partnerTranscripts: [],
      translations: [],
      isListening: false,
      isConnected: false,
      partner: null,
    }),
}));
