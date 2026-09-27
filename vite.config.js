import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.{svg,png}', 'models/*.task', 'mediapipe/*'],
      manifest: {
        name: 'SafeDrive',
        short_name: 'SafeDrive',
        description: 'Local, privacy-first eye-closure monitoring for safer driving.',
        theme_color: '#07101e',
        background_color: '#07101e',
        display: 'standalone',
        start_url: './',
        scope: './',
        orientation: 'any',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,png,svg,webmanifest,wasm,task}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
