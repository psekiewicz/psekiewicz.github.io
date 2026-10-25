import { icon } from './icons.js';
import { escapeHtml } from './utils.js';
import { withScheme } from './media.js';
import { attachFormatToolbar } from './format-toolbar.js';
import { attachUpload } from './upload-field.js';

// The forms news is written with: a new or edited newsletter, and a new or
// edited article. Each is a modal built on demand, so pages for readers never
// carry them. Both resolve with the saved fields, or null when closed. Saving
// is the caller's (it knows which newsletter it is on); a thrown error is
// shown in the form and the form stays open.

function field(id, label, input, hint = '') {
  return `
    <div class="field">
      <label for="${id}">${label}</label>
      ${input}
      ${hint ? `<div class="hint">${hint}</div>` : ''}
    </div>`;
}

function openModal(title, bodyHtml, submitLabel, { onReady, read, save, disabled = false }) {
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
        <button class="btn btn-primary btn-block" type="submit"${disabled ? ' disabled' : ''}>${escapeHtml(submitLabel)}</button>
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

// What starting a newsletter takes, and where this person stands
// (getMyNewsletterTerms() in news-data.js).
function termsNote(terms) {
  const atCap = !terms.canStart && terms.owned >= terms.maxOwned;
  const line = atCap
    ? `You already run ${terms.maxOwned} newsletters - the most anyone can.`
    : terms.cost === 0
      ? "Free for you - you're popular. You'll own it, and pick who else writes in it."
      : `It costs ${terms.price} points - you have ${terms.points}. It's free once ${terms.popularFollowers} people follow you (${terms.followers} do now), and Completionist - every other achievement - pays ${terms.price} on its own.`;
  return `<div class="hint news-terms"><strong>Your own newsletter.</strong> ${escapeHtml(line)}</div>`;
}

// `save(fields)` stores the newsletter; `newsletter` prefills the form for an
// edit. Starting one passes `terms`, which the form shows above its button.
export function openNewsletterForm({ newsletter = null, terms = null, save }) {
  const body = `
    ${field('nl-title', 'Name', `<input type="text" id="nl-title" required minlength="3" maxlength="120" placeholder="XOXD T&amp;G Weekly" value="${escapeHtml(newsletter?.title || '')}" />`)}
    ${field('nl-summary', 'What it is', `<input type="text" id="nl-summary" maxlength="300" placeholder="Tech and gaming news of the week, every Saturday" value="${escapeHtml(newsletter?.summary || '')}" />`)}
    ${field('nl-cover', 'Cover image', `<input type="url" id="nl-cover" placeholder="https://…" value="${escapeHtml(newsletter?.coverUrl || '')}" />`)}
    <div class="field checkbox-field">
      <input type="checkbox" id="nl-published" ${newsletter && !newsletter.published ? '' : 'checked'} />
      <label for="nl-published" style="margin:0;">Published - untick to keep it a draft only you and its editors see</label>
    </div>
    ${terms ? termsNote(terms) : ''}`;
  const submitLabel = newsletter ? 'Save changes' : terms?.cost ? `Start it · ${terms.cost} points` : 'Start newsletter';
  return openModal(newsletter ? 'Edit newsletter' : 'Start a newsletter', body, submitLabel, {
    disabled: Boolean(terms && !terms.canStart),
    onReady: (root) => attachUpload(root.querySelector('#nl-cover'), { kind: 'cover' }),
    read: (root) => {
      const title = value(root, 'nl-title').trim();
      if (title.length < 3) throw new Error('Give the newsletter a name (at least 3 characters).');
      return {
        title,
        summary: value(root, 'nl-summary'),
        coverUrl: withScheme(value(root, 'nl-cover')),
        published: root.querySelector('#nl-published').checked,
      };
    },
    save,
  });
}

// `save(fields)` stores the article; `article` prefills the form for an edit.
export function openArticleForm({ article = null, save }) {
  const body = `
    ${field('na-title', 'Headline', `<input type="text" id="na-title" required minlength="3" maxlength="200" value="${escapeHtml(article?.title || '')}" />`)}
    ${field('na-lead', 'Lead', `<textarea id="na-lead" rows="3" maxlength="600" placeholder="A sentence or two under the headline - what the newsletter's list shows">${escapeHtml(article?.lead || '')}</textarea>`)}
    ${field('na-image', 'Picture', `<input type="url" id="na-image" placeholder="https://…" value="${escapeHtml(article?.imageUrl || '')}" />`)}
    ${field('na-body', 'Article', `<textarea id="na-body" rows="12" maxlength="40000" placeholder="The full story">${escapeHtml(article?.body || '')}</textarea>`)}
    <div class="two-col">
      ${field('na-source-name', 'Source', `<input type="text" id="na-source-name" maxlength="100" placeholder="The Verge" value="${escapeHtml(article?.sourceName || '')}" />`)}
      ${field('na-source-url', 'Source link', `<input type="url" id="na-source-url" placeholder="https://…" value="${escapeHtml(article?.sourceUrl || '')}" />`)}
    </div>`;
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
      };
    },
    save,
  });
}

