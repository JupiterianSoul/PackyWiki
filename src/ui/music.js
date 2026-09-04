/**
 * BACKGROUND MUSIC
 * ============================================================================
 * Found recordings on a shuffled loop, quiet enough to sit under the synth:
 * the lounge of a card shop after hours, not a soundtrack. Slow jazz only -
 * anything with a beat to it fights the game. Nothing here is generated; see
 * src/assets/music/LICENSE.md for the artists and licences, and for how to
 * add a track (drop the file in that folder, credit the artist).
 *
 * The player is two HTMLAudio elements, one carrying the music and one
 * waiting to bring the next track in underneath it, so one track fades into
 * the next rather than stopping. The first is primed the moment the app boots
 * so the first track is buffered before anything asks for it. It tries to play
 * straight away, which the APK allows outright; a browser that refuses until a
 * gesture arrives is caught by poke(), called from the first-interaction hook
 * that also wakes the synthesiser. It parks itself when the app is
 * backgrounded, and obeys two settings: on/off and its own volume, separate
 * from the sounds.
 */
const TRACK_URLS = Object.entries(
  import.meta.glob('../assets/music/*.{ogg,mp3}', { eager: true, query: '?url', import: 'default' })
).sort(([a], [b]) => a.localeCompare(b)).map(([, url]) => url);

/** How long one track takes to hand over to the next, in milliseconds. */
const FADE_MS = 3200;
/** How far before a track's end the next one starts underneath it. */
const OVERLAP_S = 3.5;

class Music {
  constructor() {
    // Two players, so a track can come in under the one that is finishing.
    // `audio` is whichever is carrying the music now; `other` is idle or
    // fading out.
    this.audio = null;
    this.other = null;
    this.on = false;
    this.volume = 0.4;
    this.order = [];
    this.at = 0;
    this.parked = false;
    this.fading = null;
    this.misses = 0;
  }

  #player() {
    const audio = new Audio();
    // 'auto', not 'none'. With no preloading the file only STARTED downloading
    // at the first tap, so the music arrived five or ten seconds into the
    // session every time. Fetching it while the splash is still up means the
    // first track is ready before anything asks it to play.
    audio.preload = 'auto';
    // The handover starts a few seconds before the end, so the room is never
    // silent between two tracks; `ended` is only the fallback for a track too
    // short to have a run-up.
    audio.addEventListener('timeupdate', () => {
      if (audio !== this.audio || this.fading) return;
      if (Number.isFinite(audio.duration) && audio.duration - audio.currentTime <= OVERLAP_S) this.#next();
    });
    audio.addEventListener('ended', () => { if (audio === this.audio && !this.fading) this.#next(); });
    // A track that cannot decode must not end the music forever; a whole
    // round of them (an APK running its built-in copy, which ships without
    // the music) means there is nothing to play, and the player goes quiet
    // instead of asking for a missing file every four seconds.
    audio.addEventListener('error', () => {
      if (audio !== this.audio) return;
      this.misses += 1;
      if (this.misses >= this.order.length) return;
      setTimeout(() => this.#next(), 4000);
    });
    audio.addEventListener('playing', () => { if (audio === this.audio) this.misses = 0; });
    return audio;
  }

  #ensure() {
    if (this.audio || !TRACK_URLS.length) return;
    this.audio = this.#player();
    this.other = this.#player();
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

  /**
   * The next track, faded in under the current one while that fades out:
   * one crossfade, then the players swap roles. A single track on its own
   * simply starts again the same way.
   */
  #next() {
    if (!this.on || this.parked || this.fading) return;
    this.at = (this.at + 1) % this.order.length;
    const outgoing = this.audio;
    const incoming = this.other;
    incoming.src = this.order[this.at];
    incoming.volume = 0;
    incoming.currentTime = 0;
    this.audio = incoming;
    this.other = outgoing;
    incoming.play().catch(() => { /* until a gesture arrives */ });

    const started = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - started) / FADE_MS);
      // Equal-power curves, so the sum never dips in the middle.
      incoming.volume = this.volume * Math.sin(k * Math.PI / 2);
      outgoing.volume = this.volume * Math.cos(k * Math.PI / 2);
      if (k < 1 && !this.parked && this.on) { this.fading = requestAnimationFrame(step); return; }
      this.fading = null;
      outgoing.pause();
      outgoing.volume = this.volume;
      incoming.volume = this.volume;
    };
    this.fading = requestAnimationFrame(step);
  }

  /** Start now if allowed. Called at boot and again on the first gesture. */
  poke() {
    if (!this.on || this.parked) return;
    this.#ensure();
    if (!this.audio) return;
    if (!this.audio.src) this.prime();
    if (!this.fading) this.audio.volume = this.volume;
    this.audio.play().catch(() => { /* a browser waiting for a gesture */ });
  }

  setOn(on) {
    this.on = Boolean(on);
    if (!this.on) { this.#stopFade(); this.audio?.pause(); this.other?.pause(); }
    else this.poke();
  }

  setVolume(volume) {
    this.volume = Math.min(1, Math.max(0, Number(volume) || 0));
    if (this.audio && !this.fading) this.audio.volume = this.volume;
  }

  #stopFade() {
    if (this.fading) cancelAnimationFrame(this.fading);
    this.fading = null;
  }

  /** The app left the foreground; music must not outlive the screen. */
  park() {
    this.parked = true;
    this.#stopFade();
    this.audio?.pause();
    this.other?.pause();
  }

  unpark() {
    this.parked = false;
    if (this.on && this.audio?.paused) { this.audio.volume = this.volume; this.audio.play().catch(() => {}); }
  }
}

export const music = new Music();
