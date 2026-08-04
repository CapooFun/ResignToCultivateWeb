import { CONTENT_VERSION, ENEMIES, ITEMS, MAP_TIERS, POTIONS, RECIPES, SKILLS, TALENTS } from './content';
import { addItem, canAfford, itemCount, mergeSources, removeItem } from './inventory';
import { canEnterTerrain, currentFloor, entityAt, generateFloor, GENERATOR_VERSION, revealFloorAround } from './mapGenerator';
import { nextRandom, normalizeSeed } from './prng';
import type {
  CombatActionEvent,
  CombatState,
  DispatchResult,
  EquipmentSlot,
  GameCommand,
  GameState,
  ItemStack,
  MapEntity,
  PlayerState,
  Position,
  Realm,
  ReincarnationState
} from './types';

export const SAVE_VERSION = 1;
const DAMAGE_K = 600;
const STEPS_PER_YEAR = 5;
const ACTION_RECOVERY_MS = 260;
const POTION_COOLDOWN_MS = 1000;

const DIRECTION_DELTA = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
} as const;

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function basePlayer(reincarnation: ReincarnationState): PlayerState {
  const vitality = reincarnation.talents.sturdy_body ?? 0;
  const clarity = reincarnation.talents.clear_mind ?? 0;
  const maxHp = 138 + vitality * 12;
  const maxMp = 82 + clarity * 8;
  return {
    realm: '炼气', realmLevel: 1, exp: 0, peakRealmLevel: 1,
    lifespan: 100, maxLifespan: 100,
    hp: maxHp, maxHp, mp: maxMp, maxMp,
    strength: 16, constitution: 14, spirit: 17, sense: 13, agility: 12,
    physicalAttack: 30, spellAttack: 32, physicalDefense: 13, spellDefense: 12,
    hitRate: 0.94, critChance: 0.1, critMultiplier: 1.55, attacksPerSecond: 0.82,
    equippedSkills: ['firebolt', 'sword_art'],
    equippedPassives: ['吐纳诀', '铁骨诀'],
    equipment: { melee: null, ranged: null, armor: null, ring: null },
    potionSlots: ['healing_pill', 'mana_pill', 'balanced_pill']
  };
}

function baseBagCapacity(reincarnation: ReincarnationState): number {
  return 10 + (reincarnation.talents.bigger_bag ?? 0) * 2;
}

export function createInitialState(buildVersion = 'local-dev', seed = 20260804): GameState {
  const reincarnation: ReincarnationState = {
    karma: 0, totalDeaths: 0, talents: {}, pendingKarma: 0, lastDeathReason: null
  };
  const player = basePlayer(reincarnation);
  return {
    scene: 'cave',
    meta: {
      saveVersion: SAVE_VERSION,
      contentVersion: CONTENT_VERSION,
      buildVersion,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      message: '洞府安稳。先整备，再出发。',
      diagnosticSeed: normalizeSeed(seed)
    },
    player,
    cave: { spiritStones: 180, mineLevel: 1, mineStored: 0, alchemyLevel: 1, forgeLevel: 1 },
    inventory: {
      capacity: baseBagCapacity(reincarnation),
      bag: [
        { itemId: 'healing_pill', count: 3 },
        { itemId: 'mana_pill', count: 2 },
        { itemId: 'balanced_pill', count: 1 }
      ],
      warehouseCapacity: 30,
      warehouse: [
        { itemId: 'spirit_herb', count: 4 },
        { itemId: 'iron_ore', count: 4 },
        { itemId: 'spirit_bow', count: 1 },
        { itemId: 'cloth_armor', count: 1 }
      ]
    },
    run: null,
    combat: null,
    reincarnation
  };
}

function message(state: GameState, text: string): void {
  state.meta.message = text;
}

