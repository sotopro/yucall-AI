"use client";

import { useEffect, useRef, useMemo, useCallback } from "react";
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (transcripts.length > prevCountRef.current) {
      scrollToBottom();
    }
    prevCountRef.current = transcripts.length;
  }, [transcripts, scrollToBottom]);

  const statusLabel = useMemo(
    () => STT_STATUS_LABELS[sttStatus] || "",
    [sttStatus],
  );

  return (
    <Card className="rounded-none border-0 md:border-r flex flex-col flex-1 min-h-0 border-b md:border-b-0">
      <CardHeader className="py-2.5 px-3 sm:px-4 flex-shrink-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isListening ? "bg-green-500 animate-pulse shadow-[0_0_6px_rgba(34,197,94,0.5)]" : "bg-gray-400"}`}
          />
          <span className="font-medium">My Speech ({LANGUAGES[myLang]})</span>
          {isListening && statusLabel ? (
            <Badge variant="outline" className="text-[10px] ml-auto">
              {statusLabel}
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="flex-1 p-0 min-h-0">
        <ScrollArea className="h-full">
          <div className="p-4 sm:p-5 space-y-3">
            {sttError ? (
              <Alert variant="destructive" className="my-2">
                <AlertDescription>{sttError}</AlertDescription>
              </Alert>
            ) : null}

            {transcripts.length === 0 && !sttError ? (
              <p className="text-muted-foreground text-base text-center py-12">
                {isListening
                  ? "Listening... Start speaking."
                  : "Press Start to begin."}
              </p>
            ) : null}

            {transcripts.map((seg) =>
              seg.isFinal ? (
                <div
                  key={seg.id}
                  className="animate-message-in flex flex-col items-end gap-1 max-w-[85%] ml-auto"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground/60">
                      {new Date(seg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      You
                    </span>
                  </div>
                  <div className="rounded-2xl rounded-tr-sm bg-primary/10 px-4 py-2.5 shadow-sm">
                    <p className="text-base leading-relaxed text-foreground">
                      {seg.text}
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  key={seg.id}
                  className="flex items-end gap-1 max-w-[85%] ml-auto"
                >
                  <div className="rounded-2xl rounded-tr-sm bg-muted/50 px-4 py-2.5">
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
              ),
            )}

            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
