/**
 * UI PRIMITIVES
 * ============================================================================
 * The app's own controls, built here rather than borrowed. Nothing in this
 * file knows anything about boosters or cards — these are the parts the
 * screens are assembled from.
 *
 *   press()        physical press feedback on any element
 *   Odometer       digits that roll rather than swap
 *   Ring           an SVG progress ring that sweeps to its value
 *   Segmented      a sliding-pill segmented control
 *   Sheet          a bottom sheet you can throw closed
 *   NavBar         the bottom destination bar, with a travelling indicator
 *   Rail           a depth carousel with a magnetic centre
 *   Bar            a fill bar that animates from where it was
 *   Reveal         staggered entrance for a list of nodes
 */
import { synth } from './sound.js';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const raf = () => new Promise((r) => requestAnimationFrame(r));

/** Motion length in ms, scaled by the theme's own sense of pace. */
export const dur = (ms) => {
  const scale = Number(getComputedStyle(document.documentElement)
    .getPropertyValue('--motion-scale')) || 1;
  return ms * scale;
};

/**
 * Track a drag from a pointerdown. Move and release are bound to `window`
 * because a drag almost always ends outside the element it began on, and
 * setPointerCapture is not dependable across engines.
 */
export function trackDrag(event, { onMove, onEnd }) {
  const x0 = event.clientX;
  const y0 = event.clientY;
  let moved = false;
  let live = true;

  const unbind = () => {
    live = false;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
  };
  const move = (e) => {
    if (!live) return;
    if (Math.abs(e.clientX - x0) > 3 || Math.abs(e.clientY - y0) > 3) moved = true;
    onMove?.(e.clientX - x0, e.clientY - y0, e);
  };
  const end = (e) => {
    if (!live) return;
    unbind();
    onEnd?.(e.clientX - x0, e.clientY - y0, moved, e);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  /*
   * Drop the gesture without running onEnd.
   *
   * A pointerup does not always arrive — the system takes the gesture (a
   * notification pull, a back swipe), or the app is backgrounded mid-drag —
   * and the listeners then sit on window belonging to a finger that is no
   * longer down. The next drag would run alongside that ghost, measuring from
   * an origin two gestures old. Callers that own a single drag at a time
   * cancel the previous one before starting the next.
   */
  return unbind;
}

/* --- press ---------------------------------------------------------------- */

/**
 * Make an element feel like a physical control: it takes the press on the way
 * down, not on the way up, and the sound lands with the finger rather than
 * after it. The `is-pressed` class carries the visual half, which each theme
 * styles its own way — Paper drops it onto its shadow, Arcade shifts it down
 * a hard two pixels, Aurora scales it.
 */
export function press(node, { sound = 'tap', scale = true } = {}) {
  if (!node || node.dataset.pressBound) return node;
  node.dataset.pressBound = '1';
  if (scale) node.classList.add('pressable');

  const down = () => {
    if (node.disabled) return;
    node.classList.add('is-pressed');
    synth.resume();
    if (sound === 'tap') synth.playTap();
    else if (sound && typeof synth[`play${sound[0].toUpperCase()}${sound.slice(1)}`] === 'function') {
      synth[`play${sound[0].toUpperCase()}${sound.slice(1)}`]();
    }
  };
  const up = () => node.classList.remove('is-pressed');

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);
  node.addEventListener('pointerleave', up);
  return node;
}

/* --- odometer ------------------------------------------------------------- */

/**
 * Rolling digits. A balance that jumps from 1,500 to 2,140 tells you nothing;
 * one that rolls tells you it went up, and roughly by how much, before you
 * have read either number.
 *
 * Each digit column holds 0-9 stacked vertically and is translated to the
 * digit it should show, so the roll is one transform per column.
 */
export class Odometer {
  constructor(node) {
    this.node = node;
    this.node.classList.add('odometer');
    this.value = null;
    this.columns = [];
  }

