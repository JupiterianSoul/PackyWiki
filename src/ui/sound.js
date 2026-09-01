/**
 * THE SYNTHESISER
 * ============================================================================
 * Every sound in the app is built here at runtime. The repo ships no audio
 * files, and no two themes sound alike: a theme picks the voice (FM bell,
 * marimba, chiptune, plucked string), the tuning, the amount of room and the
 * amount of grit, so switching theme changes what the app SOUNDS like as much
 * as what it looks like.
 *
 * The chain, once, for everything:
 *
 *   voice -> [ drive ] -> bus -> filter -> compressor -> master -> out
 *                          \-> reverb send -> convolver -> master
 *
 * The compressor is what stops a Legendary chord landing on top of a coin
 * spill and clipping; the soft-clip waveshaper is what gives Arcade its bite
 * without letting anything actually distort into mud.
 */
import { themeById, DEFAULT_THEME } from './themes.js';

/* Two themes speak in recordings instead of synthesis: short CC0 one-shots
 * (from the uisfx project, dedicated to the public domain - see
 * src/assets/sfx/LICENSE.md) bundled as data URIs so they play with the app,
 * offline included. Everything else in this file still applies to them: the
 * samples run through the same bus, room, tilt and trim as the synth. */
const KIT_URIS = import.meta.glob('../assets/sfx/*/*.ogg', { eager: true, query: '?inline', import: 'default' });

