"use client";

import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ModelLoadingDialogProps {
  open: boolean;
  status: string;
}

export function ModelLoadingDialog({ open, status }: ModelLoadingDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader className="items-center text-center">
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mx-auto mb-2" />
          <DialogTitle>Downloading translation model</DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block text-sm font-medium text-foreground">
              {status}
            </span>
            <span className="block text-xs">
              This only happens once. The model will be cached for future use.
            </span>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
