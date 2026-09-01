/**
 * THE BACKDROP
 * ============================================================================
 * A single canvas behind the whole app, drawn per theme. This is the largest
 * part of what stops the app reading like a web page: a flat gradient is
 * wallpaper, a backdrop that moves is a room.
 *
 * It is also the easiest thing in the app to waste a battery on, so it is
 * governed hard:
 *
 *   - it stops completely when the document is hidden,
 *   - it stops while a full-screen takeover (opening a pack) is on top of it,
 *   - it renders at a capped device pixel ratio, and at half resolution on
 *     the themes whose look survives it,
 *   - battery saver paints one static frame and never runs the loop at all.
 *
 * Every renderer is time-driven rather than frame-driven, so a dropped frame
 * changes nothing about what you see next.
 */
import { themeById } from './themes.js';

const TAU = Math.PI * 2;
const MAX_DPR = 2;

class Backdrop {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.theme = null;
    this.raf = null;
    this.running = false;
    this.paused = false;
    this.lowPower = false;
    this.busy = false;
    this.busyTimer = 0;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.seedField = null;
  }

  mount(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.#resize();
    window.addEventListener('resize', () => this.#resize(), { passive: true });
    return this;
  }

  setTheme(id) {
    this.theme = themeById(id);
    this.seedField = null;              // renderers rebuild their own caches
    this.#resize();
    if (!this.running) this.#frame(performance.now(), true);
    return this;
  }

  setLowPower(low) {
    this.lowPower = low;
    // Battery saver does not freeze the scene any more; it halves the frame
    // rate instead. The loop reads this.lowPower each frame, so nothing to
    // restart here beyond making sure it is running.
    if (!this.paused) this.start();
  }

  /** Paused while a pack is being opened, or the app is in the background. */
  /** Called while the player is scrolling or dragging. */
  markBusy(ms = 420) {
    this.busy = true;
    clearTimeout(this.busyTimer);
    this.busyTimer = setTimeout(() => { this.busy = false; }, ms);
  }

  setPaused(paused) {
    this.paused = paused;
    if (paused) this.stop();
    else if (!this.lowPower) this.start();
  }

  start() {
    if (this.running || this.paused || !this.ctx) return;
    this.running = true;
    // Full 60fps when the phone can afford it, 30fps under battery saver.
    // (Capped at 60 either way: painting a full-screen canvas at 120Hz is
    // heat for a difference nobody can see.)
    let last = 0;
    const loop = (now) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      // A scroll gets the whole main thread it can: while the finger is
      // moving the backdrop drops to half rate, which is the difference
      // between a list that glides and one that stutters.
      const budget = this.lowPower || this.busy ? 31 : 15;
      if (now - last < budget) return;
      last = now;
      this.#frame(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  #resize() {
    if (!this.canvas) return;
    // Half resolution where the look survives it: these are soft, blurred
    // fields, and nobody can see the difference at arm's length.
    const soft = this.theme?.backdrop.renderer !== 'arcade';
    const cap = soft ? 1 : MAX_DPR;
    this.dpr = Math.min(cap, window.devicePixelRatio || 1);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.max(1, Math.floor(this.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(this.height * this.dpr));
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    if (this.ctx) this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.running) this.#frame(performance.now(), true);
  }

  #frame(now, force = false) {
    if (!this.ctx || !this.theme) return;
    const { ctx } = this;
    const w = this.width;
    const h = this.height;
    // Static themes are told to draw their "settled" state at t = 0.
    const t = this.lowPower ? 0 : now;

    switch (this.theme.backdrop.renderer) {
      case 'paper': this.#paper(ctx, w, h, t); break;
      case 'arcade': this.#arcade(ctx, w, h, t); break;
      case 'noir': this.#noir(ctx, w, h, t); break;
      case 'sunset': this.#sunset(ctx, w, h, t); break;
      case 'meadow': this.#meadow(ctx, w, h, t); break;
      case 'toon': this.#toon(ctx, w, h, t); break;
      case 'matrix': this.#matrix(ctx, w, h, t); break;
      case 'casino': this.#casino(ctx, w, h, t); break;
      case 'horror': this.#horror(ctx, w, h, t); break;
      default: this.#aurora(ctx, w, h, t);
    }
  }

  /* --- renderers --------------------------------------------------------- */

  /**
   * AURORA - slow ribbons of light folding over a deep field. Each ribbon is
   * a vertical gradient stroked along a sine path whose phase, amplitude and
   * frequency all drift at different rates, so the pattern never repeats.
   */
  #aurora(ctx, w, h, now) {
    const { ribbons, speed, alpha } = this.theme.backdrop;
    const t = now * speed;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#080b1a');
    sky.addColorStop(0.55, '#0a0e20');
    sky.addColorStop(1, '#05070f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < ribbons; i++) {
      const phase = t * (0.6 + i * 0.17) + i * 1.9;
      const amp = h * (0.06 + 0.035 * Math.sin(t * 0.7 + i));
      const mid = h * (0.26 + i * 0.13) + Math.sin(phase * 0.5) * h * 0.05;
      const thickness = h * (0.05 + 0.03 * Math.sin(t * 1.1 + i * 2));

      const hue = 190 + i * 26 + Math.sin(t + i) * 18;
      const grad = ctx.createLinearGradient(0, mid - thickness, 0, mid + thickness);
      grad.addColorStop(0, `hsla(${hue}, 90%, 62%, 0)`);
      grad.addColorStop(0.5, `hsla(${hue}, 92%, 66%, ${alpha * (0.16 + i * 0.02)})`);
      grad.addColorStop(1, `hsla(${hue}, 90%, 62%, 0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      const stepX = Math.max(12, w / 40);
      for (let x = 0; x <= w + stepX; x += stepX) {
        const k = x / w;
        ctx.lineTo(x, mid + Math.sin(k * 5 + phase) * amp + Math.sin(k * 11 - phase * 0.6) * amp * 0.35);
      }
      for (let x = w + stepX; x >= -stepX; x -= stepX) {
        const k = x / w;
        ctx.lineTo(x, mid + thickness * 2 + Math.sin(k * 5 + phase) * amp + Math.sin(k * 11 - phase * 0.6) * amp * 0.35);
      }
      ctx.closePath();
      ctx.fill();
    }

    // A scatter of stars, fixed to the field rather than the ribbons.
    if (!this.seedField) {
      this.seedField = Array.from({ length: 70 }, () => ({
        x: Math.random(), y: Math.random(), r: Math.random() * 1.1 + 0.3, p: Math.random() * TAU
      }));
    }
    for (const s of this.seedField) {
      const twinkle = 0.35 + 0.3 * Math.sin(now * 0.0012 + s.p);
      ctx.fillStyle = `rgba(226, 232, 255, ${twinkle})`;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * PAPER - a warm sheet with fibre flecks and two faint ruled lines that
   * drift so slowly you only notice if you stare. The flecks are generated
   * once and reused; regenerating them every frame would be both slower and
   * visually wrong, because paper does not shimmer.
   */
  #paper(ctx, w, h, now) {
    const { flecks, drift } = this.theme.backdrop;
    const t = now * drift;

    const sheet = ctx.createLinearGradient(0, 0, w * 0.4, h);
    sheet.addColorStop(0, '#f6f2e9');
    sheet.addColorStop(1, '#ebe5d7');
    ctx.fillStyle = sheet;
    ctx.fillRect(0, 0, w, h);

    if (!this.seedField) {
      this.seedField = Array.from({ length: flecks }, () => ({
        x: Math.random(), y: Math.random(),
        r: Math.random() * 1.4 + 0.2,
        a: Math.random() * 0.06 + 0.015,
        dark: Math.random() > 0.35
      }));
    }
    for (const f of this.seedField) {
      ctx.fillStyle = f.dark ? `rgba(60, 48, 30, ${f.a})` : `rgba(255, 255, 255, ${f.a * 1.6})`;
      ctx.beginPath();
      ctx.arc(f.x * w, f.y * h, f.r, 0, TAU);
      ctx.fill();
    }

    // Two ruled lines, breathing.
    ctx.strokeStyle = 'rgba(31, 111, 92, 0.07)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      const y = h * (0.3 + i * 0.4) + Math.sin(t + i * 2) * 14;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // A soft press shadow at the edges, so the sheet has thickness.
    const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(80, 66, 40, 0.14)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  /**
   * ARCADE - a receding grid horizon under scanlines. The grid lines are
   * spaced by a power curve so they bunch up towards the horizon the way a
   * perspective floor does, and the whole field scrolls towards the viewer.
   */
  #arcade(ctx, w, h, now) {
    const { rows, speed } = this.theme.backdrop;
    const t = now * speed;

    ctx.fillStyle = '#04050a';
    ctx.fillRect(0, 0, w, h);

    const horizon = h * 0.46;

    // Sun.
    const sun = ctx.createLinearGradient(0, horizon - h * 0.28, 0, horizon);
    sun.addColorStop(0, 'rgba(240, 171, 252, 0.55)');
    sun.addColorStop(1, 'rgba(34, 211, 238, 0.15)');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(w / 2, horizon, Math.min(w, h) * 0.19, Math.PI, TAU);
    ctx.fill();

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.32)';
    ctx.lineWidth = 1;

    // Floor lines running away from the viewer.
    for (let i = 0; i < rows; i++) {
      const k = ((i / rows) + (t % 1)) % 1;
      const y = horizon + Math.pow(k, 2.4) * (h - horizon);
      ctx.globalAlpha = 0.15 + k * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Verticals converging on the vanishing point.
    ctx.globalAlpha = 0.22;
    for (let i = -8; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + i * (w / 7), h);
      ctx.lineTo(w / 2 + i * 6, horizon);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // The tube's vignette. Scanlines are the CSS texture overlay's job, and
    // drawing them here as well would be a few hundred fillRects a frame for
    // a layer that is already on screen.
    const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  /**
   * NOIR - a dark room with one light. A slow drifting light leak, a hard
   * vignette, and film grain re-scattered every few frames rather than every
   * frame, because real grain flickers at about twelve frames a second.
   */
  #noir(ctx, w, h, now) {
    const { grain } = this.theme.backdrop;
    const t = now * 0.00006;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    // The light, wandering.
    const lx = w * (0.5 + Math.sin(t) * 0.28);
    const ly = h * (0.34 + Math.cos(t * 0.7) * 0.18);
    const beam = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(w, h) * 0.62);
    beam.addColorStop(0, 'rgba(232, 195, 122, 0.15)');
    beam.addColorStop(0.4, 'rgba(232, 195, 122, 0.05)');
    beam.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, w, h);

    // Venetian blind bars, very faint.
    ctx.fillStyle = 'rgba(232, 195, 122, 0.022)';
    const bar = h / 14;
    for (let i = 0; i < 14; i++) {
      const y = i * bar + Math.sin(t * 3 + i) * 3;
      ctx.fillRect(0, y, w, bar * 0.4);
    }

    const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.68);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.88)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    // Grain, held for a few frames at a time: real film grain flickers at
    // about twelve frames a second, not sixty.
    //
    // Drawn from a cached tile rather than computed per pixel. Scattering
    // grain across the whole screen every frame is tens of thousands of
    // trigonometric calls a frame, which is precisely the sort of thing that
    // makes a phone warm; one tile, drawn once and offset, is indistinguishable
    // and effectively free.
    const bucket = Math.floor(now / 80);
    if (bucket !== this.grainBucket) {
      this.grainBucket = bucket;
      this.grainOffset = [Math.random(), Math.random()];
    }
    const tile = this.#grainTile(grain);
    if (tile) {
      const [ox, oy] = this.grainOffset ?? [0, 0];
      const pattern = ctx.createPattern(tile, 'repeat');
      ctx.save();
      ctx.translate(-Math.floor(ox * tile.width), -Math.floor(oy * tile.height));
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w + tile.width, h + tile.height);
      ctx.restore();
    }
  }

  /** One 128px square of grain, built once and reused every frame. */
  #grainTile(strength) {
    if (this.grainCanvas) return this.grainCanvas;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const g = canvas.getContext('2d');
    const image = g.createImageData(size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const on = Math.random() > 0.93;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = on ? Math.floor(strength * 255) : 0;
    }
    g.putImageData(image, 0, 0);
    this.grainCanvas = canvas;
    return canvas;
  }

  /**
   * SUNSET '84 - a neon horizon: banded sun sinking behind a perspective
   * grid that rolls slowly toward the viewer, purple sky above.
   */
  #sunset(ctx, w, h, t) {
    const speed = this.theme.backdrop.speed ?? 0.00016;
    const horizon = h * 0.56;

    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#160a2e');
    sky.addColorStop(0.6, '#31164f');
    sky.addColorStop(1, '#6b2158');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon);

    // The sun: banded, half set.
    const r = Math.min(w, h) * 0.2;
    const cx = w / 2;
    const cy = horizon - r * 0.18;
    const sun = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    sun.addColorStop(0, '#fcd34d');
    sun.addColorStop(0.55, '#fb7185');
    sun.addColorStop(1, '#f472b6');
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, horizon);
    ctx.clip();
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // The slats cut out of the sun.
    ctx.fillStyle = '#31164f';
    for (let i = 0; i < 5; i++) {
      const y = cy - r * 0.1 + i * r * 0.24;
      ctx.fillRect(cx - r, y, r * 2, r * (0.035 + i * 0.02));
    }
    ctx.restore();

    // The ground and its grid, rolling forward.
    const ground = ctx.createLinearGradient(0, horizon, 0, h);
    ground.addColorStop(0, '#2b1048');
    ground.addColorStop(1, '#0d0620');
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, w, h - horizon);

    ctx.strokeStyle = 'rgba(244, 114, 182, 0.4)';
    ctx.lineWidth = 1;
    // Verticals converge on the sun.
    for (let i = -9; i <= 9; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * w * 0.011, horizon);
      ctx.lineTo(cx + i * w * 0.22, h);
      ctx.stroke();
    }
    // Horizontals accelerate toward the viewer, looping with time.
    const phase = (t * speed) % 1;
    for (let i = 0; i < 9; i++) {
      const p = ((i + phase) / 9) ** 2.2;
      const y = horizon + p * (h - horizon);
      ctx.globalAlpha = 0.15 + p * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // A thin cyan horizon line, glowing.
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(w, horizon);
    ctx.stroke();
  }

  /**
   * MEADOW, rebuilt. The first version drove its hills and motes with raw
   * millisecond time, so the whole field vibrated at ten hertz. This one is
   * still: fixed ridge silhouettes, a warm afterglow, and the only things
   * that move are fireflies wandering on slow loops, seeds climbing over
   * half a minute, and stars breathing over ten seconds.
   */
  /**
   * TOON - a Saturday-morning page: warm cream, a drifting halftone screen in
   * the corners, and a few fat ink bubbles floating up like something is
   * about to be very funny. All ink, no gradients doing anything moody.
   */
  #toon(ctx, w, h, t) {
    const sec = t / 1000;

    ctx.fillStyle = '#fff8e7';
    ctx.fillRect(0, 0, w, h);

    // Two halftone screens, top-right and bottom-left, breathing very slowly.
    const dots = (cx, cy, reach, phase) => {
      const drift = Math.sin(sec * 0.12 + phase) * 6;
      ctx.fillStyle = 'rgba(28, 23, 16, 0.10)';
      for (let gx = -reach; gx <= reach; gx += 18) {
        for (let gy = -reach; gy <= reach; gy += 18) {
          const d = Math.hypot(gx, gy);
          if (d > reach) continue;
          const r = 3.4 * (1 - d / reach);
          if (r < 0.5) continue;
          ctx.beginPath();
          ctx.arc(cx + gx + drift, cy + gy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    dots(w + 20, -20, Math.min(w, h) * 0.55, 0);
    dots(-20, h + 20, Math.min(w, h) * 0.6, 2.1);

    // Ink bubbles on a lazy ride up; each pops back to the bottom unseen.
    for (let i = 0; i < 7; i++) {
      const speed = 0.014 + (i % 3) * 0.006;
      const x = ((i * 197.3) % w) + Math.sin(sec * 0.4 + i * 2.2) * 14;
      const y = h + 60 - (((sec * speed * h) + i * h * 0.31) % (h + 120));
      const r = 10 + (i % 4) * 7;
      ctx.strokeStyle = 'rgba(28, 23, 16, 0.14)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      // The comic highlight: one short arc inside, upper left.
      ctx.beginPath();
      ctx.arc(x, y, r * 0.55, Math.PI * 1.1, Math.PI * 1.5);
      ctx.stroke();
    }
  }

  /**
   * MATRIX - the rain. Columns of green glyphs fall at their own speeds with
   * a bright head and a fading tail, drawn dim enough to sit behind text.
   * Column state is derived from index and time, so there is nothing to
   * store and a resize simply grows more rain.
   */
  #matrix(ctx, w, h, t) {
    const sec = t / 1000;

    ctx.fillStyle = '#010b04';
    ctx.fillRect(0, 0, w, h);

    const colW = 18;
    const cell = 20;
    const cols = Math.ceil(w / colW);
    const glyphs = '01アイウエオカキクケコサシスセソタチツテト<>+*';
    ctx.font = '14px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';

    for (let i = 0; i < cols; i++) {
      const speed = 2.4 + ((i * 7) % 5) * 1.3;              // cells per second
      const length = 9 + ((i * 13) % 8);                    // tail cells
      const lane = ((i * 37) % 11) / 11;                    // phase offset
      const headCell = (sec * speed + lane * 80) % ((h / cell) + length + 6) - length;
      for (let seg = 0; seg < length; seg++) {
        const y = (headCell - seg) * cell;
        if (y < -cell || y > h + cell) continue;
        // The glyph at a spot mutates every few frames, keyed by time+place.
        const pick = Math.floor(Math.abs(Math.sin(i * 131 + seg * 17 + Math.floor(sec * 6))) * glyphs.length);
        const fade = 1 - seg / length;
        ctx.fillStyle = seg === 0
          ? 'rgba(190, 255, 210, 0.8)'
          : `rgba(0, 255, 65, ${(0.34 * fade * fade).toFixed(3)})`;
        ctx.fillText(glyphs[pick % glyphs.length], i * colW + colW / 2, y);
      }
    }
  }

  /**
   * CASINO - a felt table under one warm lamp. Card suits drift up like
   * cigar smoke; a few gold chips sit low. All of it very slow: the table
   * is what moves in a casino, never the room.
   */
  #casino(ctx, w, h, t) {
    const sec = t / 1000;

    const felt = ctx.createRadialGradient(w * 0.5, h * 0.36, 0, w * 0.5, h * 0.36, h * 0.85);
    felt.addColorStop(0, '#124a32');
    felt.addColorStop(0.55, '#0b2e20');
    felt.addColorStop(1, '#061a12');
    ctx.fillStyle = felt;
    ctx.fillRect(0, 0, w, h);

    // The suits, rising on their own lazy lanes.
    const suits = ['\u2660', '\u2665', '\u2666', '\u2663'];
    ctx.textAlign = 'center';
    for (let i = 0; i < 10; i++) {
      const suit = suits[i % 4];
      const red = i % 4 === 1 || i % 4 === 2;
      const speed = 0.011 + (i % 3) * 0.005;
      const x = ((i * 173.7) % w) + Math.sin(sec * 0.3 + i * 1.9) * 16;
      const y = h + 40 - (((sec * speed * h) + i * h * 0.29) % (h + 90));
      const size = 15 + (i % 4) * 8;
      ctx.font = `${size}px Georgia, serif`;
      ctx.fillStyle = red ? 'rgba(224, 36, 94, 0.12)' : 'rgba(242, 202, 79, 0.1)';
      ctx.fillText(suit, x, y);
    }

    // Three chips resting near the bottom edge, breathing their edge dashes.
    for (let i = 0; i < 3; i++) {
      const cx = w * (0.2 + i * 0.3) + Math.sin(sec * 0.2 + i * 2.4) * 6;
      const cy = h * 0.9 + Math.cos(sec * 0.16 + i) * 4;
      const r = 16 + i * 3;
      ctx.strokeStyle = 'rgba(242, 202, 79, 0.14)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([6, 7]);
      ctx.beginPath();
      ctx.arc(cx, cy, r - 5, sec * 0.1 + i, sec * 0.1 + i + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /**
   * HORROR - fog on a black field, a vignette that leans in, and every nine
   * seconds or so the light flickers, barely. Nothing chases anyone: dread
   * is a slow renderer.
   */
  #horror(ctx, w, h, t) {
    const sec = t / 1000;

    ctx.fillStyle = '#070408';
    ctx.fillRect(0, 0, w, h);

    // Two banks of fog sliding against each other.
    for (let bank = 0; bank < 2; bank++) {
      const drift = sec * (bank ? 6 : -4);
      for (let i = 0; i < 4; i++) {
        const x = (((i * 331.7) + drift * (10 + i * 3)) % (w + 400)) - 200;
        const y = h * (0.55 + bank * 0.22) + Math.sin(sec * 0.12 + i * 2.1 + bank) * 24;
        const r = 190 + i * 60;
        const fog = ctx.createRadialGradient(x, y, 0, x, y, r);
        fog.addColorStop(0, `rgba(122, 138, 153, ${bank ? 0.045 : 0.06})`);
        fog.addColorStop(1, 'rgba(122, 138, 153, 0)');
        ctx.fillStyle = fog;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }

    // The flicker: a slow heartbeat of light with a stumble in it.
    const beat = Math.sin(sec * 0.7) * 0.5 + 0.5;
    const stumble = Math.sin(sec * 9.3) > 0.985 ? 0.5 : 0;
    const lamp = ctx.createRadialGradient(w * 0.5, h * 0.3, 0, w * 0.5, h * 0.3, w * 0.7);
    lamp.addColorStop(0, `rgba(200, 16, 46, ${0.05 + beat * 0.03 + stumble * 0.05})`);
    lamp.addColorStop(1, 'rgba(200, 16, 46, 0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, w, h);

    // The vignette leans closer than any other theme's.
    const edge = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.3, w * 0.5, h * 0.5, h * 0.85);
    edge.addColorStop(0, 'rgba(0, 0, 0, 0)');
    edge.addColorStop(1, 'rgba(0, 0, 0, 0.78)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);
  }

  #meadow(ctx, w, h, t) {
    // Seconds, not milliseconds: every rate below reads as "per second".
    const sec = t / 1000;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#1c2913');
    sky.addColorStop(0.5, '#1a2511');
    sky.addColorStop(1, '#10180a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // A handful of stars, each on its own ten-second breath.
    for (let i = 0; i < 26; i++) {
      const sx = ((i * 379.7) % w);
      const sy = ((i * 173.3) % (h * 0.42));
      const tw = 0.45 + 0.35 * Math.sin(sec * 0.6 + i * 1.7);
      ctx.globalAlpha = tw * 0.55;
      ctx.fillStyle = '#f5fbe8';
      ctx.fillRect(sx, sy, 1.4, 1.4);
    }
    ctx.globalAlpha = 1;

    // The afterglow of a sun that just left.
    const glow = ctx.createRadialGradient(w * 0.28, h * 0.4, 0, w * 0.28, h * 0.4, w * 0.55);
    glow.addColorStop(0, 'rgba(251, 191, 36, 0.13)');
    glow.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // Three still ridges. Shape comes from position alone; the slow phase
    // term drifts a full cycle in about two minutes, which reads as weather,
    // not motion.
    const ridges = [
      { base: 0.6, amp: 22, tone: 'rgba(96, 142, 54, 0.16)', k: 1.15, drift: 0.05 },
      { base: 0.73, amp: 30, tone: 'rgba(45, 74, 22, 0.7)', k: 0.85, drift: 0.035 },
      { base: 0.85, amp: 36, tone: 'rgba(18, 30, 9, 0.95)', k: 0.6, drift: 0.02 }
    ];
    for (const ridge of ridges) {
      ctx.fillStyle = ridge.tone;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + 16; x += 16) {
        const y = h * ridge.base
          + Math.sin(x * 0.0045 * ridge.k + sec * ridge.drift) * ridge.amp
          + Math.sin(x * 0.011 * ridge.k + 2.4) * ridge.amp * 0.35;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }

    // Fireflies: a dozen, each wandering a slow loop of its own and pulsing
    // every few seconds. Seeds: pale motes climbing the air over ~35s.
    const count = this.theme.backdrop.motes ?? 34;
    for (let i = 0; i < count; i++) {
      const seed = i * 127.31;
      const firefly = i % 3 === 0;
      if (firefly) {
        const bx = ((seed * 7.13) % w);
        const by = h * (0.35 + ((seed * 3.7) % 45) / 100);
        const x = bx + Math.sin(sec * 0.16 + seed) * 34 + Math.sin(sec * 0.07 + seed * 2.1) * 18;
        const y = by + Math.cos(sec * 0.12 + seed) * 22;
        const pulse = Math.max(0, Math.sin(sec * 0.9 + seed));
        ctx.globalAlpha = 0.15 + pulse * 0.6;
        ctx.fillStyle = '#fde68a';
        ctx.beginPath();
        ctx.arc(((x % w) + w) % w, y, 1.9, 0, Math.PI * 2);
        ctx.fill();
        if (pulse > 0.75) {
          ctx.globalAlpha = (pulse - 0.75) * 1.2;
          ctx.beginPath();
          ctx.arc(((x % w) + w) % w, y, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const p = ((sec / 35) * (0.6 + (i % 5) * 0.16) + seed / 97) % 1;
        const x = ((seed * 5.77) % w) + Math.sin(sec * 0.1 + seed) * 26;
        const y = h - p * h * 0.85;
        ctx.globalAlpha = Math.sin(p * Math.PI) * 0.35;
        ctx.fillStyle = '#e8f7cf';
        ctx.beginPath();
        ctx.arc(((x % w) + w) % w, y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
export const backdrop = new Backdrop();
