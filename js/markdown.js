import { escapeHtml, safeUrl } from './utils.js';

// A deliberately small slice of Markdown for post bodies: headings, bullet
// and numbered lists, paragraphs, **bold**, *italic*, `code`, [text](url)
// and bare links. Nothing here ever emits raw user HTML - every piece of
// text goes through escapeHtml and every href through safeUrl - so a post
// can be formatted without becoming a place to inject markup.
//
// Plain text posts (which is most of them) come out as paragraphs with
// their line breaks kept, i.e. the same as the old pre-wrap rendering.
//
// mobile/src/lib/markdown.ts is the same parser for the app; keep the two
// in step.

const HEADING = /^(#{1,3})\s+(.+?)\s*#*\s*$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
// A picture is a line of its own: ![caption](https://...). The caption is
// optional and doubles as the alt text.
// Addresses may hold balanced parentheses - Wikipedia's File_(1).jpg - which
// used to cut the address short and leave the rest as text.
const IMAGE = /^\s*!\[([^\]\n]*)\]\((https?:\/\/(?:[^\s()]|\([^\s()]*\))+)\)\s*$/;

// Splits the text into blocks. Each block is one of:
//   { type: 'heading', level: 1-3, text }
//   { type: 'list', ordered: bool, items: [text] }
//   { type: 'para', lines: [text] }
//   { type: 'image', src, caption }
export function parseBlocks(source) {
  const blocks = [];
  let para = null;
  let list = null;
  const close = () => {
    para = null;
    list = null;
  };

  for (const raw of String(source ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      close();
      continue;
    }

    const image = line.match(IMAGE);
    if (image) {
      close();
      blocks.push({ type: 'image', src: image[2], caption: image[1].trim() });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      close();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      continue;
    }

    const bullet = line.match(BULLET);
    const ordered = bullet ? null : line.match(ORDERED);
    if (bullet || ordered) {
      const isOrdered = !!ordered;
      if (!list || list.ordered !== isOrdered) {
        para = null;
        list = { type: 'list', ordered: isOrdered, items: [] };
        blocks.push(list);
      }
      list.items.push((bullet || ordered)[1]);
      continue;
    }

    // A line straight after a list item with no marker of its own is a
    // wrapped continuation of that item, not a new paragraph.
    if (list) {
      list.items[list.items.length - 1] += ' ' + line.trim();
      continue;
    }

    if (!para) {
      para = { type: 'para', lines: [] };
      blocks.push(para);
    }
    para.lines.push(line);
  }
  return blocks;
}

// An image written in the middle of a sentence has nowhere to go, so the
// leading ! is swallowed and it reads as an ordinary link.
// Links and inline code first, so their contents are never read as
// emphasis; then ***bold italic***, **bold** / __bold__, then *italic* /
// _italic_.
const INLINE = /!?\[([^\]\n]+)\]\((https?:\/\/(?:[^\s()]|\([^\s()]*\))+)\)|(https?:\/\/(?:[^\s<>()]|\([^\s<>()]*\))*(?:[^\s<>().,;:!?'"]|\([^\s<>()]*\)))|`([^`\n]+)`|\*\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*\*|\*\*(?!\s)((?:[^*\n]|\*(?!\*))+?)(?<!\s)\*\*|(?<![\w_])__(?!\s)([^_\n]+?)(?<!\s)__(?![\w_])|(?<![\w*])\*(?![\s*])((?:[^*\n]|\*\*[^*\n]+?\*\*)+?)(?<![\s*])\*(?![\w*])|(?<![\w_])_(?![\s_])((?:[^_\n]|__[^_\n]+?__)+?)(?<![\s_])_(?![\w_])/g;

// Splits one line into { type: 'text' | 'link' | 'code', text, href?, bold?,
// italic? } tokens. Emphasis nests - **bold *and italic* inside**, ***both***,
// _**both**_ - so a bold or italic span is read again for what's inside it,
// and its tokens carry the style down.
export function parseInline(source, style = {}) {
  const text = String(source ?? '');
  const tokens = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) tokens.push({ type: 'text', text: text.slice(last, m.index), ...style });
    if (m[1] !== undefined) tokens.push({ type: 'link', text: m[1], href: m[2], ...style });
    else if (m[3] !== undefined) tokens.push({ type: 'link', text: linkLabel(m[3]), href: m[3], ...style });
    else if (m[4] !== undefined) tokens.push({ type: 'code', text: m[4], ...style });
    else if (m[5] !== undefined) tokens.push(...parseInline(m[5], { ...style, bold: true, italic: true }));
    else if (m[6] !== undefined || m[7] !== undefined) tokens.push(...parseInline(m[6] ?? m[7], { ...style, bold: true }));
    else tokens.push(...parseInline(m[8] ?? m[9], { ...style, italic: true }));
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ type: 'text', text: text.slice(last), ...style });
  return tokens;
}

// A bare URL is shown as its site name - a paragraph of full article URLs
// is mostly noise, and the full address is still in the href.
export function linkLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function inlineHtml(source) {
  return parseInline(source)
    .map((tok) => {
      const text = escapeHtml(tok.text);
      let html = text;
      if (tok.type === 'link') {
        const href = safeUrl(tok.href);
        html = href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer ugc">${text}</a>` : text;
      } else if (tok.type === 'code') {
        html = `<code>${text}</code>`;
      }
      if (tok.italic) html = `<em>${html}</em>`;
      if (tok.bold) html = `<strong>${html}</strong>`;
      return html;
    })
    .join('');
}

// The page title is the h1, so post headings start one level below it.
export function renderMarkdown(source) {
  return parseBlocks(source)
    .map((block) => {
      if (block.type === 'image') {
        const src = safeUrl(block.src);
        if (!src) return '';
        const caption = escapeHtml(block.caption);
        // A dead link hides its whole figure rather than leaving a
        // broken-image box in the middle of the article - except in the
        // editor's preview, where css/style.css shows the author why, since a
        // picture that silently vanished looked like the editor had failed.
        return `<figure class="post-figure"><a href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer ugc"><img src="${escapeHtml(src)}" alt="${caption}" loading="lazy" onerror="this.closest('figure').classList.add('is-broken')" /></a>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
      }
      if (block.type === 'heading') {
        const tag = `h${block.level + 1}`;
        return `<${tag}>${inlineHtml(block.text)}</${tag}>`;
      }
      if (block.type === 'list') {
        const tag = block.ordered ? 'ol' : 'ul';
        return `<${tag}>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</${tag}>`;
      }
      return `<p>${block.lines.map(inlineHtml).join('<br>')}</p>`;
    })
    .join('');
}

// The feed preview is a couple of lines of plain text, so the markers go
// and the links collapse to their labels: "## Top stories - Starlink..."
// reads as "Top stories · Starlink...".
export function stripMarkdown(source) {
  return parseBlocks(source)
    .map((block) => {
      const plain = (s) => parseInline(s).map((t) => t.text).join('');
      if (block.type === 'image') return '';
      if (block.type === 'heading') return plain(block.text);
      if (block.type === 'list') return block.items.map(plain).join(' · ');
      return block.lines.map(plain).join(' ');
    })
    .filter(Boolean)
    .join(' · ');
}

// The first picture in the body, so a post whose only images are inline
// still gets a cover in the feed.
export function firstImage(source) {
  const block = parseBlocks(source).find((b) => b.type === 'image');
  return block ? block.src : '';
}
