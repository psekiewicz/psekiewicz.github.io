// Someone always asks if it runs Doom. This isn't the real engine or the
// shareware WAD - pulling in a whole third-party emulator for one
// terminal joke would be a strange thing for a site that's otherwise
// zero-build and one CDN script deep - it's a from-scratch raycaster:
// the same "flat grid + cast a ray per column + draw a vertical strip
// scaled by distance" trick that made the original run on anything.
// Reads its palette from the site's own CSS custom properties, so it
// reskins itself with the theme toggle instead of looking pasted in.
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

  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 202;
  canvas.className = 'doom-canvas';
  canvas.tabIndex = 0;

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

  wrap.append(canvas, hint, pad);
  mount.appendChild(wrap);
  mount.hidden = false;
  mount.scrollTop = mount.scrollHeight;

  const ctx = canvas.getContext('2d');
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
    const W = canvas.width;
    const H = canvas.height;
    const sky = cssVar('--color-bg', '#14120f');
    const floor = cssVar('--color-muted-soft', '#2a2620');
    const wallColor = cssVar('--color-primary', '#ef6b3c');
    const gunColor = cssVar('--color-text', '#f0ece3');

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H / 2);
    ctx.fillStyle = floor;
    ctx.fillRect(0, H / 2, W, H / 2);

    const FOV = Math.PI / 3;
    const numRays = 90;
    const stripW = W / numRays;
    const maxDist = 16;
    const step = 0.03;

    for (let i = 0; i < numRays; i++) {
      const rayAngle = player.angle - FOV / 2 + (FOV * i) / numRays;
      const rcos = Math.cos(rayAngle);
      const rsin = Math.sin(rayAngle);
      let dist = 0;
      while (dist < maxDist && !isWall(player.x + rcos * dist, player.y + rsin * dist)) {
        dist += step;
      }
      // Corrects the fisheye a per-column distance would otherwise show -
      // measuring along the view direction, not the ray, is what makes
      // straight walls render straight.
      const corrected = dist * Math.cos(rayAngle - player.angle);
      const wallH = Math.min(H, H / (corrected + 0.0001));
      const brightness = Math.max(0.15, 1 - corrected / 9);

      ctx.globalAlpha = brightness;
      ctx.fillStyle = wallColor;
      ctx.fillRect(i * stripW, (H - wallH) / 2, stripW + 1, wallH);
    }
    ctx.globalAlpha = 1;

    // A weapon silhouette - just enough to read as "you're holding
    // something", not an actual modeled gun.
    ctx.fillStyle = gunColor;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 22, H);
    ctx.lineTo(W / 2 - 8, H - 46);
    ctx.lineTo(W / 2 + 8, H - 46);
    ctx.lineTo(W / 2 + 22, H);
    ctx.closePath();
    ctx.fill();
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
    // Movement only counts while the canvas actually has focus, so arrow
    // keys don't hijack the page the moment a game is merely running.
    if (document.activeElement !== canvas) return;
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

  canvas.addEventListener('click', () => canvas.focus());
  canvas.focus();
  loop();

  return quit;
}
