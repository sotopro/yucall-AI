"use client";

import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type {
  TranscriptSegment,
  TranslatedSegment,
  RoomUser,
  SupportedLang,
} from "@/types";
import { LANGUAGES } from "@/types";

// --- Typewriter hook ---
function useTypewriter(text: string, speed = 20) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setDone(false);

    if (!text) {
      setDone(true);
      return;
    }

    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return { displayed, done };
}

// --- Translation bubble with streaming animation ---
function TranslationBubble({
  segment,
  isNew,
}: {
  segment: TranslatedSegment;
  isNew: boolean;
}) {
  const { displayed, done } = useTypewriter(
    isNew ? segment.translatedText : "",
    18,
  );
  const showText = isNew && !done ? displayed : segment.translatedText;
  const isDifferent = segment.translatedText !== segment.originalText;
  const time = new Date(segment.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="animate-message-in flex flex-col items-start gap-1 max-w-[85%]">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {segment.userName}
        </span>
        <span className="text-[10px] text-muted-foreground/60">{time}</span>
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-accent px-4 py-2.5 shadow-sm">
        <p
          className={`text-base leading-relaxed text-foreground ${isNew && !done ? "typewriter-cursor" : ""}`}
        >
          {showText}
        </p>
        {isDifferent && done ? (
          <p className="text-xs text-muted-foreground/70 italic mt-1.5 border-t border-border/50 pt-1.5">
            {segment.originalText}
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface TranslationPanelProps {
  myLang: SupportedLang;
  partner: RoomUser | null;
  roomId: string;
  copied: boolean;
  translations: TranslatedSegment[];
  partnerTranscripts: TranscriptSegment[];
  onCopyLink: () => void;
}

export function TranslationPanel({
  myLang,
  partner,
  roomId,
  copied,
  translations,
  partnerTranscripts,
  onCopyLink,
}: TranslationPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const [seenIds] = useState(() => new Set<string>());

  // Track which translation IDs are "new" (just arrived this render cycle)
  const newIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of translations) {
      if (!seenIds.has(t.id)) {
        ids.add(t.id);
        seenIds.add(t.id);
      }
    }
    return ids;
  }, [translations, seenIds]);

  // Auto-scroll when new content arrives
  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    const count = translations.length + partnerTranscripts.length;
    if (count > prevCountRef.current) {
      scrollToBottom();
    }
    prevCountRef.current = count;
  }, [translations, partnerTranscripts, scrollToBottom]);

  const interimTranscripts = useMemo(
    () => partnerTranscripts.filter((s) => !s.isFinal),
    [partnerTranscripts],
  );

  return (
    <Card className="rounded-none border-0 flex flex-col flex-1 min-h-0">
      <CardHeader className="py-2.5 px-3 sm:px-4 flex-shrink-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${partner ? "bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]" : "bg-gray-400"}`}
          />
          <span className="truncate font-medium">
            {partner
              ? `${partner.userName}'s Speech`
              : "Waiting for partner..."}
          </span>
          {partner?.lang ? (
            <span className="text-xs text-muted-foreground font-normal ml-auto flex-shrink-0">
              {LANGUAGES[partner.lang as SupportedLang] || partner.lang} → {LANGUAGES[myLang]}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="flex-1 p-0 min-h-0">
        <ScrollArea className="h-full">
          <div className="p-4 sm:p-5 space-y-4">
            {!partner ? (
              <div className="text-center py-12 space-y-4">
                <p className="text-muted-foreground text-base">
                  Share the room code with your conversation partner:
                </p>
                <p className="font-mono text-3xl font-bold tracking-widest">
                  {roomId}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCopyLink}
                  className="cursor-pointer"
                >
                  {copied ? "Copied!" : "Copy link"}
                </Button>
              </div>
            ) : null}

            {translations.map((seg) => (
              <TranslationBubble
                key={seg.id}
                segment={seg}
                isNew={newIds.has(seg.id)}
              />
            ))}

            {interimTranscripts.map((seg) => (
              <div
                key={seg.id}
                className="animate-message-in flex items-start gap-2 max-w-[85%]"
              >
                <div className="rounded-2xl rounded-tl-sm bg-muted/50 px-4 py-2.5">
                  <p className="text-base text-muted-foreground italic">
                    {seg.text}
                    <span className="inline-flex gap-0.5 ml-1.5 align-middle">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
                    </span>
                  </p>
                </div>
              </div>
            ))}

            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