function positionEquals(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function inventoryCapacityWithRing(state: GameState): number {
  const ringId = state.player.equipment.ring;
  return baseBagCapacity(state.reincarnation) + (ringId ? ITEMS[ringId]?.bagSlots ?? 0 : 0);
}

function recalculatePlayer(state: GameState, restore = false): void {
  const player = state.player;
  const vitality = state.reincarnation.talents.sturdy_body ?? 0;
  const clarity = state.reincarnation.talents.clear_mind ?? 0;
  let maxHp = 138 + vitality * 12 + (player.realmLevel - 1) * 28;
  let maxMp = 82 + clarity * 8 + (player.realmLevel - 1) * 18;
  let physicalAttack = 30 + (player.realmLevel - 1) * 7;
  let spellAttack = 32 + (player.realmLevel - 1) * 8;
  let physicalDefense = 13 + (player.realmLevel - 1) * 4;
  let spellDefense = 12 + (player.realmLevel - 1) * 4;
  for (const itemId of Object.values(player.equipment)) {
    if (!itemId) continue;
    const item = ITEMS[itemId];
    physicalAttack += item.physicalAttack ?? 0;
    spellAttack += item.spellAttack ?? 0;
    physicalDefense += item.physicalDefense ?? 0;
    spellDefense += item.spellDefense ?? 0;
  }
  player.maxHp = maxHp;
  player.maxMp = maxMp;
  player.physicalAttack = physicalAttack;
  player.spellAttack = spellAttack;
  player.physicalDefense = physicalDefense;
  player.spellDefense = spellDefense;
  player.hp = restore ? maxHp : Math.min(player.hp, maxHp);
  player.mp = restore ? maxMp : Math.min(player.mp, maxMp);
  state.inventory.capacity = inventoryCapacityWithRing(state);
}

function startRun(state: GameState, tier: 'S' | 'M' | 'L', requestedSeed?: number): void {
  if (state.scene !== 'select' && state.scene !== 'cave') return;
  const config = MAP_TIERS[tier];
  if (state.player.lifespan <= config.cost) {
    message(state, '寿元不足，不能踏上这段路。');
    return;
  }
  const seed = normalizeSeed(requestedSeed ?? (state.meta.diagnosticSeed + state.reincarnation.totalDeaths * 7919 + tier.charCodeAt(0)));
  const floor = generateFloor(tier, 1, seed);
  state.player.lifespan -= config.cost;
  state.run = {
    runId: `${tier}-${seed}-${state.reincarnation.totalDeaths}`,
    seed,
    baseSeed: seed,
    generatorVersion: GENERATOR_VERSION,
    sizeTier: tier,
    floor: 1,
    maxFloors: config.floors,
    travelCostYears: config.cost,
    travelCostPaid: true,
    playerPosition: { ...floor.spawn },
    stepRemainder: 0,
    totalSteps: 0,
    spentYears: config.cost,
    floors: [floor],
    pendingInteractionId: null
  };
  state.scene = 'explore';
  state.meta.diagnosticSeed = seed;
  message(state, `进入${config.name}，路程消耗 ${config.cost} 年。`);
}

function consumeExplorationStep(state: GameState): boolean {
  if (!state.run) return false;
  state.run.totalSteps += 1;
  state.run.stepRemainder += 1;
  if (state.run.stepRemainder >= STEPS_PER_YEAR) {
    state.run.stepRemainder -= STEPS_PER_YEAR;
    state.run.spentYears += 1;
    state.player.lifespan = Math.max(0, state.player.lifespan - 1);
    if (state.player.lifespan <= 0) {
      handleDeath(state, '寿元耗尽，坐化于途中');
      return true;
    }
  }
  return false;
}

function beginCombat(state: GameState, entity: MapEntity, target: Position): void {
  if (!state.run || !entity.enemyId) return;
  const base = ENEMIES[entity.enemyId];
  const tierScale = state.run.sizeTier === 'S' ? 1 : state.run.sizeTier === 'M' ? 1.22 : 1.52;
  const floorScale = 1 + (state.run.floor - 1) * 0.14;
  const scale = tierScale * floorScale;
  const enemyMaxHp = Math.round(base.maxHp * scale);
  state.combat = {
    enemyEntityId: entity.id,
    enemyId: base.id,
    targetPosition: { ...target },
    clockMs: 0,
    rngState: normalizeSeed(state.run.seed ^ (entity.id.length * 2654435761)),
    player: {
      hp: state.player.hp, maxHp: state.player.maxHp, mp: state.player.mp, maxMp: state.player.maxMp,
      physicalAttack: state.player.physicalAttack, spellAttack: state.player.spellAttack,
      physicalDefense: state.player.physicalDefense, spellDefense: state.player.spellDefense,
      attacksPerSecond: state.player.attacksPerSecond
    },
    enemy: {
      hp: enemyMaxHp, maxHp: enemyMaxHp, mp: 0, maxMp: 0,
      physicalAttack: Math.round(base.physicalAttack * scale), spellAttack: 0,
      physicalDefense: Math.round(base.physicalDefense * scale), spellDefense: Math.round(base.spellDefense * scale),
      attacksPerSecond: base.attacksPerSecond
    },
    playerBasicReadyAt: 720,
    enemyBasicReadyAt: 980,
    skillReadyAt: Object.fromEntries(state.player.equippedSkills.map((id, index) => [id, 340 + index * 80])),
    queuedPotionSlot: null,
    potionReadyAt: 0,
    awaitingAnimation: false,
    outcome: 'active',
    lastAction: null,
    nextActionId: 1
  };
  message(state, `遭遇${base.name}。秘术将按优先级自动施放。`);
}

function randomFromCombat(combat: CombatState): number {
  const next = nextRandom(combat.rngState);
  combat.rngState = next.state;
  return next.value;
}

function calculateDamage(raw: number, defense: number): number {
  return Math.max(1, Math.round(raw * DAMAGE_K / (DAMAGE_K + Math.max(0, defense))));
}

function setCombatAction(combat: CombatState, event: Omit<CombatActionEvent, 'id'>): void {
  combat.lastAction = { id: combat.nextActionId, ...event };
  combat.nextActionId += 1;
  combat.awaitingAnimation = true;
}

function usePotionInCombat(state: GameState, slot: number): boolean {
  const combat = state.combat;
  const itemId = state.player.potionSlots[slot];
  if (!combat || !itemId || !POTIONS[itemId]) return false;
  const removed = removeItem(state.inventory.bag, itemId, 1);
  if (removed.removed !== 1) return false;
  state.inventory.bag = removed.stacks;
  const potion = POTIONS[itemId];
  const oldHp = combat.player.hp;
  const oldMp = combat.player.mp;
  combat.player.hp = Math.min(combat.player.maxHp, combat.player.hp + potion.healHp);
  combat.player.mp = Math.min(combat.player.maxMp, combat.player.mp + potion.restoreMp);
  state.player.hp = combat.player.hp;
  state.player.mp = combat.player.mp;
  combat.queuedPotionSlot = null;
  combat.potionReadyAt = combat.clockMs + POTION_COOLDOWN_MS;
  setCombatAction(combat, {
    actor: 'player', kind: 'potion', name: ITEMS[itemId].name,
    damage: 0, healing: combat.player.hp - oldHp, mpDelta: combat.player.mp - oldMp,
    critical: false, missed: false
  });
  return true;
}

function chooseReadySkill(state: GameState): string | null {
  const combat = state.combat;
  if (!combat) return null;
  const skills = state.player.equippedSkills
    .map((id, slot) => ({ skill: SKILLS[id], slot }))
    .filter(({ skill }) => skill && (combat.skillReadyAt[skill.id] ?? 0) <= combat.clockMs && combat.player.mp >= skill.mpCost)
    .sort((a, b) => b.skill.priority - a.skill.priority || a.slot - b.slot);
  return skills[0]?.skill.id ?? null;
}

function playerSkillAction(state: GameState, skillId: string): void {
  const combat = state.combat!;
  const skill = SKILLS[skillId];
  combat.player.mp -= skill.mpCost;
  state.player.mp = combat.player.mp;
  combat.skillReadyAt[skillId] = combat.clockMs + skill.cooldownMs + ACTION_RECOVERY_MS;
  const missed = randomFromCombat(combat) > state.player.hitRate;
  const critical = !missed && randomFromCombat(combat) < state.player.critChance;
  const attack = skill.damageType === 'physical' ? combat.player.physicalAttack : combat.player.spellAttack;
  const defense = skill.damageType === 'physical' ? combat.enemy.physicalDefense : combat.enemy.spellDefense;
  const raw = attack * skill.multiplier * (critical ? state.player.critMultiplier : 1);
  const damage = missed ? 0 : calculateDamage(raw, defense);
  combat.enemy.hp = Math.max(0, combat.enemy.hp - damage);
  if (combat.enemy.hp <= 0) combat.outcome = 'victory';
  setCombatAction(combat, {
    actor: 'player', kind: 'skill', name: skill.name, damage, healing: 0, mpDelta: -skill.mpCost, critical, missed
  });
}

function playerBasicAction(state: GameState): void {
  const combat = state.combat!;
  const missed = randomFromCombat(combat) > state.player.hitRate;
  const critical = !missed && randomFromCombat(combat) < state.player.critChance;
  const raw = combat.player.physicalAttack * (critical ? state.player.critMultiplier : 1);
  const damage = missed ? 0 : calculateDamage(raw, combat.enemy.physicalDefense);
  combat.enemy.hp = Math.max(0, combat.enemy.hp - damage);
  combat.playerBasicReadyAt = combat.clockMs + 1000 / Math.max(0.1, combat.player.attacksPerSecond) + ACTION_RECOVERY_MS;
  if (combat.enemy.hp <= 0) combat.outcome = 'victory';
  setCombatAction(combat, {
    actor: 'player', kind: 'basic', name: '御剑普攻', damage, healing: 0, mpDelta: 0, critical, missed
  });
}

function enemyBasicAction(state: GameState): void {
  const combat = state.combat!;
  const missed = randomFromCombat(combat) > 0.9;
  const critical = !missed && randomFromCombat(combat) < 0.05;
  const raw = combat.enemy.physicalAttack * (critical ? 1.45 : 1);
  const damage = missed ? 0 : calculateDamage(raw, combat.player.physicalDefense);
  combat.player.hp = Math.max(0, combat.player.hp - damage);
  state.player.hp = combat.player.hp;
  combat.enemyBasicReadyAt = combat.clockMs + 1000 / Math.max(0.1, combat.enemy.attacksPerSecond) + ACTION_RECOVERY_MS;
  if (combat.player.hp <= 0) combat.outcome = 'defeat';
  setCombatAction(combat, {
    actor: 'enemy', kind: 'basic', name: `${ENEMIES[combat.enemyId].name}扑击`, damage, healing: 0, mpDelta: 0, critical, missed
  });
}

function tickCombat(state: GameState, deltaMs: number): void {
  const combat = state.combat;
  if (!combat || combat.awaitingAnimation || combat.outcome !== 'active') return;
  combat.clockMs += Math.min(120, Math.max(0, deltaMs));
  if (combat.queuedPotionSlot !== null && combat.clockMs >= combat.potionReadyAt) {
    if (usePotionInCombat(state, combat.queuedPotionSlot)) return;
    combat.queuedPotionSlot = null;
  }
  const skillId = chooseReadySkill(state);
  if (skillId) {
    playerSkillAction(state, skillId);
    return;
  }
  if (combat.playerBasicReadyAt <= combat.clockMs) {
    playerBasicAction(state);
    return;
  }
  if (combat.enemyBasicReadyAt <= combat.clockMs) enemyBasicAction(state);
}

function addLoot(state: GameState, stacks: ItemStack[]): void {
  for (const stack of stacks) {
    const result = addItem(state.inventory.bag, state.inventory.capacity, stack.itemId, stack.count);
    state.inventory.bag = result.stacks;
    if (result.added < stack.count) message(state, `背包已满，部分${ITEMS[stack.itemId].name}遗落。`);
  }
}

function awardExperience(state: GameState, amount: number): void {
  state.player.exp += amount;
  const oldLevel = state.player.realmLevel;
  if (state.player.exp >= 320) state.player.realmLevel = 3;
  else if (state.player.exp >= 120) state.player.realmLevel = 2;
  const realmByLevel: Record<number, Realm> = { 1: '炼气', 2: '筑基', 3: '结丹' };
  state.player.realm = realmByLevel[state.player.realmLevel];
  state.player.peakRealmLevel = Math.max(state.player.peakRealmLevel, state.player.realmLevel);
  if (state.player.realmLevel > oldLevel) {
    state.player.maxLifespan += 40;
    state.player.lifespan += 40;
    recalculatePlayer(state, true);
    message(state, `境界突破至${state.player.realm}，状态全部恢复。`);
  }
}

function finishCombatAnimation(state: GameState): void {
  const combat = state.combat;
  if (!combat) return;
  combat.awaitingAnimation = false;
  if (combat.outcome === 'active') return;
  if (combat.outcome === 'defeat') {
    handleDeath(state, `败于${ENEMIES[combat.enemyId].name}`);
    return;
  }
  if (!state.run) return;
  const floor = currentFloor(state.run);
  const entity = floor.entities.find((candidate) => candidate.id === combat.enemyEntityId);
  if (entity) entity.cleared = true;
  state.run.playerPosition = { ...combat.targetPosition };
  revealFloorAround(floor, state.run.playerPosition);
  const enemy = ENEMIES[combat.enemyId];
  addLoot(state, enemy.loot);
  awardExperience(state, enemy.exp);
  state.player.hp = combat.player.hp;
  state.player.mp = combat.player.mp;
  state.combat = null;
  message(state, `击败${enemy.name}，获得 ${enemy.exp} 修为。`);
}

function interactAfterMove(state: GameState, entity: MapEntity | undefined): void {
  if (!state.run || !entity) return;
  const floor = currentFloor(state.run);
  if (entity.kind === 'resource' && entity.itemId) {
    const result = addItem(state.inventory.bag, state.inventory.capacity, entity.itemId, entity.count ?? 1);
    state.inventory.bag = result.stacks;
    if (result.added === (entity.count ?? 1)) {
      entity.cleared = true;
      message(state, `采得${ITEMS[entity.itemId].name} ×${entity.count ?? 1}。`);
    } else message(state, '背包已满，资源仍留在原地。');
  } else if (entity.kind === 'town') {
    state.player.hp = state.player.maxHp;
    state.player.mp = state.player.maxMp;
    message(state, '城镇灵泉洗去疲惫，血与灵气回满。');
  } else if (entity.kind === 'secret' && entity.rewardId) {
    const result = addItem(state.inventory.bag, state.inventory.capacity, entity.rewardId, 1);
    state.inventory.bag = result.stacks;
    if (result.added === 1) {
      entity.cleared = true;
      message(state, `秘境所得：${ITEMS[entity.rewardId].name}。`);
    } else message(state, '背包已满，秘境奖励暂未领取。');
  } else if (entity.kind === 'return' || entity.kind === 'depth') {
    state.run.pendingInteractionId = entity.id;
    message(state, entity.kind === 'return' ? '回府阵已亮起，可结束本趟探索。' : '深入门已开启，可前往下一层。');
  }
  revealFloorAround(floor, state.run.playerPosition);
}

function movePlayer(state: GameState, direction: keyof typeof DIRECTION_DELTA): void {
  if (state.scene !== 'explore' || !state.run || state.combat) return;
  const floor = currentFloor(state.run);
  const delta = DIRECTION_DELTA[direction];
  const target = { x: state.run.playerPosition.x + delta.x, y: state.run.playerPosition.y + delta.y };
  if (target.x < 0 || target.y < 0 || target.x >= floor.width || target.y >= floor.height) return;
  if (!canEnterTerrain(floor.tiles[target.y][target.x].terrain, state.player.realm)) {
    message(state, `当前境界不足，无法进入${floor.tiles[target.y][target.x].terrain === 'water' ? '水域' : '山脉'}。`);
    return;
  }
  state.run.pendingInteractionId = null;
  const entity = entityAt(floor, target);
  if (entity?.kind === 'enemy') {
    if (consumeExplorationStep(state)) return;
    beginCombat(state, entity, target);
    return;
  }
  state.run.playerPosition = target;
  revealFloorAround(floor, target);
  if (consumeExplorationStep(state)) return;
  interactAfterMove(state, entity);
}

function returnToCave(state: GameState): void {
  if (!state.run || state.scene !== 'explore' || state.combat) return;
  const floor = currentFloor(state.run);
  const entity = floor.entities.find((candidate) => candidate.id === state.run?.pendingInteractionId);
  if (!entity || entity.kind !== 'return' || !positionEquals(entity.position, state.run.playerPosition)) return;
  const years = state.run.spentYears;
  state.cave.mineStored += Math.round(100 * Math.pow(1.5, state.cave.mineLevel - 1) * years);
  state.player.hp = state.player.maxHp;
  state.player.mp = state.player.maxMp;
  state.run = null;
  state.combat = null;
  state.scene = 'cave';
  message(state, `平安回府。本趟消耗 ${years} 年，灵矿累积了新的产出。`);
}

function advanceFloor(state: GameState): void {
  if (!state.run || state.combat) return;
  const floor = currentFloor(state.run);
  const entity = floor.entities.find((candidate) => candidate.id === state.run?.pendingInteractionId);
  if (!entity || entity.kind !== 'depth' || !positionEquals(entity.position, state.run.playerPosition)) return;
  if (state.run.floor >= state.run.maxFloors) return;
  state.run.floor += 1;
  let nextFloor = state.run.floors.find((candidate) => candidate.floor === state.run!.floor);
  if (!nextFloor) {
    nextFloor = generateFloor(state.run.sizeTier, state.run.floor, state.run.baseSeed);
    state.run.floors.push(nextFloor);
  }
  state.run.playerPosition = { ...nextFloor.spawn };
  state.run.pendingInteractionId = null;
  message(state, `进入第 ${state.run.floor}/${state.run.maxFloors} 层。`);
}

function usePotionOutsideCombat(state: GameState, slot: number): void {
  const itemId = state.player.potionSlots[slot];
  if (!itemId || !POTIONS[itemId]) return;
  const removed = removeItem(state.inventory.bag, itemId, 1);
  if (removed.removed !== 1) {
    message(state, `${ITEMS[itemId].name}已经用完。`);
    return;
  }
  state.inventory.bag = removed.stacks;
  const potion = POTIONS[itemId];
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + potion.healHp);
  state.player.mp = Math.min(state.player.maxMp, state.player.mp + potion.restoreMp);
  message(state, `服用${ITEMS[itemId].name}。`);
}

