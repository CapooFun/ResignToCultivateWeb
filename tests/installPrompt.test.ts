import { describe, expect, it } from 'vitest';
import { detectInstallPlatform } from '../src/game/installPrompt';

describe('安装平台识别', () => {
  it('能区分 iOS Safari / iOS Chrome 线索', () => {
    const original = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1'
    });
    expect(detectInstallPlatform()).toBe('ios-chrome');
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    });
    expect(detectInstallPlatform()).toBe('ios-safari');
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => original });
  });
});
