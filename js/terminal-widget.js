// The homepage hero has its own inline terminal, but a signed-in visitor
// gets redirected straight past the homepage to /projects and would
// otherwise never see it. This puts the same terminal (same commands,
// same easter eggs) one click away on every other page instead, via a
// small floating trigger - mounted the same lazy way create-sheet.js
// mounts its sheet: nothing touches the DOM until the first click.
import { pageId } from './utils.js';
import { icon } from './icons.js';

// The homepage already has the real thing inline - a second one floating
// over it would just be clutter.
if (pageId(window.location.pathname) !== 'index') {
  mountTrigger();
}

function mountTrigger() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'terminal-trigger';
  btn.setAttribute('aria-label', 'Open terminal');
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.title = 'Terminal';
  btn.innerHTML = icon('code', { size: 18 });
  btn.addEventListener('click', openTerminal);
  document.body.appendChild(btn);
}

let modal = null;
let backdrop = null;
let initialized = false;

function isOpen() {
  return Boolean(modal && modal.classList.contains('is-open'));
}

function closeTerminal() {
  if (!modal) return;
  modal.classList.remove('is-open');
  backdrop.classList.remove('is-open');
}

async function openTerminal() {
  mount();
  modal.classList.add('is-open');
  backdrop.classList.add('is-open');
  if (!initialized) {
    initialized = true;
    const { initHeroTerminal } = await import('./hero-terminal.js');
    initHeroTerminal({
      form: modal.querySelector('#widget-term-form'),
      input: modal.querySelector('#widget-term-input'),
      output: modal.querySelector('#widget-term-output'),
    });
  }
  modal.querySelector('#widget-term-input').focus();
}

function mount() {
  if (modal) return;

  backdrop = document.createElement('div');
  backdrop.className = 'terminal-modal-backdrop';
  backdrop.addEventListener('click', closeTerminal);

  modal = document.createElement('div');
  modal.className = 'terminal-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', 'Terminal');
  modal.innerHTML = `
    <div class="term-window-bar">
      <span class="term-dot"></span><span class="term-dot"></span><span class="term-dot"></span>
      <button class="modal-close" type="button" id="widget-term-close" aria-label="Close">${icon('x', { size: 16 })}</button>
    </div>
    <div class="term-output" id="widget-term-output"><p>Type <code>help</code> to get started.</p></div>
    <form class="term-input-row" id="widget-term-form">
      <span class="term-prompt" aria-hidden="true">$</span>
      <input
        class="term-input"
        id="widget-term-input"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        aria-label="Terminal command input"
      />
    </form>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);

  modal.querySelector('#widget-term-close').addEventListener('click', closeTerminal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) closeTerminal();
  });
}