function transferItem(state: GameState, itemId: string, direction: 'toWarehouse' | 'toBag'): void {
  if (state.scene !== 'cave') return;
  const source = direction === 'toWarehouse' ? state.inventory.bag : state.inventory.warehouse;
  const target = direction === 'toWarehouse' ? state.inventory.warehouse : state.inventory.bag;
  const capacity = direction === 'toWarehouse' ? state.inventory.warehouseCapacity : state.inventory.capacity;
  const count = itemCount(source, itemId);
  if (count <= 0) return;
  const added = addItem(target, capacity, itemId, count);
  const removed = removeItem(source, itemId, added.added);
  if (direction === 'toWarehouse') {
    state.inventory.warehouse = added.stacks;
    state.inventory.bag = removed.stacks;
  } else {
    state.inventory.bag = added.stacks;
    state.inventory.warehouse = removed.stacks;
  }
  message(state, `${ITEMS[itemId].name}转移 ${added.added} 件。`);
}

function transferAllToWarehouse(state: GameState): void {
  if (state.scene !== 'cave') return;
  for (const stack of [...state.inventory.bag]) transferItem(state, stack.itemId, 'toWarehouse');
  message(state, state.inventory.bag.length === 0 ? '身上物品已全部入库。' : '仓库空间不足，仍有物品留在身上。');
}

