import { ACCEPT, formatBytes } from './compress.js';

// The upload code (and with it the Supabase client) is loaded on the first
// pick, so a form with an Upload button opens without touching the network.
const uploadMedia = (...args) => import('./uploads-data.js').then((m) => m.uploadMedia(...args));

// Puts an Upload button under a link field. The picked file is compressed on
// this device, uploaded, and its URL written into the field - as if the link
// had been pasted - with an input event so previews and hints follow along.
// The field stays editable: a link from elsewhere works as before.
export function attachUpload(input, { kind = 'cover', label = 'Upload' } = {}) {
  if (!input || input.dataset.upload) return;
  input.dataset.upload = kind;

  const row = document.createElement('div');
  row.className = 'upload-row';
  row.innerHTML = `
    <button type="button" class="btn btn-secondary btn-sm upload-btn">${label}</button>
    <span class="upload-status" aria-live="polite"></span>
    <input type="file" hidden accept="${kind === 'media' ? ACCEPT.media : ACCEPT.image}" />`;
  input.insertAdjacentElement('afterend', row);
  const button = row.querySelector('button');
  const status = row.querySelector('.upload-status');
  const picker = row.querySelector('input[type=file]');

  button.addEventListener('click', () => picker.click());
  input.form?.addEventListener('reset', () => {
    status.textContent = '';
    status.classList.remove('is-error');
  });
  // Saving mid-upload would save the field without the file's link.
  const submit = input.form?.querySelector('[type=submit]');
  picker.addEventListener('change', async () => {
    const file = picker.files[0];
    picker.value = '';
    if (!file) return;
    button.disabled = true;
    if (submit) submit.disabled = true;
    status.classList.remove('is-error');
    try {
      const result = await uploadMedia(file, {
        kind,
        onStage: (stage, progress) => {
          status.textContent =
            stage === 'upload'
              ? 'Uploading…'
              : file.type.startsWith('video/')
                ? `Shrinking the clip… ${Math.round((progress || 0) * 100)}% (keep this tab open)`
                : 'Shrinking…';
        },
      });
      input.value = result.url;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      status.textContent =
        result.size < result.originalSize
          ? `Uploaded - ${formatBytes(result.originalSize)} → ${formatBytes(result.size)}`
          : `Uploaded - ${formatBytes(result.size)}`;
    } catch (e) {
      status.textContent = e.message || 'Upload failed.';
      status.classList.add('is-error');
    } finally {
      button.disabled = false;
      if (submit) submit.disabled = false;
    }
  });
}

// For pictures inside a post: uploads and hands back the URL, or null if the
// person backed out. Used by the formatting bar's picture button.
export function pickAndUpload({ kind = 'inline', onStatus } = {}) {
  return new Promise((resolve, reject) => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = ACCEPT.image;
    picker.addEventListener('change', async () => {
      const file = picker.files[0];
      if (!file) return resolve(null);
      try {
        onStatus?.('Shrinking…');
        const result = await uploadMedia(file, { kind, onStage: (s) => s === 'upload' && onStatus?.('Uploading…') });
        onStatus?.('');
        resolve(result.url);
      } catch (e) {
        onStatus?.('');
        reject(e);
      }
    });
    picker.addEventListener('cancel', () => resolve(null));
    picker.click();
  });
}
