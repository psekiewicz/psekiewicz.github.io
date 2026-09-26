// The editor's formatting edits - the app's copy of the pure functions in
// js/format-toolbar.js; keep the two in step. Each takes the text and the
// selection and returns the new text and where the selection should go.

type Kind = 'bold' | 'italic' | 'code';
export type Edit = { value: string; start: number; end: number };

const PLACEHOLDER: Record<Kind, string> = { bold: 'bold text', italic: 'italic text', code: 'code' };
const MARK: Record<Kind, string> = { bold: '**', italic: '*', code: '`' };

// The start/end offsets of the whole lines the selection touches.
function lineRange(value: string, start: number, end: number): [number, number] {
  const from = value.lastIndexOf('\n', start - 1) + 1;
  let to = value.indexOf('\n', end > start && value[end - 1] === '\n' ? end - 1 : end);
  if (to === -1) to = value.length;
  return [from, to];
}

// Wraps the selection in a mark, or unwraps it if it's already wrapped. With
// nothing selected it inserts a placeholder and selects it, ready to type
// over.
export function wrap(value: string, start: number, end: number, kind: Kind): Edit {
  const mark = MARK[kind];
  const selected = value.slice(start, end);
  const before = value.slice(start - mark.length, start);
  const after = value.slice(end, end + mark.length);
  if (selected && before === mark && after === mark) {
    return {
      value: value.slice(0, start - mark.length) + selected + value.slice(end + mark.length),
      start: start - mark.length,
      end: end - mark.length,
    };
  }
  const text = selected || PLACEHOLDER[kind];
  return {
    value: value.slice(0, start) + mark + text + mark + value.slice(end),
    start: start + mark.length,
    end: start + mark.length + text.length,
  };
}

// Heading cycles the current line through ## → ### → plain.
export function toggleHeading(value: string, start: number, end: number): Edit {
  const [from, to] = lineRange(value, start, end);
  const line = value.slice(from, to);
  const current = line.match(/^(#{1,3})\s+/);
  const bare = current ? line.slice(current[0].length) : line;
  const level = current ? current[1].length : 0;
  const prefix = level === 0 || level === 1 ? '## ' : level === 2 ? '### ' : '';
  const next = prefix + bare;
  const shift = next.length - line.length;
  return {
    value: value.slice(0, from) + next + value.slice(to),
    start: Math.max(from, start + shift),
    end: Math.max(from, end + shift),
  };
}

// Turns every selected line into a list item, or back into plain lines if
// they all already are one.
export function toggleList(value: string, start: number, end: number, ordered: boolean): Edit {
  const [from, to] = lineRange(value, start, end);
  const lines = value.slice(from, to).split('\n');
  const marker = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*•]\s+/;
  const content = lines.filter((l) => l.trim());
  const allListed = content.length > 0 && content.every((l) => marker.test(l));
  let n = 0;
  const next = lines
    .map((l) => {
      if (!l.trim()) return l;
      const bare = l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '');
      if (allListed) return bare;
      n += 1;
      return (ordered ? `${n}. ` : '- ') + bare;
    })
    .join('\n');
  return { value: value.slice(0, from) + next + value.slice(to), start: from, end: from + next.length };
}

// [text](url). The selection becomes the text; with nothing selected the
// link's own address stands in for it, selected so it can be typed over.
export function insertLink(value: string, start: number, end: number, url: string): Edit {
  const text = value.slice(start, end) || url;
  const md = `[${text}](${url})`;
  return { value: value.slice(0, start) + md + value.slice(end), start: start + 1, end: start + 1 + text.length };
}

// A picture has to sit on a line of its own, with a blank line either side
// so it can't be read as part of the paragraph around it.
export function insertImage(value: string, start: number, end: number, url: string, caption = ''): Edit {
  const md = `![${caption.replace(/[\[\]\n]/g, ' ').trim()}](${url})`;
  const before = value.slice(0, start).replace(/[ \t]+$/, '');
  const after = value.slice(end).replace(/^[ \t]+/, '');
  const lead = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trail = !after ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const at = before.length + lead.length + md.length + trail.length;
  return { value: before + lead + md + trail + after, start: at, end: at };
}
