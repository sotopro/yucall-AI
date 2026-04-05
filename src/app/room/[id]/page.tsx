"use client";

import { Suspense, useEffect, useRef, useCallback, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { RoomHeader } from "@/components/room-header";
import { ControlsBar } from "@/components/controls-bar";
import { TranscriptPanel } from "@/components/transcript-panel";
import { TranslationPanel } from "@/components/translation-panel";
import { ModelLoadingDialog } from "@/components/model-loading-dialog";
import { AudioVisualizer } from "@/components/audio-visualizer";
import { useSessionStore } from "@/stores/session-store";
import { RoomClient } from "@/lib/sync/room-client";
import { WebSpeechEngine } from "@/lib/stt/web-speech-engine";
import type { SttStatus } from "@/lib/stt/web-speech-engine";
import { MicrophoneCapture } from "@/lib/audio/microphone";
import {
  ChromeTranslator,
  FallbackTranslator,
} from "@/lib/translation/translator";
import { TransformersTranslator } from "@/lib/translation/transformers-translator";
import { detectCapabilities } from "@/lib/utils/capability-detect";
import type {
  RoomMessage,
  TranscriptSegment,
  TranscriptPayload,
  UserPayload,
  LanguagePayload,
  SupportedLang,
  TranslatedSegment,
} from "@/types";
import { LANG_SPEECH_CODES } from "@/types";
import type { Translator } from "@/lib/translation/translator";

export default function RoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center h-dvh">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <RoomPageContent />
    </Suspense>
  );
}

function RoomPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomId = params.id as string;
  const nameFromUrl = searchParams.get("name") || "Anonymous";

  const {
    userId,
    userName,
    isConnected,
    isListening,
    myLang,
    myTranscripts,
    partnerTranscripts,
    translations,
    partner,
    setRoomId,
    setUserName,
    setIsConnected,
    setIsListening,
    setMyLang,
    addMyTranscript,
    addPartnerTranscript,
    addTranslation,
    updateInterimTranscript,
    setPartner,
  } = useSessionStore();

  const roomClientRef = useRef<RoomClient | null>(null);
  const sttEngineRef = useRef<WebSpeechEngine | null>(null);
  const micRef = useRef<MicrophoneCapture | null>(null);
  const translatorRef = useRef<Translator | null>(null);
  const translatorLangPairRef = useRef<string>("");
  const isInitializingTranslator = useRef(false);
  const hasAnnouncedToPartner = useRef<string>("");
  const [copied, setCopied] = useState(false);
  const [translatorStatus, setTranslatorStatus] = useState("");
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [sttError, setSttError] = useState("");
  const [sttStatus, setSttStatus] = useState<SttStatus>("stopped");

  // --- Room connection ---
  useEffect(() => {
    setRoomId(roomId);
    setUserName(nameFromUrl);

    const client = new RoomClient(roomId);
    roomClientRef.current = client;
    client.connect();
    setIsConnected(true);

    setTimeout(() => {
      client.sendUserJoined(userId, nameFromUrl);
      client.sendLanguageSet(userId, myLang);
    }, 100);

    return () => {
      client.disconnect();
      setIsConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // --- Message handling ---
  const handleTranslate = useCallback(async (text: string) => {
    if (!translatorRef.current?.isReady()) return text;
    try {
      return await translatorRef.current.translate(text);
    } catch {
      return text;
    }
  }, []);

  useEffect(() => {
    if (!roomClientRef.current) return;

    const unsub = roomClientRef.current.onMessage(
      async (message: RoomMessage) => {
        if (!message?.type) return;

        switch (message.type) {
          case "transcript": {
            const payload = message.payload as TranscriptPayload;
            if (!payload?.segment) return;
            const { segment } = payload;
            if (segment.userId === userId) return;

            if (segment.isFinal) {
              addPartnerTranscript(segment);
              const translated = await handleTranslate(segment.text);
              const translatedSegment: TranslatedSegment = {
                id: `tr-${segment.id}`,
                originalText: segment.text,
                translatedText: translated,
                sourceLang: segment.lang,
                targetLang: myLang,
                timestamp: Date.now(),
                userName: segment.userName,
              };
              addTranslation(translatedSegment);
            } else {
              updateInterimTranscript(segment);
            }
            break;
          }
          case "user-joined": {
            const { userId: joinedId, userName: joinedName } =
              message.payload as UserPayload;
            if (joinedId !== userId) {
              // Preserve existing lang to avoid race condition where
              // user-joined arrives after language-set and resets lang to ""
              const current = useSessionStore.getState().partner;
              setPartner({
                userId: joinedId,
                userName: joinedName,
                lang: current?.userId === joinedId ? current.lang : "",
                isConnected: true,
              });
              // Only re-announce once per partner to avoid infinite loop
              if (hasAnnouncedToPartner.current !== joinedId) {
                hasAnnouncedToPartner.current = joinedId;
                roomClientRef.current?.sendUserJoined(userId, userName);
                roomClientRef.current?.sendLanguageSet(userId, myLang);
              }
            }
            break;
          }
          case "language-set": {
            const { userId: langUserId, lang } =
              message.payload as LanguagePayload;
            if (langUserId !== userId) {
              // Read latest state to avoid stale closure for partner.userName
              const current = useSessionStore.getState().partner;
              setPartner({
                userId: langUserId,
                userName: current?.userName || "Partner",
                lang,
                isConnected: true,
              });
            }
            break;
          }
        }
      },
    );

    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, myLang, handleTranslate]);

  // --- Translator init ---
  useEffect(() => {
    if (!partner?.lang || partner.lang === myLang) return;

    // Avoid re-initializing for the same language pair
    const langPair = `${partner.lang}-${myLang}`;
    if (translatorLangPairRef.current === langPair) return;
    if (isInitializingTranslator.current) return;

    isInitializingTranslator.current = true;
    translatorLangPairRef.current = langPair;

    const caps = detectCapabilities();

    async function initTranslator() {
      setIsLoadingModel(true);

      if (caps.chromeTranslatorApi) {
        try {
          setTranslatorStatus("Loading translation model...");
          const translator = new ChromeTranslator(partner!.lang, myLang, (loaded, total) => {
            const pct = Math.round((loaded / total) * 100);
            setTranslatorStatus(`Downloading translation model: ${pct}%`);
          });
          await translator.init();
          translatorRef.current = translator;
          setTranslatorStatus("Ready");
          setIsLoadingModel(false);
          isInitializingTranslator.current = false;
          return;
        } catch (e) {
          console.warn("Chrome Translator failed, trying Transformers.js:", e);
        }
      }

      try {
        setTranslatorStatus("Downloading translation model...");
        const translator = new TransformersTranslator(partner!.lang, myLang, (status) => {
          setTranslatorStatus(status);
        });
        await translator.init();
        translatorRef.current = translator;
        setTranslatorStatus("Ready");
      } catch (e) {
        console.error("Transformers.js failed:", e);
        translatorRef.current = new FallbackTranslator();
        setTranslatorStatus("Translation unavailable — showing original text");
      }

      setIsLoadingModel(false);
      isInitializingTranslator.current = false;
    }

    initTranslator();
  }, [partner?.lang, myLang]);

  // --- Actions ---
  const toggleListening = useCallback(async () => {
    if (isListening) {
      sttEngineRef.current?.stop();
      micRef.current?.stop();
      setMicStream(null);
      setIsListening(false);
      return;
    }

    const caps = detectCapabilities();
    if (!caps.webSpeechApi) {
      setSttError("Web Speech API is not supported. Please use Chrome or Safari.");
      return;
    }

    try {
      const mic = new MicrophoneCapture();
      const stream = await mic.start();
      micRef.current = mic;
      setMicStream(stream);

      setSttError("");
      setSttStatus("starting");
      const stt = new WebSpeechEngine(
        userId,
        userName,
        (segment: TranscriptSegment) => {
          if (segment.isFinal) {
            addMyTranscript(segment);
            roomClientRef.current?.sendTranscript(segment);
          } else {
            updateInterimTranscript(segment);
          }
        },
        (error: string) => {
          setSttError(error);
          setIsListening(false);
          micRef.current?.stop();
          setMicStream(null);
        },
        (status: SttStatus) => setSttStatus(status),
      );
      stt.start(LANG_SPEECH_CODES[myLang]);
      sttEngineRef.current = stt;
      setIsListening(true);
    } catch {
      setSttError("Could not access microphone. Please allow microphone permissions.");
    }
  }, [isListening, userId, userName, myLang, setIsListening, addMyTranscript, updateInterimTranscript]);

  const handleLangChange = useCallback(
    (lang: SupportedLang) => {
      setMyLang(lang);
      roomClientRef.current?.sendLanguageSet(userId, lang);
      if (isListening) {
        sttEngineRef.current?.setLang(LANG_SPEECH_CODES[lang]);
      }
    },
    [userId, isListening, setMyLang],
  );

  const copyRoomLink = useCallback(() => {
    const url = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomId]);

  const exportConversation = useCallback(() => {
    const lines = [
      `Yucall AI - Room ${roomId}`,
      `Date: ${new Date().toLocaleString()}`,
      `Participants: ${userName}, ${partner?.userName || "N/A"}`,
      "---",
      "",
    ];

    const allEntries = [
      ...myTranscripts
        .filter((s) => s.isFinal)
        .map((s) => ({ time: s.timestamp, name: s.userName, text: s.text })),
      ...translations.map((s) => ({
        time: s.timestamp,
        name: s.userName,
        text: `${s.translatedText} [${s.originalText}]`,
      })),
    ].sort((a, b) => a.time - b.time);

    for (const entry of allEntries) {
      const time = new Date(entry.time).toLocaleTimeString();
      lines.push(`[${time}] ${entry.name}: ${entry.text}`);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yucall-${roomId}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [roomId, userName, partner?.userName, myTranscripts, translations]);

  const hasContent = myTranscripts.length > 0 || translations.length > 0;

  return (
    <main className="flex-1 flex flex-col h-dvh">
      <RoomHeader
        roomId={roomId}
        isConnected={isConnected}
        partner={partner}
        copied={copied}
        onCopyLink={copyRoomLink}
      />

      <ControlsBar
        myLang={myLang}
        isListening={isListening}
        hasContent={hasContent}
        copied={copied}
        onLangChange={handleLangChange}
        onToggleListening={toggleListening}
        onExport={exportConversation}
        onCopyLink={copyRoomLink}
      />

      <ModelLoadingDialog open={isLoadingModel} status={translatorStatus} />

      {isListening ? (
        <div className="px-3 py-1 sm:px-4 border-b flex-shrink-0">
          <AudioVisualizer stream={micStream} isActive={isListening} />
        </div>
      ) : null}

      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        <TranscriptPanel
          myLang={myLang}
          isListening={isListening}
          sttStatus={sttStatus}
          sttError={sttError}
          transcripts={myTranscripts}
        />
        <TranslationPanel
          myLang={myLang}
          partner={partner}
          roomId={roomId}
          copied={copied}
          translations={translations}
          partnerTranscripts={partnerTranscripts}
          onCopyLink={copyRoomLink}
        />
      </div>
    </main>
  );
}
