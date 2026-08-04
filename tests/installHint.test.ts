import { describe, expect, it } from 'vitest';
import { markInstallHintSeen, shouldOfferInstallHint } from '../src/game/installHint';

describe('添加到主屏幕提示', () => {
  it('仅在至少死亡一次、非 standalone、且未看过时弹出', () => {
    const memory = new Map<string, string>();
    const opts = {
      standalone: false,
      storageGet: (key: string) => memory.get(key) ?? null
    };
    expect(shouldOfferInstallHint(0, opts)).toBe(false);
    expect(shouldOfferInstallHint(1, opts)).toBe(true);
    expect(shouldOfferInstallHint(1, { ...opts, standalone: true })).toBe(false);

    markInstallHintSeen((key, value) => { memory.set(key, value); });
    expect(shouldOfferInstallHint(1, opts)).toBe(false);
  });
});