  set(value, { animate = true } = {}) {
    const text = Math.round(value).toLocaleString('en-US');
    if (text === this.value) return;
    const first = this.value === null;
    this.value = text;

    const chars = [...text];
    // Rebuild only when the shape changes (a digit added, a comma moved).
    if (chars.length !== this.columns.length) {
      this.node.replaceChildren(...chars.map((ch) => this.#column(ch)));
      this.columns = [...this.node.children];
    }

    chars.forEach((ch, i) => {
      const col = this.columns[i];
      if (!col) return;
      if (!/\d/.test(ch)) {
        col.className = 'odo-fixed';
        col.textContent = ch;
        return;
      }
      if (col.className !== 'odo-col') {
        col.className = 'odo-col';
        col.replaceChildren(this.#reel());
      }
      const reel = col.firstChild;
      reel.style.transition = (animate && !first)
        ? `transform ${dur(520)}ms var(--ease-pop)` : 'none';
      reel.style.transform = `translateY(${-Number(ch) * 10}%)`;
    });
  }

  #column(ch) {
    const col = document.createElement('span');
    if (/\d/.test(ch)) {
      col.className = 'odo-col';
      col.appendChild(this.#reel());
    } else {
      col.className = 'odo-fixed';
      col.textContent = ch;
    }
    return col;
  }

  #reel() {
    const reel = document.createElement('span');
    reel.className = 'odo-reel';
    for (let d = 0; d <= 9; d++) {
      const cell = document.createElement('span');
      cell.textContent = String(d);
      reel.appendChild(cell);
    }
    return reel;
  }
}

/* --- ring ----------------------------------------------------------------- */

/** A progress ring. Used for the level badge in the header. */
export class Ring {
  constructor(node, { size = 40, width = 3 } = {}) {
    this.node = node;
    const r = (size - width) / 2;
    this.circumference = 2 * Math.PI * r;
    node.classList.add('ring');
    node.innerHTML = `
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
        <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${width}"/>
        <circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${width}"
                stroke-linecap="round" stroke-dasharray="${this.circumference}"
                stroke-dashoffset="${this.circumference}"
                transform="rotate(-90 ${size / 2} ${size / 2})"/>
      </svg>
      <span class="ring-label"></span>`;
    this.fill = node.querySelector('.ring-fill');
    this.label = node.querySelector('.ring-label');
  }

  set(fraction, label) {
    const f = clamp(fraction, 0, 1);
    this.fill.style.transition = `stroke-dashoffset ${dur(700)}ms var(--ease)`;
    this.fill.style.strokeDashoffset = String(this.circumference * (1 - f));
    if (label != null) this.label.textContent = label;
  }
}

/* --- bar ------------------------------------------------------------------ */

/** A fill bar that animates from wherever it already was. */
export class Bar {
  constructor(node) {
    this.node = node;
    node.classList.add('bar');
    node.innerHTML = '<span class="bar-fill"></span>';
    this.fill = node.firstChild;
  }

  set(fraction, { animate = true } = {}) {
    this.fill.style.transition = animate ? `width ${dur(700)}ms var(--ease)` : 'none';
    this.fill.style.width = `${clamp(fraction, 0, 1) * 100}%`;
  }
}

/* --- segmented control ----------------------------------------------------- */

/**
 * A sliding pill. The indicator is a single element moved with a transform
 * rather than a class on each option, so it travels between segments instead
 * of blinking from one to the next.
 */
export class Segmented {
  constructor(node, options, onChange) {
    this.node = node;
    this.onChange = onChange;
    node.classList.add('segmented');
    node.setAttribute('role', 'tablist');

    this.indicator = document.createElement('span');
    this.indicator.className = 'seg-indicator';

    this.buttons = options.map((opt, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg-option';
      b.dataset.value = opt.id;
      b.textContent = opt.label;
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => this.select(opt.id));
      press(b, { scale: false });
      return b;
    });

    node.replaceChildren(this.indicator, ...this.buttons);
    this.value = options[0]?.id ?? null;
    requestAnimationFrame(() => this.#move(false));
  }

  select(id, { silent = false } = {}) {
    if (id === this.value) return;
    this.value = id;
    this.#move(true);
    if (!silent) this.onChange?.(id);
  }

  relabel(options) {
    options.forEach((opt, i) => { if (this.buttons[i]) this.buttons[i].textContent = opt.label; });
    this.#move(false);
  }

  #move(animate) {
    const active = this.buttons.find((b) => b.dataset.value === this.value);
    if (!active) return;
    this.buttons.forEach((b) => {
      const on = b === active;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
    this.indicator.style.transition = animate
      ? `transform ${dur(380)}ms var(--ease-pop), width ${dur(380)}ms var(--ease-pop)` : 'none';
    this.indicator.style.width = `${active.offsetWidth}px`;
    this.indicator.style.transform = `translateX(${active.offsetLeft}px)`;
  }
}

/* --- bottom sheet ---------------------------------------------------------- */

/**
 * A sheet that rises from the bottom and can be thrown back down.
 *
 * The drag rubber-bands upward (you can pull it past its stop, but only a
 * little, and with resistance) and dismisses on either distance or velocity,
 * so a short fast flick closes it just as a slow long drag does. That pairing
 * is most of what separates a sheet that feels native from one that feels
 * like a div someone animated.
 */
export class Sheet {
  constructor(node) {
    this.node = node;
    this.panel = node.querySelector('.sheet-panel');
    this.scrim = node.querySelector('.sheet-scrim');
    this.open = false;
    this.locked = false;      // a level-up must be claimed, not swiped away
    this.onClose = null;
    this.#bind();
  }

  show(onClose, { locked = false } = {}) {
    this.locked = locked;
    this.onClose = onClose;
    this.node.hidden = false;
    this.panel.style.transition = 'none';
    this.panel.style.transform = 'translateY(100%)';
    this.open = true;
    document.documentElement.classList.add('has-sheet');
    requestAnimationFrame(() => {
      this.panel.style.transition = `transform ${dur(420)}ms var(--ease)`;
      this.panel.style.transform = '';
      this.node.classList.add('is-open');
    });
    synth.resume();
    synth.playSheet(true);
  }

  /** Returns whether it actually closed: a locked sheet refuses. */
  hide({ silent = false, force = false } = {}) {
    if (!this.open) return false;
    if (this.locked && !force) return false;
    this.open = false;
    this.node.classList.remove('is-open');
    this.panel.style.transition = `transform ${dur(320)}ms var(--ease)`;
    this.panel.style.transform = 'translateY(100%)';
    document.documentElement.classList.remove('has-sheet');
    if (!silent) synth.playSheet(false);
    const done = () => {
      if (this.open) return;
      this.node.hidden = true;
      this.onClose?.();
    };
    setTimeout(done, dur(340));
    return true;
  }

  #bind() {
    this.scrim?.addEventListener('click', () => this.hide());
    // A locked sheet still rubber-bands under the finger; it just will not go.
    const handle = this.node.querySelector('.sheet-handle');
    const start = (event) => {
      // Only from the handle, or from a scroll region already at the top.
      const scroller = event.target.closest('.sheet-body');
      if (scroller && scroller.scrollTop > 0 && !event.target.closest('.sheet-handle')) return;
      const t0 = performance.now();
      let last = 0;
      let lastT = t0;
      let velocity = 0;
      this.panel.style.transition = 'none';

      trackDrag(event, {
        onMove: (dx, dy) => {
          const now = performance.now();
          if (now > lastT) velocity = (dy - last) / (now - lastT);
          last = dy; lastT = now;
          // Rubber band: downward is free, upward resists.
          const y = dy > 0 ? dy : dy * 0.28;
          this.panel.style.transform = `translateY(${y}px)`;
        },
        onEnd: (dx, dy) => {
          this.panel.style.transition = `transform ${dur(340)}ms var(--ease)`;
          const height = this.panel.offsetHeight || 1;
          // Distance OR velocity: a flick should close as surely as a haul.
          const wantsClose = dy > height * 0.32 || velocity > 0.7;
          // A locked sheet refuses to close, so it has to be put back: without
          // this it stays wherever the drag left it, off the bottom of the
          // screen, with its own buttons out of reach.
          if (!wantsClose || !this.hide()) this.panel.style.transform = '';
        }
      });
    };
    this.panel?.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, a, input, select, textarea, .no-drag')) return;
      start(e);
    });
    if (handle) handle.style.touchAction = 'none';
  }
}

