/**
 * BACKGROUND MUSIC
 * ============================================================================
 * Found recordings on a shuffled loop, quiet enough to sit under the synth:
 * the lounge of a card shop after hours, not a soundtrack. Slow jazz only -
 * anything with a beat to it fights the game. Nothing here is generated; see
 * src/assets/music/LICENSE.md for the artists and licences, and for how to
 * add a track (drop the file in that folder, credit the artist).
 *
 * The player is one HTMLAudio element. It starts only after a user gesture
 * (poke() is called from the app's first-interaction hook, the same one that
 * wakes the synthesiser), parks itself when the app is backgrounded, and
 * obeys two settings: on/off and its own volume, separate from the sounds.
 */
const TRACK_URLS = Object.entries(
  import.meta.glob('../assets/music/*.{ogg,mp3}', { eager: true, query: '?url', import: 'default' })
).sort(([a], [b]) => a.localeCompare(b)).map(([, url]) => url);

class Music {
  constructor() {
    this.audio = null;
    this.on = false;
    this.volume = 0.4;
    this.order = [];
    this.at = 0;
    this.parked = false;
  }

  #ensure() {
    if (this.audio || !TRACK_URLS.length) return;
    this.audio = new Audio();
    this.audio.preload = 'none';
    this.audio.addEventListener('ended', () => this.#next());
    // A track that cannot decode must not end the music forever.
    this.audio.addEventListener('error', () => setTimeout(() => this.#next(), 4000));
    this.order = [...TRACK_URLS].sort(() => Math.random() - 0.5);
    this.at = -1;
  }

  #next() {
    if (!this.on || this.parked) return;
    this.at = (this.at + 1) % this.order.length;
    this.audio.src = this.order[this.at];
    this.audio.volume = this.volume;
    this.audio.play().catch(() => { /* until a gesture arrives */ });
  }

  /** A user gesture happened: allowed to start now. */
  poke() {
    if (!this.on || this.parked) return;
    this.#ensure();
    if (!this.audio) return;
    if (!this.audio.src) this.#next();
    else if (this.audio.paused) this.audio.play().catch(() => {});
  }

  setOn(on) {
    this.on = Boolean(on);
    if (!this.on) this.audio?.pause();
    else this.poke();
  }

  setVolume(volume) {
    this.volume = Math.min(1, Math.max(0, Number(volume) || 0));
    if (this.audio) this.audio.volume = this.volume;
  }

  /** The app left the foreground; music must not outlive the screen. */
  park() {
    this.parked = true;
    this.audio?.pause();
  }

  unpark() {
    this.parked = false;
    if (this.on && this.audio?.paused) this.audio.play().catch(() => {});
  }
}

export const music = new Music();
