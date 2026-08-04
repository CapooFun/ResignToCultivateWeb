import { describe, expect, it } from 'vitest';
import { createInitialState, dispatchGameCommand, migrateGameState, unlockedPotionSlots } from '../src/game/core';
import { ENEMIES, facilityUpgradeCost, manualMineStrikeTable, mineBreathMax, mineYieldPerYear, REALM_EXP_THRESHOLDS, scaleEnemyCombatStats, scaledEnemyExp } from '../src/game/content';
import { itemCount } from '../src/game/inventory';
import { currentFloor } from '../src/game/mapGenerator';
import { createEnvelope, importState, parseEnvelope } from '../src/game/save';
import type { Direction, EnemyRank, GameState, Position } from '../src/game/types';

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

function enterEnemy(state: GameState, rank: EnemyRank = 'normal'): GameState {
  const run = state.run!;
  const floor = currentFloor(run);
  const enemy = floor.entities.find((entity) => entity.kind === 'enemy' && (entity.enemyRank ?? 'normal') === rank)!;
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

function enterFirstEnemy(state: GameState): GameState {
  return enterEnemy(state, 'normal');
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

  it('动画等待期间推进时钟但不堆积动作', () => {
    let state = enterFirstEnemy(startRun());
    state.combat!.skillReadyAt.firebolt = 0;
    state = dispatchGameCommand(state, { type: 'TICK_COMBAT', deltaMs: 16 }).state;
    const clock = state.combat!.clockMs;
    const actionId = state.combat!.lastAction!.id;
    state = dispatchGameCommand(state, { type: 'TICK_COMBAT', deltaMs: 120 }).state;
    expect(state.combat?.clockMs).toBeGreaterThan(clock);
    expect(state.combat?.lastAction?.id).toBe(actionId);
    state = dispatchGameCommand(state, { type: 'COMBAT_ANIMATION_DONE' }).state;
    state = dispatchGameCommand(state, { type: 'TICK_COMBAT', deltaMs: 120 }).state;
    expect(state.combat?.clockMs).toBeGreaterThan(clock + 120);
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

  it('击败敌人弹出奖励结算，关闭前不可移动', () => {
    let state = enterFirstEnemy(startRun());
    state.combat!.enemy.hp = 1;
    state.combat!.skillReadyAt.firebolt = 0;
    state = dispatchGameCommand(state, { type: 'TICK_COMBAT', deltaMs: 16 }).state;
    state = dispatchGameCommand(state, { type: 'COMBAT_ANIMATION_DONE' }).state;
    expect(state.popup?.title).toBe('战斗胜利');
    expect(state.popup?.lines.some((line) => line.includes('修为'))).toBe(true);
    const position = { ...state.run!.playerPosition };
    state = dispatchGameCommand(state, { type: 'MOVE', direction: 'up' }).state;
    expect(state.run?.playerPosition).toEqual(position);
    state = dispatchGameCommand(state, { type: 'DISMISS_POPUP' }).state;
    expect(state.popup).toBeNull();
  });

  it('精英面板约强 30%，击败后修为按 +200% 结算', () => {
    let state = enterEnemy(startRun(), 'elite');
    expect(state.combat?.enemyRank).toBe('elite');
    const enemyId = state.combat!.enemyId;
    const scaled = scaleEnemyCombatStats(enemyId, 'elite');
    expect(state.combat?.enemy.maxHp).toBe(scaled.maxHp);
    expect(state.combat?.enemy.maxHp).toBe(Math.round(ENEMIES[enemyId].maxHp * 1.3));
    expect(state.combat?.enemy.physicalAttack).toBe(Math.round(ENEMIES[enemyId].physicalAttack * 1.3));
    const expBefore = state.player.exp;
    state.player.hitRate = 1;
    state.combat!.enemy.hp = 1;
    state.combat!.skillReadyAt.firebolt = 0;
    state = dispatchGameCommand(state, { type: 'TICK_COMBAT', deltaMs: 16 }).state;
    expect(state.combat?.outcome).toBe('victory');
    state = dispatchGameCommand(state, { type: 'COMBAT_ANIMATION_DONE' }).state;
    expect(state.player.exp - expBefore).toBe(scaledEnemyExp(enemyId, 'elite'));
    expect(state.player.exp - expBefore).toBe(ENEMIES[enemyId].exp * 3);
    expect(state.popup?.lines.some((line) => line.includes('精英·'))).toBe(true);
  });

  it('踩到灵泉回满一次后消失', () => {
    let state = startRun();
    const floor = currentFloor(state.run!);
    const spring = floor.entities.find((entity) => entity.kind === 'spring')!;
    state.player.hp = 10;
    state.player.mp = 5;
    const adjacent = { x: spring.position.x - 1, y: spring.position.y };
    floor.tiles[adjacent.y][adjacent.x].terrain = 'plain';
    floor.tiles[spring.position.y][spring.position.x].terrain = 'plain';
    for (const entity of floor.entities) {
      if (entity !== spring && entity.position.x === adjacent.x && entity.position.y === adjacent.y) entity.cleared = true;
      if (entity !== spring && entity.position.x === spring.position.x && entity.position.y === spring.position.y) entity.cleared = true;
    }
    state.run!.playerPosition = adjacent;
    state = dispatchGameCommand(state, { type: 'MOVE', direction: 'right' }).state;
    expect(state.popup?.title).toBe('灵泉');
    expect(state.player.hp).toBe(state.player.maxHp);
    expect(state.popup?.lines.join('')).toMatch(/回满/);
    expect(currentFloor(state.run!).entities.find((entity) => entity.id === spring.id)?.cleared).toBe(true);
    state = dispatchGameCommand(state, { type: 'DISMISS_POPUP' }).state;
    state.player.hp = 10;
    state = dispatchGameCommand(state, { type: 'MOVE', direction: 'left' }).state;
    if (state.popup) state = dispatchGameCommand(state, { type: 'DISMISS_POPUP' }).state;
    state = dispatchGameCommand(state, { type: 'MOVE', direction: 'right' }).state;
    expect(state.popup).toBeNull();
    expect(state.player.hp).toBe(10);
  });

  it('丹药排队后优先于攻击执行且只扣腰带不扣背包', () => {
    let state = enterFirstEnemy(startRun());
    state.combat!.player.hp = 20;
    state.player.hp = 20;
    const bagBefore = structuredClone(state.inventory.bag);
    const beltBefore = state.player.potionBelt[0]!.count;
    const basicReadyAt = state.combat!.playerBasicReadyAt;
    state = dispatchGameCommand(state, { type: 'QUEUE_POTION', slot: 0 }).state;
    state = dispatchGameCommand(state, { type: 'TICK_COMBAT', deltaMs: 16 }).state;
    expect(state.combat?.lastAction?.kind).toBe('potion');
    expect(state.combat?.player.hp).toBeGreaterThan(20);
    expect(state.combat?.playerBasicReadyAt).toBe(basicReadyAt);
    expect(state.inventory.bag).toEqual(bagBefore);
    expect(state.player.potionBelt[0]?.count ?? 0).toBe(beltBefore - 1);
  });

  it('丹药挂槽从背包扣除，战斗用尽不自动补充', () => {
    let state = createInitialState('test', 1);
    state.inventory.bag.push({ itemId: 'pill_heal_s', count: 2 });
    state = dispatchGameCommand(state, { type: 'ASSIGN_POTION', itemId: 'pill_heal_s', slot: 0 }).state;
    expect(state.player.potionBelt[0]?.count).toBeGreaterThan(2);
    expect(state.inventory.bag.some((stack) => stack.itemId === 'pill_heal_s')).toBe(false);
    state.player.potionBelt[0] = { itemId: 'pill_heal_s', count: 1 };
    state.inventory.bag.push({ itemId: 'pill_heal_s', count: 5 });
    state = dispatchGameCommand(state, { type: 'OPEN_SELECT' }).state;
    state = dispatchGameCommand(state, { type: 'START_RUN', tier: 'S', seed: 99 }).state;
    state = enterFirstEnemy(state);
    state = dispatchGameCommand(state, { type: 'QUEUE_POTION', slot: 0 }).state;
    state = dispatchGameCommand(state, { type: 'TICK_COMBAT', deltaMs: 16 }).state;
    expect(state.player.potionBelt[0]).toBeNull();
    expect(state.inventory.bag.find((stack) => stack.itemId === 'pill_heal_s')?.count).toBe(5);
  });

  it('腰带提升丹药槽，降档多余丹药回包', () => {
    let state = createInitialState('test', 2);
    state.inventory.warehouse.push({ itemId: 'iron_belt', count: 1 });
    state = dispatchGameCommand(state, { type: 'EQUIP', itemId: 'iron_belt' }).state;
    expect(unlockedPotionSlots(state)).toBe(3);
    state.inventory.bag.push({ itemId: 'pill_mana_s', count: 2 });
    state = dispatchGameCommand(state, { type: 'ASSIGN_POTION', itemId: 'pill_mana_s', slot: 2 }).state;
    expect(state.player.potionBelt[2]?.itemId).toBe('pill_mana_s');
    state.inventory.warehouse.push({ itemId: 'leather_belt', count: 1 });
    state = dispatchGameCommand(state, { type: 'EQUIP', itemId: 'leather_belt' }).state;
    expect(unlockedPotionSlots(state)).toBe(2);
    expect(state.player.potionBelt[2]).toBeNull();
    expect(state.inventory.bag.some((stack) => stack.itemId === 'pill_mana_s') || state.inventory.warehouse.some((stack) => stack.itemId === 'pill_mana_s')).toBe(true);
  });

  it('遁药只加下一次逃跑，与鞋子加法', () => {
    let state = enterFirstEnemy(startRun());
    state.player.equipment.shoes = 'cloud_shoes';
    state.player.potionBelt[0] = { itemId: 'pill_escape_s', count: 1 };
    state.combat!.rngState = 1;
    state = dispatchGameCommand(state, { type: 'QUEUE_POTION', slot: 0 }).state;
    state = dispatchGameCommand(state, { type: 'TICK_COMBAT', deltaMs: 16 }).state;
    expect(state.combat?.nextEscapeBonus).toBe(0.1);
    state = dispatchGameCommand(state, { type: 'COMBAT_ANIMATION_DONE' }).state;
    state = dispatchGameCommand(state, { type: 'ATTEMPT_ESCAPE' }).state;
    expect(state.combat?.lastAction?.kind).toBe('escape');
    expect(state.combat?.nextEscapeBonus).toBe(0);
  });

  it('心法叠层提高最大生命', () => {
    let state = createInitialState('test', 3);
    const baseHp = state.player.maxHp;
    state = migrateGameState({
      ...state,
      player: { ...state.player, passives: { rebirth_body: 2 } }
    });
    expect(state.player.maxHp).toBe(Math.round(baseHp * (1 + 0.08 * 2)));
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
    expect(state.reincarnation.offeredTalents).toHaveLength(3);
    const talentId = state.reincarnation.offeredTalents.includes('sturdy_body')
      ? 'sturdy_body'
      : state.reincarnation.offeredTalents[0];
    state = dispatchGameCommand(state, { type: 'BUY_TALENT', talentId }).state;
    const warehouseBefore = structuredClone(state.inventory.warehouse);
    state = dispatchGameCommand(state, { type: 'REINCARNATE' }).state;
    expect(state.scene).toBe('cave');
    expect(state.reincarnation.talents[talentId]).toBe(1);
    if (talentId === 'sturdy_body') expect(state.player.maxHp).toBe(150);
    expect(state.inventory.warehouse).toEqual(warehouseBefore);
  });
});

describe('存档迁移', () => {
  it('可导入当前版本存档', () => {
    const state = createInitialState('test', 42);
    const restored = importState(JSON.stringify(createEnvelope(state)));
    expect(restored.player.potionBelt[0]?.itemId).toBe('pill_heal_s');
    expect(restored.meta.saveVersion).toBe(3);
  });

  it('拒绝未来版本', () => {
    const envelope = createEnvelope(createInitialState('test', 42));
    expect(() => parseEnvelope({ ...envelope, saveVersion: 999 })).toThrow(/不支持的存档版本/);
  });

  it('迁移旧 potionSlots 到腰带', () => {
    const legacy = createInitialState('test', 7);
    const migrated = migrateGameState({
      ...legacy,
      player: {
        ...legacy.player,
        passives: undefined,
        equippedPassives: ['吐纳诀', '铁骨诀'],
        potionBelt: undefined,
        potionSlots: ['healing_pill', 'mana_pill', null],
        equipment: { melee: null, ranged: null, armor: null, ring: null }
      },
      inventory: {
        ...legacy.inventory,
        bag: [{ itemId: 'healing_pill', count: 2 }, { itemId: 'mana_pill', count: 1 }]
      }
    } as unknown as GameState);
    expect(migrated.player.potionBelt[0]?.itemId).toBe('pill_heal_s');
    expect(migrated.player.passives.rebirth_body).toBe(1);
    expect(migrated.player.passives.iron_bone).toBe(1);
    expect(migrated.player.equipment.shoes).toBeNull();
    expect(migrated.player.equipment.belt).toBeNull();
  });

  it('设施升级与修为阈值为指数曲线', () => {
    let state = createInitialState('economy', 7);
    expect(state.cave.spiritStones).toBe(200);
    expect(facilityUpgradeCost(1)).toBe(180);
    expect(facilityUpgradeCost(2)).toBe(540);
    expect(REALM_EXP_THRESHOLDS).toEqual([0, 200, 700, 2200, 7000]);
    state = dispatchGameCommand(state, { type: 'UPGRADE_FACILITY', facility: 'mine' }).state;
    expect(state.cave.mineLevel).toBe(2);
    expect(state.cave.spiritStones).toBe(20);
    state.cave.spiritStones = 540;
    state = dispatchGameCommand(state, { type: 'UPGRADE_FACILITY', facility: 'mine' }).state;
    expect(state.cave.mineLevel).toBe(3);
    expect(mineYieldPerYear(3)).toBe(320);
  });

  it('手动叩击灵脉：耗灵息、累计待收，耗尽时拒绝；再收取入库', () => {
    let state = createInitialState('manual-mine', 42);
    expect(state.cave.mineBreath).toBe(mineBreathMax(1));
    const beforeStones = state.cave.spiritStones;
    const beforeStored = state.cave.mineStored;
    const breath = state.cave.mineBreath;
    state = dispatchGameCommand(state, { type: 'MANUAL_MINE' }).state;
    expect(state.cave.spiritStones).toBe(beforeStones);
    expect(state.cave.mineStored).toBeGreaterThan(beforeStored);
    expect(state.cave.mineBreath).toBe(breath - 1);
    expect(state.cave.lastMineStrike?.amount).toBeGreaterThan(0);
    expect(state.cave.lastMineStrike?.id).toBe(1);

    const pending = state.cave.mineStored;
    state = dispatchGameCommand(state, { type: 'COLLECT_MINE' }).state;
    expect(state.cave.mineStored).toBe(0);
    expect(state.cave.spiritStones).toBe(beforeStones + pending);

    state.cave.mineBreath = 0.2;
    state.cave.mineBreathAt = Date.now();
    const stones = state.cave.spiritStones;
    const stored = state.cave.mineStored;
    state = dispatchGameCommand(state, { type: 'MANUAL_MINE' }).state;
    expect(state.cave.spiritStones).toBe(stones);
    expect(state.cave.mineStored).toBe(stored);
    expect(state.meta.message).toMatch(/灵息/);
  });

  it('矿场等级提升手动采矿收益与爆发率', () => {
    const low = manualMineStrikeTable(1);
    const high = manualMineStrikeTable(3);
    expect(low.max).toBeLessThan(high.max);
    expect(low.jackpotMax).toBeLessThan(high.jackpotMax);
    expect(low.jackpotChance).toBeLessThan(high.jackpotChance);
    expect(mineBreathMax(3)).toBeGreaterThan(mineBreathMax(1));
  });

  it('丹缘增加炼丹产出，仓库满时拒绝换装', () => {
    let state = createInitialState('talent', 11);
    state.reincarnation.talents.alchemy_gift = 2;
    state.cave.spiritStones = 100;
    state.inventory.warehouse = [
      { itemId: 'spirit_herb', count: 10 },
      { itemId: 'iron_ore', count: 10 }
    ];
    const before = itemCount(state.inventory.warehouse, 'pill_heal_1');
    state = dispatchGameCommand(state, { type: 'CRAFT', recipeId: 'recipe_pill_heal_1' }).state;
    expect(itemCount(state.inventory.warehouse, 'pill_heal_1')).toBe(before + 4);

    state.inventory.warehouseCapacity = 2;
    state.inventory.warehouse = [
      { itemId: 'spirit_herb', count: 1 },
      { itemId: 'melee_1', count: 1 }
    ];
    state.player.equipment.melee = 'melee_2';
    state.inventory.bag = [{ itemId: 'melee_3', count: 1 }];
    state = dispatchGameCommand(state, { type: 'EQUIP', itemId: 'melee_3' }).state;
    expect(state.player.equipment.melee).toBe('melee_2');
    expect(state.meta.message).toMatch(/仓库已满/);
  });

  it('探索非战斗可换装换术补丹，旧装备回行囊；战斗中不可', () => {
    let state = startRun();
    state.inventory.bag = [
      { itemId: 'melee_2', count: 1 },
      { itemId: 'pill_heal_1', count: 2 }
    ];
    state.player.equipment.melee = 'melee_1';
    state.player.learnedSkills = ['firebolt', 'sword_art', 'wind_slash'];
    state.player.equippedSkills = ['firebolt', 'sword_art'];

    state = dispatchGameCommand(state, { type: 'EQUIP', itemId: 'melee_2' }).state;
    expect(state.player.equipment.melee).toBe('melee_2');
    expect(itemCount(state.inventory.bag, 'melee_1')).toBe(1);
    expect(itemCount(state.inventory.bag, 'melee_2')).toBe(0);

    state = dispatchGameCommand(state, { type: 'TOGGLE_SKILL', skillId: 'wind_slash' }).state;
    expect(state.player.equippedSkills).toContain('wind_slash');

    state = dispatchGameCommand(state, { type: 'ASSIGN_POTION', itemId: 'pill_heal_1', slot: 0 }).state;
    expect(state.player.potionBelt[0]?.itemId).toBe('pill_heal_1');
    expect(itemCount(state.inventory.bag, 'pill_heal_1')).toBe(0);

    state = enterFirstEnemy(state);
    const meleeBefore = state.player.equipment.melee;
    state.inventory.bag.push({ itemId: 'melee_3', count: 1 });
    state = dispatchGameCommand(state, { type: 'EQUIP', itemId: 'melee_3' }).state;
    expect(state.player.equipment.melee).toBe(meleeBefore);
  });
});