const kitBytes = async (uri) => {
  const text = String(uri);
  if (!text.startsWith('data:')) {
    // A file that outgrew the inline limit: fall back to fetching it.
    return (await fetch(text)).arrayBuffer();
  }
  const raw = atob(text.slice(text.indexOf(',') + 1));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Equal temperament from a root, in semitones. */
const step = (root, semitones) => root * Math.pow(2, semitones / 12);

class Synth {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.theme = themeById(DEFAULT_THEME);
    this.nodes = null;
    this.kitName = null;                 // sample kit of the current theme
    this.kitBuffers = new Map();         // event -> decoded AudioBuffer
  }

  /* --- graph ------------------------------------------------------------- */

  ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;

    this.ctx = new Ctx();
    const ctx = this.ctx;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.62 * (this.theme?.sound?.gain ?? 1);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 22;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 5200;
    filter.Q.value = 0.5;

    // A gentle high-shelf dip: the single biggest de-harsher. Every voice in
    // every theme passes through it, so nothing can ever be shrill.
    const tilt = ctx.createBiquadFilter();
    tilt.type = 'highshelf';
    tilt.frequency.value = 4800;
    tilt.gain.value = -4.5;

    const bus = ctx.createGain();
    bus.gain.value = 1;

    const send = ctx.createGain();
    send.gain.value = 0.3;

    const reverb = ctx.createConvolver();

    bus.connect(filter);
    filter.connect(tilt);
    tilt.connect(comp);
    comp.connect(master);
    bus.connect(send);
    send.connect(reverb);
    reverb.connect(master);
    master.connect(ctx.destination);

    this.nodes = { master, comp, filter, bus, send, reverb };
    this.#applyThemeToGraph();
    return ctx;
  }

  resume() {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  /** Park the audio hardware while the app is backgrounded. Never creates one. */
  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.nodes) {
      this.nodes.master.gain.setTargetAtTime(muted ? 0 : 0.62 * (this.theme?.sound?.gain ?? 1), this.ctx.currentTime, 0.02);
    }
  }

  /** Retune the whole instrument. Called when the player changes theme. */
  setTheme(id) {
    this.theme = themeById(id);
    if (this.nodes) this.#applyThemeToGraph();
  }

  #applyThemeToGraph() {
    const { filter, send, reverb, master } = this.nodes;
    const s = this.theme.sound;
    const t = this.ctx.currentTime;
    // Some voices simply run hot: a chip square wave at the same master gain
    // as a felt piano is twice as loud to the ear. Themes carry their own
    // trim, applied here and in setMuted.
    if (!this.muted) master.gain.setTargetAtTime(0.62 * (s.gain ?? 1), t, 0.05);
    filter.frequency.setTargetAtTime(s.filter, t, 0.05);
    send.gain.setTargetAtTime(s.reverb.mix, t, 0.05);
    reverb.buffer = this.#impulse(s.reverb.seconds, s.reverb.decay);
    this.#loadKit(s.kit ?? null);
  }

  /* --- sample kits -------------------------------------------------------- */

  /** Decode the theme's kit, if it has one. Decoding is async; until an
   *  event's buffer lands, the synth keeps covering that event. */
  #loadKit(name) {
    if (name === this.kitName) return;
    this.kitName = name;
    this.kitBuffers = new Map();
    if (!name) return;
    const prefix = `../assets/sfx/${name}/`;
    for (const [path, uri] of Object.entries(KIT_URIS)) {
      if (!path.startsWith(prefix)) continue;
      const event = path.slice(prefix.length).replace(/\.ogg$/, '');
      kitBytes(uri)
        .then((bytes) => this.ctx.decodeAudioData(bytes))
        .then((buffer) => { if (this.kitName === name) this.kitBuffers.set(event, buffer); })
        .catch(() => { /* an undecodable file just stays on the synth */ });
    }
  }

  /** Play one kit sample through the theme's graph. True when it played;
   *  false hands the moment back to the synth. `vary` adds a whisper of
   *  random pitch so the most frequent sounds never repeat exactly. */
  #kit(event, { rate = 1, gain = 1, vary = 0, at = 0 } = {}) {
    if (!this.kitName) return false;
    const buffer = this.kitBuffers.get(event);
    if (!buffer) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * vary);
    const out = this.ctx.createGain();
    out.gain.value = 0.34 * gain;
    src.connect(out);
    out.connect(this.nodes.bus);
    src.start(this.ctx.currentTime + at);
    return true;
  }

  /** A generated room. Cheaper and smaller than shipping an impulse file. */
  #impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * seconds));
    const buffer = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  #noiseBuffer(seconds) {
    const rate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, Math.max(1, Math.floor(rate * seconds)), rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** Soft clip. `amount` 0 is transparent, 1 is Arcade. */
  #shaper(amount) {
    const curve = new Float32Array(1024);
    const k = amount * 60;
    for (let i = 0; i < 1024; i++) {
      const x = (i / 511.5) - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = curve;
    shaper.oversample = '2x';
    return shaper;
  }

  /* --- voices ------------------------------------------------------------ */

  /**
   * One note, in whatever voice the current theme speaks. Everything musical
   * in the app goes through here, which is why a chord sounds like a bell in
   * Aurora and a plucked string in Noir without any caller knowing.
   */
  #note({ freq, at = 0, dur = 0.5, gain = 0.2, voice = null, bend = 0 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const kind = voice ?? this.theme.sound.voice;
    const out = ctx.createGain();
    out.gain.value = 1;

    const drive = this.theme.sound.drive;
    if (drive > 0.02) {
      const shaper = this.#shaper(drive);
      out.connect(shaper);
      shaper.connect(this.nodes.bus);
    } else {
      out.connect(this.nodes.bus);
    }

    if (kind === 'pluck') return this.#pluck({ freq, t, dur, gain, out });
    if (kind === 'chip') return this.#chip({ freq, t, dur, gain, out, bend });
    if (kind === 'marimba') return this.#marimba({ freq, t, dur, gain, out });
    if (kind === 'synthwave') return this.#synthwave({ freq, t, dur, gain, out, bend });
    if (kind === 'keys') return this.#keys({ freq, t, dur, gain, out });
    return this.#fm({ freq, t, dur, gain, out });
  }

  /** FM bell: a modulator an octave-and-a-fifth up, decaying faster than the carrier. */
  #fm({ freq, t, dur, gain, out }) {
    const ctx = this.ctx;
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;

    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq * 3.01;   // slightly detuned for shimmer

    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(freq * 2.2, t);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.02, t + dur * 0.6);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(env);
    env.connect(out);

    mod.start(t); carrier.start(t);
    mod.stop(t + dur + 0.05); carrier.stop(t + dur + 0.05);
  }

  /** Marimba: sine body with a hard wooden transient and a fast decay. */
  #marimba({ freq, t, dur, gain, out }) {
    const ctx = this.ctx;
    const short = Math.min(dur, 0.42);

    [1, 4.02, 9.1].forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * ratio;
      const env = ctx.createGain();
      const level = gain / (i * 2.4 + 1);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(level, t + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, t + short / (i + 1));
      osc.connect(env); env.connect(out);
      osc.start(t); osc.stop(t + short + 0.05);
    });

    // The mallet hitting the bar.
    const knock = ctx.createBufferSource();
    knock.buffer = this.#noiseBuffer(0.03);
    const kf = ctx.createBiquadFilter();
    kf.type = 'bandpass'; kf.frequency.value = freq * 5; kf.Q.value = 1.6;
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(gain * 0.5, t);
    kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    knock.connect(kf); kf.connect(kg); kg.connect(out);
    knock.start(t); knock.stop(t + 0.05);
  }

  /** Chiptune: square plus detuned saw, with an optional pitch bend. */
  #chip({ freq, t, dur, gain, out, bend }) {
    const ctx = this.ctx;
    const short = Math.min(dur, 0.5);

    [['square', 1, 1], ['sawtooth', 1.005, 0.4]].forEach(([type, detune, level]) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq * detune, t);
      if (bend) osc.frequency.exponentialRampToValueAtTime(freq * detune * (1 + bend), t + short);
      const env = ctx.createGain();
      // Hard gate rather than a curve: chip voices do not fade, they stop.
      env.gain.setValueAtTime(gain * level, t);
      env.gain.setValueAtTime(gain * level * 0.6, t + short * 0.5);
      env.gain.exponentialRampToValueAtTime(0.0001, t + short);
      osc.connect(env); env.connect(out);
      osc.start(t); osc.stop(t + short + 0.02);
    });
  }

  /**
   * Karplus-Strong: a burst of noise fed through a tuned delay that low-passes
   * a little on each pass. It is a plucked string, from first principles.
   */
  #pluck({ freq, t, dur, gain, out }) {
    const ctx = this.ctx;
    const burst = ctx.createBufferSource();
    burst.buffer = this.#noiseBuffer(0.02);

    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = 1 / freq;

    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = clamp(freq * 8, 800, 7000);

    const feedback = ctx.createGain();
    feedback.gain.value = 0.965;

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    burst.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);
    damp.connect(env);
    env.connect(out);

    burst.start(t);
    burst.stop(t + 0.03);
    // The loop keeps ringing on its own; cut the feedback so it cannot run on.
    feedback.gain.setValueAtTime(0.965, t);
    feedback.gain.setTargetAtTime(0, t + dur * 0.8, 0.05);
  }

  /**
   * Synthwave: two saws detuned against each other, a sine sub an octave
   * down, and a slow filter sweep - the fat analogue stack under every
   * 1984 sunset. The vibrato arrives late, like a hand reaching for the
   * mod wheel.
   */
  #synthwave({ freq, t, dur, gain, out, bend = 0 }) {
    const ctx = this.ctx;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.1;
    lp.frequency.setValueAtTime(freq * 3, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, freq * 9), t + Math.min(0.14, dur * 0.4));
    lp.frequency.exponentialRampToValueAtTime(Math.max(260, freq * 2.2), t + dur);
    lp.connect(out);

    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5.4;
    const vibDepth = ctx.createGain();
    vibDepth.gain.setValueAtTime(0, t);
    vibDepth.gain.linearRampToValueAtTime(freq * 0.006, t + Math.min(0.35, dur * 0.7));
    vibrato.connect(vibDepth);

    [[-7, 0.5, 'sawtooth', -12], [4, 0.5, 'sawtooth', 0], [-4, 0.45, 'sawtooth', 0], [0, 0.55, 'sine', -12]]
      .forEach(([cents, level, type, semis]) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        const f = freq * Math.pow(2, semis / 12);
        osc.frequency.setValueAtTime(f, t);
        if (bend) osc.frequency.exponentialRampToValueAtTime(f * (1 + bend), t + dur);
        osc.detune.value = cents;
        vibDepth.connect(osc.frequency);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(gain * level, t + 0.014);
        env.gain.setTargetAtTime(gain * level * 0.55, t + 0.1, 0.12);
        env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(env); env.connect(lp);
        osc.start(t); osc.stop(t + dur + 0.05);
      });
    vibrato.start(t); vibrato.stop(t + dur + 0.05);
  }

  /**
   * Keys: a felt piano - triangle body, a sine an octave up fading faster,
   * a soft thump underneath, everything through its own gentle lowpass.
   * Warm, round, incapable of harshness. Noir speaks in this now.
   */
  #keys({ freq, t, dur, gain, out }) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(3400, freq * 7);
    lp.Q.value = 0.4;
    lp.connect(out);

    [[1, 'triangle', 1, 1], [2.001, 'sine', 0.35, 0.5], [0.5, 'sine', 0.28, 1.2]]
      .forEach(([ratio, type, level, durScale]) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq * ratio;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(gain * level, t + 0.012);
        env.gain.exponentialRampToValueAtTime(0.0001, t + dur * durScale);
        osc.connect(env); env.connect(lp);
        osc.start(t); osc.stop(t + dur * durScale + 0.05);
      });

    // The felt: a tiny dark thump as the hammer lands.
    const thump = ctx.createBufferSource();
    thump.buffer = this.#noiseBuffer(0.02);
    const tf = ctx.createBiquadFilter();
    tf.type = 'lowpass'; tf.frequency.value = 420;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(gain * 0.5, t);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    thump.connect(tf); tf.connect(tg); tg.connect(out);
    thump.start(t); thump.stop(t + 0.06);
  }

  /** Filtered noise. Rips, whooshes, transients, texture. */
  #noise({ at = 0, dur = 0.3, gain = 0.2, type = 'bandpass', from = 1400, to = 400, q = 1 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(dur + 0.1);

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(40, from), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter); filter.connect(env); env.connect(this.nodes.bus);
    src.start(t); src.stop(t + dur + 0.1);
  }

  /** The theme's own click: air, wood, bit-crush or brush. */
  #transient(gain = 0.08) {
    const kind = this.theme.sound.transient;
    if (kind === 'knock') this.#noise({ dur: 0.035, gain, type: 'bandpass', from: 2200, to: 900, q: 2.4 });
    else if (kind === 'bit') this.#noise({ dur: 0.03, gain: gain * 1.1, type: 'highpass', from: 3000, to: 6000, q: 0.6 });
    else if (kind === 'brush') this.#noise({ dur: 0.09, gain: gain * 0.7, type: 'bandpass', from: 1200, to: 300, q: 0.8 });
    else this.#noise({ dur: 0.05, gain: gain * 0.8, type: 'highpass', from: 3600, to: 7200, q: 0.7 });
  }

  /** A note of the theme's scale, `degree` steps up from its root. */
  #degree(degree, octave = 0) {
    const { root, scale } = this.theme.sound;
    const size = scale.length;
    const index = ((degree % size) + size) % size;
    const octaves = Math.floor(degree / size) + octave;
    return step(root, scale[index] + octaves * 12);
  }

  #ready() {
    if (!this.ensure() || this.muted) return false;
    return true;
  }

  /* --- the app's vocabulary ---------------------------------------------- */

  /** Any press. The smallest sound in the app, and the most frequent -
   *  so it is never exactly the same twice: the degree wanders between
   *  three chord tones and the gain breathes a little. */
  playTap() {
    if (!this.#ready()) return;
    if (this.#kit('press', { gain: 0.55, vary: 0.08 })) return;
    this.#transient(0.06 + Math.random() * 0.02);
    const deg = [1, 2, 4][Math.floor(Math.random() * 3)];
    this.#note({ freq: this.#degree(deg, 1), dur: 0.08, gain: 0.042 + Math.random() * 0.016 });
  }

  /** The side drawer sliding in or away: felt, not glass. */
  playDrawer(open = true) {
    if (!this.#ready()) return;
    if (this.#kit(open ? 'expand' : 'collapse', { gain: 0.7 })) return;
    this.#noise({
      dur: 0.22, gain: 0.05, type: 'lowpass',
      from: open ? 300 : 900, to: open ? 900 : 300, q: 0.7
    });
    this.#note({ freq: this.#degree(open ? 0 : 4, 0), dur: 0.16, gain: 0.035 });
  }

  /** A favourite star turning on (a bright doublet) or off (a soft step down). */
  playFav(on = true) {
    if (!this.#ready()) return;
    if (this.#kit(on ? 'check' : 'uncheck', { gain: 0.75 })) return;
    if (on) {
      this.#note({ freq: this.#degree(5, 1), dur: 0.1, gain: 0.06 });
      this.#note({ freq: this.#degree(7, 1), at: 0.06, dur: 0.16, gain: 0.055 });
      this.#noise({ at: 0.02, dur: 0.1, gain: 0.02, type: 'highpass', from: 6000, to: 9000 });
    } else {
      this.#note({ freq: this.#degree(2, 0), dur: 0.12, gain: 0.05 });
    }
  }

  /** An album page turning: paper, then the soft landing of the spread. */
  playPageTurn() {
    if (!this.#ready()) return;
    if (this.#kit('swipe', { rate: 0.92, gain: 0.7 })) return;
    this.#noise({ dur: 0.16, gain: 0.1, type: 'bandpass', from: 1600, to: 3400, q: 0.7 });
    this.#noise({ at: 0.1, dur: 0.1, gain: 0.08, type: 'bandpass', from: 2800, to: 600, q: 1 });
    this.#note({ freq: this.#degree(2, 0), at: 0.16, dur: 0.12, gain: 0.035 });
  }

  /** An achievement redeemed: a proud little rise with sparkle on top. */
  playAchievement() {
    if (!this.#ready()) return;
    this.resume();
    if (this.#kit('achievement')) return;
    [0, 4, 7, 9].forEach((deg, i) => {
      this.#note({ freq: this.#degree(deg, 1), at: i * 0.09, dur: 0.55, gain: 0.11 });
    });
    this.#note({ freq: this.#degree(0, 0), dur: 0.9, gain: 0.09 });
    this.#noise({ at: 0.25, dur: 0.5, gain: 0.03, type: 'highpass', from: 5000, to: 9000 });
  }

  /** A message arriving in a chat. Small, bright, unmistakable. */
  playMessage() {
    if (!this.#ready()) return;
    if (this.#kit('notification', { gain: 0.8 })) return;
    this.#note({ freq: this.#degree(4, 1), dur: 0.12, gain: 0.07 });
    this.#note({ freq: this.#degree(6, 1), at: 0.07, dur: 0.18, gain: 0.06 });
  }

  /** A trade or gift going through: two hands meeting. */
  playTrade() {
    if (!this.#ready()) return;
    this.resume();
    if (this.#kit('checkout')) return;
    this.#note({ freq: this.#degree(0, 1), dur: 0.2, gain: 0.09 });
    this.#note({ freq: this.#degree(3, 1), at: 0.09, dur: 0.24, gain: 0.09 });
    this.#note({ freq: this.#degree(5, 1), at: 0.18, dur: 0.4, gain: 0.1 });
    this.#transient(0.06);
  }

  /** Moving between destinations. Direction is audible. */
  playNav(forward = true) {
    if (!this.#ready()) return;
    if (this.#kit('select', { rate: forward ? 1 : 0.94, gain: 0.6, vary: 0.04 })) return;
    this.#transient(0.05);
    this.#note({ freq: this.#degree(forward ? 1 : 3, 1), dur: 0.12, gain: 0.06, bend: forward ? 0.04 : -0.03 });
    this.#note({ freq: this.#degree(forward ? 3 : 1, 1), at: 0.045, dur: 0.16, gain: 0.05 });
  }

  /** A switch. On and off are different sounds, not the same one twice. */
  playToggle(on) {
    if (!this.#ready()) return;
    if (this.#kit(on ? 'toggle-on' : 'toggle-off', { gain: 0.7 })) return;
    this.#transient(0.06);
    this.#note({ freq: this.#degree(on ? 4 : 0, on ? 1 : 0), dur: 0.12, gain: 0.07 });
  }

  /** A sheet or dialog arriving or leaving. */
  playSheet(open = true) {
    if (!this.#ready()) return;
    if (this.#kit(open ? 'open' : 'close', { gain: 0.7 })) return;
    this.#noise({
      dur: 0.3, gain: 0.06, type: 'bandpass',
      from: open ? 400 : 2200, to: open ? 2200 : 400, q: 0.8
    });
    this.#note({ freq: this.#degree(open ? 0 : 2, 1), dur: 0.24, gain: 0.05 });
  }

  /** The shelf settling onto a booster. */
  playSnap() {
    if (!this.#ready()) return;
    if (this.#kit('snap', { gain: 0.5, vary: 0.05 })) return;
    this.#transient(0.05);
    this.#note({ freq: this.#degree(4, 1), dur: 0.06, gain: 0.04 });
  }

  /** One notch of tearing. Driven by the drag, so it has to be granular. */
  playRipTick(progress = 0) {
    if (!this.#ready()) return;
    const p = clamp(progress, 0, 1);
    this.#noise({
      dur: 0.05 + p * 0.02, gain: 0.055 + p * 0.07, type: 'bandpass',
      from: 900 + p * 2600, to: 500 + p * 900, q: 1.1 + p * 2
    });
  }

  /**
   * A snag in the foil letting go - the weld the tear was caught on popping
   * loose. Louder and snappier than a tick, so the catch-and-release of the
   * drag reads through the speaker as well as the finger.
   */
  playSnagPop(progress = 0) {
    if (!this.#ready()) return;
    const p = clamp(progress, 0, 1);
    this.#transient(0.09);
    this.#noise({
      dur: 0.09, gain: 0.15, type: 'bandpass',
      from: 2600 + p * 1800, to: 700, q: 2.2
    });
    this.#noise({ at: 0.015, dur: 0.06, gain: 0.08, type: 'highpass', from: 4500, to: 7000 });
  }

  /** The foil giving way. */
  playRip() {
    if (!this.#ready()) return;
    this.resume();
    this.#noise({ dur: 0.42, gain: 0.24, type: 'bandpass', from: 3200, to: 260, q: 0.8 });
    this.#noise({ at: 0.03, dur: 0.3, gain: 0.16, type: 'highpass', from: 2000, to: 6000 });
    this.#note({ freq: this.#degree(0, -1), dur: 0.5, gain: 0.12 });
  }

  /** A card turning over. */
  playFlip() {
    if (!this.#ready()) return;
    if (this.#kit('swipe', { gain: 0.65, vary: 0.06 })) return;
    this.#noise({ dur: 0.15, gain: 0.12, type: 'bandpass', from: 2400, to: 700, q: 1.3 });
  }

  /** A card opening to full size. */
  playCardOpen() {
    if (!this.#ready()) return;
    if (this.#kit('open', { rate: 1.12, gain: 0.75 })) return;
    this.#noise({ dur: 0.13, gain: 0.09, type: 'bandpass', from: 1700, to: 900, q: 1.4 });
    this.#note({ freq: this.#degree(3, 1), at: 0.02, dur: 0.26, gain: 0.06 });
  }

  /** Money arriving. */
  playCoins() {
    if (!this.#ready()) return;
    if (this.#kit('bonus')) return;
    this.resume();
    [4, 5, 7].forEach((deg, i) => {
      this.#note({ freq: this.#degree(deg, 1), at: i * 0.05, dur: 0.3, gain: 0.1 });
    });
    for (let i = 0; i < 4; i++) {
      this.#noise({
        at: 0.02 + Math.random() * 0.18, dur: 0.045, gain: 0.045,
        type: 'bandpass', from: 4200 + Math.random() * 3000, to: 6500, q: 4
      });
    }
  }

  /** Money leaving, and something arriving in its place. */
  playPurchase() {
    if (!this.#ready()) return;
    if (this.#kit('purchase')) return;
    this.resume();
    this.#note({ freq: this.#degree(0), dur: 0.3, gain: 0.13 });
    this.#note({ freq: this.#degree(2), at: 0.08, dur: 0.32, gain: 0.12 });
    this.#note({ freq: this.#degree(4, 1), at: 0.16, dur: 0.46, gain: 0.11 });
    this.#transient(0.07);
  }

  /** Refused. */
  playDenied() {
    if (!this.#ready()) return;
    if (this.#kit('blocked', { gain: 0.8 })) return;
    this.#note({ freq: this.#degree(0, -1), dur: 0.14, gain: 0.1, bend: -0.12 });
    this.#note({ freq: this.#degree(0, -1) * 0.94, at: 0.1, dur: 0.22, gain: 0.09 });
  }

  /** Arming something destructive. Unsettled on purpose. */
  playArm() {
    if (!this.#ready()) return;
    if (this.#kit('warning', { gain: 0.75 })) return;
    this.#note({ freq: this.#degree(1), dur: 0.1, gain: 0.08, bend: 0.06 });
    this.#note({ freq: this.#degree(2, 1), at: 0.06, dur: 0.14, gain: 0.05 });
  }

  /** A gift being taken. */
  playGift() {
    if (!this.#ready()) return;
    if (this.#kit('reward')) return;
    this.resume();
    [2, 4, 6].forEach((deg, i) => {
      this.#note({ freq: this.#degree(deg, 1), at: i * 0.07, dur: 0.44, gain: 0.11 });
    });
    this.#noise({ at: 0.08, dur: 0.4, gain: 0.04, type: 'highpass', from: 5000, to: 10000 });
  }

  /** Crossing a level. */
  playLevelUp() {
    if (!this.#ready()) return;
    if (this.#kit('level-up')) return;
    this.resume();
    [0, 2, 4, 6, 8].forEach((deg, i) => {
      this.#note({ freq: this.#degree(deg, 1), at: i * 0.085, dur: 0.8, gain: 0.12 });
    });
    this.#note({ freq: this.#degree(0, -1), dur: 1.2, gain: 0.12 });
    this.#noise({ at: 0.3, dur: 0.9, gain: 0.045, type: 'highpass', from: 4000, to: 12000 });
  }

  /** XP landing. Tiny: it fires on every pack. */
  playXp() {
    if (!this.#ready()) return;
    if (this.#kit('progress-step', { gain: 0.45, vary: 0.05 })) return;
    this.#note({ freq: this.#degree(5, 1), dur: 0.13, gain: 0.05, bend: 0.08 });
  }

  /** A timed booster becoming available. */
  playReady() {
    if (!this.#ready()) return;
    if (this.#kit('wake', { gain: 0.8 })) return;
    this.#note({ freq: this.#degree(4, 1), dur: 0.2, gain: 0.07 });
    this.#note({ freq: this.#degree(6, 1), at: 0.09, dur: 0.3, gain: 0.06 });
  }

  /** A custom wiki resolved. */
  playResolved() {
    if (!this.#ready()) return;
    if (this.#kit('success', { gain: 0.85 })) return;
    this.#note({ freq: this.#degree(0, 1), dur: 0.26, gain: 0.09 });
    this.#note({ freq: this.#degree(4, 1), at: 0.09, dur: 0.36, gain: 0.09 });
  }

  /** The starter kit and the restock bonus. */
  playFanfare() {
    if (!this.#ready()) return;
    if (this.#kit('streak')) return;
    this.resume();
    [0, 2, 4, 7].forEach((deg, i) => {
      this.#note({ freq: this.#degree(deg, 1), at: i * 0.1, dur: 0.75, gain: 0.12 });
    });
    this.#note({ freq: this.#degree(0, -1), dur: 1.1, gain: 0.11 });
  }

  /** Switching theme: a short signature in the theme you just switched TO. */
  playTheme() {
    if (!this.#ready()) return;
    if (this.#kit('toggle-on', { rate: 0.9, gain: 0.7 })) return;
    this.resume();
    [0, 2, 4].forEach((deg, i) => {
      this.#note({ freq: this.#degree(deg, 1), at: i * 0.075, dur: 0.6, gain: 0.11 });
    });
    this.#transient(0.06);
  }

  /**
   * The reveal. `rank` is the tier's index: higher tiers get more voices, a
   * longer tail, sub-bass and a shimmer, so the sound scales with the pull.
   */
  playReveal(rank = 0) {
    if (!this.#ready()) return;
    if (this.#kit('drop', { rate: 1 + rank * 0.05, gain: 0.6 + rank * 0.07 })) return;
    this.resume();
    const tier = clamp(rank, 0, 7);
    const voices = 2 + Math.floor(tier * 0.7);
    const spacing = 0.08 - tier * 0.005;
    const tail = 0.5 + tier * 0.24;

    for (let i = 0; i < voices; i++) {
      this.#note({
        freq: this.#degree(tier + i, 1),
        at: i * spacing,
        dur: tail,
        gain: 0.2 / Math.sqrt(i + 1)
      });
    }
    if (tier >= 4) this.#note({ freq: this.#degree(tier, -1), dur: tail * 1.2, gain: 0.16 });
    if (tier >= 6) {
      for (let i = 0; i < 4; i++) {
        this.#noise({
          at: 0.15 + i * 0.12, dur: 0.5, gain: 0.035,
          type: 'bandpass', from: 6000 + i * 1200, to: 9000, q: 5
        });
      }
    }
  }
}

export const synth = new Synth();
