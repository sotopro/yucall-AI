"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useSessionStore } from "@/stores/session-store";
import { RoomClient } from "@/lib/sync/room-client";
import { WebSpeechEngine } from "@/lib/stt/web-speech-engine";
import { MicrophoneCapture } from "@/lib/audio/microphone";
import { ChromeTranslator, FallbackTranslator } from "@/lib/translation/translator";
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
import { LANGUAGES } from "@/types";
import type { Translator } from "@/lib/translation/translator";

export default function RoomPage() {
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

  // Initialize room connection
  useEffect(() => {
    setRoomId(roomId);
    setUserName(nameFromUrl);

    const client = new RoomClient(roomId);
    roomClientRef.current = client;
    client.connect();
    setIsConnected(true);

    client.sendUserJoined(userId, nameFromUrl);
    client.sendLanguageSet(userId, myLang);

    return () => {
      client.disconnect();
      setIsConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Handle incoming messages
  const handleTranslate = useCallback(
    async (text: string, sourceLang: string) => {
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
        switch (message.type) {
          case "transcript": {
            const { segment } = message.payload as TranscriptPayload;
            if (segment.userId === userId) return;

            if (segment.isFinal) {
              addPartnerTranscript(segment);
              const translated = await handleTranslate(
                segment.text,
                segment.lang,
              );
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
              // Re-announce ourselves
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
              setTranslatorStatus(`Downloading model: ${pct}%`);
            },
          );
          await translator.init();
          translatorRef.current = translator;
          setTranslatorStatus("Ready");
        } catch (e) {
          console.error("Chrome Translator failed:", e);
          translatorRef.current = new FallbackTranslator();
          setTranslatorStatus("Using passthrough (no translation API)");
        }
      } else {
        translatorRef.current = new FallbackTranslator();
        setTranslatorStatus("No translation API available");
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
      setIsListening(false);
      return;
    }

    const caps = detectCapabilities();
    if (!caps.webSpeechApi) {
      alert("Web Speech API is not supported in this browser. Please use Chrome or Safari.");
      return;
    }

    try {
      const mic = new MicrophoneCapture();
      await mic.start();
      micRef.current = mic;

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
      );
      stt.start(myLang);
      sttEngineRef.current = stt;
      setIsListening(true);
    } catch (e) {
      console.error("Failed to start microphone:", e);
      alert("Could not access microphone. Please allow microphone permissions.");
    }
  };

  const handleLangChange = (lang: SupportedLang) => {
    setMyLang(lang);
    roomClientRef.current?.sendLanguageSet(userId, lang);
    if (isListening) {
      sttEngineRef.current?.setLang(lang);
    }
  };

  const copyRoomLink = () => {
    const url = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="flex-1 flex flex-col h-screen">
      {/* Header */}
      <header className="border-b px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">Yucall AI</h1>
          <Badge variant="outline" className="font-mono">
            {roomId}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyRoomLink}
            className="text-xs cursor-pointer"
          >
            {copied ? "Copied!" : "Copy link"}
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={isConnected ? "default" : "destructive"}>
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
          {partner && (
            <Badge variant="secondary">
              {partner.userName}{" "}
              {partner.lang ? `(${LANGUAGES[partner.lang as SupportedLang] || partner.lang})` : ""}
            </Badge>
          )}
        </div>
      </header>

      {/* Language selector + Mic control */}
      <div className="border-b px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">My language:</span>
          <select
            value={myLang}
            onChange={(e) => handleLangChange(e.target.value as SupportedLang)}
            className="bg-background border rounded px-2 py-1 text-sm"
          >
            {Object.entries(LANGUAGES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          {translatorStatus && (
            <span className="text-xs text-muted-foreground ml-2">
              {translatorStatus}
            </span>
          )}
        </div>
        <Button
          onClick={toggleListening}
          variant={isListening ? "destructive" : "default"}
          size="lg"
          className="cursor-pointer"
        >
          {isListening ? "Stop" : "Start"} Listening
        </Button>
      </div>

      {/* Main content - two panels */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-0 min-h-0">
        {/* My transcription panel */}
        <Card className="rounded-none border-0 border-r flex flex-col min-h-0">
          <CardHeader className="py-3 flex-shrink-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${isListening ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}
              />
              My Speech ({LANGUAGES[myLang]})
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="flex-1 p-0 min-h-0">
            <ScrollArea className="h-full">
              <div ref={myScrollRef} className="p-4 space-y-2">
                {myTranscripts.length === 0 && (
                  <p className="text-muted-foreground text-sm text-center py-8">
                    {isListening
                      ? "Listening... Start speaking."
                      : 'Click "Start Listening" to begin.'}
                  </p>
                )}
                {myTranscripts.map((seg) => (
                  <p
                    key={seg.id}
                    className={`text-sm ${seg.isFinal ? "text-foreground" : "text-muted-foreground italic"}`}
                  >
                    {seg.text}
                  </p>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Partner translation panel */}
        <Card className="rounded-none border-0 flex flex-col min-h-0">
          <CardHeader className="py-3 flex-shrink-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${partner ? "bg-blue-500" : "bg-gray-400"}`}
              />
              {partner ? `${partner.userName}'s Speech` : "Waiting for partner..."}
              {partner?.lang &&
                ` (${LANGUAGES[partner.lang as SupportedLang] || partner.lang} → ${LANGUAGES[myLang]})`}
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="flex-1 p-0 min-h-0">
            <ScrollArea className="h-full">
              <div ref={partnerScrollRef} className="p-4 space-y-3">
                {!partner && (
                  <p className="text-muted-foreground text-sm text-center py-8">
                    Share the room code or link with your conversation partner.
                  </p>
                )}
                {translations.map((seg) => (
                  <div key={seg.id} className="space-y-1">
                    <p className="text-sm text-foreground">
                      {seg.translatedText}
                    </p>
                    {seg.translatedText !== seg.originalText && (
                      <p className="text-xs text-muted-foreground">
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
                      className="text-sm text-muted-foreground italic"
                    >
                      {seg.text}
                    </p>
                  ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
