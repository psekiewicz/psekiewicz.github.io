import { icon } from './icons.js';
import { escapeHtml } from './utils.js';

// Lightweight toast stack, created lazily the first time something is
// shown so pages that never toast pay nothing for it.
let stack = null;

function getStack() {
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  return stack;
}

const DEFAULT_DURATION = 6000;

// Toasts announce a reward that already happened — dismissing one must
// never look like it cancelled anything, so they fade rather than needing
// an explicit action, and a click just takes them away early.
export function showToast({ title, body = '', iconName = 'award', variant = '', duration = DEFAULT_DURATION }) {
  const el = document.createElement('div');
  el.className = `toast${variant ? ' toast-' + variant : ''}`;
  el.innerHTML = `
    <span class="toast-icon">${icon(iconName, { size: 20 })}</span>
    <span class="toast-text">
      <strong>${escapeHtml(title)}</strong>
      ${body ? `<span>${escapeHtml(body)}</span>` : ''}
    </span>
  `;

  const remove = () => {
    if (!el.isConnected) return;
    el.classList.add('is-leaving');
    // Matches the CSS leave transition; removing sooner would cut it off.
    setTimeout(() => el.remove(), 220);
  };

  el.addEventListener('click', remove);
  getStack().appendChild(el);
  // Next frame, so the browser has a chance to paint the "before" state and
  // actually animate the entrance instead of jumping straight to the end.
  requestAnimationFrame(() => el.classList.add('is-visible'));
  setTimeout(remove, duration);
  return el;
}

export function showAchievementToast(achievement) {
  showToast({
    title: 'Achievement unlocked',
    body: `${achievement.label} · +${achievement.reward} pts to claim`,
    iconName: achievement.icon || 'award',
    variant: 'achievement',
    duration: 8000,
  });
}

export function showLevelUpToast(level) {
  showToast({
    title: `Level ${level}`,
    body: 'You levelled up',
    iconName: 'star',
    variant: 'level',
    duration: 8000,
  });
}

export function showXpToast(gained) {
  showToast({ title: `+${gained.toLocaleString()} XP`, iconName: 'flame', variant: 'xp', duration: 4500 });
}

// Points paid out for reach — someone else viewed, liked, commented on or
// followed your work. Worth its own toast rather than folding into the XP
// one: this is spendable currency, not just a number going up.
export function showEarningsToast(paid) {
  showToast({
    title: `+${paid.toLocaleString()} points`,
    body: 'Earned from people finding your work',
    iconName: 'coin',
    variant: 'points',
    duration: 7000,
  });
}
