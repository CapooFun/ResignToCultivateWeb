const INSTALL_HINT_KEY = 'resign-cultivate-install-hint-v1';

export function isStandaloneDisplay(
  mediaMatches: (query: string) => boolean = (query) =>
    typeof window !== 'undefined' && window.matchMedia(query).matches,
  iosStandalone: boolean = typeof navigator !== 'undefined'
    && 'standalone' in navigator
    && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
): boolean {
  return mediaMatches('(display-mode: standalone), (display-mode: fullscreen)') || iosStandalone;
}

export function shouldOfferInstallHint(
  totalDeaths: number,
  options?: {
    standalone?: boolean;
    storageGet?: (key: string) => string | null;
  }
): boolean {
  if (totalDeaths < 1) return false;
  if (options?.standalone ?? isStandaloneDisplay()) return false;
  const read = options?.storageGet ?? ((key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  });
  return read(INSTALL_HINT_KEY) !== '1';
}

export function markInstallHintSeen(
  storageSet: (key: string, value: string) => void = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }
): void {
  storageSet(INSTALL_HINT_KEY, '1');
}

export { INSTALL_HINT_KEY };
