# CLAUDE.md — DubFlow

## What is this project?

DubFlow is an AI-powered YouTube video dubbing app. Users paste a YouTube URL, pick a target language, and get back the original video with translated, AI-generated voiceover (and optionally burned-in captions). It uses OpenAI for context-aware translation (gpt-4o-mini) and text-to-speech (tts-1).

## Project structure

```
Backend/           Node.js/Express API server (CommonJS)
  server.js        Main server — all endpoints + dubbing pipeline (~760 lines)
  transcript-fetcher.js   YouTube transcript extraction (yt-dlp + npm fallback)
  .env             OPENAI_API_KEY (required), PORT (default 3001)

Frontend/          Next.js 14 + React 18 + Tailwind CSS
  components/YouTubeDubber.js   Main (and only) UI component (~475 lines)
  app/page.tsx     Home page wrapper
  app/layout.tsx   Root layout with metadata
```

## Setup & run

**Prerequisites:** Node.js v18+, FFmpeg, yt-dlp, an OpenAI API key.

```bash
# Install deps
cd Backend && npm install
cd ../Frontend && npm install

# Configure
echo "OPENAI_API_KEY=sk-..." > Backend/.env

# Run (two terminals)
cd Backend && node server.js        # API on :3001
cd Frontend && npm run dev           # UI on :3000
```

## Backend API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/dub-video` | Main dubbing endpoint (SSE stream) |
| GET | `/api/cache-status/:videoId/:language` | Check for cached result |
| POST | `/api/check-transcript` | Validate transcript availability |
| GET | `/api/job-status/:jobId` | Check job status |
| GET | `/api/health` | Health check |
| GET | `/downloads/*` | Static file serving |

## Dubbing pipeline flow

1. Extract video ID from URL
2. Fetch transcript (yt-dlp primary, youtube-transcript npm fallback)
3. Detect video context via OpenAI (domain, key terms, tone)
4. Translate in batches of 50 segments (OpenAI gpt-4o-mini)
5. Generate TTS audio (OpenAI tts-1, 8 concurrent requests)
6. Align audio with original timestamps + silence gaps
7. Download original video (yt-dlp)
8. Optionally generate SRT + burn captions (FFmpeg)
9. Merge video + dubbed audio (FFmpeg)
10. Cache result and serve

## Key patterns & conventions

- **SSE streaming** for real-time progress from backend to frontend
- **Batch processing** — translations in groups of 50 segments
- **Concurrency** — 8 parallel TTS requests (`CONCURRENCY = 8`)
- **Multi-level caching** in `Backend/downloads/cache/{videoId}_{language}/` (transcript, context, translation, final video)
- **Fallback pattern** — yt-dlp falls back to youtube-transcript npm package
- **Page recovery** — video ID and language stored in URL query params; frontend polls cache-status on reload
- **Backend:** CommonJS, async/await, console logs with emoji prefixes
- **Frontend:** React hooks, `'use client'` component, Tailwind glassmorphism UI
- **Naming:** camelCase functions/variables, UPPER_SNAKE_CASE constants

## Common commands

```bash
# Backend dev (auto-reload)
cd Backend && npx nodemon server.js

# Frontend dev
cd Frontend && npm run dev

# Frontend production build
cd Frontend && npm run build && npm start

# Lint frontend
cd Frontend && npm run lint
```

## Things to know

- No automated tests exist yet
- No Docker setup — runs directly on the host
- FFmpeg commands have a 10-minute timeout for re-encoding (caption burning)
- Downloaded/cached videos live in `Backend/downloads/` — no automatic cleanup
- The frontend is a single component (`YouTubeDubber.js`) — all UI logic lives there
- 16 languages supported (see `LANGUAGE_VOICES` map in server.js)
- Translation output uses numbered-line format `[N] text` parsed via regex
