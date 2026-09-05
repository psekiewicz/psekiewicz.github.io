// The hero's terminal window used to be pure decoration - a static line
// behind a titlebar of three dead dots. This wires up the input row below
// it to actually run a handful of commands, some of which touch real
// site state (theme, auth, the projects table) rather than just printing
// canned text.
import { escapeHtml } from './utils.js';
import { getCurrentUser, displayNameOf, logoutUser } from './auth.js';
import { getPublishedProjectCount } from './projects-data.js';

const MAX_LINES = 60;
const PAGE_LOAD_TIME = Date.now();

function formatUptime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

// The site keeps you signed in and remembers your theme via localStorage,
// not cookies (see js/cookie-consent.js) - there's nothing server-side
// here to set one. This clears whatever document.cookie actually has
// anyway, for whatever a browser extension or the hosting layer left
// behind, rather than assuming there's nothing to do.
function wipeCookies() {
  const cookies = document.cookie ? document.cookie.split(';') : [];
  for (const cookie of cookies) {
    const name = cookie.split('=')[0].trim();
    if (!name) continue;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}`;
  }
  return cookies.filter(Boolean).length;
}

export function initHeroTerminal() {
  const form = document.getElementById('term-form');
  const input = document.getElementById('term-input');
  const output = document.getElementById('term-output');
  if (!form || !input || !output) return;

  function print(html) {
    const p = document.createElement('p');
    p.innerHTML = html;
    output.appendChild(p);
    output.hidden = false;
    while (output.children.length > MAX_LINES) output.removeChild(output.firstChild);
    output.scrollTop = output.scrollHeight;
    return p;
  }

  function echo(text) {
    const p = document.createElement('p');
    p.className = 'term-out-echo';
    p.textContent = text;
    output.appendChild(p);
    output.hidden = false;
  }

  const handlers = {
    help() {
      print(
        [
          'help — this list',
          'about — what this place is',
          'stats — how many projects are published',
          "whoami — who you are (or aren't) signed in as",
          'projects / scrolls / shop / register — go there',
          'theme [dark|light|toggle] — switch the site theme',
          'clear — clear this output',
        ].join('<br>'),
      );
    },
    about() {
      print(
        "A feed for music, video, images and apps, built so whoever made them isn't invisible. No mission statement, just a feed.",
      );
    },
    async stats() {
      const line = print('counting…');
      try {
        const count = await getPublishedProjectCount();
        line.textContent = `${count} project${count === 1 ? '' : 's'} published so far. Not enough, but growing.`;
      } catch {
        line.textContent = 'could not reach the database from here.';
      }
    },
    async whoami() {
      const user = await getCurrentUser();
      print(user ? `you're ${escapeHtml(displayNameOf(user))}. hi.` : "you're nobody yet — try <code>register</code>.");
    },
    projects() {
      print('taking you to /projects…');
      setTimeout(() => (window.location.href = '/projects'), 400);
    },
    scrolls() {
      print('taking you to /scrolls…');
      setTimeout(() => (window.location.href = '/scrolls'), 400);
    },
    shop() {
      print('taking you to /shop…');
      setTimeout(() => (window.location.href = '/shop'), 400);
    },
    register() {
      print('taking you to /register…');
      setTimeout(() => (window.location.href = '/register.html'), 400);
    },
    theme([mode]) {
      const toggle = document.getElementById('theme-toggle');
      if (!toggle) {
        print('no theme toggle on this page.');
        return;
      }
      const current =
        document.documentElement.getAttribute('data-theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

      if (!mode || mode === 'toggle') {
        toggle.click();
        print(`switched to ${current === 'dark' ? 'light' : 'dark'}.`);
      } else if (mode === 'dark' || mode === 'light') {
        if (current !== mode) toggle.click();
        print(`theme set to ${mode}.`);
      } else {
        print('usage: theme [dark|light|toggle]');
      }
    },
    clear() {
      output.innerHTML = '';
      output.hidden = true;
    },
    async sudo(args) {
      if (args.join(' ') !== 'rm -rf /') {
        print("nice try — this isn't that kind of terminal.");
        return;
      }
      print("rm: cannot delete '/': not that kind of terminal.");
      print('rm: deleting your session instead.');
      try {
        await logoutUser();
      } catch {
        // Already signed out, or the network's gone - either way there's
        // nothing left to sign out of.
      }
      const count = wipeCookies();
      print(count > 0 ? `${count} cookie${count === 1 ? '' : 's'} deleted. logged out.` : 'no cookies found. logged out.');
    },
    date() {
      print(new Date().toString());
    },
    async neofetch() {
      const user = await getCurrentUser();
      const who = user ? displayNameOf(user) : 'guest';
      const theme =
        document.documentElement.getAttribute('data-theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const logo = [
        '<span style="color:var(--color-accent)">&nbsp;&nbsp;████</span>',
        '<span style="color:var(--color-accent)">&nbsp;&nbsp;████</span>',
        '<span style="color:var(--color-primary)">████</span><span style="color:var(--color-accent)">██</span>',
        '<span style="color:var(--color-primary)">████</span>',
        '<span style="color:var(--color-primary)">████</span>',
      ].join('<br>');
      const info = [
        `${escapeHtml(who)}@showcase`,
        '------------------',
        'OS: ShowcaseOS (GitHub Pages)',
        'Host: psekiewicz.github.io',
        'Kernel: postgres+rls 16.13',
        `Uptime: ${formatUptime(Date.now() - PAGE_LOAD_TIME)}`,
        'Shell: /bin/vibes',
        `Theme: ${theme}`,
        `Resolution: ${window.innerWidth}x${window.innerHeight}`,
        'Packages: 0 (no build step)',
      ].join('<br>');
      print(`${logo}<br><br>${info}`);
    },
    fastfetch(args) {
      return handlers.neofetch(args);
    },
    async doom() {
      print('it runs on everything. loading…');
      const { runDoom } = await import('./hero-doom.js');
      input.disabled = true;
      runDoom(output, {
        onQuit: () => {
          input.disabled = false;
          input.focus();
          print('thanks for playing.');
        },
      });
    },
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = input.value;
    input.value = '';

    const trimmed = raw.trim();
    echo(trimmed);
    if (!trimmed) return;

    const [cmd, ...args] = trimmed.split(/\s+/);
    const handler = handlers[cmd.toLowerCase()];
    if (handler) {
      await handler(args);
    } else {
      print(`command not found: ${escapeHtml(cmd)} — try <code>help</code>`);
    }
    output.scrollTop = output.scrollHeight;
  });
}
