"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import type { RoomUser, SupportedLang } from "@/types";
import { LANGUAGES } from "@/types";

interface RoomHeaderProps {
  roomId: string;
  isConnected: boolean;
  partner: RoomUser | null;
  copied: boolean;
  onCopyLink: () => void;
}

export function RoomHeader({
  roomId,
  isConnected,
  partner,
  copied,
  onCopyLink,
}: RoomHeaderProps) {
  return (
    <header className="border-b px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-2 sm:gap-3">
        <h1 className="text-base sm:text-lg font-bold">Yucall AI</h1>
        <Badge variant="outline" className="font-mono text-xs">
          {roomId}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCopyLink}
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
          <Badge variant="secondary" className="text-xs hidden sm:inline-flex">
            {partner.userName}
            {partner.lang
              ? ` (${LANGUAGES[partner.lang as SupportedLang] || partner.lang})`
              : ""}
          </Badge>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
