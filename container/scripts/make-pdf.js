#!/usr/bin/env node
// Renders a Markdown file to PDF via headless Chromium, driven over the
// DevTools Protocol (puppeteer-core — no bundled browser, uses the Chromium
// already installed for agent-browser). CDP gives reliable control over
// header/footer and margins, unlike the undocumented `--print-to-pdf` CLI
// flags, which didn't actually suppress the browser-injected header/footer.
const fs = require('fs');
const puppeteer = require('/opt/create-pdf/node_modules/puppeteer-core');
const { marked } = require('/opt/create-pdf/node_modules/marked');

const [, , inputPath, outputPath, title] = process.argv;

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function main() {
  const md = fs.readFileSync(inputPath, 'utf8');
  const body = marked.parse(md, { gfm: true, breaks: false });

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(title || 'Document')}</title>
<style>
  body {
    font-family: "Noto Sans", "Liberation Sans", "Noto Color Emoji", sans-serif;
    margin: 0;
    line-height: 1.55;
    color: #1a1a1a;
    font-size: 14px;
  }
  h1, h2, h3 { line-height: 1.25; }
  code, pre {
    font-family: "Liberation Mono", monospace;
    background: #f4f4f4;
    border-radius: 3px;
  }
  code { padding: 2px 4px; }
  pre { padding: 12px; overflow-x: auto; }
  input[type="checkbox"] { margin-right: 6px; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; }
  blockquote {
    border-left: 3px solid #ccc;
    margin-left: 0;
    padding-left: 12px;
    color: #555;
  }
</style>
</head>
<body>${body}</body>
</html>
`;

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: '40px', bottom: '40px', left: '40px', right: '40px' },
    });
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
