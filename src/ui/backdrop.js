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
    if (low) {
      this.stop();
      this.#frame(performance.now(), true);   // one static frame, then nothing
    } else if (!this.paused) {
      this.start();
    }
  }

  /** Paused while a pack is being opened, or the app is in the background. */
  setPaused(paused) {
    this.paused = paused;
    if (paused) this.stop();
    else if (!this.lowPower) this.start();
  }

  start() {
    if (this.running || this.lowPower || this.paused || !this.ctx) return;
    this.running = true;
    const loop = (now) => {
      if (!this.running) return;
      this.#frame(now);
      this.raf = requestAnimationFrame(loop);
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
    if (this.lowPower && !force) return;
    const { ctx } = this;
    const w = this.width;
    const h = this.height;
    // Static themes are told to draw their "settled" state at t = 0.
    const t = this.lowPower ? 0 : now;

    switch (this.theme.backdrop.renderer) {
      case 'paper': this.#paper(ctx, w, h, t); break;
      case 'arcade': this.#arcade(ctx, w, h, t); break;
      case 'noir': this.#noir(ctx, w, h, t); break;
      default: this.#aurora(ctx, w, h, t);
    }
  }

  /* --- renderers --------------------------------------------------------- */

  /**
   * AURORA — slow ribbons of light folding over a deep field. Each ribbon is
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
   * PAPER — a warm sheet with fibre flecks and two faint ruled lines that
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
   * ARCADE — a receding grid horizon under scanlines. The grid lines are
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
   * NOIR — a dark room with one light. A slow drifting light leak, a hard
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
}

export const backdrop = new Backdrop();