/* --- bottom navigation ------------------------------------------------------ */

/**
 * The destination bar. The indicator is one element that travels, and the
 * active icon lifts — so the bar reads as a single object with a position in
 * it, rather than five buttons that light up independently.
 */
export class NavBar {
  constructor(node, items, onChange) {
    this.node = node;
    this.onChange = onChange;
    this.items = items;
    node.classList.add('navbar');

    this.indicator = document.createElement('span');
    this.indicator.className = 'nav-indicator';

    this.buttons = items.map((item) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'nav-item';
      b.dataset.tab = item.id;
      b.innerHTML = `
        <span class="nav-icon">${item.icon}</span>
        <span class="nav-label"></span>
        <span class="nav-badge" hidden></span>`;
      b.addEventListener('click', () => this.select(item.id));
      press(b, { sound: null, scale: false });
      return b;
    });

    node.replaceChildren(this.indicator, ...this.buttons);
    this.value = items[0]?.id ?? null;
    requestAnimationFrame(() => this.#move(false));
    window.addEventListener('resize', () => this.#move(false), { passive: true });
  }

  select(id, { silent = false } = {}) {
    if (id === this.value) {
      if (!silent) this.onChange?.(id, true);
      return;
    }
    const before = this.items.findIndex((i) => i.id === this.value);
    const after = this.items.findIndex((i) => i.id === id);
    this.value = id;
    this.#move(true);
    if (!silent) {
      synth.resume();
      synth.playNav(after >= before);
      this.onChange?.(id, false);
    }
  }

  setLabels(labels) {
    this.buttons.forEach((b) => {
      const label = labels[b.dataset.tab];
      if (label != null) b.querySelector('.nav-label').textContent = label;
    });
    this.#move(false);
  }

  setBadge(id, text) {
    const button = this.buttons.find((b) => b.dataset.tab === id);
    if (!button) return;
    const badge = button.querySelector('.nav-badge');
    badge.textContent = text ?? '';
    badge.hidden = !text;
  }

  #move(animate) {
    const active = this.buttons.find((b) => b.dataset.tab === this.value);
    if (!active || !active.offsetWidth) return;
    this.buttons.forEach((b) => {
      const on = b === active;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-current', on ? 'page' : 'false');
    });
    this.indicator.style.transition = animate
      ? `transform ${dur(420)}ms var(--ease-pop), width ${dur(420)}ms var(--ease-pop)` : 'none';
    this.indicator.style.width = `${active.offsetWidth}px`;
    this.indicator.style.transform = `translateX(${active.offsetLeft}px)`;
  }
}