// Who writes in a newsletter: its owner and the editors they picked. The
// owner (`manages`) adds people they follow or who follow them, and removes
// anyone; an editor can step down. `load()` resolves { owner, editors, people }
// as profiles; `add(id)` and `remove(id)` save. Resolves when closed, with
// whether anything changed.
export function openEditorsPanel({ title, me, manages, load, add, remove, renderPerson }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="Editors">
      <div class="modal-head">
        <h2 style="margin:0;">Editors</h2>
        <button class="modal-close" type="button" aria-label="Close">${icon('x', { size: 18 })}</button>
      </div>
      <p class="hint" style="margin-top:0;">${escapeHtml(title)}: whoever is here can write in it. The owner can also edit anything in it and pick who's here.</p>
      <div class="alert alert-error" data-alert></div>
      <div class="news-people" data-current><p class="hint">Loading…</p></div>
      ${manages ? `
        <h3 style="margin:20px 0 6px;">Add an editor</h3>
        <p class="hint" style="margin-top:0;">From the people you follow and the people who follow you.</p>
        <input type="search" data-filter placeholder="Search by name" aria-label="Search by name" />
        <div class="news-people" data-people></div>` : ''}
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-open'));

  const alertEl = overlay.querySelector('[data-alert]');
  const filterEl = overlay.querySelector('[data-filter]');
  let state = { owner: null, editors: [], people: [] };
  let changed = false;

  const row = (p, action) => `
    <div class="news-person">
      <a class="news-person-who" href="/profile?user=${encodeURIComponent(p.id)}">${renderPerson(p)}</a>
      ${action}
    </div>`;

  function draw() {
    const { owner, editors, people } = state;
    overlay.querySelector('[data-current]').innerHTML =
      (owner ? row(owner, '<span class="news-person-tag">Owner</span>') : '') +
      editors
        .map((p) =>
          row(
            p,
            manages || p.id === me
              ? `<button class="btn btn-secondary btn-sm" type="button" data-remove="${escapeHtml(p.id)}">${p.id === me ? 'Step down' : 'Remove'}</button>`
              : ''
          )
        )
        .join('');
    if (!manages) return;
    const taken = new Set([owner?.id, ...editors.map((p) => p.id)]);
    const q = (filterEl.value || '').trim().toLowerCase();
    const options = people.filter((p) => !taken.has(p.id) && (!q || p.displayName.toLowerCase().includes(q)));
    overlay.querySelector('[data-people]').innerHTML = options.length
      ? options.map((p) => row(p, `<button class="btn btn-primary btn-sm" type="button" data-add="${escapeHtml(p.id)}">${icon('plus', { size: 14 })} Add</button>`)).join('')
      : `<p class="hint">${people.length ? 'Nobody else matches.' : 'Follow someone, or get a follower, to add them here.'}</p>`;
  }

  async function refresh() {
    state = await load();
    draw();
  }

  async function act(fn) {
    alertEl.classList.remove('is-visible');
    try {
      await fn();
      changed = true;
      await refresh();
    } catch (err) {
      alertEl.textContent = err.message;
      alertEl.classList.add('is-visible');
    }
  }

  overlay.addEventListener('click', (e) => {
    const addBtn = e.target.closest('[data-add]');
    const removeBtn = e.target.closest('[data-remove]');
    if (addBtn) {
      addBtn.disabled = true;
      act(() => add(addBtn.dataset.add));
    } else if (removeBtn) {
      const self = removeBtn.dataset.remove === me;
      if (confirm(self ? "Step down as an editor? You won't be able to write in it any more." : 'Remove this editor? Their articles stay.')) {
        act(() => remove(removeBtn.dataset.remove));
      }
    }
  });
  filterEl?.addEventListener('input', draw);
  refresh().catch((err) => {
    alertEl.textContent = err.message;
    alertEl.classList.add('is-visible');
  });

  return new Promise((resolve) => {
    const close = () => {
      overlay.classList.remove('is-open');
      setTimeout(() => overlay.remove(), 250);
      resolve(changed);
    };
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  });
}
