# CLAUDE.md - AI Assistant Guide for yucall-AI

## Project Overview

yucall-AI is a real-time bidirectional translation app for calls. Two people in a call (WeChat PC, Zoom, Google Meet, etc.) each open the app, join a shared room, and speak in their own language. Each person sees the other's words translated to their language in real-time.

**Supported languages**: Spanish, English, Chinese.

## Tech Stack

- **Framework**: Next.js 16 (App Router) with TypeScript
- **UI**: shadcn/ui + Tailwind CSS v4
- **State**: Zustand
- **Sync**: Redis on the VPS + HTTP polling via Next.js API routes
- **STT**: Web Speech API (Chrome + Safari)
- **Translation (Chrome)**: Chrome Translator API (local, on-device)
- **Translation (Safari/fallback)**: Transformers.js + OPUS-MT models (local, in-browser)
- **Deploy**: company VPS (Docker Swarm), image built by Forgejo CI from `main`

## Architecture

```
Browser A (mic → STT → text) ──→ VPS API + Redis ──→ Browser B (text → translate → display)
Browser B (mic → STT → text) ──→ VPS API + Redis ──→ Browser A (text → translate → display)
```

All heavy processing (STT + translation) runs in the browser. The server only relays text messages (~100 bytes each) via Redis on the VPS. Translation happens on the **receiver's** browser.

## Project Structure

```
src/
  app/
    page.tsx                         # Landing: create/join room
    room/[id]/page.tsx               # Main translation session
    api/ws/route.ts                  # HTTP polling relay (Redis)
    layout.tsx                       # Root layout
    globals.css                      # Global styles + shadcn theme
  components/
    ui/                              # shadcn/ui components
    audio-visualizer.tsx             # Real-time waveform display
    theme-toggle.tsx                 # Dark/light theme toggle
  lib/
    audio/microphone.ts              # getUserMedia wrapper
    stt/web-speech-engine.ts         # Web Speech API engine
    translation/translator.ts        # Chrome Translator API + fallback interface
    translation/transformers-translator.ts  # Transformers.js OPUS-MT (Safari)
    sync/room-client.ts              # Room sync client (HTTP polling)
    utils/capability-detect.ts       # Browser API detection
  stores/session-store.ts            # Zustand session state
  types/index.ts                     # Shared TypeScript types
public/
  manifest.json                      # PWA manifest
.env.example                         # Environment variables template
```

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run lint     # ESLint
npx tsc --noEmit # Type check
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_URL` | Yes | Redis URL (`rediss://` on the VPS; keys under `yc:`) |
| `WHISPER_URL` | No | Whisper server (speaches, OpenAI API); default `http://whisper.internal.evsn:8000` |
| `WHISPER_MODEL` | No | Default `Systran/faster-whisper-small` |
| `LIBRETRANSLATE_URL` | No | Default `http://libretranslate.internal.evsn:5000` |

Everything runs on the company VPS: no third-party services. The browser loads the translation
models from `/models/` and the ONNX runtime from `/ort/` on the same host.

### Local development

```bash
cp .env.example .env.local
# REDIS_URL=redis://localhost:6379, plus local speaches and LibreTranslate containers if needed
npm run dev
```

## Deploy

Merging to `main` builds the image on the company Forgejo CI; the infra repo deploys it
(`stacks/yucall.yml`).


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

- **Chrome** (full support: Web Speech API + Chrome Translator API)
- **Safari** (Web Speech API + Transformers.js OPUS-MT for translation)

### Translation Fallback Chain

1. Chrome Translator API (fastest, Chrome only)
2. Transformers.js + OPUS-MT models (cross-browser, downloads ~60MB per language pair on first use)
3. Passthrough (no translation, shows original text)

For es↔zh translation, Transformers.js uses a two-step process through English (es→en→zh or zh→en→es).
