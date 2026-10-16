#!/usr/bin/env node
// Renders a Markdown file to a sequence of 1280x720 PNG frames via headless
// Chromium (puppeteer-core over CDP — same already-installed browser that
// create-pdf and agent-browser use, no second rendering engine).
//
// Slides are separated by a `---` horizontal rule. One PNG per slide, named
// frame-0001.png upward, written into the output directory. Assembling them
// into a video is ffmpeg's job (see create-video).
//
// Usage: make-slides.js <input.md> <output-dir> [width] [height]
const fs = require('fs');
const path = require('path');
const puppeteer = require('/opt/create-pdf/node_modules/puppeteer-core');
const { marked } = require('/opt/create-pdf/node_modules/marked');

const [, , inputPath, outDir, widthArg, heightArg] = process.argv;
const width = parseInt(widthArg || '1280', 10);
const height = parseInt(heightArg || '720', 10);

if (!inputPath || !outDir) {
  console.error('Usage: make-slides.js <input.md> <output-dir> [w] [h]');
  process.exit(1);
}

// Split on a `---` rule that sits alone on its line, so `---` inside fenced
// code blocks or YAML-ish content doesn't silently cut a slide in half.
function splitSlides(md) {
  const lines = md.split(/\r?\n/);
  const slides = [];
  let current = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && /^\s*---\s*$/.test(line)) {
      slides.push(current.join('\n'));
      current = [];
      continue;
    }
    current.push(line);
  }
  slides.push(current.join('\n'));
  return slides.map((s) => s.trim()).filter((s) => s.length > 0);
}

// Scaled against the 720p default so slides keep their proportions at any size.
const scale = height / 720;
const px = (n) => `${Math.round(n * scale)}px`;

function pageHtml(bodyHtml) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; }
  body {
    width: ${width}px;
    height: ${height}px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    box-sizing: border-box;
    padding: ${px(64)} ${px(80)};
    font-family: "Noto Sans", "Liberation Sans", "Noto Color Emoji", sans-serif;
    background: #ffffff;
    color: #14161a;
    font-size: ${px(30)};
    line-height: 1.45;
    overflow: hidden;
  }
  h1 { font-size: ${px(60)}; line-height: 1.15; margin: 0 0 ${px(24)}; }
  h2 { font-size: ${px(44)}; line-height: 1.2; margin: 0 0 ${px(20)}; }
  h3 { font-size: ${px(34)}; line-height: 1.25; margin: 0 0 ${px(16)}; }
  p, li { margin: 0 0 ${px(14)}; }
  ul, ol { margin: 0 0 ${px(14)}; padding-left: ${px(40)}; }
  strong { color: #000; }
  code, pre {
    font-family: "Liberation Mono", monospace;
    background: #f1f3f5;
    border-radius: ${px(6)};
  }
  code { padding: ${px(3)} ${px(8)}; font-size: 0.85em; }
  pre { padding: ${px(20)}; font-size: 0.7em; overflow: hidden; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; font-size: 0.8em; }
  th, td { border: 1px solid #ccd0d5; padding: ${px(8)} ${px(14)}; }
  blockquote {
    border-left: ${px(5)} solid #ccd0d5;
    margin: 0 0 ${px(14)};
    padding-left: ${px(20)};
    color: #495057;
  }
  img { max-width: 100%; max-height: ${px(420)}; object-fit: contain; }
  /* Centre a title-only slide, left-align anything with body content. */
  body.title-only { text-align: center; }
</style>
</head>
<body class="${/^<h1[^>]*>[\s\S]*<\/h1>\s*$/.test(bodyHtml.trim()) ? 'title-only' : ''}">${bodyHtml}</body>
</html>
`;
}

async function main() {
  const md = fs.readFileSync(inputPath, 'utf8');
  const slides = splitSlides(md);
  if (slides.length === 0) {
    console.error('No slide content found in ' + inputPath);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    for (let i = 0; i < slides.length; i++) {
      const body = marked.parse(slides[i], { gfm: true, breaks: false });
      // 'load' not 'networkidle0': these pages make no network requests, and
      // waiting for network idle hangs the second setContent onward.
      await page.setContent(pageHtml(body), { waitUntil: 'load' });
      const name = `frame-${String(i + 1).padStart(4, '0')}.png`;
      await page.screenshot({ path: path.join(outDir, name) });
    }
  } finally {
    await browser.close();
  }

  console.log(String(slides.length));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
