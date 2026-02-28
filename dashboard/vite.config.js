import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    proxy: {
      // ── Port invariant: backend always runs on 3939 ──────────────
      '/api': {
        target: 'http://localhost:3939',
        changeOrigin: true,
      },
    },
  },

  build: {
    // vendor-vis (vis-network) is ~523 KB minified — suppress advisory.
    // It only loads on /brain-view, so it does not affect initial load time.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        /**
         * Manual chunk splitting keeps the initial bundle small.
         *
         * vis-network + vis-data  ≈ 500 KB — only loaded when BrainViewPage
         * is actually visited.  McpSettingsPage is already lazy-imported, so
         * its chunk is automatically split by Rollup; we just ensure React
         * core and the large third-party graph lib land in separate chunks.
         */
        manualChunks: {
          // React core — shared by every route
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],

          // Firebase SDKs — auth + firestore used site-wide
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],

          // Graph visualisation — only needed on /brain-view
          'vendor-vis': ['vis-network', 'vis-data'],
        },
      },
    },
  },
});
