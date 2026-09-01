import { defineConfig } from 'vite';

export default defineConfig({
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
