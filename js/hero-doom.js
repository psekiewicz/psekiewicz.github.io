// Someone always asks if it runs Doom. This isn't the real engine or the
// shareware WAD - pulling in a whole third-party emulator for one
// terminal joke would be a strange thing for a site that's otherwise
// zero-build and one CDN script deep - it's a from-scratch raycaster:
// the same "flat grid + cast a ray per column + draw a vertical strip
// scaled by distance" trick that made the original run on anything.
// Rendered as actual text - a density-shaded ASCII frame redrawn every
// tick into a <pre>, not a picture of one - because a terminal command
// that just opens a <canvas> isn't really "doom in the terminal", it's a
// window floating on top of it. Reads its palette from the site's own
// CSS custom properties, so it reskins itself with the theme toggle.
const MAP = [
  '##########',
  '#........#',
  '#..##....#',
  '#..#.....#',
  '#..#.###.#',
  '#........#',
  '#.######.#',
  '#........#',
  '#........#',
  '##########',
];
const MAP_W = MAP[0].length;
const MAP_H = MAP.length;

function isWall(x, y) {
  const mx = Math.floor(x);
  const my = Math.floor(y);
  if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) return true;
  return MAP[my][mx] === '#';
}

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

// Character weight stands in for shading - a raycaster's usual per-pixel
// brightness has no pixels to dim here, so distance instead picks how
// "solid" a glyph looks, light to heavy. Both gradients skip a leading
// space: even the farthest wall or floor cell should read as something
// there, not a gap the sky bleeds through.
const WALL_GRADIENT = '.:-=+*#%@';
const FLOOR_GRADIENT = '.,:;=';
const COLS = 70;
const ROWS = 28;
const FOV = Math.PI / 3;
const MAX_DIST = 16;
const STEP = 0.05;

function wallChar(dist) {
  const t = Math.max(0, Math.min(1, 1 - dist / 9));
  const idx = Math.min(WALL_GRADIENT.length - 1, Math.floor(t * WALL_GRADIENT.length));
  return WALL_GRADIENT[idx];
}