/* --- depth rail ------------------------------------------------------------- */

/**
 * A carousel with depth. Items are scaled, dimmed and pushed back by their
 * distance from the centre of the viewport, recomputed on scroll, so moving
 * through the shelf feels like moving past objects rather than scrolling a
 * list. The centre is magnetic: releasing settles onto the nearest item.
 */
export class Rail {
  constructor(node, { onFocus } = {}) {
    this.node = node;
    this.onFocus = onFocus;
    this.index = 0;
    this.ticking = false;
    node.classList.add('rail');
    node.addEventListener('scroll', () => this.#onScroll(), { passive: true });
    this.#bindDrag();
  }

  setItems(nodes) {
    this.node.replaceChildren(...nodes);
    if (!nodes.length) { this.index = 0; return; }
    requestAnimationFrame(() => { this.scrollTo(Math.min(this.index, nodes.length - 1), 'auto'); this.paint(); });
  }

  get items() { return [...this.node.children]; }

  scrollTo(index, behavior = 'smooth') {
    const item = this.items[index];
    if (!item) return;
    this.node.scrollTo({
      left: item.offsetLeft - (this.node.clientWidth - item.offsetWidth) / 2,
      behavior
    });
  }

  /** Depth as a function of distance from the centre line. */
  paint() {
    const items = this.items;
    if (!items.length) return;
    const mid = this.node.scrollLeft + this.node.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;

    items.forEach((item, i) => {
      const centre = item.offsetLeft + item.offsetWidth / 2;
      const dist = Math.abs(centre - mid);
      if (dist < bestDist) { bestDist = dist; best = i; }
      const k = clamp(dist / (this.node.clientWidth * 0.62), 0, 1);
      item.style.setProperty('--depth', k.toFixed(3));
      item.classList.toggle('is-focused', false);
    });

    items[best]?.classList.add('is-focused');
    if (best !== this.index) {
      this.index = best;
      this.onFocus?.(best);
    }
  }

  #onScroll() {
    if (this.ticking) return;
    this.ticking = true;
    requestAnimationFrame(() => { this.paint(); this.ticking = false; });
  }

  #bindDrag() {
    let left0 = 0;
    this.node.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch') return;   // native momentum is better
      left0 = this.node.scrollLeft;
      this.node.classList.add('is-dragging');
      trackDrag(event, {
        onMove: (dx) => { this.node.scrollLeft = left0 - dx; },
        onEnd: (dx, dy, moved) => {
          this.node.classList.remove('is-dragging');
          this.scrollTo(this.index);
          if (moved) synth.playSnap();
        }
      });
    });
  }
}

/* --- entrance --------------------------------------------------------------- */

/** Stagger a set of nodes in. Used whenever a screen's content is replaced. */
export function reveal(nodes, { step = 45, from = 14 } = {}) {
  [...nodes].forEach((node, i) => {
    node.style.setProperty('--enter-from', `${from}px`);
    node.style.animationDelay = `${i * step}ms`;
    node.classList.add('entering');
    node.addEventListener('animationend', () => {
      node.classList.remove('entering');
      node.style.animationDelay = '';
    }, { once: true });
  });
}

/** Wait one paint, so a just-inserted node can be transitioned from. */
export const nextFrame = raf;
