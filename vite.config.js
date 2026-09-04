import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

/*
 * The build stamp: which commit, built when. It goes into the bundle (every
 * save written by this build carries it, and an older build refuses to
 * overwrite a save written by a newer one) and into dist/version.json, which
 * the published site serves so an installed APK can find out that a newer
 * build exists.
 */
function buildStamp() {
  let sha = 'dev';
  try { sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'; }
  catch { /* no git: a folder build */ }
  return { sha, at: Date.now() };
}
const STAMP = buildStamp();

const versionFile = () => ({
  name: 'wikster-version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(STAMP) });
  }
});

export default defineConfig({
  // Every asset is referenced relative to index.html, so the same build runs
  // from the APK's asset origin, from a project page under a repository path,
  // and from a folder opened on disk. An absolute base would break two of the
  // three the moment the site does not sit at the domain root.
  base: './',
  define: { __WIKSTER_BUILD__: JSON.stringify(STAMP) },
  plugins: [versionFile()],
  build: {
    // The sound kits must ride inside the bundle as data URIs: the APK's
    // WebView cannot reliably fetch() loose files, and a sound that loads
    // late is a sound that plays late. The largest such asset is a ~20 KB font.
    assetsInlineLimit: 32768,
    rollupOptions: {
      output: {
        // Third-party code changes once a quarter and the app changes every
        // week: kept apart, an update only refetches what actually moved.
        manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined)
      }
    }
  },
  server: {
    port: 5173,
    open: false
  }
});