function floorChar(depth) {
  const idx = Math.min(FLOOR_GRADIENT.length - 1, Math.floor(depth * FLOOR_GRADIENT.length));
  return FLOOR_GRADIENT[Math.max(0, idx)];
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const KEY_ACTION = {
  ArrowUp: 'up',
  w: 'up',
  W: 'up',
  ArrowDown: 'down',
  s: 'down',
  S: 'down',
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
};

// Mounts the game into `mount` (the terminal's own output pane) and wires
// up keyboard + on-screen controls. Returns a quit() function; also calls
// options.onQuit once, however the player leaves (Q, Esc, or the button).
export function runDoom(mount, { onQuit } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'doom-wrap';

  const screen = document.createElement('pre');
  screen.className = 'doom-ascii';
  screen.tabIndex = 0;

  const hint = document.createElement('p');
  hint.className = 'doom-hint';
  hint.textContent = 'click the screen, then WASD/arrows to move · Q or Esc to quit';

  const pad = document.createElement('div');
  pad.className = 'doom-pad';
  pad.innerHTML = `
    <button type="button" class="btn btn-ghost btn-sm" data-k="left" aria-label="Turn left">◀</button>
    <button type="button" class="btn btn-ghost btn-sm" data-k="up" aria-label="Move forward">▲</button>
    <button type="button" class="btn btn-ghost btn-sm" data-k="down" aria-label="Move backward">▼</button>
    <button type="button" class="btn btn-ghost btn-sm" data-k="right" aria-label="Turn right">▶</button>
    <button type="button" class="btn btn-secondary btn-sm" data-k="quit">Quit</button>
  `;

  wrap.append(screen, hint, pad);
  mount.appendChild(wrap);
  mount.hidden = false;
  mount.scrollTop = mount.scrollHeight;

  // Mid-corridor, facing down the map's one long open row (row 5) - a
  // spawn facing straight into an adjacent wall just fills the screen
  // with a flat color, which is a worse first impression than a bit of
  // actual depth.
  const player = { x: 4.5, y: 5.5, angle: 0 };
  const pressed = new Set();
  let running = true;
  let rafId = null;

  function tryMove(nx, ny) {
    // Per-axis sliding collision: a wall in front stops that axis without
    // freezing the other one, so grazing a corner doesn't stick you to it.
    const r = 0.2;
    if (!isWall(nx + r, player.y) && !isWall(nx - r, player.y)) player.x = nx;
    if (!isWall(player.x, ny + r) && !isWall(player.x, ny - r)) player.y = ny;
  }

  function update() {
    const turnSpeed = 0.045;
    const moveSpeed = 0.045;
    if (pressed.has('left')) player.angle -= turnSpeed;
    if (pressed.has('right')) player.angle += turnSpeed;
    const cos = Math.cos(player.angle);
    const sin = Math.sin(player.angle);
    if (pressed.has('up')) tryMove(player.x + cos * moveSpeed, player.y + sin * moveSpeed);
    if (pressed.has('down')) tryMove(player.x - cos * moveSpeed, player.y - sin * moveSpeed);
  }

  function render() {
    const wallColor = cssVar('--color-primary', '#ef6b3c');
    const floorColor = cssVar('--color-text-faint', '#78726a');
    const gunColor = cssVar('--color-text', '#f0ece3');

    // One raycast per column, same as the canvas version - just recording
    // where the wall band starts/ends in character rows instead of pixels.
    const columns = new Array(COLS);
    for (let i = 0; i < COLS; i++) {
      const rayAngle = player.angle - FOV / 2 + (FOV * i) / COLS;
      const rcos = Math.cos(rayAngle);
      const rsin = Math.sin(rayAngle);
      let dist = 0;
      while (dist < MAX_DIST && !isWall(player.x + rcos * dist, player.y + rsin * dist)) {
        dist += STEP;
      }
      // Corrects the fisheye a per-column distance would otherwise show -
      // measuring along the view direction, not the ray, is what makes
      // straight walls render straight.
      const corrected = dist * Math.cos(rayAngle - player.angle);
      const wallRows = Math.min(ROWS, ROWS / (corrected + 0.0001));
      columns[i] = {
        top: Math.floor((ROWS - wallRows) / 2),
        bottom: Math.ceil((ROWS + wallRows) / 2),
        char: wallChar(corrected),
      };
    }

    // A gun silhouette sitting on the floor rows, widening toward the
    // bottom - just enough to read as "you're holding something", not an
    // actual modeled gun.
    const gunTopRow = ROWS - 8;

    const lines = new Array(ROWS);
    for (let r = 0; r < ROWS; r++) {
      let html = '';
      let runType = null;
      let runBuf = '';
      const flush = () => {
        if (!runBuf) return;
        if (runType === 'sky') {
          html += runBuf;
        } else {
          const color = runType === 'gun' ? gunColor : runType === 'wall' ? wallColor : floorColor;
          html += `<span style="color:${color}">${escapeHtml(runBuf)}</span>`;
        }
        runBuf = '';
      };

      for (let c = 0; c < COLS; c++) {
        const col = columns[c];
        let type;
        let ch;
        if (r < col.top) {
          type = 'sky';
          ch = ' ';
        } else if (r < col.bottom) {
          type = 'wall';
          ch = col.char;
        } else {
          const depth = (r - ROWS / 2) / (ROWS / 2);
          type = 'floor';
          ch = floorChar(depth);
          if (r >= gunTopRow) {
            const halfWidth = ((r - gunTopRow + 1) / (ROWS - gunTopRow)) * 7;
            if (Math.abs(c - COLS / 2) < halfWidth) {
              type = 'gun';
              ch = '#';
            }
          }
        }
        if (type !== runType) {
          flush();
          runType = type;
        }
        runBuf += ch;
      }
      flush();
      lines[r] = html;
    }

    screen.innerHTML = lines.join('\n');
  }

  function loop() {
    if (!running) return;
    update();
    render();
    rafId = requestAnimationFrame(loop);
  }

  function quit() {
    if (!running) return;
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    wrap.remove();
    if (onQuit) onQuit();
  }

  function onKeyDown(e) {
    if (!running) return;
    if (e.key === 'q' || e.key === 'Q' || e.key === 'Escape') {
      e.preventDefault();
      quit();
      return;
    }
    // Movement only counts while the screen actually has focus, so arrow
    // keys don't hijack the page the moment a game is merely running.
    if (document.activeElement !== screen) return;
    const action = KEY_ACTION[e.key];
    if (action) {
      e.preventDefault();
      pressed.add(action);
    }
  }

  function onKeyUp(e) {
    const action = KEY_ACTION[e.key];
    if (action) pressed.delete(action);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  pad.querySelectorAll('button').forEach((btn) => {
    const action = btn.dataset.k;
    if (action === 'quit') {
      btn.addEventListener('click', quit);
      return;
    }
    const press = (e) => {
      e.preventDefault();
      pressed.add(action);
    };
    const release = (e) => {
      e.preventDefault();
      pressed.delete(action);
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('pointercancel', release);
  });

  screen.addEventListener('click', () => screen.focus());
  screen.focus();
  loop();

  return quit;
}
