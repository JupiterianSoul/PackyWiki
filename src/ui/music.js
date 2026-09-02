/**
 * BACKGROUND MUSIC
 * ============================================================================
 * Found recordings on a shuffled loop, quiet enough to sit under the synth:
 * the lounge of a card shop after hours, not a soundtrack. Slow jazz only -
 * anything with a beat to it fights the game. Nothing here is generated; see
 * src/assets/music/LICENSE.md for the artists and licences, and for how to
 * add a track (drop the file in that folder, credit the artist).
 *
 * The player is one HTMLAudio element, primed the moment the app boots so the
 * first track is buffered before anything asks for it. It tries to play
 * straight away, which the APK allows outright; a browser that refuses until a
 * gesture arrives is caught by poke(), called from the first-interaction hook
 * that also wakes the synthesiser. It parks itself when the app is
 * backgrounded, and obeys two settings: on/off and its own volume, separate
 * from the sounds.
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
    // 'auto', not 'none'. With no preloading the file only STARTED downloading
    // at the first tap, so the music arrived five or ten seconds into the
    // session every time. Fetching it while the splash is still up means the
    // first track is ready before anything asks it to play.
    this.audio.preload = 'auto';
    this.audio.addEventListener('ended', () => this.#next());
    // A track that cannot decode must not end the music forever.
    this.audio.addEventListener('error', () => setTimeout(() => this.#next(), 4000));
    this.order = [...TRACK_URLS].sort(() => Math.random() - 0.5);
    this.at = -1;
  }

  /**
   * Load the first track without playing it. Called at boot whatever the
   * settings say, because the cost of having it ready is one buffered file and
   * the cost of not having it is the silence the player hears instead.
   */
  prime() {
    this.#ensure();
    if (!this.audio || this.audio.src) return;
    this.at = 0;
    this.audio.src = this.order[0];
    this.audio.volume = this.volume;
    this.audio.load();
  }

  #next() {
    if (!this.on || this.parked) return;
    this.at = (this.at + 1) % this.order.length;
    this.audio.src = this.order[this.at];
    this.audio.volume = this.volume;
    this.audio.play().catch(() => { /* until a gesture arrives */ });
  }

  /** Start now if allowed. Called at boot and again on the first gesture. */
  poke() {
    if (!this.on || this.parked) return;
    this.#ensure();
    if (!this.audio) return;
    if (!this.audio.src) this.prime();
    this.audio.volume = this.volume;
    this.audio.play().catch(() => { /* a browser waiting for a gesture */ });
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
