import { describe, expect, it } from 'vitest';
import { createInitialState, dispatchGameCommand } from '../src/game/core';
import { currentFloor } from '../src/game/mapGenerator';
import type { Direction, GameState, Position } from '../src/game/types';

function startRun(): GameState {
  let state = createInitialState('test', 1234);
  state = dispatchGameCommand(state, { type: 'OPEN_SELECT' }).state;
  return dispatchGameCommand(state, { type: 'START_RUN', tier: 'S', seed: 1234 }).state;
}

function directionFromTo(from: Position, to: Position): Direction {
  if (to.x > from.x) return 'right';
  if (to.x < from.x) return 'left';
  if (to.y > from.y) return 'down';
  return 'up';
}

function enterFirstEnemy(state: GameState): GameState {
  const run = state.run!;
  const floor = currentFloor(run);
  const enemy = floor.entities.find((entity) => entity.kind === 'enemy')!;
  const candidates = [
    { x: enemy.position.x - 1, y: enemy.position.y },
    { x: enemy.position.x + 1, y: enemy.position.y },
    { x: enemy.position.x, y: enemy.position.y - 1 },
    { x: enemy.position.x, y: enemy.position.y + 1 }
  ].filter((position) => position.x > 0 && position.y > 0 && position.x < floor.width - 1 && position.y < floor.height - 1);
  const adjacent = candidates[0];
  floor.tiles[adjacent.y][adjacent.x].terrain = 'plain';
  run.playerPosition = adjacent;
  return dispatchGameCommand(state, { type: 'MOVE', direction: directionFromTo(adjacent, enemy.position) }).state;
}

