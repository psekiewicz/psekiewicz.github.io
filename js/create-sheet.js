import { SCROLL_BACKGROUNDS } from './scroll-styles.js';
import { PROJECT_TYPE_OPTIONS, escapeHtml } from './utils.js';
import { icon } from './icons.js';
import { showToast } from './toast.js';

// Only local modules are imported statically. Anything that reaches
// Supabase is pulled in when the form is actually submitted, so opening
// the sheet — and filling it in — never waits on the network, and a failed
// CDN load can't stop the + button from doing anything at all.

// The + tab used to navigate to the dashboard, which meant leaving whatever
// you were looking at to reach a form. This is the full project editor as a
// sheet over the current page — every field the dashboard modal has, so
// there's never a reason to go elsewhere to finish creating something.
let sheet = null;
let overlay = null;
let onStateChange = null;

function fieldsHtml() {
  const types = PROJECT_TYPE_OPTIONS.map(
    (t) => `<option value="${t.value}"${t.value === 'other' ? ' selected' : ''}>${escapeHtml(t.label)}</option>`
  ).join('');
  const backgrounds = SCROLL_BACKGROUNDS.map(
    (b) => `<option value="${b.id}">${escapeHtml(b.label)}</option>`
  ).join('');

  return `
    <div class="alert alert-error" id="sheet-alert"></div>
    <form id="sheet-form" novalidate>
      <div class="field">
        <label for="sheet-title">Title</label>
        <input type="text" id="sheet-title" required minlength="3" maxlength="100" placeholder="What did you build?" />
      </div>
      <div class="field">
        <label for="sheet-type">Project type</label>
        <select id="sheet-type">${types}</select>
      </div>
      <div class="field">
        <label for="sheet-summary">Short summary</label>
        <input type="text" id="sheet-summary" maxlength="200" placeholder="One sentence about it" />
      </div>
      <div class="field">
        <label for="sheet-description">Description</label>
        <textarea id="sheet-description" maxlength="5000" placeholder="What is it, how does it work, what did you learn?"></textarea>
      </div>
      <div class="field">
        <label for="sheet-image">Image URL</label>
        <input type="url" id="sheet-image" placeholder="https://…" />
      </div>
      <div class="two-col">
        <div class="field">
          <label for="sheet-repo">Repository URL</label>
          <input type="url" id="sheet-repo" placeholder="https://github.com/…" />
        </div>
        <div class="field">
          <label for="sheet-live">Live URL</label>
          <input type="url" id="sheet-live" placeholder="https://…" />
        </div>
      </div>
      <div class="field">
        <label for="sheet-tags">Tags</label>
        <input type="text" id="sheet-tags" placeholder="react, api, side-project" />
        <div class="hint">Comma-separated, up to 10 tags.</div>
      </div>

      <details class="sheet-details">
        <summary>${icon('film', { size: 15 })} Customize Scrolls page</summary>
        <p class="hint">Scrolls shows your project full-screen and portrait, where a wide thumbnail usually crops badly. Set a taller image just for it, or pick a background if you'd rather it be text-only.</p>
        <div class="field">
          <label for="sheet-scroll-image">Scrolls image URL</label>
          <input type="url" id="sheet-scroll-image" placeholder="https://… (portrait works best)" />
        </div>
        <div class="field">
          <label for="sheet-scroll-bg">Background</label>
          <select id="sheet-scroll-bg">${backgrounds}</select>
          <div class="hint">Choosing one replaces the image on the Scrolls card.</div>
        </div>
        <div class="scroll-preview" id="sheet-scroll-preview">
          <span class="scroll-preview-label">Scrolls preview</span>
        </div>
      </details>

      <div class="field checkbox-field">
        <input type="checkbox" id="sheet-published" checked />
        <label for="sheet-published" style="margin:0;">Publish immediately</label>
      </div>
      <button class="btn btn-primary btn-block" type="submit" id="sheet-submit">Create project</button>
    </form>
  `;
}

