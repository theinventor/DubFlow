# DubFlow - AI-Powered YouTube Video Dubbing

Transform any YouTube video into multiple languages with AI-powered dubbing. DubFlow extracts transcripts, detects video context, translates with domain-aware terminology, generates natural speech, and produces dubbed videos with optional burned-in captions.

## Features

- **Context-Aware Translation**: OpenAI analyzes the transcript to detect the video's domain (e.g., "Snowmobile Track Replacement" / "Automotive Repair") and uses appropriate terminology when translating
- **Optional Context Hints**: Tell the AI what the video is about for even better translations
- **OpenAI TTS**: Natural-sounding text-to-speech via OpenAI's `tts-1` model
- **Burned-In Captions**: Optionally burn translated captions into the video with configurable position (top/middle/bottom)
- **Smart Caching**: Transcript, translation, context, and final video are cached per video+language combo. Re-dubbing the same video is instant.
- **Auto-Caption Support**: Uses yt-dlp to reliably fetch auto-generated YouTube captions (not just manual subtitles)
- **Real-Time Progress**: SSE-based progress streaming with step-aware progress bars for translation batches and audio generation
- **Page Recovery**: Video ID and language are stored in the URL. If you refresh mid-process, the page polls for the completed video and recovers automatically.
- **Concurrent TTS**: 8 parallel audio generation requests for faster processing
- **16+ Languages**: Spanish, French, German, Italian, Portuguese, Russian, Japanese, Korean, Chinese, Hindi, Arabic, Dutch, Polish, Turkish, Thai, Vietnamese

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | Next.js 14, React 18, Tailwind CSS |
| **Backend** | Node.js, Express.js |
| **Translation** | OpenAI gpt-4o-mini (context-aware, batched) |
| **Text-to-Speech** | OpenAI tts-1 |
| **Transcript** | yt-dlp (primary), youtube-transcript (fallback) |
| **Video Processing** | FFmpeg, yt-dlp |

## Quick Start

```bash
git clone https://github.com/theinventor/DubFlow.git
cd DubFlow
./setup.sh
```

The setup script handles everything: checks Node.js v18+, installs FFmpeg, installs the **latest** yt-dlp directly from GitHub releases, installs npm dependencies for both backend and frontend, and prompts for your OpenAI API key.

Then start the app:

```bash
# Terminal 1 — Backend
cd Backend && node server.js

# Terminal 2 — Frontend
cd Frontend && npm run dev
```

Open http://localhost:3000

## Prerequisites

