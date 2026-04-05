"use client";

import { useEffect, useRef, useMemo } from "react";
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

interface TranslationItemProps {
  segment: TranslatedSegment;
}

function TranslationItem({ segment }: TranslationItemProps) {
  const isDifferent = segment.translatedText !== segment.originalText;
  return (
    <div className="space-y-1">
      <p className="text-sm leading-relaxed text-foreground">
        {segment.translatedText}
      </p>
      {isDifferent ? (
        <p className="text-xs text-muted-foreground italic">
          {segment.originalText}
        </p>
      ) : null}
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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [translations, partnerTranscripts]);

  const interimTranscripts = useMemo(
    () => partnerTranscripts.filter((s) => !s.isFinal),
    [partnerTranscripts],
  );

  return (
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
            {partner?.lang
              ? ` (${LANGUAGES[partner.lang as SupportedLang] || partner.lang} → ${LANGUAGES[myLang]})`
              : ""}
          </span>
        </CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="flex-1 p-0 min-h-0">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div className="p-3 sm:p-4 space-y-3">
            {!partner ? (
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
                  onClick={onCopyLink}
                  className="cursor-pointer"
                >
                  {copied ? "Copied!" : "Copy link"}
                </Button>
              </div>
            ) : null}
            {translations.map((seg) => (
              <TranslationItem key={seg.id} segment={seg} />
            ))}
            {interimTranscripts.map((seg) => (
              <p
                key={seg.id}
                className="text-sm text-muted-foreground italic animate-pulse"
              >
                {seg.text}
              </p>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
