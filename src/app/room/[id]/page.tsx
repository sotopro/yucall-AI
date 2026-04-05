"use client";

import { Suspense, useEffect, useRef, useCallback, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AudioVisualizer } from "@/components/audio-visualizer";
import { ThemeToggle } from "@/components/theme-toggle";
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
import { LANGUAGES, LANG_SPEECH_CODES } from "@/types";
import type { Translator } from "@/lib/translation/translator";

export default function RoomPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center h-dvh">Loading...</div>}>
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
  const myScrollRef = useRef<HTMLDivElement>(null);
  const partnerScrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [translatorStatus, setTranslatorStatus] = useState<string>("");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [sttError, setSttError] = useState<string>("");
  const [sttStatus, setSttStatus] = useState<SttStatus>("stopped");

  // Initialize room connection
  useEffect(() => {
    setRoomId(roomId);
    setUserName(nameFromUrl);

    const client = new RoomClient(roomId);
    roomClientRef.current = client;
    client.connect();
    setIsConnected(true);

    // Small delay to ensure connect() sets lastTimestamp before sending
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

  // Handle incoming messages
  const handleTranslate = useCallback(
    async (text: string) => {
      if (!translatorRef.current?.isReady()) {
        return text;
      }
      try {
        return await translatorRef.current.translate(text);
      } catch {
        return text;
      }
    },
    [],
  );

  useEffect(() => {
    if (!roomClientRef.current) return;

    const unsub = roomClientRef.current.onMessage(
      async (message: RoomMessage) => {
        if (!message || !message.type) return;

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
              setPartner({
                userId: joinedId,
                userName: joinedName,
                lang: "",
                isConnected: true,
              });
              // Re-announce ourselves so new partner knows we're here
              roomClientRef.current?.sendUserJoined(userId, userName);
              roomClientRef.current?.sendLanguageSet(userId, myLang);
            }
            break;
          }
          case "language-set": {
            const { userId: langUserId, lang } =
              message.payload as LanguagePayload;
            if (langUserId !== userId) {
              setPartner({
                userId: langUserId,
                userName: partner?.userName || "Partner",
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
  }, [userId, myLang, partner?.userName, handleTranslate]);

  // Initialize translator when partner language is known
  useEffect(() => {
    if (!partner?.lang || partner.lang === myLang) return;

    const caps = detectCapabilities();

    async function initTranslator() {
      if (caps.chromeTranslatorApi) {
        try {
          setTranslatorStatus("Loading translation model...");
          const translator = new ChromeTranslator(
            partner!.lang,
            myLang,
            (loaded, total) => {
              const pct = Math.round((loaded / total) * 100);
              setTranslatorStatus(`Downloading: ${pct}%`);
            },
          );
          await translator.init();
          translatorRef.current = translator;
          setTranslatorStatus("Ready");
          return;
        } catch (e) {
          console.warn(
            "Chrome Translator failed, falling back to Transformers.js:",
            e,
          );
        }
      }

      try {
        setTranslatorStatus("Loading translation model...");
        const translator = new TransformersTranslator(
          partner!.lang,
          myLang,
          (status) => {
            setTranslatorStatus(status);
          },
        );
        await translator.init();
        translatorRef.current = translator;
        setTranslatorStatus("Ready");
      } catch (e) {
        console.error("Transformers.js failed:", e);
        translatorRef.current = new FallbackTranslator();
        setTranslatorStatus(
          "Translation unavailable — showing original text",
        );
      }
    }

    initTranslator();
  }, [partner?.lang, myLang]);

  // Auto-scroll
  useEffect(() => {
    if (myScrollRef.current) {
      myScrollRef.current.scrollTop = myScrollRef.current.scrollHeight;
    }
  }, [myTranscripts]);

  useEffect(() => {
    if (partnerScrollRef.current) {
      partnerScrollRef.current.scrollTop =
        partnerScrollRef.current.scrollHeight;
    }
  }, [translations, partnerTranscripts]);

  const toggleListening = async () => {
    if (isListening) {
      sttEngineRef.current?.stop();
      micRef.current?.stop();
      setMicStream(null);
      setIsListening(false);
      return;
    }

    const caps = detectCapabilities();
    if (!caps.webSpeechApi) {
      setSttError(
        "Web Speech API is not supported in this browser. Please use Chrome or Safari.",
      );
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
        (status: SttStatus) => {
          setSttStatus(status);
        },
      );
      stt.start(LANG_SPEECH_CODES[myLang]);
      sttEngineRef.current = stt;
      setIsListening(true);
    } catch (e) {
      console.error("Failed to start microphone:", e);
      setSttError(
        "Could not access microphone. Please allow microphone permissions.",
      );
    }
  };

  const handleLangChange = (lang: SupportedLang) => {
    setMyLang(lang);
    roomClientRef.current?.sendLanguageSet(userId, lang);
    if (isListening) {
      sttEngineRef.current?.setLang(LANG_SPEECH_CODES[lang]);
    }
  };

  const copyRoomLink = () => {
    const url = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportConversation = () => {
    const lines: string[] = [];
    lines.push(`Yucall AI - Room ${roomId}`);
    lines.push(`Date: ${new Date().toLocaleString()}`);
    lines.push(`Participants: ${userName}, ${partner?.userName || "N/A"}`);
    lines.push("---");
    lines.push("");

    const allEntries = [
      ...myTranscripts
        .filter((s) => s.isFinal)
        .map((s) => ({
          time: s.timestamp,
          name: s.userName,
          text: s.text,
          type: "original" as const,
        })),
      ...translations.map((s) => ({
        time: s.timestamp,
        name: s.userName,
        text: `${s.translatedText} [${s.originalText}]`,
        type: "translated" as const,
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
  };

  return (
    <main className="flex-1 flex flex-col h-dvh">
      {/* Header */}
      <header className="border-b px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <h1 className="text-base sm:text-lg font-bold">Yucall AI</h1>
          <Badge variant="outline" className="font-mono text-xs">
            {roomId}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyRoomLink}
            className="text-xs cursor-pointer hidden sm:inline-flex"
          >
            {copied ? "Copied!" : "Copy link"}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={isConnected ? "default" : "destructive"}
            className="text-xs"
          >
            {isConnected ? "Connected" : "Offline"}
          </Badge>
          {partner && (
            <Badge
              variant="secondary"
              className="text-xs hidden sm:inline-flex"
            >
              {partner.userName}
              {partner.lang
                ? ` (${LANGUAGES[partner.lang as SupportedLang] || partner.lang})`
                : ""}
            </Badge>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* Controls bar */}
      <div className="border-b px-3 py-2 sm:px-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Language:</span>
          <select
            value={myLang}
            onChange={(e) =>
              handleLangChange(e.target.value as SupportedLang)
            }
            className="bg-background border rounded px-2 py-1 text-sm"
          >
            {Object.entries(LANGUAGES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          {translatorStatus && (
            <Badge
              variant={translatorStatus === "Ready" ? "default" : "outline"}
              className="text-xs"
            >
              {translatorStatus}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            onClick={toggleListening}
            variant={isListening ? "destructive" : "default"}
            className="cursor-pointer flex-1 sm:flex-none"
          >
            {isListening ? "Stop" : "Start"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportConversation}
            className="cursor-pointer text-xs"
            disabled={myTranscripts.length === 0 && translations.length === 0}
          >
            Export
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyRoomLink}
            className="cursor-pointer text-xs sm:hidden"
          >
            {copied ? "Copied!" : "Link"}
          </Button>
        </div>
      </div>

      {/* Audio visualizer */}
      {isListening && (
        <div className="px-3 py-1 sm:px-4 border-b flex-shrink-0">
          <AudioVisualizer stream={micStream} isActive={isListening} />
        </div>
      )}

      {/* Main content - two panels */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* My transcription panel */}
        <Card className="rounded-none border-0 md:border-r flex flex-col flex-1 min-h-0 border-b md:border-b-0">
          <CardHeader className="py-2 px-3 sm:px-4 flex-shrink-0">
            <CardTitle className="text-xs sm:text-sm flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${isListening ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}
              />
              My Speech ({LANGUAGES[myLang]})
              {isListening && (
                <Badge variant="outline" className="text-[10px] ml-1">
                  {sttStatus === "starting" && "Starting..."}
                  {sttStatus === "listening" && "Waiting for speech"}
                  {sttStatus === "speech-detected" && "Hearing you..."}
                  {sttStatus === "processing" && "Processing..."}
                  {sttStatus === "error" && "Error"}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="flex-1 p-0 min-h-0 overflow-y-auto">
            <div ref={myScrollRef} className="p-3 sm:p-4 space-y-2">
              {sttError && (
                <p className="text-red-500 text-sm text-center py-4 px-2">
                  {sttError}
                </p>
              )}
              {myTranscripts.length === 0 && !sttError && (
                <p className="text-muted-foreground text-sm text-center py-8">
                  {isListening
                    ? "Listening... Start speaking."
                    : "Press Start to begin."}
                </p>
              )}
              {myTranscripts.map((seg) => (
                <p
                  key={seg.id}
                  className={`text-sm leading-relaxed ${seg.isFinal ? "text-foreground" : "text-muted-foreground italic"}`}
                >
                  {seg.text}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Partner translation panel */}
        <Card className="rounded-none border-0 flex flex-col flex-1 min-h-0">
          <CardHeader className="py-2 px-3 sm:px-4 flex-shrink-0">
            <CardTitle className="text-xs sm:text-sm flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${partner ? "bg-blue-500" : "bg-gray-400"}`}
              />
              <span className="truncate">
                {partner
                  ? `${partner.userName}'s Speech`
                  : "Waiting for partner..."}
                {partner?.lang &&
                  ` (${LANGUAGES[partner.lang as SupportedLang] || partner.lang} → ${LANGUAGES[myLang]})`}
              </span>
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="flex-1 p-0 min-h-0 overflow-y-auto">
            <div ref={partnerScrollRef} className="p-3 sm:p-4 space-y-3">
              {!partner && (
                <div className="text-center py-8 space-y-3">
                  <p className="text-muted-foreground text-sm">
                    Share the room code with your conversation partner:
                  </p>
                  <p className="font-mono text-2xl font-bold tracking-widest">
                    {roomId}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyRoomLink}
                    className="cursor-pointer"
                  >
                    {copied ? "Copied!" : "Copy link"}
                  </Button>
                </div>
              )}
              {translations.map((seg) => (
                <div key={seg.id} className="space-y-1">
                  <p className="text-sm leading-relaxed text-foreground">
                    {seg.translatedText}
                  </p>
                  {seg.translatedText !== seg.originalText && (
                    <p className="text-xs text-muted-foreground italic">
                      {seg.originalText}
                    </p>
                  )}
                </div>
              ))}
              {partnerTranscripts
                .filter((s) => !s.isFinal)
                .map((seg) => (
                  <p
                    key={seg.id}
                    className="text-sm text-muted-foreground italic animate-pulse"
                  >
                    {seg.text}
                  </p>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
