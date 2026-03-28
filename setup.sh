#!/usr/bin/env bash
set -e

# DubFlow Setup Script
# Installs all dependencies and configures the app to run locally.

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# -----------------------------------------------------------
# 1. Check for Node.js
# -----------------------------------------------------------
info "Checking Node.js..."
if command -v node &>/dev/null; then
    NODE_VERSION=$(node -v)
    NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_MAJOR" -lt 18 ]; then
        error "Node.js $NODE_VERSION found but v18+ is required."
        error "Install a newer version: https://nodejs.org/"
        exit 1
    fi
    info "Node.js $NODE_VERSION OK"
else
    error "Node.js not found. Install v18+: https://nodejs.org/"
    exit 1
fi

# -----------------------------------------------------------
# 2. Check for npm
# -----------------------------------------------------------
if ! command -v npm &>/dev/null; then
    error "npm not found. It should come with Node.js — check your installation."
    exit 1
fi
info "npm $(npm -v) OK"

# -----------------------------------------------------------
# 3. Install FFmpeg
# -----------------------------------------------------------
info "Checking FFmpeg..."
if command -v ffmpeg &>/dev/null; then
    info "FFmpeg already installed: $(ffmpeg -version 2>&1 | head -1)"
else
    warn "FFmpeg not found. Installing..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &>/dev/null; then
            brew install ffmpeg
        else
            error "Homebrew not found. Install FFmpeg manually: https://ffmpeg.org/download.html"
            exit 1
        fi
    elif [[ -f /etc/debian_version ]]; then
        sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg
    elif [[ -f /etc/redhat-release ]]; then
        sudo dnf install -y ffmpeg
    else
        error "Could not auto-install FFmpeg. Install it manually: https://ffmpeg.org/download.html"
        exit 1
    fi
    info "FFmpeg installed: $(ffmpeg -version 2>&1 | head -1)"
fi

# -----------------------------------------------------------
# 4. Install yt-dlp (latest release binary — NOT from apt/brew)
# -----------------------------------------------------------
info "Checking yt-dlp..."
YTDLP_INSTALLED=false
if command -v yt-dlp &>/dev/null; then
    YTDLP_VERSION=$(yt-dlp --version 2>/dev/null || echo "unknown")
    # Treat anything older than 2025 as outdated
    YTDLP_YEAR=$(echo "$YTDLP_VERSION" | cut -d. -f1)
    if [ "$YTDLP_YEAR" -ge 2025 ] 2>/dev/null; then
        info "yt-dlp $YTDLP_VERSION OK"
        YTDLP_INSTALLED=true
    else
        warn "yt-dlp $YTDLP_VERSION is outdated (YouTube breaks old versions frequently)."
    fi
fi

if [ "$YTDLP_INSTALLED" = false ]; then
    info "Installing latest yt-dlp from GitHub releases..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        YTDLP_BIN="yt-dlp_macos"
    else
        YTDLP_BIN="yt-dlp"
    fi

    INSTALL_DIR="/usr/local/bin"
    if [ -w "$INSTALL_DIR" ]; then
        curl -L "https://github.com/yt-dlp/yt-dlp/releases/latest/download/$YTDLP_BIN" -o "$INSTALL_DIR/yt-dlp"
        chmod a+rx "$INSTALL_DIR/yt-dlp"
    else
        sudo curl -L "https://github.com/yt-dlp/yt-dlp/releases/latest/download/$YTDLP_BIN" -o "$INSTALL_DIR/yt-dlp"
        sudo chmod a+rx "$INSTALL_DIR/yt-dlp"
    fi
    info "yt-dlp $(yt-dlp --version) installed"
fi

# -----------------------------------------------------------
# 5. Install npm dependencies
# -----------------------------------------------------------
info "Installing Backend dependencies..."
cd "$SCRIPT_DIR/Backend" && npm install

info "Installing Frontend dependencies..."
cd "$SCRIPT_DIR/Frontend" && npm install

# -----------------------------------------------------------
# 6. Configure environment
# -----------------------------------------------------------
cd "$SCRIPT_DIR"

if [ ! -f Backend/.env ]; then
    if [ -n "$OPENAI_API_KEY" ]; then
        info "Creating Backend/.env from OPENAI_API_KEY environment variable..."
        cat > Backend/.env <<EOF
OPENAI_API_KEY=$OPENAI_API_KEY
PORT=3001
EOF
    else
        warn "No Backend/.env found and OPENAI_API_KEY not set in environment."
        echo ""
        read -rp "Enter your OpenAI API key (or press Enter to skip): " API_KEY
        if [ -n "$API_KEY" ]; then
            cat > Backend/.env <<EOF
OPENAI_API_KEY=$API_KEY
PORT=3001
EOF
            info "Backend/.env created."
        else
            warn "Skipped. Create Backend/.env manually before running the app:"
            echo "  echo 'OPENAI_API_KEY=sk-...' > Backend/.env"
        fi
    fi
else
    info "Backend/.env already exists, skipping."
fi

# -----------------------------------------------------------
# Done
# -----------------------------------------------------------
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  DubFlow setup complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "  Start the app:"
echo ""
echo "    # Terminal 1 — Backend"
echo "    cd Backend && node server.js"
echo ""
echo "    # Terminal 2 — Frontend"
echo "    cd Frontend && npm run dev"
echo ""
echo "  Then open http://localhost:3000"
echo ""
