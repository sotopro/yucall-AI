# CLAUDE.md - AI Assistant Guide for yucall-AI

## Project Overview

yucall-AI is a real-time bidirectional translation app for calls. Two people in a call (WeChat PC, Zoom, Google Meet, etc.) each open the app, join a shared room, and speak in their own language. Each person sees the other's words translated to their language in real-time.

**Supported languages**: Spanish, English, Chinese.

## Tech Stack

- **Framework**: Next.js 16 (App Router) with TypeScript
- **UI**: shadcn/ui + Tailwind CSS v4
- **State**: Zustand
- **Sync**: Upstash Redis + HTTP polling via Next.js API routes
- **STT**: Web Speech API (Chrome + Safari)
- **Translation (Chrome)**: Chrome Translator API (local, on-device)
- **Translation (Safari/fallback)**: Transformers.js + OPUS-MT models (local, in-browser)
- **Deploy**: Vercel

## Architecture

```
Browser A (mic → STT → text) ──→ Vercel API + Redis ──→ Browser B (text → translate → display)
Browser B (mic → STT → text) ──→ Vercel API + Redis ──→ Browser A (text → translate → display)
```

All heavy processing (STT + translation) runs in the browser. The server only relays text messages (~100 bytes each) via Upstash Redis. Translation happens on the **receiver's** browser.

## Project Structure

```
src/
  app/
    page.tsx                         # Landing: create/join room
    room/[id]/page.tsx               # Main translation session
    api/ws/route.ts                  # HTTP polling relay (Upstash Redis)
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
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Redis REST API URL |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Redis REST API token |

### Local development

```bash
cp .env.example .env.local
# Fill in your Upstash Redis credentials
npm run dev
```

### Getting Upstash credentials (free)

1. Go to https://console.upstash.com/
2. Create a free account
3. Create a new Redis database (any region)
4. Copy the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from the dashboard

## Deploy to Vercel

1. Push code to GitHub
2. Import repository in Vercel dashboard (https://vercel.com/new)
3. Add environment variables in Vercel project settings:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Deploy

Or via CLI:
```bash
npx vercel --prod
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

- **Chrome** (full support: Web Speech API + Chrome Translator API)
- **Safari** (Web Speech API + Transformers.js OPUS-MT for translation)

### Translation Fallback Chain

1. Chrome Translator API (fastest, Chrome only)
2. Transformers.js + OPUS-MT models (cross-browser, downloads ~60MB per language pair on first use)
3. Passthrough (no translation, shows original text)

For es↔zh translation, Transformers.js uses a two-step process through English (es→en→zh or zh→en→es).