- **Node.js v18+** — [nodejs.org](https://nodejs.org/)
- **FFmpeg** — installed by `setup.sh`, or manually: `brew install ffmpeg` / `sudo apt install ffmpeg`
- **yt-dlp** — installed by `setup.sh` from [GitHub releases](https://github.com/yt-dlp/yt-dlp/releases/latest) (see note below)
- **OpenAI API key** — [platform.openai.com](https://platform.openai.com/api-keys)

> **Important:** Do not install yt-dlp from apt or brew — those packages are often months behind and will fail with YouTube API changes. The setup script installs the latest binary directly from GitHub. To update later: `sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp`

## Manual Setup

If you prefer not to use the setup script:

1. **Clone the repository**
   ```bash
   git clone https://github.com/theinventor/DubFlow.git
   cd DubFlow
   ```

2. **Install system dependencies**

   ```bash
   # FFmpeg
   brew install ffmpeg          # macOS
   sudo apt install ffmpeg      # Ubuntu/Debian

   # yt-dlp (always install from GitHub releases, not apt/brew)
   sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
   sudo chmod a+rx /usr/local/bin/yt-dlp
   ```

3. **Install npm dependencies**
   ```bash
   cd Backend && npm install
   cd ../Frontend && npm install
   ```

4. **Configure environment variables**

   Create `Backend/.env`:
   ```env
   OPENAI_API_KEY=sk-your-openai-key-here
   PORT=3001
   ```

5. **Run the app**

   Terminal 1 (backend):
   ```bash
   cd Backend && node server.js
   ```

   Terminal 2 (frontend):
   ```bash
   cd Frontend && npm run dev
   ```

6. Open http://localhost:3000

## How It Works

```
YouTube URL + Language + Optional Context Hint
    |
    v
Extract Video ID
    |
    v
Fetch Transcript (yt-dlp auto-captions, with npm fallback)
    |
    v
Detect Video Context (OpenAI gpt-4o-mini → domain, key terms, tone)
    |
    v
Translate in Batches of 50 (OpenAI gpt-4o-mini, context-aware prompts)
    |
    v
Generate TTS Audio (OpenAI tts-1, 8 concurrent requests)
    |
    v
Align Audio with Original Timestamps + Silence Gaps
    |
    v
Download Original Video (yt-dlp)
    |
    v
[Optional] Generate SRT + Burn Captions (FFmpeg subtitles filter)
    |
    v
Merge Video + Audio (FFmpeg)
    |
    v
Cache Result + Serve
```

## API Endpoints

### POST /api/dub-video

Dubs a YouTube video. Returns an SSE stream with progress events, then a final result.

**Request Body:**
```json
{
  "videoUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
  "targetLanguage": "spanish",
  "contextHint": "This is a video about fixing a snowmobile engine",
  "forceRefresh": false,
  "burnCaptions": true,
  "captionPosition": "bottom"
}
```

**SSE Progress Events:**
```
data: {"videoId":"abc123"}
data: {"step":"transcript","label":"Fetching transcript...","progress":null}
data: {"step":"translate","label":"Translating...","progress":40,"detail":"Batch 2/5"}
data: {"step":"audio","label":"Generating audio...","progress":75,"detail":"380/537"}
data: {"done":true,"success":true,"jobId":"...","downloadUrl":"/downloads/.../dubbed_video.mp4",...}
```

### GET /api/cache-status/:videoId/:language

Check if a cached dubbed video exists (used for page refresh recovery).

### POST /api/check-transcript

Validate transcript availability for a video.

### GET /api/job-status/:jobId

Check status of a dubbing job by job ID.

### GET /api/health

Health check.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key (used for translation + TTS) | Yes |
| `PORT` | Backend server port | No (default: 3001) |

## Cost Estimate

Per video (e.g., 537 segments / ~30 min video):
- **OpenAI Translation**: ~$0.01 (gpt-4o-mini, batched)
- **OpenAI TTS**: ~$0.40 (tts-1, ~27k characters)
- **Total**: ~$0.41 per video
- **Cached re-dub**: $0

## Caching

Results are cached in `Backend/downloads/cache/{videoId}_{language}/`:
- `transcript.json` — raw transcript
- `context.json` — detected video context
- `translation.json` — translated segments
- `dubbed_video.mp4` — final output

Same video + same language = instant return. Different language = reuses cached transcript.

## Troubleshooting

**"No transcript found"** — Make sure the video has captions (auto-generated or manual). yt-dlp handles auto-captions well, but some videos have none.

**yt-dlp errors / "Precondition check failed" / "Unable to extract"** — Your yt-dlp is outdated. YouTube changes their internal API frequently, which breaks older versions. Install the latest directly from GitHub (do **not** use `apt` or `brew` — those lag behind):
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

**Translation quality** — Use the "Context Hint" field to tell the AI what the video is about. This dramatically improves domain-specific terminology.

**Slow processing** — The TTS step is the bottleneck (one API call per segment, 8 concurrent). A 500-segment video takes a few minutes.

## Acknowledgments

- [OpenAI](https://openai.com/) for translation and text-to-speech APIs
- [FFmpeg](https://ffmpeg.org/) for video/audio processing
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) for YouTube downloads and caption extraction
- [youtube-transcript](https://github.com/Kakulukian/youtube-transcript) for fallback transcript extraction

Originally forked from [Badri467/DubFlow](https://github.com/Badri467/DubFlow).
