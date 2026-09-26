// A small slice of Markdown for post bodies - the app's copy of
// js/markdown.js, which has the reasoning; keep the two in step. Only the
// parsing lives here: components/RichText.tsx draws the blocks, and no
// markup is ever rendered, so there is nothing to escape.

export type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'para'; lines: string[] };

export type Inline = { type: 'text' | 'link' | 'code' | 'bold' | 'italic'; text: string; href?: string };

const HEADING = /^(#{1,3})\s+(.+?)\s*#*\s*$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;

// Splits the text into blocks. Each block is one of:
//   { type: 'heading', level: 1-3, text }
//   { type: 'list', ordered: bool, items: [text] }
//   { type: 'para', lines: [text] }
export function parseBlocks(source: string | null | undefined): Block[] {
  const blocks: Block[] = [];
  let para: Extract<Block, { type: 'para' }> | null = null;
  let list: Extract<Block, { type: 'list' }> | null = null;
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
      list.items.push((bullet || ordered)![1]);
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

// Links and inline code first, so their contents are never read as
// emphasis; then **bold**, then *italic* / _italic_.
const INLINE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|`([^`\n]+)`|\*\*([^*\n]+?)\*\*|(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])|(?<![\w_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])/g;

// Splits one line into { type: 'text' | 'link' | 'code' | 'bold' | 'italic',
// text, href? } tokens.
export function parseInline(source: string | null | undefined): Inline[] {
  const text = String(source ?? '');
  const tokens: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) tokens.push({ type: 'text', text: text.slice(last, m.index!) });
    if (m[1] !== undefined) tokens.push({ type: 'link', text: m[1], href: m[2] });
    else if (m[3] !== undefined) tokens.push({ type: 'link', text: linkLabel(m[3]), href: m[3] });
    else if (m[4] !== undefined) tokens.push({ type: 'code', text: m[4] });
    else if (m[5] !== undefined) tokens.push({ type: 'bold', text: m[5] });
    else tokens.push({ type: 'italic', text: m[6] ?? m[7] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) tokens.push({ type: 'text', text: text.slice(last) });
  return tokens;
}

// A bare URL is shown as its site name - a paragraph of full article URLs
// is mostly noise, and the full address is still in the href.
export function linkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// The feed preview is a couple of lines of plain text, so the markers go
// and the links collapse to their labels: "## Top stories - Starlink..."
// reads as "Top stories · Starlink...".
export function stripMarkdown(source: string | null | undefined): string {
  return parseBlocks(source)
    .map((block) => {
      const plain = (s: string) => parseInline(s).map((t) => t.text).join('');
      if (block.type === 'heading') return plain(block.text);
      if (block.type === 'list') return block.items.map(plain).join(' · ');
      return block.lines.map(plain).join(' ');
    })
    .join(' · ');
}