function removeCostsFromBagAndWarehouse(state: GameState, costs: ItemStack[]): void {
  for (const cost of costs) {
    const fromBag = Math.min(itemCount(state.inventory.bag, cost.itemId), cost.count);
    state.inventory.bag = removeItem(state.inventory.bag, cost.itemId, fromBag).stacks;
    state.inventory.warehouse = removeItem(state.inventory.warehouse, cost.itemId, cost.count - fromBag).stacks;
  }
}

function craft(state: GameState, recipeId: string): void {
  if (state.scene !== 'cave') return;
  const recipe = RECIPES[recipeId];
  if (!recipe) return;
  const facilityLevel = recipe.facility === 'alchemy' ? state.cave.alchemyLevel : state.cave.forgeLevel;
  if ((recipe.id === 'mana_recipe' || recipe.id === 'ring_recipe') && facilityLevel < 2) {
    message(state, '该配方需要对应设施达到 2 级。');
    return;
  }
  const available = mergeSources(state.inventory.bag, state.inventory.warehouse);
  if (state.cave.spiritStones < recipe.spiritStoneCost || !canAfford(available, recipe.ingredients)) {
    message(state, '材料或灵石不足。');
    return;
  }
  const output = addItem(state.inventory.warehouse, state.inventory.warehouseCapacity, recipe.output.itemId, recipe.output.count);
  if (output.added !== recipe.output.count) {
    message(state, '仓库已满，无法炼制。');
    return;
  }
  removeCostsFromBagAndWarehouse(state, recipe.ingredients);
  state.inventory.warehouse = output.stacks;
  state.cave.spiritStones -= recipe.spiritStoneCost;
  message(state, `${recipe.name}成功，产物已入仓库。`);
}

