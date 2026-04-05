"use client";

import { useEffect, useRef, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { TranscriptSegment, SupportedLang } from "@/types";
import { LANGUAGES } from "@/types";
import type { SttStatus } from "@/lib/stt/web-speech-engine";

const STT_STATUS_LABELS: Record<string, string> = {
  starting: "Starting...",
  listening: "Waiting for speech",
  "speech-detected": "Hearing you...",
  processing: "Processing...",
  error: "Error",
};

interface TranscriptPanelProps {
  myLang: SupportedLang;
  isListening: boolean;
  sttStatus: SttStatus;
  sttError: string;
  transcripts: TranscriptSegment[];
}

export function TranscriptPanel({
  myLang,
  isListening,
  sttStatus,
  sttError,
  transcripts,
}: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts]);

  const statusLabel = useMemo(
    () => STT_STATUS_LABELS[sttStatus] || "",
    [sttStatus],
  );

  return (
    <Card className="rounded-none border-0 md:border-r flex flex-col flex-1 min-h-0 border-b md:border-b-0">
      <CardHeader className="py-2 px-3 sm:px-4 flex-shrink-0">
        <CardTitle className="text-xs sm:text-sm flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${isListening ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}
          />
          My Speech ({LANGUAGES[myLang]})
          {isListening && statusLabel ? (
            <Badge variant="outline" className="text-[10px] ml-1">
              {statusLabel}
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="flex-1 p-0 min-h-0">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div className="p-3 sm:p-4 space-y-2">
            {sttError ? (
              <Alert variant="destructive" className="my-2">
                <AlertDescription>{sttError}</AlertDescription>
              </Alert>
            ) : null}
            {transcripts.length === 0 && !sttError ? (
              <p className="text-muted-foreground text-sm text-center py-8">
                {isListening
                  ? "Listening... Start speaking."
                  : "Press Start to begin."}
              </p>
            ) : null}
            {transcripts.map((seg) => (
              <p
                key={seg.id}
                className={`text-sm leading-relaxed ${seg.isFinal ? "text-foreground" : "text-muted-foreground italic"}`}
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
