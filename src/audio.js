/**
 * All sound in the app is synthesised at runtime with the Web Audio API.
 * There are no audio files anywhere in this project.
 *
 *   playRip()          - filtered noise burst + low thump, for tearing the pack
 *   playReveal(rank)   - a chime that gains layers as rarity rank climbs (0-9)
 *   playFlip()         - short card-flip whoosh
 *
 * The AudioContext is created lazily on the first user gesture, because
 * browsers refuse to start audio before one.
 */

/** Pentatonic degrees (semitones) -- always consonant however many we stack. */
const PENTATONIC = [0, 4, 7, 12, 16, 19, 24, 28];

const midiToFreq = (semitonesAboveA4) => 440 * Math.pow(2, semitonesAboveA4 / 12);

class Synth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.reverb = null;
    this.reverbGain = null;
    this.muted = false;
  }

  /** Build the graph on demand. Safe to call as often as you like. */
  ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;

    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    // A cheap plate-ish reverb: an impulse response made of decaying noise.
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.#impulseResponse(2.6, 3.2);
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 1;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    return this.ctx;
  }

  /** Call from a click handler -- Chrome starts contexts suspended. */
  resume() {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
    }
  }

  #impulseResponse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = this.ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  #noiseBuffer(seconds) {
    const rate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, Math.floor(rate * seconds), rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** One enveloped oscillator, optionally pitch-swept and reverb-sent. */
  #tone({ freq, type = 'sine', at = 0, dur = 0.6, gain = 0.2, sweepTo = null, send = 0 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(env);
    env.connect(this.master);
    if (send > 0) {
      const sendGain = ctx.createGain();
      sendGain.gain.value = send;
      env.connect(sendGain);
      sendGain.connect(this.reverb);
    }

    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** Enveloped noise through a filter -- the basis of rips and whooshes. */
  #noise({ at = 0, dur = 0.4, gain = 0.3, type = 'bandpass', from = 1200, to = 400, q = 1, send = 0 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;

    const src = ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(dur + 0.1);

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + dur);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.master);
    if (send > 0) {
      const sendGain = ctx.createGain();
      sendGain.gain.value = send;
      env.connect(sendGain);
      sendGain.connect(this.reverb);
    }

    src.start(t);
    src.stop(t + dur + 0.1);
  }

  /** Foil tearing: a bright, gritty noise sweep over a low cardboard thump. */
  playRip() {
    if (!this.ensure() || this.muted) return;
    this.resume();

    // Two overlapping tears so it sounds ragged rather than like one swoosh.
    this.#noise({ at: 0, dur: 0.38, gain: 0.34, from: 5200, to: 900, q: 0.8 });
    this.#noise({ at: 0.07, dur: 0.3, gain: 0.22, from: 3600, to: 600, q: 2.5 });
    // Crinkle: a handful of tiny high bursts.
    for (let i = 0; i < 7; i++) {
      this.#noise({
        at: 0.04 + Math.random() * 0.32,
        dur: 0.05,
        gain: 0.09,
        type: 'highpass',
        from: 4000 + Math.random() * 3000,
        to: 6000,
        q: 0.7
      });
    }
    // The pack hitting the table.
    this.#tone({ freq: 150, type: 'sine', at: 0.3, dur: 0.35, gain: 0.28, sweepTo: 55 });
  }

  playFlip() {
    if (!this.ensure() || this.muted) return;
    this.#noise({ at: 0, dur: 0.16, gain: 0.16, from: 2600, to: 700, q: 1.2 });
  }

  /**
   * Reveal chime. `rank` is the rarity's index in the rarity table (0-9);
   * higher ranks get more partials, a longer tail, sub-bass, a shimmer sweep
   * and a riser, so the sound scales with the pull.
   */
  playReveal(rank) {
    if (!this.ensure() || this.muted) return;
    this.resume();

    const tier = Math.max(0, Math.min(9, rank));
    const root = midiToFreq(-9 + tier); // climbs a semitone per tier
    const partials = 2 + Math.floor(tier / 2); // 2 -> 6 notes
    const spacing = 0.075 - tier * 0.004;
    const tail = 0.45 + tier * 0.22;
    const send = 0.06 + tier * 0.07;

    for (let i = 0; i < partials; i++) {
      this.#tone({
        freq: root * Math.pow(2, PENTATONIC[i] / 12),
        type: tier >= 6 ? 'triangle' : 'sine',
        at: i * spacing,
        dur: tail,
        gain: 0.2 / Math.sqrt(i + 1),
        send
      });
    }

    // Weight underneath the chord.
    if (tier >= 4) {
      this.#tone({ freq: root / 2, type: 'sine', at: 0, dur: 0.7 + tier * 0.1, gain: 0.2 });
    }

    // Metallic shimmer riding on top.
    if (tier >= 6) {
      for (let i = 0; i < 3; i++) {
        this.#tone({
          freq: root * 4 * Math.pow(2, i / 12),
          type: 'sawtooth',
          at: 0.1 + i * 0.05,
          dur: 1.1,
          gain: 0.03,
          send: send + 0.15
        });
      }
      this.#noise({ at: 0, dur: 0.9, gain: 0.05, type: 'highpass', from: 6000, to: 12000, send: 0.3 });
    }

    // A riser sweeping into the reveal, for the top three tiers.
    if (tier >= 7) {
      this.#tone({ freq: root / 2, type: 'sawtooth', at: 0, dur: 0.9, gain: 0.07, sweepTo: root * 4, send });
      this.#tone({ freq: root * 1.5, type: 'square', at: 0.18, dur: 1.4, gain: 0.045, send: send + 0.2 });
    }

    // Artifact / Secret Rare: a big bloom of detuned octaves.
    if (tier >= 8) {
      [1, 2, 3, 4].forEach((mult, i) => {
        this.#tone({
          freq: root * mult,
          type: 'triangle',
          at: 0.24 + i * 0.03,
          dur: 2.2,
          gain: 0.06,
          send: 0.6
        });
      });
      this.#noise({ at: 0.2, dur: 1.6, gain: 0.06, type: 'bandpass', from: 900, to: 9000, q: 0.6, send: 0.5 });
    }
  }
}

export const synth = new Synth();
