"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function generateRoomId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [userName, setUserName] = useState("");

  const handleCreate = () => {
    if (!userName.trim()) return;
    const roomId = generateRoomId();
    router.push(`/room/${roomId}?name=${encodeURIComponent(userName.trim())}`);
  };

  const handleJoin = () => {
    if (!joinCode.trim() || !userName.trim()) return;
    router.push(
      `/room/${joinCode.trim().toUpperCase()}?name=${encodeURIComponent(userName.trim())}`,
    );
  };

  return (
    <main className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">Yucall AI</CardTitle>
          <CardDescription className="text-base">
            Real-time translation for your calls. Both participants open this
            app and speak — each sees the other&apos;s words translated to their
            language.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label
              htmlFor="userName"
              className="text-sm font-medium mb-2 block"
            >
              Your name
            </label>
            <Input
              id="userName"
              placeholder="Enter your name..."
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
          </div>

          <Button
            className="w-full text-lg py-6 cursor-pointer"
            size="lg"
            onClick={handleCreate}
            disabled={!userName.trim()}
          >
            Create Room
          </Button>

          <div className="flex items-center gap-4">
            <Separator className="flex-1" />
            <span className="text-sm text-muted-foreground">or join</span>
            <Separator className="flex-1" />
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Room code (e.g. ABC123)"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="font-mono text-center tracking-widest uppercase"
            />
            <Button
              variant="outline"
              onClick={handleJoin}
              disabled={!joinCode.trim() || !userName.trim()}
              className="cursor-pointer"
            >
              Join
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
