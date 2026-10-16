---
name: transcribe
description: Transcribe a voice note or audio file to text using a local whisper.cpp binary. Use this whenever asked to transcribe voice messages — never install or run your own speech-to-text model (e.g. @xenova/transformers, openai-whisper via pip). This tool is already installed and is far faster and lighter than doing it yourself.
allowed-tools: Bash(transcribe:*)
---

# Voice Transcription with `transcribe`

A prebuilt `whisper.cpp` binary is available as a single command. It handles
format conversion internally (ffmpeg under the hood), so it accepts whatever
audio format the voice note arrived in — `.oga`, `.ogg`, `.mp3`, `.wav`, etc.

```bash
transcribe <audio-file> [language]
```

- `<audio-file>` — path to the voice note, e.g. `attachments/voice_123.oga`
- `[language]` — optional ISO 639-1 code (e.g. `ru`, `en`). Defaults to
  `auto` (auto-detect), which works well in most cases.

Prints the plain-text transcript to stdout. No timestamps, no extra output.

## Example

```bash
transcribe attachments/voice_123.oga ru
```

## Important

Do **not** `npm install` or `pip install` a speech-to-text model (Whisper,
`@xenova/transformers`, etc.) to do this yourself. That runs a heavy
CPU-bound inference pipeline inside your own turn, which can take many
minutes, block you from responding, and destabilize the host. `transcribe`
already does this efficiently — always use it instead.

For multiple voice notes, call `transcribe` once per file; each call
finishes in roughly real-time or faster for the `base` model on CPU.
