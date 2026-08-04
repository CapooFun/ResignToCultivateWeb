/** Chromium 一键安装用的 deferred beforeinstallprompt。 */

export type BeforeInstallPromptLike = {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type InstallPromptListener = (ready: boolean) => void;

let deferred: BeforeInstallPromptLike | null = null;
const listeners = new Set<InstallPromptListener>();

function notify(): void {
  const ready = deferred !== null;
  for (const listener of listeners) listener(ready);
}

export function getDeferredInstallPrompt(): BeforeInstallPromptLike | null {
  return deferred;
}

export function subscribeInstallPrompt(listener: InstallPromptListener): () => void {
  listeners.add(listener);
  listener(deferred !== null);
  return () => { listeners.delete(listener); };
}

export async function promptInstallApp(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred;
  if (!event) return 'unavailable';
  deferred = null;
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}

export function detectInstallPlatform(): 'ios-safari' | 'ios-chrome' | 'chromium' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    // iOS 上 Chrome/Edge/Firefox 等均无 beforeinstallprompt，统一给 Safari 指引
    if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return 'ios-chrome';
    return 'ios-safari';
  }
  if (/Chrome|Chromium|Edg|OPR/.test(ua) && !/Firefox/.test(ua)) return 'chromium';
  return 'other';
}

/** 尽早挂上，避免漏掉浏览器发出的安装事件。 */
export function bindInstallPromptCapture(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', ((event: Event) => {
    event.preventDefault();
    deferred = event as unknown as BeforeInstallPromptLike;
    notify();
  }) as EventListener);
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}
