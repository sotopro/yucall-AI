# CLAUDE.md - AI Assistant Guide for yucall-AI

## Project Overview

yucall-AI is a real-time bidirectional translation app for calls. Two people in a call (WeChat PC, Zoom, Google Meet, etc.) each open the app, join a shared room, and speak in their own language. Each person sees the other's words translated to their language in real-time.

## Tech Stack

- **Framework**: Next.js 16 (App Router) with TypeScript
- **UI**: shadcn/ui + Tailwind CSS v4
- **State**: Zustand
- **Sync**: HTTP polling via Next.js API routes (upgradeable to PartyKit/WebSocket)
- **STT**: Web Speech API (Chrome + Safari)
- **Translation**: Chrome Translator API (with fallback for Safari)
- **Deploy**: Vercel

## Architecture

```
Browser A (mic → STT → text) ──→ API relay ──→ Browser B (text → translate → display)
Browser B (mic → STT → text) ──→ API relay ──→ Browser A (text → translate → display)
```

All heavy processing (STT + translation) runs in the browser. The server only relays text messages (~100 bytes each).

## Project Structure

```
src/
  app/
    page.tsx                    # Landing: create/join room
    room/[id]/page.tsx          # Main translation session
    api/ws/route.ts             # HTTP polling relay server
    layout.tsx                  # Root layout
    globals.css                 # Global styles + shadcn theme
  components/ui/                # shadcn/ui components
  lib/
    audio/microphone.ts         # getUserMedia wrapper
    stt/web-speech-engine.ts    # Web Speech API engine
    translation/translator.ts   # Chrome Translator API + fallback
    sync/room-client.ts         # Room sync client (HTTP polling)
    utils/capability-detect.ts  # Browser API detection
  stores/session-store.ts       # Zustand session state
  types/index.ts                # Shared TypeScript types
```

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run lint     # ESLint
npx tsc --noEmit # Type check
```

## Development Guidelines

### Git Workflow

- Use feature branches for all changes
- Write clear, descriptive commit messages
- Push to feature branches, never directly to `main`

### Code Standards

- TypeScript strict mode
- Use shadcn/ui components for all UI
- Follow Next.js App Router patterns (server components by default, "use client" when needed)
- Keep commits atomic and focused

### Supported Browsers

- Chrome (full support: Web Speech API + Chrome Translator API)
- Safari (partial: Web Speech API + Transformers.js for translation)

## Environment Setup

```bash
npm install      # Install dependencies
npm run dev      # Start development server at localhost:3000
```

No environment variables required for basic development.
