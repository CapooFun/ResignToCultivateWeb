import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, dispatchGameCommand } from '../src/game/core';
import {
  getPlayStats,
  observeTelemetry,
  resetTelemetryForTests,
  setTelemetryOptOut,
  startTelemetry
} from '../src/game/telemetry';

function installMemoryStorage(): void {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
    removeItem: (key: string) => { memory.delete(key); },
    clear: () => { memory.clear(); },
    key: () => null,
    get length() { return memory.size; }
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    language: 'zh-CN',
    maxTouchPoints: 5,
    standalone: false
  });
  vi.stubGlobal('screen', { width: 390, height: 844 });
  vi.stubGlobal('document', { hidden: false, addEventListener() { /* noop */ } });
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    addEventListener() { /* noop */ },
    matchMedia: () => ({ matches: false })
  });
}

describe('试玩匿名统计', () => {
  beforeEach(() => {
    installMemoryStorage();
    resetTelemetryForTests();
    setTelemetryOptOut(false);
  });

  it('observe 能累计 runs / deaths', () => {
    let state = createInitialState('test', 7);
    startTelemetry(state);
    expect(getPlayStats().sessions).toBe(1);

    state = dispatchGameCommand(state, { type: 'OPEN_SELECT' }).state;
    const beforeStart = structuredClone(state);
    const afterStart = dispatchGameCommand(state, { type: 'START_RUN', tier: 'S', seed: 99 }).state;
    observeTelemetry(beforeStart, afterStart, { type: 'START_RUN', tier: 'S', seed: 99 });
    expect(getPlayStats().runs).toBe(1);
    expect(getPlayStats().tiers.S).toBe(1);

    const dying = structuredClone(afterStart);
    const dead = structuredClone(afterStart);
    dead.reincarnation.totalDeaths = afterStart.reincarnation.totalDeaths + 1;
    dead.reincarnation.lastDeathReason = '测试阵亡';
    dead.scene = 'reincarnation';
    observeTelemetry(dying, dead, { type: 'COMBAT_ANIMATION_DONE' });
    expect(getPlayStats().deaths).toBe(1);
  });

  it('关闭上报后 observe 直接返回', () => {
    const state = createInitialState('test', 8);
    startTelemetry(state);
    setTelemetryOptOut(true);
    const before = structuredClone(state);
    const after = dispatchGameCommand(state, { type: 'OPEN_SELECT' }).state;
    const runsBefore = getPlayStats().runs;
    observeTelemetry(before, after, { type: 'START_RUN', tier: 'M' });
    expect(getPlayStats().runs).toBe(runsBefore);
  });
});
