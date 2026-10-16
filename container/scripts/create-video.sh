#!/bin/bash
# Assemble short videos with ffmpeg (already installed for transcribe) and
# headless Chromium (already installed for agent-browser). No model generates
# footage here — this composes frames you supply or render.
#
# Usage:
#   create-video slides <input.md> <output.mp4> [--seconds N] [--audio FILE] [--size WxH]
#   create-video images <glob-or-dir> <output.mp4> [--seconds N] [--audio FILE] [--size WxH]
#   create-video gif    <input-video> <output.gif> [--fps N] [--width N]
set -euo pipefail

MODE="${1:-}"
IN="${2:-}"
OUT="${3:-}"

if [ -z "$MODE" ] || [ -z "$IN" ] || [ -z "$OUT" ]; then
  cat >&2 <<'USAGE'
Usage:
  create-video slides <input.md> <output.mp4> [--seconds N] [--audio FILE] [--size WxH]
  create-video images <glob-or-dir> <output.mp4> [--seconds N] [--audio FILE] [--size WxH]
  create-video gif    <input-video> <output.gif> [--fps N] [--width N]
USAGE
  exit 1
fi
shift 3

SECONDS_PER=4
AUDIO=""
SIZE="1280x720"
FPS=12
GIF_WIDTH=640

while [ $# -gt 0 ]; do
  case "$1" in
    --seconds) SECONDS_PER="$2"; shift 2 ;;
    --audio)   AUDIO="$2"; shift 2 ;;
    --size)    SIZE="$2"; shift 2 ;;
    --fps)     FPS="$2"; shift 2 ;;
    --width)   GIF_WIDTH="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

W="${SIZE%x*}"
H="${SIZE#*x}"

if [ -n "$AUDIO" ] && [ ! -f "$AUDIO" ]; then
  echo "Audio file not found: $AUDIO" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Build an mp4 from still frames listed in an ffmpeg concat file. Each frame is
# held for SECONDS_PER; the last one is repeated because ffmpeg's concat demuxer
# drops the final duration. Scaled and padded to exactly WxH so mixed-size
# inputs don't break H.264 (which needs even dimensions).
frames_to_mp4() {
  local list="$1"
  local vf="scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p"
  if [ -n "$AUDIO" ]; then
    ffmpeg -y -loglevel error -f concat -safe 0 -i "$list" -i "$AUDIO" \
      -vf "$vf" -r 30 -c:v libx264 -preset veryfast -crf 23 \
      -c:a aac -b:a 128k -shortest -movflags +faststart "$OUT"
  else
    ffmpeg -y -loglevel error -f concat -safe 0 -i "$list" \
      -vf "$vf" -r 30 -c:v libx264 -preset veryfast -crf 23 \
      -movflags +faststart "$OUT"
  fi
}

write_concat_list() {
  local list="$1"; shift
  : > "$list"
  local last=""
  for f in "$@"; do
    printf "file '%s'\nduration %s\n" "$(realpath "$f")" "$SECONDS_PER" >> "$list"
    last="$f"
  done
  [ -n "$last" ] && printf "file '%s'\n" "$(realpath "$last")" >> "$list"
}

case "$MODE" in
  slides)
    [ -f "$IN" ] || { echo "Markdown file not found: $IN" >&2; exit 1; }
    COUNT=$(node /opt/create-video/make-slides.js "$IN" "$TMP/frames" "$W" "$H")
    mapfile -t FRAMES < <(ls "$TMP"/frames/frame-*.png | sort)
    [ "${#FRAMES[@]}" -gt 0 ] || { echo "No slides rendered" >&2; exit 1; }
    write_concat_list "$TMP/list.txt" "${FRAMES[@]}"
    frames_to_mp4 "$TMP/list.txt"
    echo "Video written to $OUT (${COUNT} slides, ${SECONDS_PER}s each)"
    ;;

  images)
    if [ -d "$IN" ]; then
      mapfile -t FRAMES < <(find "$IN" -maxdepth 1 -type f \
        \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) | sort)
    else
      # Unquoted on purpose: the caller passes a glob for us to expand.
      mapfile -t FRAMES < <(ls $IN 2>/dev/null | sort)
    fi
    [ "${#FRAMES[@]}" -gt 0 ] || { echo "No images matched: $IN" >&2; exit 1; }
    write_concat_list "$TMP/list.txt" "${FRAMES[@]}"
    frames_to_mp4 "$TMP/list.txt"
    echo "Video written to $OUT (${#FRAMES[@]} images, ${SECONDS_PER}s each)"
    ;;

  gif)
    [ -f "$IN" ] || { echo "Input video not found: $IN" >&2; exit 1; }
    # Two-pass palette for decent colour instead of ffmpeg's default 256-colour
    # dither, which looks muddy on screenshots and charts.
    ffmpeg -y -loglevel error -i "$IN" \
      -vf "fps=${FPS},scale=${GIF_WIDTH}:-1:flags=lanczos,palettegen=stats_mode=diff" \
      "$TMP/palette.png"
    ffmpeg -y -loglevel error -i "$IN" -i "$TMP/palette.png" \
      -lavfi "fps=${FPS},scale=${GIF_WIDTH}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" \
      "$OUT"
    echo "GIF written to $OUT (${FPS}fps, ${GIF_WIDTH}px wide)"
    ;;

  *)
    echo "Unknown mode: $MODE (expected slides, images, or gif)" >&2
    exit 1
    ;;
esac
