"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SupportedLang } from "@/types";
import { LANGUAGES } from "@/types";

interface ControlsBarProps {
  myLang: SupportedLang;
  isListening: boolean;
  hasContent: boolean;
  copied: boolean;
  onLangChange: (lang: SupportedLang) => void;
  onToggleListening: () => void;
  onExport: () => void;
  onCopyLink: () => void;
}

export function ControlsBar({
  myLang,
  isListening,
  hasContent,
  copied,
  onLangChange,
  onToggleListening,
  onExport,
  onCopyLink,
}: ControlsBarProps) {
  return (
    <div className="border-b px-3 py-2 sm:px-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 flex-shrink-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Language:</span>
        <Select
          value={myLang}
          onValueChange={(value) => onLangChange(value as SupportedLang)}
        >
          <SelectTrigger className="w-[130px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(LANGUAGES).map(([code, name]) => (
              <SelectItem key={code} value={code}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <Button
          onClick={onToggleListening}
          variant={isListening ? "destructive" : "default"}
          className="cursor-pointer flex-1 sm:flex-none"
        >
          {isListening ? "Stop" : "Start"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          className="cursor-pointer text-xs"
          disabled={!hasContent}
        >
          Export
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCopyLink}
          className="cursor-pointer text-xs sm:hidden"
        >
          {copied ? "Copied!" : "Link"}
        </Button>
      </div>
    </div>
  );
}
