---
name: create-video
description: Assemble a short video or GIF from Markdown slides, images, or an existing clip using a local tool. Use this whenever asked for a video, slideshow, animation, or GIF file — never install your own video library (moviepy, imageio, opencv, ffmpeg-python, etc.) and never call a video generation API. This tool is already installed and renders in seconds.
allowed-tools: Bash(create-video:*)
---

# Video Assembly with `create-video`

A local tool composes short videos with ffmpeg and headless Chromium — both
already installed, no network calls.

```bash
create-video slides <input.md>       <output.mp4> [--seconds N] [--audio FILE] [--size WxH]
create-video images <glob-or-dir>    <output.mp4> [--seconds N] [--audio FILE] [--size WxH]
create-video gif    <input-video>    <output.gif> [--fps N] [--width N]
```

| Option | Applies to | Default | Meaning |
|---|---|---|---|
| `--seconds N` | slides, images | `4` | How long each slide/image is held |
| `--audio FILE` | slides, images | none | Soundtrack or narration; output ends with the shorter of audio/video |
| `--size WxH` | slides, images | `1280x720` | Output resolution |
| `--fps N` | gif | `12` | GIF frame rate |
| `--width N` | gif | `640` | GIF width in px (height follows aspect ratio) |

## What this does and does not do

It **composes** footage from material you provide or render: slides, image
sequences, existing clips. It does **not** generate footage from a text
description — no Claude model, this one included, outputs video. If the user
wants generated footage ("a video of a cat surfing"), say that plainly and
offer a slideshow or animation instead.

## Modes

**`slides`** — Markdown to a slide video. Separate slides with `---` on its own
line (ignored inside code fences). A slide that is only an `# H1` is centred as
a title card; anything else is left-aligned. Headings, lists, task lists,
tables, code blocks, blockquotes, and local images all render; Cyrillic and
emoji work (fonts are installed).

**`images`** — image sequence to video, from a directory or a glob. Files are
used in sorted order; mixed sizes are scaled and padded to fit, so nothing is
cropped or stretched.

**`gif`** — video to GIF, with a two-pass palette so charts and screenshots stay
legible. Keep GIFs short: a few seconds at `--width 640` is usually a couple of
MB, and they balloon fast.

## Workflow

1. Write slides as Markdown (or collect images) under `attachments/`.
2. Run `create-video` to produce the file.
3. Send it with `mcp__nanoclaw__send_document`.

Note: there is no inline video send tool, so the result is delivered as a file
attachment rather than a playable inline video.

## Example

```bash
cat > attachments/update.md << 'EOF'
# Weekly Update
## Week 42

---

## Shipped

- PDF export for reports
- Voice note transcription
- **3x** faster container start

---

## Next week

| Item | Owner |
|---|---|
| Video assembly | Andy |
| Slack channel | Rocky |
EOF

create-video slides attachments/update.md attachments/update.mp4 --seconds 5
```

Photo slideshow with music, vertical format:

```bash
create-video images attachments/photos attachments/trip.mp4 \
  --seconds 2.5 --audio attachments/music.mp3 --size 1080x1920
```

## Important

Do **not** `pip install` or `npm install` a video library (moviepy, imageio,
opencv, ffmpeg-python) and do not hand-roll ffmpeg pipelines for these cases.
Installing one burns minutes on a task that takes seconds, and raw ffmpeg
invocations routinely produce files that players reject — odd pixel
dimensions, a missing `yuv420p` pixel format, or a dropped final frame.
`create-video` already handles all of that — always use it instead.

For anything it does not cover (trimming, concatenating clips, overlays),
`ffmpeg` is available directly — use it for that, not to re-implement the
cases above.
