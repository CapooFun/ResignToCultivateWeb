import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const githubRepository = process.env.GITHUB_REPOSITORY?.split('/')[1];
const configuredBase = process.env.VITE_BASE_PATH ?? (githubRepository ? `/${githubRepository}/` : '/');
const basePath = configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`;

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
        includeAssets: [
        'favicon.png',
        'icon-192.png',
        'icon-512.png',
        'ui/spirit-vein-ore.png',
        'ui/spirit-stone.png',
        'ui/weihai-splash.png',
        'audio/bgm/*.m4a',
        'audio/system_sfx/*',
        'audio/combat_sfx/*'
      ],
      manifest: {
        id: basePath,
        name: '辞职修仙传',
        short_name: '辞职修仙传',
        description: '竖屏网页修仙肉鸽：洞府、探索、自动战斗与轮回。',
        start_url: basePath,
        scope: basePath,
        display: 'standalone',
        background_color: '#f3eee2',
        theme_color: '#17201c',
        lang: 'zh-CN',
        orientation: 'portrait',
        icons: [
          { src: `${basePath}icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${basePath}icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${basePath}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: `${basePath}index.html`,
        globPatterns: ['**/*.{js,css,html,png,woff2,ogg,wav,m4a}'],
        cleanupOutdatedCaches: true
      }
    })
  ],
  define: {
    __BUILD_VERSION__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? process.env.npm_package_version ?? '0.1.0')
  },
  build: {
    target: 'es2022',
    sourcemap: false
  }
});
