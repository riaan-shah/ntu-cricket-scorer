import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base: './' + HashRouter means the built `dist/` folder works on any static host
// (GitHub Pages, Netlify, a club laptop) without server rewrites.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'logo-192.png'],
      // Live-link previews are served by a Vercel function; the offline app shell must not swallow them.
      workbox: { navigateFallbackDenylist: [/^\/m\//, /^\/api\//] },
      manifest: {
        name: 'NTU Cricket Scorer',
        short_name: 'NTU Cricket',
        description: 'Ball-by-ball scoring and stats for NTU Cricket Club',
        theme_color: '#0d4d4f',
        background_color: '#f2f5f5',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'logo-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'logo-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'logo-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
