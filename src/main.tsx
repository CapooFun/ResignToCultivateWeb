import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { sound } from './game/audio';
import { validateContent } from './game/content';
import { bindInstallPromptCapture } from './game/installPrompt';
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
  // iOS 对 button 也要拦双击放大；连点采矿时补一次 click，避免 preventDefault 吃掉第二次点击
  document.addEventListener(
    'touchend',
    (event) => {
      const now = Date.now();
      const isDouble = now - lastTouchEnd <= 320;
      lastTouchEnd = now;
      if (!isDouble) return;
      event.preventDefault();
      const target = event.target as HTMLElement | null;
      const interactive = target?.closest(
        'button:not(:disabled), a[href], .stack-chip, .vein-core:not(:disabled), .mine-stored-collect:not(:disabled)'
      ) as HTMLElement | null;
      if (interactive) interactive.click();
    },
    { passive: false }
  );
}

sound.bindUnlock();
sound.bindLifecycle();
sound.preload();
bindViewportLock();
bindInstallPromptCapture();

await gameStore.initialize();

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
);
