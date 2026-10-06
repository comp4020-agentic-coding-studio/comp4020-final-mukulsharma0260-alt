// Minimal, dependency-free Markdown -> HTML for /readme/. Covers ATX
// headings, paragraphs, lists, blockquotes, fenced code, inline
// emphasis/code/links, and passes raw HTML comments through untouched.
// Not a general-purpose Markdown engine — just enough for this repo's docs.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_m, a, b) => `<strong>${a ?? b}</strong>`);
  out = out.replace(/\*([^*]+)\*|_([^_]+)_/g, (_m, a, b) => `<em>${a ?? b}</em>`);
  return out;
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === "") {
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      html.push(`<h${level}>${renderInline(heading[2]!.trim())}</h${level}>`);
      i++;
      continue;
    }

    if (line.startsWith("<!--")) {
      const block: string[] = [];
      while (i < lines.length && !lines[i]!.includes("-->")) {
        block.push(lines[i]!);
        i++;
      }
      if (i < lines.length) block.push(lines[i]!);
      i++;
      html.push(block.join("\n"));
      continue;
    }

    if (line.startsWith("```")) {
      const block: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) {
        block.push(lines[i]!);
        i++;
      }
      i++;
      html.push(`<pre><code>${escapeHtml(block.join("\n"))}</code></pre>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const block: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) {
        block.push(lines[i]!.replace(/^>\s?/, ""));
        i++;
      }
      html.push(`<blockquote>${renderInline(block.join(" "))}</blockquote>`);
      continue;
    }

    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i]!)) {
        items.push(`<li>${renderInline(lines[i]!.replace(/^[-*+]\s+/, ""))}</li>`);
        i++;
      }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i]!)) {
        items.push(`<li>${renderInline(lines[i]!.replace(/^\d+\.\s+/, ""))}</li>`);
        i++;
      }
      html.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "" && !/^(#{1,6})\s+/.test(lines[i]!)) {
      para.push(lines[i]!);
      i++;
    }
    html.push(`<p>${renderInline(para.join(" "))}</p>`);
  }

  return html.join("\n");
}