function upgradeFacility(state: GameState, facility: 'mine' | 'alchemy' | 'forge'): void {
  if (state.scene !== 'cave') return;
  const key = facility === 'mine' ? 'mineLevel' : facility === 'alchemy' ? 'alchemyLevel' : 'forgeLevel';
  const current = state.cave[key];
  if (current >= 3) {
    message(state, '首版设施最高为 3 级。');
    return;
  }
  const cost = current * 120;
  if (state.cave.spiritStones < cost) {
    message(state, `升级需要 ${cost} 灵石。`);
    return;
  }
  state.cave.spiritStones -= cost;
  state.cave[key] = current + 1;
  const name = facility === 'mine' ? '采矿' : facility === 'alchemy' ? '炼丹' : '炼器';
  message(state, `${name}设施提升至 ${current + 1} 级。`);
}

function equipItem(state: GameState, itemId: string): void {
  if (state.scene !== 'cave') return;
  const item = ITEMS[itemId];
  if (!item?.equipmentSlot) return;
  const inBag = itemCount(state.inventory.bag, itemId);
  const inWarehouse = itemCount(state.inventory.warehouse, itemId);
  if (inBag + inWarehouse <= 0) return;
  const slot: EquipmentSlot = item.equipmentSlot;
  const previous = state.player.equipment[slot];
  if (inBag > 0) state.inventory.bag = removeItem(state.inventory.bag, itemId, 1).stacks;
  else state.inventory.warehouse = removeItem(state.inventory.warehouse, itemId, 1).stacks;
  if (previous) state.inventory.warehouse = addItem(state.inventory.warehouse, state.inventory.warehouseCapacity, previous, 1).stacks;
  state.player.equipment[slot] = itemId;
  recalculatePlayer(state);
  message(state, `已装备${item.name}。`);
}

