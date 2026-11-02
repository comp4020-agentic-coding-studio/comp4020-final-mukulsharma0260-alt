// Dependency-free Markdown -> HTML for /readme/. Covers what this repo's
// README uses: ATX headings (with GitHub-style ids), paragraphs, lists,
// blockquotes, fenced code, pipe tables, thematic breaks, images, inline
// emphasis/code/links, HTML comments, and a short allowlist of block HTML
// (centred blocks, <picture>, <details>). Not a general-purpose engine.
//
// README.md is trusted repo content, but raw HTML still passes through an
// allowlist: unknown tags are escaped, every attribute not listed is dropped,
// and href/src/srcset must be relative, https or mailto, so no script, style,
// event handler or javascript: URL can reach the page.

export interface Heading {
  level: number;
  id: string;
  text: string;
}

export interface Rendered {
  html: string;
  headings: Heading[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const SAFE_URL = /^(https:\/\/|mailto:|#|\.{0,2}\/|[a-z0-9_-][a-z0-9_./-]*(#[a-z0-9_-]*)?$)/i;
const safeUrl = (url: string): string | undefined => (SAFE_URL.test(url.trim()) && !/^\s*javascript:/i.test(url) ? url.trim() : undefined);

const ALLOWED: Record<string, readonly string[]> = {
  p: ["align"],
  div: ["align"],
  a: ["href", "title"],
  img: ["src", "alt", "width", "height", "title"],
  picture: [],
  source: ["media", "srcset"],
  details: ["open"],
  summary: [],
  br: [],
  sub: [],
  sup: [],
  strong: [],
  em: [],
  code: [],
};
const URL_ATTRS = new Set(["href", "src", "srcset"]);

function sanitizeTag(tag: string): string {
  const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>$/.exec(tag);
  if (!m) return escapeHtml(tag);
  const [, close, rawName, rawAttrs, selfClose] = m;
  const name = rawName!.toLowerCase();
  const allowed = ALLOWED[name];
  if (!allowed) return escapeHtml(tag);
  if (close) return `</${name}>`;
  const attrs: string[] = [];
  for (const a of rawAttrs!.matchAll(/([a-zA-Z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    const key = a[1]!.toLowerCase();
    if (!allowed.includes(key)) continue;
    let value = a[2] ?? a[3] ?? a[4] ?? "";
    if (URL_ATTRS.has(key)) {
      const ok = key === "srcset" ? value.split(",").every((part) => safeUrl(part.trim().split(/\s+/)[0] ?? "")) : safeUrl(value);
      if (!ok) continue;
      value = value.trim();
    }
    if (name === "img" && (key === "width" || key === "height") && !/^\d+%?$/.test(value)) continue;
    attrs.push(value === "" && key === "open" ? " open" : ` ${key}="${escapeHtml(value)}"`);
  }
  if (name === "img") attrs.push(' loading="lazy" decoding="async"');
  return `<${name}${attrs.join("")}${selfClose ? " /" : ""}>`;
}

// Escapes text, but lets allowlisted inline tags through sanitized.
function escapeKeepingTags(text: string): string {
  return text
    .split(/(<\/?[a-zA-Z][^<>]*>)/)
    .map((part, i) => (i % 2 === 1 ? sanitizeTag(part) : escapeHtml(part)))
    .join("");
}

function renderInline(text: string): string {
  const codes: string[] = [];
  let out = text.replace(/`([^`]+)`/g, (_m, c: string) => `\u0000${codes.push(`<code>${escapeHtml(c)}</code>`) - 1}\u0000`);
  out = escapeKeepingTags(out);
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, src: string) => {
    const url = safeUrl(src.replace(/&amp;/g, "&"));
    return url ? `<img src="${escapeHtml(url)}" alt="${alt}" loading="lazy" decoding="async">` : alt;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    const url = safeUrl(href.replace(/&amp;/g, "&"));
    return url ? `<a href="${escapeHtml(url)}">${label}</a>` : label;
  });
  out = out.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_m, a, b) => `<strong>${a ?? b}</strong>`);
  out = out.replace(/(^|[^\w*])\*([^*\s][^*]*)\*(?!\w)|(^|\W)_([^_\s][^_]*)_(?!\w)/g, (_m, p1, a, p2, b) => `${p1 ?? p2}<em>${a ?? b}</em>`);
  return out.replace(/\u0000(\d+)\u0000/g, (_m, i) => codes[Number(i)]!);
}

const plain = (html: string): string => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// GitHub's anchor rule: lower-case, drop punctuation, spaces to hyphens.
function slug(text: string, seen: Map<string, number>): string {
  const base = text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n === 0 ? base : `${base}-${n}`;
}

const splitRow = (line: string): string[] =>
  line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
const isTableDivider = (line: string): boolean => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
const BLOCK_HTML = /^<\/?(p|div|picture|details|summary|source|img|br)\b/i;

export function renderMarkdownDocument(markdown: string): Rendered {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  const headings: Heading[] = [];
  const seen = new Map<string, number>();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === "") {
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const inner = renderInline(heading[2]!.trim());
      const text = plain(inner);
      const id = slug(text, seen);
      headings.push({ level, id, text });
      html.push(`<h${level} id="${id}">${inner}</h${level}>`);
      i++;
      continue;
    }

    if (/^ {0,3}([-*_])( *\1){2,} *$/.test(line)) {
      html.push("<hr>");
      i++;
      continue;
    }

    if (line.startsWith("<!--")) {
      while (i < lines.length && !lines[i]!.includes("-->")) i++;
      i++;
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

    if (BLOCK_HTML.test(line.trim())) {
      // One line of block HTML, sanitized; Markdown inside it is rendered inline.
      html.push(renderInline(line.trim()));
      i++;
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && isTableDivider(lines[i + 1]!)) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]!).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : ""));
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim() !== "") {
        rows.push(splitRow(lines[i]!));
        i++;
      }
      const cell = (tag: string, c: string, k: number) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ""}>${renderInline(c)}</${tag}>`;
      html.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((c, k) => cell("th", c, k)).join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${head.map((_, k) => cell("td", r[k] ?? "", k)).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
      continue;
    }

    if (/^>\s?/.test(line)) {
      const block: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) {
        block.push(lines[i]!.replace(/^>\s?/, ""));
        i++;
      }
      html.push(`<blockquote><p>${renderInline(block.join(" "))}</p></blockquote>`);
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
    while (
      i < lines.length &&
      lines[i]!.trim() !== "" &&
      !/^(#{1,6})\s+/.test(lines[i]!) &&
      !BLOCK_HTML.test(lines[i]!.trim()) &&
      !/^ {0,3}([-*_])( *\1){2,} *$/.test(lines[i]!)
    ) {
      para.push(lines[i]!);
      i++;
    }
    html.push(`<p>${renderInline(para.join(" "))}</p>`);
  }

  return { html: html.join("\n"), headings };
}

export function renderMarkdown(markdown: string): string {
  return renderMarkdownDocument(markdown).html;
}
