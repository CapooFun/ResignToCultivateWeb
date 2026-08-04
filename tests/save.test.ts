import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core';
import { createEnvelope, exportState, importState, parseEnvelope } from '../src/game/save';

describe('存档契约', () => {
  it('可以导出并导入完整状态', () => {
    const state = createInitialState('test', 42);
    const restored = importState(exportState(state));
    expect(restored.meta.diagnosticSeed).toBe(42);
    expect(restored.inventory.warehouse).toEqual(state.inventory.warehouse);
    expect(restored.player.potionBelt.length).toBe(3);
  });

  it('拒绝未来或未知版本', () => {
    const envelope = createEnvelope(createInitialState('test', 42));
    expect(() => parseEnvelope({ ...envelope, saveVersion: 999 })).toThrow(/不支持的存档版本/);
  });
});
