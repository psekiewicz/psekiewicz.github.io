import { icon } from './icons.js';
import { escapeHtml } from './utils.js';
import { withScheme } from './media.js';
import { attachFormatToolbar } from './format-toolbar.js';
import { attachUpload } from './upload-field.js';

// The forms a news editor uses: a new or edited issue, and a new or edited
// article. Each is a modal built on demand, so pages for readers never carry
// them. Both resolve with the saved fields, or null when closed. Saving is
// the caller's (it knows which issue it is on); a thrown error is shown in
// the form and the form stays open.

function field(id, label, input, hint = '') {
  return `
    <div class="field">
      <label for="${id}">${label}</label>
      ${input}
      ${hint ? `<div class="hint">${hint}</div>` : ''}
    </div>`;
}

function openModal(title, bodyHtml, submitLabel, { onReady, read, save }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="modal-head">
        <h2 style="margin:0;">${escapeHtml(title)}</h2>
        <button class="modal-close" type="button" aria-label="Close">${icon('x', { size: 18 })}</button>
      </div>
      <div class="alert alert-error" data-alert></div>
      <form novalidate>
        ${bodyHtml}
        <button class="btn btn-primary btn-block" type="submit">${escapeHtml(submitLabel)}</button>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-open'));
  onReady?.(overlay);

  return new Promise((resolve) => {
    const close = (result) => {
      overlay.classList.remove('is-open');
      setTimeout(() => overlay.remove(), 250);
      resolve(result);
    };
    overlay.querySelector('.modal-close').addEventListener('click', () => close(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });
    const form = overlay.querySelector('form');
    const alertEl = overlay.querySelector('[data-alert]');
    const submit = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertEl.classList.remove('is-visible');
      submit.disabled = true;
      try {
        const fields = read(overlay);
        await save(fields);
        close(fields);
      } catch (err) {
        alertEl.textContent = err.message;
        alertEl.classList.add('is-visible');
        submit.disabled = false;
      }
    });
  });
}

const value = (root, id) => root.querySelector(`#${id}`).value;

// `save(fields)` stores the issue; `issue` prefills the form for an edit.
export function openIssueForm({ issue = null, save }) {
  const body = `
    ${field('ni-title', 'Title', `<input type="text" id="ni-title" required minlength="3" maxlength="120" placeholder="T&amp;G Weekly - 24-31 Oct 2026" value="${escapeHtml(issue?.title || '')}" />`)}
    <div class="two-col">
      ${field('ni-start', 'Week from', `<input type="date" id="ni-start" value="${escapeHtml(issue?.periodStart || '')}" />`)}
      ${field('ni-end', 'to', `<input type="date" id="ni-end" value="${escapeHtml(issue?.periodEnd || '')}" />`)}
    </div>
    ${field('ni-summary', 'Summary', `<input type="text" id="ni-summary" maxlength="300" placeholder="The week's biggest stories, in a sentence" value="${escapeHtml(issue?.summary || '')}" />`)}
    ${field('ni-cover', 'Cover image', `<input type="url" id="ni-cover" placeholder="https://…" value="${escapeHtml(issue?.coverUrl || '')}" />`)}
    <div class="field checkbox-field">
      <input type="checkbox" id="ni-published" ${issue && !issue.published ? '' : 'checked'} />
      <label for="ni-published" style="margin:0;">Published - untick to keep it a draft only editors see</label>
    </div>`;
  return openModal(issue ? 'Edit issue' : 'New issue', body, issue ? 'Save changes' : 'Create issue', {
    onReady: (root) => attachUpload(root.querySelector('#ni-cover'), { kind: 'cover' }),
    read: (root) => {
      const title = value(root, 'ni-title').trim();
      if (title.length < 3) throw new Error('Give the issue a title (at least 3 characters).');
      const periodStart = value(root, 'ni-start') || null;
      const periodEnd = value(root, 'ni-end') || null;
      if (periodStart && periodEnd && periodEnd < periodStart) throw new Error('The week has to end after it starts.');
      return {
        title,
        summary: value(root, 'ni-summary'),
        coverUrl: withScheme(value(root, 'ni-cover')),
        periodStart,
        periodEnd,
        published: root.querySelector('#ni-published').checked,
      };
    },
    save,
  });
}

// `save(fields)` stores the article; `article` prefills the form for an edit.
export function openArticleForm({ article = null, position = 0, save }) {
  const body = `
    ${field('na-title', 'Headline', `<input type="text" id="na-title" required minlength="3" maxlength="200" value="${escapeHtml(article?.title || '')}" />`)}
    ${field('na-lead', 'Lead', `<textarea id="na-lead" rows="3" maxlength="600" placeholder="A sentence or two under the headline - what the issue's list shows">${escapeHtml(article?.lead || '')}</textarea>`)}
    ${field('na-image', 'Picture', `<input type="url" id="na-image" placeholder="https://…" value="${escapeHtml(article?.imageUrl || '')}" />`)}
    ${field('na-body', 'Article', `<textarea id="na-body" rows="12" maxlength="40000" placeholder="The full story">${escapeHtml(article?.body || '')}</textarea>`)}
    <div class="two-col">
      ${field('na-source-name', 'Source', `<input type="text" id="na-source-name" maxlength="100" placeholder="The Verge" value="${escapeHtml(article?.sourceName || '')}" />`)}
      ${field('na-source-url', 'Source link', `<input type="url" id="na-source-url" placeholder="https://…" value="${escapeHtml(article?.sourceUrl || '')}" />`)}
    </div>
    ${field('na-position', 'Position in the issue', `<input type="number" id="na-position" min="0" step="1" value="${article ? article.position : position}" />`, 'Lower comes first.')}`;
  return openModal(article ? 'Edit article' : 'New article', body, article ? 'Save changes' : 'Add article', {
    onReady: (root) => {
      attachUpload(root.querySelector('#na-image'), { kind: 'cover' });
      attachFormatToolbar(root.querySelector('#na-body'));
    },
    read: (root) => {
      const title = value(root, 'na-title').trim();
      if (title.length < 3) throw new Error('Give the article a headline (at least 3 characters).');
      return {
        title,
        lead: value(root, 'na-lead'),
        imageUrl: withScheme(value(root, 'na-image')),
        body: value(root, 'na-body'),
        sourceName: value(root, 'na-source-name'),
        sourceUrl: withScheme(value(root, 'na-source-url')),
        position: Number.parseInt(value(root, 'na-position'), 10) || 0,
      };
    },
    save,
  });
}
