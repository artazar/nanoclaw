---
name: create-pdf
description: Generate a PDF from Markdown content using a local tool. Use this whenever asked to create a PDF, report, document, or to-do list as a file — never install your own PDF library (reportlab, weasyprint, pandoc, wkhtmltopdf, etc.) or write one from scratch. This tool is already installed and renders in seconds.
allowed-tools: Bash(create-pdf:*)
---

# PDF Generation with `create-pdf`

A local tool converts Markdown straight to PDF (via headless Chromium — no
extra install, no network calls).

```bash
create-pdf <input.md> <output.pdf> ["Title"]
```

- `<input.md>` — a Markdown file you've written, e.g. `attachments/todo.md`
- `<output.pdf>` — where to write the PDF, e.g. `attachments/todo.pdf`
- `["Title"]` — optional document title (shown in the PDF metadata/tab title)

## Workflow

1. Write your content as Markdown to a file under `attachments/`.
2. Run `create-pdf attachments/todo.md attachments/todo.pdf "Weekly To-Do"`.
3. Send the resulting PDF with `mcp__nanoclaw__send_document`.

## Supported Markdown

Headings, bold/italic, bullet and numbered lists, GitHub-style task lists
(`- [ ]` / `- [x]`), code blocks, tables, blockquotes, and links. Cyrillic
and emoji render correctly (fonts are already installed).

## Example

```bash
cat > attachments/todo.md << 'EOF'
# Weekly To-Do — Week 40

- [ ] Review PRs
- [ ] Write status update
- [x] Deploy hotfix

> Quote of the week: "..."
EOF

create-pdf attachments/todo.md attachments/todo.pdf "Weekly To-Do"
```

## Important

Do **not** `pip install` or `npm install` a PDF library, and do not shell out
to `pandoc` or `wkhtmltopdf` — none of those are installed, and installing
one yourself burns minutes on a task that should take seconds. `create-pdf`
already handles this efficiently — always use it instead.
