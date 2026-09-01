import { defineConfig } from 'vite';

export default defineConfig({
  // Every asset is referenced relative to index.html, so the same build runs
  // from the APK's asset origin, from a project page under a repository path,
  // and from a folder opened on disk. An absolute base would break two of the
  // three the moment the site does not sit at the domain root.
  base: './',
  build: {
    // The sound kits must ride inside the bundle as data URIs: the APK's
    // WebView cannot reliably fetch() loose files, and a sound that loads
    // late is a sound that plays late. The largest such asset is a ~20 KB font.
    assetsInlineLimit: 32768
  },
  server: {
    port: 5173,
    open: false
  }
});
