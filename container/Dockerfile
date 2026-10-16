# NanoClaw Agent Container
# Runs Claude Agent SDK in isolated Linux VM with browser automation

FROM node:22-slim

# Install system dependencies for Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    libgbm1 \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libcups2 \
    libdrm2 \
    libxshmfence1 \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Build whisper.cpp for local voice transcription — a native CPU-efficient binary,
# not a heavy in-process WASM/ONNX pipeline the agent would otherwise have to invent
# (and one that pegs the container's capped CPU for the whole run).
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && git clone --depth 1 https://github.com/ggml-org/whisper.cpp /opt/whisper.cpp \
    && cmake -B /opt/whisper.cpp/build -S /opt/whisper.cpp -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /opt/whisper.cpp/build -j --config Release \
    && bash /opt/whisper.cpp/models/download-ggml-model.sh base /opt/whisper.cpp/models \
    && ln -s /opt/whisper.cpp/build/bin/whisper-cli /usr/local/bin/whisper-cli \
    && rm -rf /opt/whisper.cpp/.git

# Wrapper: convert any audio format to 16kHz mono WAV (what whisper-cli expects)
# and print a plain transcript. Usage: transcribe <audio-file> [language]
RUN printf '#!/bin/bash\nset -e\nIN="$1"\nLANG="${2:-auto}"\nif [ -z "$IN" ]; then\n  echo "Usage: transcribe <audio-file> [language]" >&2\n  exit 1\nfi\nTMP=$(mktemp -d)\ntrap '"'"'rm -rf "$TMP"'"'"' EXIT\nWAV="$TMP/audio.wav"\nffmpeg -y -loglevel error -i "$IN" -ar 16000 -ac 1 -c:a pcm_s16le "$WAV"\nwhisper-cli -m /opt/whisper.cpp/models/ggml-base.bin -f "$WAV" -l "$LANG" -t 1 -nt -np\n' > /usr/local/bin/transcribe \
    && chmod +x /usr/local/bin/transcribe

# PDF generation: render Markdown -> HTML -> PDF via headless Chromium, which
# is already installed above for agent-browser. Avoids pulling in a whole
# second rendering engine (pandoc/LaTeX/wkhtmltopdf) just for this.
# puppeteer-core drives our existing Chromium over CDP (no bundled browser) —
# needed for reliable displayHeaderFooter control, which the plain
# `--print-to-pdf` CLI flags don't actually expose.
RUN mkdir -p /opt/create-pdf && cd /opt/create-pdf && npm init -y >/dev/null && npm install marked puppeteer-core
COPY scripts/make-pdf.js /opt/create-pdf/make-pdf.js
COPY scripts/create-pdf.sh /usr/local/bin/create-pdf
RUN chmod +x /usr/local/bin/create-pdf

# Video assembly: compose slides/images/clips with ffmpeg (installed above
# for transcribe) and render Markdown slides to frames with the same
# Chromium create-pdf uses. node_modules is shared with create-pdf rather
# than installed twice - make-slides.js needs the same marked +
# puppeteer-core.
RUN mkdir -p /opt/create-video \
    && ln -s /opt/create-pdf/node_modules /opt/create-video/node_modules
COPY scripts/make-slides.js /opt/create-video/make-slides.js
COPY scripts/create-video.sh /usr/local/bin/create-video
RUN chmod +x /usr/local/bin/create-video

# Set Chromium path for agent-browser
ENV AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Install agent-browser and claude-code globally
RUN npm install -g agent-browser @anthropic-ai/claude-code

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY agent-runner/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY agent-runner/ ./

# Build TypeScript
RUN npm run build

# Create workspace directories
RUN mkdir -p /workspace/group /workspace/global /workspace/extra /workspace/ipc/messages /workspace/ipc/tasks /workspace/ipc/input

# Create entrypoint script
# Container input (prompt, group info) is passed via stdin JSON.
# Credentials are injected by the host's credential proxy — never passed here.
# Follow-up messages arrive via IPC files in /workspace/ipc/input/
RUN printf '#!/bin/bash\nset -e\ncd /app && npx tsc --outDir /tmp/dist 2>&1 >&2\nln -s /app/node_modules /tmp/dist/node_modules\nchmod -R a-w /tmp/dist\ncat > /tmp/input.json\nnode /tmp/dist/index.js < /tmp/input.json\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Set ownership to node user (non-root) for writable directories
RUN chown -R node:node /workspace && chmod 777 /home/node

# Switch to non-root user (required for --dangerously-skip-permissions)
USER node

# Set working directory to group workspace
WORKDIR /workspace/group

# Entry point reads JSON from stdin, outputs JSON to stdout
ENTRYPOINT ["/app/entrypoint.sh"]