function handleDeath(state: GameState, reason: string): void {
  const reward = 10 + state.player.peakRealmLevel * 15;
  state.reincarnation.karma += reward;
  state.reincarnation.pendingKarma = reward;
  state.reincarnation.totalDeaths += 1;
  state.reincarnation.lastDeathReason = reason;
  state.inventory.bag = [];
  state.run = null;
  state.combat = null;
  state.player.hp = 0;
  state.scene = 'reincarnation';
  message(state, `${reason}。获得 ${reward} 因果。`);
}

function buyTalent(state: GameState, talentId: string): void {
  if (state.scene !== 'reincarnation') return;
  const talent = TALENTS[talentId];
  if (!talent) return;
  const level = state.reincarnation.talents[talentId] ?? 0;
  const cost = 10 * (level + 1);
  if (level >= talent.maxLevel || state.reincarnation.karma < cost) {
    message(state, level >= talent.maxLevel ? '该天赋已满。' : '因果不足。');
    return;
  }
  state.reincarnation.karma -= cost;
  state.reincarnation.talents[talentId] = level + 1;
  message(state, `${talent.name}提升至 ${level + 1} 级。`);
}

function reincarnate(state: GameState): void {
  if (state.scene !== 'reincarnation') return;
  state.player = basePlayer(state.reincarnation);
  state.inventory.capacity = baseBagCapacity(state.reincarnation);
  state.inventory.bag = [
    { itemId: 'healing_pill', count: 2 },
    { itemId: 'mana_pill', count: 1 },
    { itemId: 'balanced_pill', count: 1 }
  ];
  state.reincarnation.pendingKarma = 0;
  state.scene = 'cave';
  message(state, `第 ${state.reincarnation.totalDeaths + 1} 世开始。洞府与仓库仍在。`);
}

