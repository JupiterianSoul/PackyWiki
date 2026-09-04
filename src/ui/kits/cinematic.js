/** The cinematic kit: every one-shot in src/assets/sfx/cinematic, as data URIs. The
 *  synth fetches this module the first time a theme asks for the kit, so the
 *  samples ride in a chunk of their own instead of in the first screen. */
export default import.meta.glob('../../assets/sfx/cinematic/*.ogg', { eager: true, query: '?inline', import: 'default' });
