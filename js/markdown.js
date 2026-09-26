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
const IMAGE = /^\s*!\[([^\]\n]*)\]\((https?:\/\/[^\s)]+)\)\s*$/;

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
// emphasis; then **bold**, then *italic* / _italic_.
const INLINE = /!?\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|`([^`\n]+)`|\*\*([^*\n]+?)\*\*|(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])|(?<![\w_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])/g;

// Splits one line into { type: 'text' | 'link' | 'code' | 'bold' | 'italic',
// text, href? } tokens.
export function parseInline(source) {
  const text = String(source ?? '');
  const tokens = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) tokens.push({ type: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) tokens.push({ type: 'link', text: m[1], href: m[2] });
    else if (m[3] !== undefined) tokens.push({ type: 'link', text: linkLabel(m[3]), href: m[3] });
    else if (m[4] !== undefined) tokens.push({ type: 'code', text: m[4] });
    else if (m[5] !== undefined) tokens.push({ type: 'bold', text: m[5] });
    else tokens.push({ type: 'italic', text: m[6] ?? m[7] });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ type: 'text', text: text.slice(last) });
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
      switch (tok.type) {
        case 'link': {
          const href = safeUrl(tok.href);
          return href
            ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer ugc">${text}</a>`
            : text;
        }
        case 'code':
          return `<code>${text}</code>`;
        case 'bold':
          return `<strong>${text}</strong>`;
        case 'italic':
          return `<em>${text}</em>`;
        default:
          return text;
      }
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
        // A dead link takes its whole figure with it rather than leaving a
        // broken-image box in the middle of the article.
        return `<figure class="post-figure"><a href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer ugc"><img src="${escapeHtml(src)}" alt="${caption}" loading="lazy" onerror="this.closest('figure').remove()" /></a>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
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