function updatePreview() {
  const preview = sheet.querySelector('#sheet-scroll-preview');
  if (!preview) return;
  const bg = sheet.querySelector('#sheet-scroll-bg').value;
  const img = sheet.querySelector('#sheet-scroll-image').value.trim() || sheet.querySelector('#sheet-image').value.trim();

  preview.className = `scroll-preview${bg ? ' scroll-bg-' + bg : ''}`;
  // JSON.stringify gives a correctly quoted and escaped CSS string, which
  // hand-rolled quoting around a user-typed URL does not.
  preview.style.backgroundImage = !bg && img ? `url(${JSON.stringify(img)})` : '';
}

export function isOpen() {
  return Boolean(sheet && sheet.classList.contains('is-open'));
}

export function closeSheet() {
  if (!sheet) return;
  sheet.classList.remove('is-open');
  overlay.classList.remove('is-open');
  document.body.classList.remove('sheet-open');
  if (onStateChange) onStateChange(false);
}

export function openSheet() {
  mount();
  sheet.classList.add('is-open');
  overlay.classList.add('is-open');
  document.body.classList.add('sheet-open');
  if (onStateChange) onStateChange(true);
  // Deliberately not autofocusing: on a phone that throws the keyboard up
  // over the sheet before it has finished sliding in.
}

export function toggleSheet() {
  if (isOpen()) closeSheet();
  else openSheet();
}

export function onSheetToggle(callback) {
  onStateChange = callback;
}

function mount() {
  if (sheet) return;

  overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.addEventListener('click', closeSheet);

  sheet = document.createElement('div');
  sheet.className = 'create-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'New project');
  sheet.innerHTML = `
    <div class="sheet-grabber" aria-hidden="true"></div>
    <div class="sheet-head">
      <h2>New project</h2>
      <button class="modal-close" type="button" id="sheet-close" aria-label="Close">${icon('x', { size: 18 })}</button>
    </div>
    <div class="sheet-body">${fieldsHtml()}</div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(sheet);

  sheet.querySelector('#sheet-close').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) closeSheet();
  });

  ['#sheet-scroll-bg', '#sheet-scroll-image', '#sheet-image'].forEach((sel) =>
    sheet.querySelector(sel).addEventListener('input', updatePreview)
  );
  sheet.querySelector('#sheet-scroll-bg').addEventListener('change', updatePreview);
  updatePreview();

  sheet.querySelector('#sheet-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertEl = sheet.querySelector('#sheet-alert');
    const submit = sheet.querySelector('#sheet-submit');
    alertEl.classList.remove('is-visible');

    const title = sheet.querySelector('#sheet-title').value.trim();
    if (title.length < 3) {
      alertEl.textContent = 'Title must be at least 3 characters.';
      alertEl.classList.add('is-visible');
      return;
    }

    submit.disabled = true;
    submit.innerHTML = '<span class="spinner"></span> Creating…';

    try {
      const [{ getCurrentUser, displayNameOf }, { createProject }, { refreshProgress }] = await Promise.all([
        import('./auth.js'),
        import('./projects-data.js'),
        import('./progress-watch.js'),
      ]);
      const user = await getCurrentUser();
      if (!user) {
        window.location.href = '/login.html?next=' + encodeURIComponent(window.location.pathname);
        return;
      }

      const id = await createProject(user.id, displayNameOf(user), {
        title,
        summary: sheet.querySelector('#sheet-summary').value.trim(),
        description: sheet.querySelector('#sheet-description').value.trim(),
        imageUrl: sheet.querySelector('#sheet-image').value.trim(),
        tags: sheet
          .querySelector('#sheet-tags')
          .value.split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 10),
        repoUrl: sheet.querySelector('#sheet-repo').value.trim(),
        liveUrl: sheet.querySelector('#sheet-live').value.trim(),
        type: sheet.querySelector('#sheet-type').value,
        scrollImageUrl: sheet.querySelector('#sheet-scroll-image').value.trim(),
        scrollBg: sheet.querySelector('#sheet-scroll-bg').value,
        published: sheet.querySelector('#sheet-published').checked,
      });

      closeSheet();
      sheet.querySelector('#sheet-form').reset();
      updatePreview();
      showToast({ title: 'Project created', body: title, iconName: 'rocket', duration: 5000 });
      refreshProgress();
      window.location.href = `/project.html?id=${encodeURIComponent(id)}`;
    } catch (err) {
      alertEl.textContent = err.message;
      alertEl.classList.add('is-visible');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Create project';
    }
  });
}