describe('游戏核心', () => {
  it('进图寿元只扣一次且会话记录付款', () => {
    const state = startRun();
    expect(state.player.lifespan).toBe(97);
    expect(state.run?.travelCostPaid).toBe(true);
    expect(state.run?.spentYears).toBe(3);
  });

  it('秘术按优先级先释放火弹术', () => {
    let state = enterFirstEnemy(startRun());
    expect(state.combat).not.toBeNull();
    for (let index = 0; index < 3; index += 1) state = dispatchGameCommand(state, { type: 'TICK_COMBAT', deltaMs: 120 }).state;
    expect(state.combat?.lastAction?.name).toBe('火弹术');
    expect(state.combat?.lastAction?.kind).toBe('skill');
  });

  it('MP 不足时回退普攻，且双方同时就绪时玩家先手', () => {
    let state = enterFirstEnemy(startRun());
    state.combat!.player.mp = 0;
    state.player.mp = 0;
    state.combat!.playerBasicReadyAt = 0;
    state.combat!.enemyBasicReadyAt = 0;
    state.combat!.skillReadyAt = { firebolt: 0, sword_art: 0 };
    state = dispatchGameCommand(state, { type: 'TICK_COMBAT', deltaMs: 16 }).state;
    expect(state.combat?.lastAction?.actor).toBe('player');
    expect(state.combat?.lastAction?.kind).toBe('basic');
  });

  it('秘术施放不覆盖已经就绪的普攻计时', () => {
    let state = enterFirstEnemy(startRun());
    state.combat!.playerBasicReadyAt = 0;
    state.combat!.skillReadyAt.firebolt = 0;
    const basicReadyAt = state.combat!.playerBasicReadyAt;
    state = dispatchGameCommand(state, { type: 'TICK_COMBAT', deltaMs: 16 }).state;
    expect(state.combat?.lastAction?.name).toBe('火弹术');
    expect(state.combat?.playerBasicReadyAt).toBe(basicReadyAt);
  });

  it('动画等待期间不推进逻辑时钟或堆积动作', () => {
    let state = enterFirstEnemy(startRun());
    state.combat!.skillReadyAt.firebolt = 0;
    state = dispatchGameCommand(state, { type: 'TICK_COMBAT', deltaMs: 16 }).state;
    const clock = state.combat!.clockMs;
    const actionId = state.combat!.lastAction!.id;
    state = dispatchGameCommand(state, { type: 'TICK_COMBAT', deltaMs: 120 }).state;
    expect(state.combat?.clockMs).toBe(clock);
    expect(state.combat?.lastAction?.id).toBe(actionId);
    state = dispatchGameCommand(state, { type: 'COMBAT_ANIMATION_DONE' }).state;
    state = dispatchGameCommand(state, { type: 'TICK_COMBAT', deltaMs: 120 }).state;
    expect(state.combat?.clockMs).toBeGreaterThan(clock);
  });

  it('玩家击杀后敌方同帧就绪攻击不会结算', () => {
    let state = enterFirstEnemy(startRun());
    state.combat!.enemy.hp = 1;
    state.combat!.skillReadyAt.firebolt = 0;
    state.combat!.enemyBasicReadyAt = 0;
    const hpBefore = state.combat!.player.hp;
    state = dispatchGameCommand(state, { type: 'TICK_COMBAT', deltaMs: 16 }).state;
    expect(state.combat?.outcome).toBe('victory');
    expect(state.combat?.player.hp).toBe(hpBefore);
    state = dispatchGameCommand(state, { type: 'COMBAT_ANIMATION_DONE' }).state;
    expect(state.combat).toBeNull();
    expect(state.player.hp).toBe(hpBefore);
  });

  it('丹药排队后优先于攻击执行且不重置普攻', () => {
    let state = enterFirstEnemy(startRun());
    state.combat!.player.hp = 20;
    state.player.hp = 20;
    const basicReadyAt = state.combat!.playerBasicReadyAt;
    state = dispatchGameCommand(state, { type: 'QUEUE_POTION', slot: 0 }).state;
    state = dispatchGameCommand(state, { type: 'TICK_COMBAT', deltaMs: 16 }).state;
    expect(state.combat?.lastAction?.kind).toBe('potion');
    expect(state.combat?.player.hp).toBeGreaterThan(20);
    expect(state.combat?.playerBasicReadyAt).toBe(basicReadyAt);
  });

  it('寿元耗尽进入轮回，仓库与设施保留、身上清空', () => {
    let state = startRun();
    const warehouseBefore = structuredClone(state.inventory.warehouse);
    state.player.lifespan = 1;
    state.run!.stepRemainder = 4;
    const floor = currentFloor(state.run!);
    const from = state.run!.playerPosition;
    const target = { x: from.x, y: from.y - 1 };
    floor.tiles[target.y][target.x].terrain = 'plain';
    for (const entity of floor.entities) if (entity.position.x === target.x && entity.position.y === target.y) entity.cleared = true;
    state = dispatchGameCommand(state, { type: 'MOVE', direction: 'up' }).state;
    expect(state.scene).toBe('reincarnation');
    expect(state.inventory.bag).toEqual([]);
    expect(state.inventory.warehouse).toEqual(warehouseBefore);
    expect(state.cave.mineLevel).toBe(1);
    expect(state.reincarnation.karma).toBeGreaterThan(0);
  });

  it('购买天赋后转世保留仓库并获得天赋加成', () => {
    let state = startRun();
    state.player.lifespan = 1;
    state.run!.stepRemainder = 4;
    const floor = currentFloor(state.run!);
    const from = state.run!.playerPosition;
    floor.tiles[from.y - 1][from.x].terrain = 'plain';
    for (const entity of floor.entities) if (entity.position.x === from.x && entity.position.y === from.y - 1) entity.cleared = true;
    state = dispatchGameCommand(state, { type: 'MOVE', direction: 'up' }).state;
    state = dispatchGameCommand(state, { type: 'BUY_TALENT', talentId: 'sturdy_body' }).state;
    const warehouseBefore = structuredClone(state.inventory.warehouse);
    state = dispatchGameCommand(state, { type: 'REINCARNATE' }).state;
    expect(state.scene).toBe('cave');
    expect(state.reincarnation.talents.sturdy_body).toBe(1);
    expect(state.player.maxHp).toBe(150);
    expect(state.inventory.warehouse).toEqual(warehouseBefore);
  });
});
