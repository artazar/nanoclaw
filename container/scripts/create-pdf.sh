#!/bin/bash
# Render a Markdown file to PDF via headless Chromium (already installed for
# agent-browser — no extra rendering engine needed).
# Usage: create-pdf <input.md> <output.pdf> ["Title"]
set -e

IN="$1"
OUT="$2"
TITLE="${3:-Document}"

if [ -z "$IN" ] || [ -z "$OUT" ]; then
  echo "Usage: create-pdf <input.md> <output.pdf> [title]" >&2
  exit 1
fi

node /opt/create-pdf/make-pdf.js "$IN" "$OUT" "$TITLE"
echo "PDF written to $OUT"
