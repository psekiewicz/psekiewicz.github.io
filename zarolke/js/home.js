// Home page: the example-offer reel (story-style autoplay) and the copy-email buttons.
(() => {
  const SLIDE_MS = 5000;
  const reel = document.getElementById('reel');
  const slides = [...reel.querySelectorAll('.slide')];
  const bars = [...reel.querySelectorAll('.reel-bars span')];
  const pauseBtn = document.getElementById('reel-pause');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let index = 0;
  let timer = 0;
  let paused = reduceMotion;
  let hovering = false;

  reel.style.setProperty('--slide-ms', `${SLIDE_MS}ms`);

  function show(next) {
    index = (next + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      const active = i === index;
      slide.hidden = !active;
      slide.classList.toggle('is-active', active);
    });
    bars.forEach((bar, i) => {
      bar.classList.toggle('done', i < index);
      bar.classList.remove('now');
    });
    void bars[index].offsetWidth; // restart the progress animation
    bars[index].classList.add('now');
    schedule();
  }

  function schedule() {
    window.clearTimeout(timer);
    const stopped = paused || hovering || document.hidden;
    reel.classList.toggle('is-paused', stopped);
    if (!stopped) timer = window.setTimeout(() => show(index + 1), SLIDE_MS);
  }

  function setPaused(value) {
    paused = value;
    pauseBtn.setAttribute('aria-pressed', String(paused));
    pauseBtn.textContent = paused ? 'Odtwórz' : 'Pauza';
    // A restarted bar is simpler than tracking remaining time.
    show(index);
  }

  reel.querySelectorAll('.reel-zone').forEach((zone) => {
    zone.addEventListener('click', () => show(index + Number(zone.dataset.step)));
  });

  pauseBtn.addEventListener('click', () => setPaused(!paused));

  const screen = reel.querySelector('.reel-screen');
  screen.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') {
      hovering = true;
      schedule();
    }
  });
  screen.addEventListener('pointerleave', () => {
    if (hovering) {
      hovering = false;
      show(index);
    }
  });

  reel.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(index + 1);
    if (e.key === 'ArrowLeft') show(index - 1);
  });

  document.addEventListener('visibilitychange', schedule);

  setPaused(paused);

  // ---------- Copy e-mail addresses ----------

  const toast = document.getElementById('toast');
  let toastTimer = 0;
  function say(message) {
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast.hidden = true), 2000);
  }

  document.querySelectorAll('.mail-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const address = btn.dataset.copy;
      const fallback = () => {
        const range = document.createRange();
        range.selectNodeContents(btn.previousElementSibling);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        say('Adres zaznaczony, skopiuj go skrótem Ctrl+C');
      };
      if (!navigator.clipboard) return fallback();
      navigator.clipboard.writeText(address).then(() => say(`Skopiowano ${address}`), fallback);
    });
  });
})();
