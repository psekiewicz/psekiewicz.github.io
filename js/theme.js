import { icon } from './icons.js';

function currentTheme() {
  var stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyIcon(btn, theme) {
  btn.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon', { size: 18 });
  btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

document.addEventListener('DOMContentLoaded', function () {
  var btn = document.getElementById('theme-toggle');
  if (!btn) return;
  applyIcon(btn, currentTheme());
  btn.addEventListener('click', function () {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);
    applyIcon(btn, next);
  });
});