export function dispatchGameCommand(input: GameState, command: GameCommand): DispatchResult {
  const state = deepClone(input);
  let shouldSave = command.type !== 'TICK_COMBAT';
  switch (command.type) {
    case 'OPEN_SELECT': if (state.scene === 'cave') state.scene = 'select'; break;
    case 'CLOSE_SELECT': if (state.scene === 'select') state.scene = 'cave'; break;
    case 'START_RUN': startRun(state, command.tier, command.seed); break;
    case 'MOVE': movePlayer(state, command.direction); break;
    case 'RETURN_CAVE': returnToCave(state); break;
    case 'ADVANCE_FLOOR': advanceFloor(state); break;
    case 'QUEUE_POTION':
      if (command.slot < 0 || command.slot > 2) break;
      if (state.combat) {
        if (state.combat.outcome === 'active' && state.combat.clockMs >= state.combat.potionReadyAt) {
          state.combat.queuedPotionSlot = command.slot;
          message(state, '丹药已排队，将在当前动作结束后服用。');
        }
      } else usePotionOutsideCombat(state, command.slot);
      break;
    case 'TICK_COMBAT':
      tickCombat(state, command.deltaMs);
      shouldSave = state.combat?.awaitingAnimation ?? false;
      break;
    case 'COMBAT_ANIMATION_DONE': finishCombatAnimation(state); break;
    case 'TRANSFER_ALL_TO_WAREHOUSE': transferAllToWarehouse(state); break;
    case 'TRANSFER_ITEM': transferItem(state, command.itemId, command.direction); break;
    case 'COLLECT_MINE':
      if (state.scene === 'cave' && state.cave.mineStored > 0) {
        state.cave.spiritStones += state.cave.mineStored;
        message(state, `收取灵石 ${state.cave.mineStored}。`);
        state.cave.mineStored = 0;
      }
      break;
    case 'UPGRADE_FACILITY': upgradeFacility(state, command.facility); break;
    case 'CRAFT': craft(state, command.recipeId); break;
    case 'EQUIP': equipItem(state, command.itemId); break;
    case 'BUY_TALENT': buyTalent(state, command.talentId); break;
    case 'REINCARNATE': reincarnate(state); break;
    case 'RESET_GAME': return { state: createInitialState(input.meta.buildVersion, input.meta.diagnosticSeed), shouldSave: true };
    case 'SET_MESSAGE': message(state, command.message); break;
  }
  return { state, shouldSave };
}

export function talentCost(state: GameState, talentId: string): number {
  return 10 * ((state.reincarnation.talents[talentId] ?? 0) + 1);
}
