import { icon } from './icons.js';
import { renderMarkdown } from './markdown.js';
import { safeUrl } from './utils.js';

// A formatting bar for the description box: buttons (and Ctrl/Cmd+B, I, K)
// that write the Markdown js/markdown.js reads, so nobody has to remember
// the syntax, plus a Write/Preview switch that shows the post as it will
// look once published.
//
// The edits themselves are pure functions of (text, selection) so they can
// be tested without a DOM; attachFormatToolbar only wires them to a
// textarea.

const PLACEHOLDER = { bold: 'bold text', italic: 'italic text', code: 'code' };
const MARK = { bold: '**', italic: '*', code: '`' };

// The start/end offsets of the whole lines the selection touches.
function lineRange(value, start, end) {
  const from = value.lastIndexOf('\n', start - 1) + 1;
  let to = value.indexOf('\n', end > start && value[end - 1] === '\n' ? end - 1 : end);
  if (to === -1) to = value.length;
  return [from, to];
}

// Wraps the selection in a mark, or unwraps it if it's already wrapped. With
// nothing selected it inserts a placeholder and selects it, ready to type
// over.
export function wrap(value, start, end, kind) {
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
export function toggleHeading(value, start, end) {
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
export function toggleList(value, start, end, ordered) {
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
export function insertLink(value, start, end, url) {
  const text = value.slice(start, end) || url;
  const md = `[${text}](${url})`;
  return { value: value.slice(0, start) + md + value.slice(end), start: start + 1, end: start + 1 + text.length };
}

// A picture has to sit on a line of its own, with a blank line either side
// so it can't be read as part of the paragraph around it.
export function insertImage(value, start, end, url, caption = '') {
  const md = `![${caption.replace(/[\[\]\n]/g, ' ').trim()}](${url})`;
  const before = value.slice(0, start).replace(/[ \t]+$/, '');
  const after = value.slice(end).replace(/^[ \t]+/, '');
  const lead = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trail = !after ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const at = before.length + lead.length + md.length + trail.length;
  return { value: before + lead + md + trail + after, start: at, end: at };
}

// Most used first: on a phone the row scrolls, and pictures and links are
// the ones nobody would think to scroll for.
const BUTTONS = [
  { action: 'heading', label: 'Heading', html: '<b>H</b>' },
  { action: 'bold', label: 'Bold (Ctrl+B)', html: '<b>B</b>' },
  { action: 'image', label: 'Picture from a link', html: () => icon('image', { size: 15 }) },
  { action: 'link', label: 'Link (Ctrl+K)', html: () => icon('globe', { size: 15 }) },
  { action: 'bullets', label: 'Bulleted list', html: '•&thinsp;≡' },
  { action: 'numbers', label: 'Numbered list', html: '1.&thinsp;≡' },
  { action: 'italic', label: 'Italic (Ctrl+I)', html: '<i>I</i>' },
  { action: 'code', label: 'Code', html: () => icon('code', { size: 15 }) },
];

function askUrl(message) {
  const raw = window.prompt(message, 'https://');
  if (raw === null) return null;
  const url = safeUrl(raw.trim());
  if (!url || raw.trim() === 'https://') {
    if (raw.trim() && raw.trim() !== 'https://') window.alert('That needs to be a full http(s):// link.');
    return null;
  }
  return url;
}

// Adds the bar above `textarea` and a preview pane after it. Safe to call
// more than once on the same textarea. Returns { reset } to switch back to
// the Write tab, for editors that refill the box and reopen.
export function attachFormatToolbar(textarea) {
  if (textarea.dataset.formatBar) return textarea._formatBar;
  textarea.dataset.formatBar = '1';

  const bar = document.createElement('div');
  bar.className = 'fmt-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Formatting');
  bar.innerHTML = `
    <div class="fmt-tools">
      ${BUTTONS.map(
        (b) =>
          `<button type="button" class="fmt-btn" data-fmt="${b.action}" title="${b.label}" aria-label="${b.label}">${
            typeof b.html === 'function' ? b.html() : b.html
          }</button>`
      ).join('')}
    </div>
    <div class="fmt-tabs" role="tablist">
      <button type="button" class="fmt-tab is-active" data-mode="write" role="tab" aria-selected="true">Write</button>
      <button type="button" class="fmt-tab" data-mode="preview" role="tab" aria-selected="false">Preview</button>
    </div>
  `;
  const preview = document.createElement('div');
  preview.className = 'fmt-preview detail-body';
  preview.style.display = 'none';

  textarea.classList.add('fmt-textarea');
  textarea.before(bar);
  textarea.after(preview);

  const apply = (result) => {
    if (!result) return;
    textarea.value = result.value;
    textarea.focus();
    textarea.setSelectionRange(result.start, result.end);
    // So anything listening (counters, autosave) sees the change.
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const run = (action) => {
    const { value, selectionStart: s, selectionEnd: e } = textarea;
    switch (action) {
      case 'bold':
      case 'italic':
      case 'code':
        return apply(wrap(value, s, e, action));
      case 'heading':
        return apply(toggleHeading(value, s, e));
      case 'bullets':
        return apply(toggleList(value, s, e, false));
      case 'numbers':
        return apply(toggleList(value, s, e, true));
      case 'link': {
        // A selected address links itself; anything else asks where to.
        const selected = value.slice(s, e).trim();
        const url = /^https?:\/\/\S+$/.test(selected) ? selected : askUrl('Link to (https://…)');
        return url ? apply(insertLink(value, s, e, url)) : undefined;
      }
      case 'image': {
        const url = askUrl('Picture link - a direct https:// address of an image');
        if (!url) return undefined;
        const caption = window.prompt('Caption (optional)', '') || '';
        return apply(insertImage(value, s, e, url, caption));
      }
      default:
        return undefined;
    }
  };

  const setMode = (mode) => {
    const previewing = mode === 'preview';
    if (previewing) {
      preview.innerHTML = renderMarkdown(textarea.value) || '<p class="fmt-empty">Nothing to preview yet.</p>';
      preview.style.minHeight = `${textarea.offsetHeight}px`;
    }
    // style.display rather than the hidden attribute, which any stylesheet
    // rule setting display quietly overrides.
    textarea.style.display = previewing ? 'none' : '';
    preview.style.display = previewing ? '' : 'none';
    bar.classList.toggle('is-previewing', previewing);
    bar.querySelectorAll('.fmt-tab').forEach((t) => {
      const on = t.dataset.mode === mode;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
  };

  // mousedown, not click, keeps the textarea's selection from being lost to
  // the button taking focus first.
  bar.addEventListener('mousedown', (e) => {
    if (e.target.closest('.fmt-btn')) e.preventDefault();
  });
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('.fmt-btn');
    if (btn) return run(btn.dataset.fmt);
    const tab = e.target.closest('.fmt-tab');
    if (tab) setMode(tab.dataset.mode);
    return undefined;
  });

  textarea.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const action = { b: 'bold', i: 'italic', k: 'link' }[e.key.toLowerCase()];
    if (!action) return;
    e.preventDefault();
    run(action);
  });

  const controller = { reset: () => setMode('write') };
  textarea._formatBar = controller;
  return controller;
}
