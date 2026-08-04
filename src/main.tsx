import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { sound } from './game/audio';
import { validateContent } from './game/content';
import { gameStore } from './game/store';

const contentErrors = validateContent();
if (contentErrors.length > 0) throw new Error(`内容表校验失败：${contentErrors.join('；')}`);

/** 手机狂点时禁止拖页、双指缩放、双击放大。 */
function bindViewportLock(): void {
  const blockGesture = (event: Event) => event.preventDefault();
  document.addEventListener('gesturestart', blockGesture, { passive: false } as AddEventListenerOptions);
  document.addEventListener('gesturechange', blockGesture, { passive: false } as AddEventListenerOptions);
  document.addEventListener('gestureend', blockGesture, { passive: false } as AddEventListenerOptions);

  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) event.preventDefault();
    },
    { passive: false }
  );

  let lastTouchEnd = 0;
  // 仅拦截「空白处」的双击放大；按钮狂点不拦截，否则采矿连点会失效
  document.addEventListener(
    'touchend',
    (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, .stack-chip, .vein-core, .mine-stored-collect')) return;
      const now = Date.now();
      if (now - lastTouchEnd <= 280) event.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false }
  );
}

sound.bindUnlock();
sound.bindLifecycle();
sound.preload();
bindViewportLock();

await gameStore.initialize();

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
);
