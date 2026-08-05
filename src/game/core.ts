import {
  BASE_ESCAPE_CHANCE,
  BASE_ESCAPE_COOLDOWN_MS,
  BEST_GEAR,
  BEST_POTIONS,
  CONTENT_VERSION,
  ENEMIES,
  enemyDisplayName,
  facilityUpgradeCost,
  ITEMS,
  MAP_TIERS,
  MAX_EQUIPPED_SKILLS,
  MAX_ESCAPE_CHANCE,
  MAX_POTION_SLOTS,
  manualMineStrikeTable,
  mineBreathMax,
  mineBreathRegenMs,
  mineYieldPerYear,
  PASSIVES,
  POTIONS,
  REALM_EXP_THRESHOLDS,
  RECIPES,
  scaleEnemyCombatStats,
  scaledEnemyExp,
  scaledEnemyLoot,
  SKILLS,
  TALENTS
} from './content';
import { addItem, canAfford, itemCount, mergeSources, removeItem } from './inventory';
import { canEnterTerrain, currentFloor, entityAt, fogRevealRadius, generateFloor, GENERATOR_VERSION, revealFloorAround } from './mapGenerator';
import { nextRandom, normalizeSeed, SeededRandom } from './prng';
import type {
  CombatActionEvent,
  CombatState,
  DispatchResult,
  EquipmentSlot,
  GameCommand,
  GamePopup,
  GameState,
  ItemStack,
  MapEntity,
  PlayerState,
  Position,
  PotionBeltSlot,
  Realm,
  ReincarnationState
} from './types';

export const SAVE_VERSION = 3;

const ITEM_ID_ALIASES: Record<string, string> = {
  healing_pill: 'pill_heal_s',
  mana_pill: 'pill_mana_s',
  balanced_pill: 'pill_heal_s'
};

const REALM_BY_LEVEL: Record<number, Realm> = {
  1: '炼气', 2: '筑基', 3: '结丹', 4: '元婴', 5: '化神'
};
const DAMAGE_K = 600;
const STEPS_PER_YEAR = 5;
const ACTION_RECOVERY_MS = 260;
const POTION_COOLDOWN_MS = 1000;
const ANIMATION_STUCK_MS = 1200;

const DIRECTION_DELTA = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
} as const;

const EMPTY_EQUIPMENT: Record<EquipmentSlot, string | null> = {
  melee: null, ranged: null, armor: null, ring: null, shoes: null, belt: null
};

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function emptyPotionBelt(): Array<PotionBeltSlot | null> {
  return [null, null, null];
}

export function unlockedPotionSlots(state: GameState): number {
  const beltId = state.player.equipment.belt;
  const bonus = beltId ? ITEMS[beltId]?.potionSlotBonus ?? 0 : 0;
  return Math.min(MAX_POTION_SLOTS, 1 + bonus);
}

export function shoeEscapeBonus(state: GameState): { chance: number; cooldownReductionMs: number } {
  const shoesId = state.player.equipment.shoes;
  if (!shoesId) return { chance: 0, cooldownReductionMs: 0 };
  const item = ITEMS[shoesId];
  return {
    chance: item.escapeChanceBonus ?? 0,
    cooldownReductionMs: item.escapeCooldownReductionMs ?? 0
  };
}

export function escapeChanceFor(state: GameState, nextBonus = state.combat?.nextEscapeBonus ?? 0): number {
  const talentBonus = (state.reincarnation.talents.escape_artist ?? 0) * 0.03;
  return Math.min(MAX_ESCAPE_CHANCE, BASE_ESCAPE_CHANCE + shoeEscapeBonus(state).chance + talentBonus + nextBonus);
}

export function escapeCooldownMs(state: GameState): number {
  return Math.max(4000, BASE_ESCAPE_COOLDOWN_MS - shoeEscapeBonus(state).cooldownReductionMs);
}

function basePlayer(reincarnation: ReincarnationState): PlayerState {
  const vitality = reincarnation.talents.sturdy_body ?? 0;
  const clarity = reincarnation.talents.clear_mind ?? 0;
  const longevity = reincarnation.talents.long_breath ?? 0;
  const maxHp = 138 + vitality * 12;
  const maxMp = 82 + clarity * 8;
  const maxLifespan = 100 + longevity * 15;
  return {
    realm: '炼气', realmLevel: 1, exp: 0, peakRealmLevel: 1,
    lifespan: maxLifespan, maxLifespan,
    hp: maxHp, maxHp, mp: maxMp, maxMp,
    strength: 16, constitution: 14, spirit: 17, sense: 13, agility: 12,
    physicalAttack: 30, spellAttack: 32, physicalDefense: 13, spellDefense: 12,
    hitRate: 0.94, critChance: 0.1, critMultiplier: 1.55, attacksPerSecond: 0.82,
    learnedSkills: ['firebolt', 'sword_art'],
    equippedSkills: ['firebolt', 'sword_art'],
    passives: {},
    equipment: { ...EMPTY_EQUIPMENT },
    potionBelt: emptyPotionBelt()
  };
}

function baseBagCapacity(reincarnation: ReincarnationState): number {
  return 10 + (reincarnation.talents.bigger_bag ?? 0) * 2;
}

function pickOfferedTalents(seed: number, deathCount: number): string[] {
  const ids = Object.keys(TALENTS);
  const rng = new SeededRandom(normalizeSeed(seed + deathCount * 1337 + 42));
  const pool = [...ids];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

export function createInitialState(buildVersion = 'local-dev', seed = 20260804): GameState {
  const reincarnation: ReincarnationState = {
    karma: 0, totalDeaths: 0, talents: {}, offeredTalents: [], pendingKarma: 0, lastDeathReason: null
  };
  const player = basePlayer(reincarnation);
  player.potionBelt[0] = { itemId: 'pill_heal_s', count: 3 };
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
    cave: {
      spiritStones: 200,
      mineLevel: 1,
      mineStored: 0,
      alchemyLevel: 1,
      forgeLevel: 1,
      mineBreath: mineBreathMax(1),
      mineBreathAt: Date.now(),
      mineRngState: normalizeSeed(seed ^ 0x4d494e45),
      mineStrikeSeq: 0,
      lastMineStrike: null
    },
    inventory: {
      capacity: baseBagCapacity(reincarnation),
      bag: [
        { itemId: 'pill_mana_s', count: 2 },
        { itemId: 'pill_escape_s', count: 1 },
        { itemId: 'spirit_silk', count: 2 }
      ],
      warehouseCapacity: 40,
      warehouse: [
        { itemId: 'spirit_herb', count: 6 },
        { itemId: 'iron_ore', count: 4 },
        { itemId: 'spirit_bow', count: 1 },
        { itemId: 'cloth_armor', count: 1 }
      ]
    },
    run: null,
    combat: null,
    reincarnation,
    popup: null,
    cheatRestore: null
  };
}

function revealAtPlayer(state: GameState, position?: Position): void {
  if (!state.run) return;
  const floor = currentFloor(state.run);
  revealFloorAround(floor, position ?? state.run.playerPosition, fogRevealRadius(state.player.realmLevel));
}

function message(state: GameState, text: string): void {
  state.meta.message = text;
}

function showPopup(state: GameState, title: string, lines: string[]): void {
  const cleaned = lines.map((line) => line.trim()).filter(Boolean);
  if (cleaned.length === 0) return;
  state.popup = { title, lines: cleaned } satisfies GamePopup;
}

/** 按时间回复灵息，写回 cave；返回当前可用灵息。 */
export function refreshMineBreath(state: GameState, now = Date.now()): number {
  const max = mineBreathMax(state.cave.mineLevel);
  const regenMs = mineBreathRegenMs(state.cave.mineLevel);
  let breath = state.cave.mineBreath ?? max;
  let at = state.cave.mineBreathAt ?? now;
  if (breath < max && now > at) {
    const gained = (now - at) / regenMs;
    breath = Math.min(max, breath + gained);
    at = now;
  } else if (breath >= max) {
    breath = max;
    at = now;
  }
  state.cave.mineBreath = breath;
  state.cave.mineBreathAt = at;
  return breath;
}

/** 只读：预览当前灵息（含回复），不改状态。 */
export function previewMineBreath(state: GameState, now = Date.now()): { breath: number; max: number; regenMs: number } {
  const max = mineBreathMax(state.cave.mineLevel);
  const regenMs = mineBreathRegenMs(state.cave.mineLevel);
  let breath = state.cave.mineBreath ?? max;
  const at = state.cave.mineBreathAt ?? now;
  if (breath < max && now > at) breath = Math.min(max, breath + (now - at) / regenMs);
  else if (breath > max) breath = max;
  return { breath, max, regenMs };
}

function ensureMineFields(state: GameState): void {
  const max = mineBreathMax(state.cave.mineLevel || 1);
  if (typeof state.cave.mineBreath !== 'number') state.cave.mineBreath = max;
  if (typeof state.cave.mineBreathAt !== 'number') state.cave.mineBreathAt = Date.now();
  if (typeof state.cave.mineRngState !== 'number') {
    state.cave.mineRngState = normalizeSeed((state.meta.diagnosticSeed ?? 1) ^ 0x4d494e45);
  }
  if (typeof state.cave.mineStrikeSeq !== 'number') state.cave.mineStrikeSeq = 0;
  if (!('lastMineStrike' in state.cave) || state.cave.lastMineStrike === undefined) {
    state.cave.lastMineStrike = null;
  }
}

function manualMineStrike(state: GameState): void {
  if (state.scene !== 'cave') return;
  ensureMineFields(state);
  const now = Date.now();
  const breath = refreshMineBreath(state, now);
  const max = mineBreathMax(state.cave.mineLevel);
  if (breath < 1) {
    message(state, '灵息未复，灵脉暂歇。');
    return;
  }

  const table = manualMineStrikeTable(state.cave.mineLevel);
  const roll = nextRandom(state.cave.mineRngState);
  state.cave.mineRngState = roll.state;
  const jackpot = roll.value < table.jackpotChance;
  const amountRoll = nextRandom(state.cave.mineRngState);
  state.cave.mineRngState = amountRoll.state;
  const lo = jackpot ? table.jackpotMin : table.min;
  const hi = jackpot ? table.jackpotMax : table.max;
  const amount = lo + Math.floor(amountRoll.value * (hi - lo + 1));

  state.cave.mineBreath = breath - 1;
  state.cave.mineBreathAt = now;
  state.cave.mineStored += amount;
  state.cave.mineStrikeSeq += 1;
  state.cave.lastMineStrike = {
    id: state.cave.mineStrikeSeq,
    amount,
    jackpot,
    breathLeft: state.cave.mineBreath,
    breathMax: max
  };

  if (jackpot) {
    showPopup(state, '灵脉爆发！', [
      `叩击引出深处矿脉，待收 +${amount}。`,
      `点下方「待收灵石」统一入库。`,
      `矿场 Lv.${state.cave.mineLevel} · 灵息 ${Math.floor(state.cave.mineBreath)}/${max}`
    ]);
    message(state, `灵脉爆发！待收 +${amount}`);
  } else {
    message(state, `叩击灵脉，待收 +${amount}`);
  }
}

function hasPopup(state: GameState): boolean {
  return state.popup !== null;
}

function positionEquals(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

/** TEMP 热修：朋友试用期间背包容量翻倍，用完删掉此倍率。 */
const TEMP_BAG_CAPACITY_MULTIPLIER = 2;

function inventoryCapacityWithGear(state: GameState): number {
  const ringId = state.player.equipment.ring;
  const base = baseBagCapacity(state.reincarnation) + (ringId ? ITEMS[ringId]?.bagSlots ?? 0 : 0);
  return base * TEMP_BAG_CAPACITY_MULTIPLIER;
}

function returnOverflowPotionSlots(state: GameState): void {
  const unlocked = unlockedPotionSlots(state);
  for (let slot = unlocked; slot < MAX_POTION_SLOTS; slot += 1) {
    const belt = state.player.potionBelt[slot];
    if (!belt) continue;
    const added = addItem(state.inventory.bag, state.inventory.capacity, belt.itemId, belt.count);
    state.inventory.bag = added.stacks;
    if (added.added < belt.count) {
      const rest = belt.count - added.added;
      state.inventory.warehouse = addItem(state.inventory.warehouse, state.inventory.warehouseCapacity, belt.itemId, rest).stacks;
    }
    state.player.potionBelt[slot] = null;
  }
}

export function grantPassive(state: GameState, passiveId: string, options?: { silent?: boolean }): boolean {
  const definition = PASSIVES[passiveId];
  if (!definition) return false;
  const current = state.player.passives[passiveId] ?? 0;
  if (current >= definition.maxStacks) {
    if (!options?.silent) message(state, `${definition.name}已达最大层数。`);
    return false;
  }
  state.player.passives[passiveId] = current + 1;
  recalculatePlayer(state);
  if (!options?.silent) message(state, `领悟心法「${definition.name}」· ${current + 1} 层。`);
  return true;
}

export function grantSkill(state: GameState, skillId: string, options?: { silent?: boolean }): boolean {
  const definition = SKILLS[skillId];
  if (!definition) return false;
  if (state.player.learnedSkills.includes(skillId)) {
    if (!options?.silent) message(state, `秘术「${definition.name}」已掌握。`);
    return false;
  }
  state.player.learnedSkills.push(skillId);
  if (state.player.equippedSkills.length < MAX_EQUIPPED_SKILLS) {
    state.player.equippedSkills.push(skillId);
    if (!options?.silent) message(state, `领悟秘术「${definition.name}」，已自动装配。`);
  } else if (!options?.silent) {
    message(state, `领悟秘术「${definition.name}」。装配已满，可在行囊中手动切换。`);
  }
  return true;
}

function canManageLoadout(state: GameState): boolean {
  if (state.scene === 'cave') return true;
  return state.scene === 'explore' && !state.combat;
}

function toggleSkill(state: GameState, skillId: string): void {
  if (!canManageLoadout(state)) return;
  if (!state.player.learnedSkills.includes(skillId) || !SKILLS[skillId]) {
    message(state, '尚未领悟该秘术。');
    return;
  }
  const equipped = state.player.equippedSkills;
  const index = equipped.indexOf(skillId);
  if (index >= 0) {
    if (equipped.length <= 1) {
      message(state, '至少保留一门秘术。');
      return;
    }
    equipped.splice(index, 1);
    message(state, `已卸下「${SKILLS[skillId].name}」。`);
    return;
  }
  if (equipped.length >= MAX_EQUIPPED_SKILLS) {
    message(state, `最多装配 ${MAX_EQUIPPED_SKILLS} 门秘术。`);
    return;
  }
  equipped.push(skillId);
  message(state, `已装配「${SKILLS[skillId].name}」。`);
}

function recalculatePlayer(state: GameState, restore = false): void {
  const player = state.player;
  const vitality = state.reincarnation.talents.sturdy_body ?? 0;
  const clarity = state.reincarnation.talents.clear_mind ?? 0;
  const keen = state.reincarnation.talents.keen_blade ?? 0;
  const focus = state.reincarnation.talents.spirit_focus ?? 0;
  const wall = state.reincarnation.talents.iron_wall ?? 0;
  const shield = state.reincarnation.talents.mana_shield ?? 0;
  const fleet = state.reincarnation.talents.fleet_foot ?? 0;
  const longevity = state.reincarnation.talents.long_breath ?? 0;
  let maxHp = 138 + vitality * 12 + (player.realmLevel - 1) * 28;
  let maxMp = 82 + clarity * 8 + (player.realmLevel - 1) * 18;
  let physicalAttack = 30 + (player.realmLevel - 1) * 7 + keen * 3;
  let spellAttack = 32 + (player.realmLevel - 1) * 8 + focus * 3;
  let physicalDefense = 13 + (player.realmLevel - 1) * 4 + wall * 2;
  let spellDefense = 12 + (player.realmLevel - 1) * 4 + shield * 2;
  let hitRate = 0.94;
  let critChance = 0.1;
  let attacksPerSecond = 0.82 * (1 + fleet * 0.04);
  let maxLifespan = 100 + longevity * 15 + Math.max(0, player.realmLevel - 1) * 40;
  for (const itemId of Object.values(player.equipment)) {
    if (!itemId) continue;
    const item = ITEMS[itemId];
    physicalAttack += item.physicalAttack ?? 0;
    spellAttack += item.spellAttack ?? 0;
    physicalDefense += item.physicalDefense ?? 0;
    spellDefense += item.spellDefense ?? 0;
  }
  for (const [passiveId, stacks] of Object.entries(player.passives)) {
    const passive = PASSIVES[passiveId];
    if (!passive || stacks <= 0) continue;
    if (passive.hpPercentPerStack) maxHp = Math.round(maxHp * (1 + passive.hpPercentPerStack * stacks));
    if (passive.mpPercentPerStack) maxMp = Math.round(maxMp * (1 + passive.mpPercentPerStack * stacks));
    if (passive.physicalDefensePerStack) physicalDefense += passive.physicalDefensePerStack * stacks;
    if (passive.spellDefensePerStack) spellDefense += passive.spellDefensePerStack * stacks;
    if (passive.physicalAttackPerStack) physicalAttack += passive.physicalAttackPerStack * stacks;
    if (passive.spellAttackPerStack) spellAttack += passive.spellAttackPerStack * stacks;
    if (passive.hitPerStack) hitRate += passive.hitPerStack * stacks;
    if (passive.critPerStack) critChance += passive.critPerStack * stacks;
    if (passive.apsPercentPerStack) attacksPerSecond *= 1 + passive.apsPercentPerStack * stacks;
    if (passive.lifespanPerStack) maxLifespan += passive.lifespanPerStack * stacks;
  }
  player.maxHp = maxHp;
  player.maxMp = maxMp;
  player.physicalAttack = physicalAttack;
  player.spellAttack = spellAttack;
  player.physicalDefense = physicalDefense;
  player.spellDefense = spellDefense;
  player.hitRate = Math.min(0.99, hitRate);
  player.critChance = Math.min(0.6, critChance);
  player.attacksPerSecond = attacksPerSecond;
  player.maxLifespan = maxLifespan;
  player.lifespan = Math.min(player.lifespan, maxLifespan);
  player.hp = restore ? maxHp : Math.min(player.hp, maxHp);
  player.mp = restore ? maxMp : Math.min(player.mp, maxMp);
  state.inventory.capacity = inventoryCapacityWithGear(state);
  returnOverflowPotionSlots(state);
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
  revealFloorAround(floor, state.run.playerPosition, fogRevealRadius(state.player.realmLevel));
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
  const rank = entity.enemyRank ?? 'normal';
  const scaled = scaleEnemyCombatStats(entity.enemyId, rank);
  state.combat = {
    enemyEntityId: entity.id,
    enemyId: base.id,
    enemyRank: rank,
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
      hp: scaled.maxHp, maxHp: scaled.maxHp, mp: 0, maxMp: 0,
      physicalAttack: scaled.physicalAttack, spellAttack: 0,
      physicalDefense: scaled.physicalDefense, spellDefense: scaled.spellDefense,
      attacksPerSecond: scaled.attacksPerSecond
    },
    playerBasicReadyAt: 720,
    enemyBasicReadyAt: 980,
    skillReadyAt: Object.fromEntries(state.player.equippedSkills.map((id, index) => [id, 340 + index * 80])),
    queuedPotionSlot: null,
    potionReadyAt: 0,
    escapeReadyAt: 0,
    nextEscapeBonus: 0,
    awaitingAnimation: false,
    awaitingElapsedMs: 0,
    outcome: 'active',
    lastAction: null,
    nextActionId: 1
  };
  message(state, `遭遇${enemyDisplayName(base.id, rank)}。秘术将按优先级自动施放。`);
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
  combat.awaitingElapsedMs = 0;
}

function consumeBeltPotion(state: GameState, slot: number): PotionBeltSlot | null {
  if (slot < 0 || slot >= unlockedPotionSlots(state)) return null;
  const belt = state.player.potionBelt[slot];
  if (!belt || belt.count <= 0) return null;
  belt.count -= 1;
  const used = { itemId: belt.itemId, count: 1 };
  if (belt.count <= 0) state.player.potionBelt[slot] = null;
  return used;
}

function usePotionInCombat(state: GameState, slot: number): boolean {
  const combat = state.combat;
  if (!combat) return false;
  const used = consumeBeltPotion(state, slot);
  if (!used) return false;
  const potion = POTIONS[used.itemId];
  if (!potion) return false;
  const oldHp = combat.player.hp;
  const oldMp = combat.player.mp;
  combat.player.hp = Math.min(combat.player.maxHp, combat.player.hp + potion.healHp);
  combat.player.mp = Math.min(combat.player.maxMp, combat.player.mp + potion.restoreMp);
  state.player.hp = combat.player.hp;
  state.player.mp = combat.player.mp;
  if (potion.escapeBonus > 0) combat.nextEscapeBonus = potion.escapeBonus;
  combat.queuedPotionSlot = null;
  combat.potionReadyAt = combat.clockMs + POTION_COOLDOWN_MS;
  setCombatAction(combat, {
    actor: 'player', kind: 'potion', name: ITEMS[used.itemId].name,
    damage: 0, healing: combat.player.hp - oldHp, mpDelta: combat.player.mp - oldMp,
    critical: false, missed: false
  });
  if (potion.effect === 'escape' || potion.escapeBonus > 0) {
    message(state, `${ITEMS[used.itemId].name}生效：下次逃跑加权。`);
  }
  return true;
}

function usePotionOutsideCombat(state: GameState, slot: number): void {
  const used = consumeBeltPotion(state, slot);
  if (!used) {
    message(state, '该丹药槽为空。');
    return;
  }
  const potion = POTIONS[used.itemId];
  if (!potion) return;
  if (potion.effect === 'escape' && potion.healHp <= 0 && potion.restoreMp <= 0) {
    message(state, '遁丹只能在战斗中使用。');
    const restored = addItem(state.inventory.bag, state.inventory.capacity, used.itemId, 1);
    state.inventory.bag = restored.stacks;
    const current = state.player.potionBelt[slot];
    if (current && current.itemId === used.itemId) current.count += 1;
    else state.player.potionBelt[slot] = { itemId: used.itemId, count: 1 };
    return;
  }
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + potion.healHp);
  state.player.mp = Math.min(state.player.maxMp, state.player.mp + potion.restoreMp);
  message(state, `服用${ITEMS[used.itemId].name}。`);
}

function attemptEscape(state: GameState): void {
  const combat = state.combat;
  if (!combat || combat.outcome !== 'active') return;
  if (combat.awaitingAnimation) {
    message(state, '当前动作尚未结束。');
    return;
  }
  if (combat.clockMs < combat.escapeReadyAt) {
    message(state, `逃跑冷却中（${((combat.escapeReadyAt - combat.clockMs) / 1000).toFixed(1)} 秒）。`);
    return;
  }
  const chance = escapeChanceFor(state, combat.nextEscapeBonus);
  const roll = randomFromCombat(combat);
  combat.nextEscapeBonus = 0;
  combat.escapeReadyAt = combat.clockMs + escapeCooldownMs(state);
  if (roll < chance) {
    combat.outcome = 'fled';
    setCombatAction(combat, {
      actor: 'player', kind: 'escape', name: '逃遁成功', damage: 0, healing: 0, mpDelta: 0, critical: false, missed: false
    });
    message(state, `逃跑成功（${Math.round(chance * 100)}%）。`);
  } else {
    setCombatAction(combat, {
      actor: 'player', kind: 'escape', name: '逃遁失败', damage: 0, healing: 0, mpDelta: 0, critical: false, missed: true
    });
    message(state, `逃跑失败（${Math.round(chance * 100)}%）。`);
  }
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
    actor: 'enemy', kind: 'basic', name: `${enemyDisplayName(combat.enemyId, combat.enemyRank)}扑击`, damage, healing: 0, mpDelta: 0, critical, missed
  });
}

function tickCombat(state: GameState, deltaMs: number): void {
  const combat = state.combat;
  if (!combat) return;
  // 胜利/逃跑/战败都要走完结算；战败若早退会卡在 0 血战斗里（刷新后更明显）
  if (combat.outcome === 'victory' || combat.outcome === 'fled' || combat.outcome === 'defeat') {
    if (combat.awaitingAnimation) {
      combat.awaitingElapsedMs += Math.min(120, Math.max(0, deltaMs));
      if (combat.awaitingElapsedMs >= ANIMATION_STUCK_MS) finishCombatAnimation(state);
    } else {
      // 读档清掉 awaitingAnimation 后，终端态仍需立刻结算
      finishCombatAnimation(state);
    }
    return;
  }
  if (combat.awaitingAnimation) {
    const step = Math.min(120, Math.max(0, deltaMs));
    combat.awaitingElapsedMs += step;
    // 动画等待期间时钟继续走，秘术雷达才能连贯转圈
    combat.clockMs += step;
    if (combat.awaitingElapsedMs >= ANIMATION_STUCK_MS) {
      combat.awaitingAnimation = false;
      combat.awaitingElapsedMs = 0;
    } else {
      return;
    }
  }
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

function addLoot(state: GameState, stacks: ItemStack[], dropAt?: Position): void {
  const luck = state.reincarnation.talents.lucky_drop ?? 0;
  const leftovers: ItemStack[] = [];
  for (const stack of stacks) {
    const count = stack.count + (luck > 0 && stack.count > 0 ? Math.min(luck, 2) : 0);
    const result = addItem(state.inventory.bag, state.inventory.capacity, stack.itemId, count);
    state.inventory.bag = result.stacks;
    if (result.added < count) leftovers.push({ itemId: stack.itemId, count: count - result.added });
  }
  if (leftovers.length === 0 || !state.run || !dropAt) {
    if (leftovers.length > 0) message(state, '背包已满，部分战利品遗落。');
    return;
  }
  const floor = currentFloor(state.run);
  for (const leftover of leftovers) {
    const existing = floor.entities.find((entity) => (
      !entity.cleared
      && entity.kind === 'resource'
      && entity.itemId === leftover.itemId
      && positionEquals(entity.position, dropAt)
    ));
    if (existing) {
      existing.count = (existing.count ?? 0) + leftover.count;
      continue;
    }
    floor.entities.push({
      id: `loot-${dropAt.x}-${dropAt.y}-${leftover.itemId}-${floor.entities.length}`,
      kind: 'resource',
      position: { ...dropAt },
      itemId: leftover.itemId,
      count: leftover.count
    });
  }
}

function pickupResourcesAt(state: GameState, position: Position): string[] {
  if (!state.run) return [];
  const floor = currentFloor(state.run);
  const resources = floor.entities.filter((entity) => (
    !entity.cleared && entity.kind === 'resource' && entity.itemId && positionEquals(entity.position, position)
  ));
  const lines: string[] = [];
  for (const entity of resources) {
    const want = entity.count ?? 1;
    const result = addItem(state.inventory.bag, state.inventory.capacity, entity.itemId!, want);
    state.inventory.bag = result.stacks;
    const name = ITEMS[entity.itemId!]?.name ?? entity.itemId!;
    if (result.added === want) {
      entity.cleared = true;
      lines.push(`采得 ${name} ×${want}`);
    } else if (result.added > 0) {
      entity.count = want - result.added;
      lines.push(`背包将满，只装下 ${name} ×${result.added}`);
      message(state, '背包空间不足。');
    } else {
      message(state, '背包已满，资源仍留在原地。');
      break;
    }
  }
  return lines;
}

function awardExperience(state: GameState, amount: number): string | null {
  state.player.exp += amount;
  const oldLevel = state.player.realmLevel;
  let nextLevel = 1;
  for (let level = REALM_EXP_THRESHOLDS.length; level >= 2; level -= 1) {
    if (state.player.exp >= REALM_EXP_THRESHOLDS[level - 1]) {
      nextLevel = level;
      break;
    }
  }
  state.player.realmLevel = nextLevel;
  state.player.realm = REALM_BY_LEVEL[state.player.realmLevel];
  state.player.peakRealmLevel = Math.max(state.player.peakRealmLevel, state.player.realmLevel);
  if (state.player.realmLevel > oldLevel) {
    state.player.maxLifespan += 40 * (state.player.realmLevel - oldLevel);
    state.player.lifespan += 40 * (state.player.realmLevel - oldLevel);
    recalculatePlayer(state, true);
    return `境界突破至${state.player.realm}，状态全部恢复`;
  }
  return null;
}

function finishCombatAnimation(state: GameState): void {
  const combat = state.combat;
  if (!combat) return;
  combat.awaitingAnimation = false;
  combat.awaitingElapsedMs = 0;
  if (combat.outcome === 'active') return;
  if (combat.outcome === 'defeat') {
    handleDeath(state, `败于${enemyDisplayName(combat.enemyId, combat.enemyRank)}`);
    return;
  }
  if (!state.run) return;
  state.player.hp = combat.player.hp;
  state.player.mp = combat.player.mp;
  if (combat.outcome === 'fled') {
    state.combat = null;
    message(state, '你抽身离开，未获战利品。');
    return;
  }
  const floor = currentFloor(state.run);
  const entity = floor.entities.find((candidate) => candidate.id === combat.enemyEntityId);
  if (entity) entity.cleared = true;
  state.run.playerPosition = { ...combat.targetPosition };
  revealFloorAround(floor, state.run.playerPosition, fogRevealRadius(state.player.realmLevel));
  const enemy = ENEMIES[combat.enemyId];
  const rank = combat.enemyRank ?? entity?.enemyRank ?? 'normal';
  const expGain = scaledEnemyExp(combat.enemyId, rank);
  const loot = scaledEnemyLoot(combat.enemyId, rank);
  const luck = state.reincarnation.talents.lucky_drop ?? 0;
  const lines: string[] = [`击败「${enemyDisplayName(combat.enemyId, rank)}」`, `修为 +${expGain}`];
  for (const stack of loot) {
    const count = stack.count + (luck > 0 && stack.count > 0 ? Math.min(luck, 2) : 0);
    lines.push(`掉落 ${ITEMS[stack.itemId]?.name ?? stack.itemId} ×${count}`);
  }
  addLoot(state, loot, combat.targetPosition);
  if (enemy.passiveLoot?.length) {
    const pick = enemy.passiveLoot[Math.floor(randomFromCombat(combat) * enemy.passiveLoot.length) % enemy.passiveLoot.length];
    if (randomFromCombat(combat) < 0.45) {
      const before = state.player.passives[pick] ?? 0;
      if (grantPassive(state, pick, { silent: true })) {
        lines.push(`领悟心法「${PASSIVES[pick].name}」· ${before + 1} 层`);
      }
    }
  }
  if (enemy.skillLoot?.length) {
    const pick = enemy.skillLoot[Math.floor(randomFromCombat(combat) * enemy.skillLoot.length) % enemy.skillLoot.length];
    if (randomFromCombat(combat) < 0.35) {
      if (grantSkill(state, pick, { silent: true })) {
        const auto = state.player.equippedSkills.includes(pick);
        lines.push(auto
          ? `领悟秘术「${SKILLS[pick].name}」，已自动装配`
          : `领悟秘术「${SKILLS[pick].name}」（装配已满，可在行囊切换）`);
      }
    }
  }
  const breakthrough = awardExperience(state, expGain);
  if (breakthrough) lines.push(breakthrough);
  pickupResourcesAt(state, combat.targetPosition);
  const overflowLeft = currentFloor(state.run).entities.some((candidate) => (
    !candidate.cleared
    && candidate.kind === 'resource'
    && candidate.id.startsWith('loot-')
    && positionEquals(candidate.position, combat.targetPosition)
  ));
  if (overflowLeft) lines.push('背包已满，多余战利品留在原地');
  state.combat = null;
  showPopup(state, '战斗胜利', lines);
  message(state, '战斗结束，点开结算继续。');
}

function interactAfterMove(state: GameState, entity: MapEntity | undefined): void {
  if (!state.run || !entity) return;
  const floor = currentFloor(state.run);
  const lines: string[] = [];
  let title = '机缘';
  if (entity.kind === 'resource' || floor.entities.some((candidate) => (
    !candidate.cleared && candidate.kind === 'resource' && positionEquals(candidate.position, state.run!.playerPosition)
  ))) {
    lines.push(...pickupResourcesAt(state, state.run.playerPosition));
    if (lines.length) title = '采撷';
  }
  const focus = entity.kind === 'resource'
    ? floor.entities.find((candidate) => (
      !candidate.cleared
      && positionEquals(candidate.position, state.run!.playerPosition)
      && candidate.kind !== 'resource'
    ))
    : entity;
  if (!focus) {
    revealFloorAround(floor, state.run.playerPosition, fogRevealRadius(state.player.realmLevel));
    if (lines.length) {
      showPopup(state, title, lines);
      message(state, '收获已结算。');
    }
    return;
  }
  if (focus.kind === 'spring') {
    state.player.hp = state.player.maxHp;
    state.player.mp = state.player.maxMp;
    focus.cleared = true;
    title = '灵泉';
    lines.push('灵泉一次涤尽疲敝', '气血与灵气已回满', '泉眼已枯竭消散');
  } else if (focus.kind === 'secret') {
    title = '秘境机缘';
    if (focus.passiveId) {
      const before = state.player.passives[focus.passiveId] ?? 0;
      const definition = PASSIVES[focus.passiveId];
      if (grantPassive(state, focus.passiveId, { silent: true })) {
        focus.cleared = true;
        lines.push(`领悟心法「${definition.name}」· ${before + 1} 层`);
        if (definition.description) lines.push(definition.description);
      } else {
        lines.push(`心法「${definition?.name ?? focus.passiveId}」已达最大层数，机缘未能吸收`);
      }
    } else if (focus.skillId) {
      const definition = SKILLS[focus.skillId];
      const learned = grantSkill(state, focus.skillId, { silent: true });
      focus.cleared = true;
      if (learned) {
        const auto = state.player.equippedSkills.includes(focus.skillId);
        lines.push(auto
          ? `领悟秘术「${definition.name}」，已自动装配`
          : `领悟秘术「${definition.name}」（装配已满，可在行囊切换）`);
        if (definition.description) lines.push(definition.description);
      } else {
        lines.push(`秘术「${definition?.name ?? focus.skillId}」早已掌握`);
      }
    } else if (focus.rewardId) {
      const result = addItem(state.inventory.bag, state.inventory.capacity, focus.rewardId, 1);
      state.inventory.bag = result.stacks;
      const item = ITEMS[focus.rewardId];
      if (result.added === 1) {
        focus.cleared = true;
        lines.push(`获得 ${item?.name ?? focus.rewardId}`);
        if (item?.description) lines.push(item.description);
      } else {
        lines.push(`背包已满，${item?.name ?? '奖励'}暂未领取`);
        message(state, '背包已满，秘境奖励暂未领取。');
      }
    }
  } else if (focus.kind === 'return' || focus.kind === 'depth') {
    state.run.pendingInteractionId = focus.id;
    message(state, focus.kind === 'return' ? '回府阵已亮起，可结束本趟探索。' : '传送门已开启，可前往下一层。');
  }
  revealFloorAround(floor, state.run.playerPosition, fogRevealRadius(state.player.realmLevel));
  if (lines.length) {
    showPopup(state, title, lines);
    message(state, title === '采撷' ? '收获已结算。' : `${title}已触发。`);
  }
}

function movePlayer(state: GameState, direction: keyof typeof DIRECTION_DELTA): void {
  if (state.scene !== 'explore' || !state.run || state.combat || hasPopup(state)) return;
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
  revealFloorAround(floor, target, fogRevealRadius(state.player.realmLevel));
  if (consumeExplorationStep(state)) return;
  interactAfterMove(state, entity);
}

function returnToCave(state: GameState): void {
  if (!state.run || state.scene !== 'explore' || state.combat || hasPopup(state)) return;
  const floor = currentFloor(state.run);
  const entity = floor.entities.find((candidate) => candidate.id === state.run?.pendingInteractionId);
  if (!entity || entity.kind !== 'return' || !positionEquals(entity.position, state.run.playerPosition)) return;
  const years = state.run.spentYears;
  state.cave.mineStored += Math.round(mineYieldPerYear(state.cave.mineLevel) * years);
  state.player.hp = state.player.maxHp;
  state.player.mp = state.player.maxMp;
  state.run = null;
  state.combat = null;
  state.scene = 'cave';
  message(state, `平安回府。本趟消耗 ${years} 年，灵矿累积了新的产出。`);
}

function advanceFloor(state: GameState): void {
  if (!state.run || state.combat || hasPopup(state)) return;
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
  revealFloorAround(nextFloor, state.run.playerPosition, fogRevealRadius(state.player.realmLevel));
  message(state, `进入第 ${state.run.floor}/${state.run.maxFloors} 层。`);
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
  if ((recipe.requiredLevel ?? 1) > facilityLevel) {
    message(state, `该配方需要对应设施达到 ${recipe.requiredLevel} 级。`);
    return;
  }
  const available = mergeSources(state.inventory.bag, state.inventory.warehouse);
  if (state.cave.spiritStones < recipe.spiritStoneCost || !canAfford(available, recipe.ingredients)) {
    message(state, '材料或灵石不足。');
    return;
  }
  const alchemyBonus = recipe.facility === 'alchemy' ? (state.reincarnation.talents.alchemy_gift ?? 0) : 0;
  const outputCount = recipe.output.count + alchemyBonus;
  const output = addItem(state.inventory.warehouse, state.inventory.warehouseCapacity, recipe.output.itemId, outputCount);
  if (output.added !== outputCount) {
    message(state, '仓库已满，无法炼制。');
    return;
  }
  removeCostsFromBagAndWarehouse(state, recipe.ingredients);
  state.inventory.warehouse = output.stacks;
  state.cave.spiritStones -= recipe.spiritStoneCost;
  const bonusText = alchemyBonus > 0 ? `（丹缘 +${alchemyBonus}）` : '';
  message(state, `${recipe.name}成功${bonusText}，产物已入仓库。`);
}

function upgradeFacility(state: GameState, facility: 'mine' | 'alchemy' | 'forge'): void {
  if (state.scene !== 'cave') return;
  const key = facility === 'mine' ? 'mineLevel' : facility === 'alchemy' ? 'alchemyLevel' : 'forgeLevel';
  const current = state.cave[key];
  if (current >= 3) {
    message(state, '首版设施最高为 3 级。');
    return;
  }
  const cost = facilityUpgradeCost(current);
  if (state.cave.spiritStones < cost) {
    message(state, `升级需要 ${cost} 灵石。`);
    return;
  }
  state.cave.spiritStones -= cost;
  state.cave[key] = current + 1;
  if (facility === 'mine') {
    ensureMineFields(state);
    const max = mineBreathMax(state.cave.mineLevel);
    state.cave.mineBreath = Math.max(state.cave.mineBreath, Math.min(max, state.cave.mineBreath + 5));
    if (state.cave.mineBreath > max) state.cave.mineBreath = max;
    state.cave.mineBreathAt = Date.now();
  }
  const name = facility === 'mine' ? '采矿' : facility === 'alchemy' ? '炼丹' : '炼器';
  message(state, `${name}设施提升至 ${current + 1} 级。`);
}

function equipItem(state: GameState, itemId: string): void {
  if (!canManageLoadout(state)) return;
  const item = ITEMS[itemId];
  if (!item?.equipmentSlot) return;
  const inBag = itemCount(state.inventory.bag, itemId);
  const inWarehouse = state.scene === 'cave' ? itemCount(state.inventory.warehouse, itemId) : 0;
  if (inBag + inWarehouse <= 0) return;
  const slot: EquipmentSlot = item.equipmentSlot;
  const previous = state.player.equipment[slot];
  const fieldMode = state.scene === 'explore';

  if (fieldMode) {
    if (inBag <= 0) {
      message(state, '野外只能装备身上行囊中的法宝。');
      return;
    }
    if (previous) {
      const canStore = addItem(state.inventory.bag, state.inventory.capacity, previous, 1);
      if (canStore.added !== 1) {
        message(state, '行囊已满，无法卸下旧装备，换装取消。');
        return;
      }
    }
    state.inventory.bag = removeItem(state.inventory.bag, itemId, 1).stacks;
    if (previous) {
      state.inventory.bag = addItem(state.inventory.bag, state.inventory.capacity, previous, 1).stacks;
    }
  } else {
    if (previous) {
      const canStore = addItem(state.inventory.warehouse, state.inventory.warehouseCapacity, previous, 1);
      if (canStore.added !== 1) {
        message(state, '仓库已满，无法卸下旧装备，换装取消。');
        return;
      }
    }
    if (inBag > 0) state.inventory.bag = removeItem(state.inventory.bag, itemId, 1).stacks;
    else state.inventory.warehouse = removeItem(state.inventory.warehouse, itemId, 1).stacks;
    if (previous) {
      state.inventory.warehouse = addItem(state.inventory.warehouse, state.inventory.warehouseCapacity, previous, 1).stacks;
    }
  }

  state.player.equipment[slot] = itemId;
  recalculatePlayer(state);
  message(state, `已装备${item.name}。`);
}

function assignPotion(state: GameState, itemId: string, slot: number): void {
  if (!canManageLoadout(state)) return;
  if (!POTIONS[itemId] || ITEMS[itemId]?.kind !== 'potion') return;
  if (slot < 0 || slot >= unlockedPotionSlots(state)) {
    message(state, '该丹药槽尚未解锁，请先装备更高阶腰带。');
    return;
  }
  const available = itemCount(state.inventory.bag, itemId);
  if (available <= 0) {
    message(state, '背包中没有这味丹药。');
    return;
  }
  const existing = state.player.potionBelt[slot];
  if (existing && existing.itemId !== itemId) {
    const returned = addItem(state.inventory.bag, state.inventory.capacity, existing.itemId, existing.count);
    state.inventory.bag = returned.stacks;
    state.player.potionBelt[slot] = null;
  }
  const removed = removeItem(state.inventory.bag, itemId, available);
  state.inventory.bag = removed.stacks;
  const current = state.player.potionBelt[slot];
  if (current && current.itemId === itemId) current.count += removed.removed;
  else state.player.potionBelt[slot] = { itemId, count: removed.removed };
  message(state, `${ITEMS[itemId].name}已挂到丹药槽 ${slot + 1}。`);
}

function clearPotionSlot(state: GameState, slot: number): void {
  if (!canManageLoadout(state)) return;
  const belt = state.player.potionBelt[slot];
  if (!belt) return;
  const added = addItem(state.inventory.bag, state.inventory.capacity, belt.itemId, belt.count);
  state.inventory.bag = added.stacks;
  if (added.added < belt.count) {
    message(state, '背包空间不足，无法卸下全部丹药。');
    belt.count -= added.added;
    return;
  }
  state.player.potionBelt[slot] = null;
  message(state, `${ITEMS[belt.itemId].name}已卸回背包。`);
}

function handleDeath(state: GameState, reason: string): void {
  const reward = 10 + state.player.peakRealmLevel * 15;
  state.reincarnation.karma += reward;
  state.reincarnation.pendingKarma = reward;
  state.reincarnation.totalDeaths += 1;
  state.reincarnation.lastDeathReason = reason;
  state.reincarnation.offeredTalents = pickOfferedTalents(state.meta.diagnosticSeed, state.reincarnation.totalDeaths);
  state.inventory.bag = [];
  state.run = null;
  state.combat = null;
  state.player.hp = 0;
  state.scene = 'reincarnation';
  message(state, `${reason}。获得 ${reward} 因果。本次可选强化三项天赋。`);
}

function buyTalent(state: GameState, talentId: string): void {
  if (state.scene !== 'reincarnation') return;
  const talent = TALENTS[talentId];
  if (!talent) return;
  if (!state.reincarnation.offeredTalents.includes(talentId)) {
    message(state, '本次轮回未提供该天赋。');
    return;
  }
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
  const keptPassives = { ...state.player.passives };
  const keptLearned = [...state.player.learnedSkills];
  state.player = basePlayer(state.reincarnation);
  state.player.passives = keptPassives;
  state.player.learnedSkills = keptLearned.length > 0 ? keptLearned : state.player.learnedSkills;
  state.player.equippedSkills = state.player.learnedSkills
    .filter((id) => SKILLS[id])
    .slice(0, MAX_EQUIPPED_SKILLS);
  if (state.player.equippedSkills.length === 0) {
    state.player.learnedSkills = ['firebolt', 'sword_art'];
    state.player.equippedSkills = ['firebolt', 'sword_art'];
  }
  recalculatePlayer(state, true);
  state.inventory.capacity = inventoryCapacityWithGear(state);
  state.player.potionBelt = emptyPotionBelt();
  state.player.potionBelt[0] = { itemId: 'pill_heal_s', count: 2 };
  state.inventory.bag = [
    { itemId: 'pill_mana_s', count: 1 },
    { itemId: 'pill_escape_s', count: 1 }
  ];
  state.reincarnation.pendingKarma = 0;
  state.reincarnation.offeredTalents = [];
  state.scene = 'cave';
  message(state, `第 ${state.reincarnation.totalDeaths + 1} 世开始。洞府、仓库、心法与秘术仍在。`);
}

function applyCheat(state: GameState): void {
  // 已开启则恢复快照（由 dispatch 侧整页替换）；此处只负责开启
  if (state.scene !== 'cave' && state.scene !== 'select') {
    message(state, '请先回到洞府再开风灵月影。');
    return;
  }
  const snapshot = deepClone(state);
  snapshot.cheatRestore = null;
  state.cheatRestore = snapshot;
  state.scene = 'cave';
  state.run = null;
  state.combat = null;
  state.popup = null;
  state.player.realmLevel = 5;
  state.player.realm = '化神';
  state.player.peakRealmLevel = 5;
  state.player.exp = 7000;
  state.player.lifespan = 480;
  state.player.maxLifespan = 480;
  state.player.learnedSkills = Object.keys(SKILLS);
  state.player.equippedSkills = Object.values(SKILLS)
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .slice(0, MAX_EQUIPPED_SKILLS)
    .map((skill) => skill.id);
  for (const passiveId of Object.keys(PASSIVES)) {
    state.player.passives[passiveId] = Math.min(3, PASSIVES[passiveId].maxStacks);
  }
  for (const slot of Object.keys(BEST_GEAR) as EquipmentSlot[]) {
    state.player.equipment[slot] = BEST_GEAR[slot];
  }
  state.player.potionBelt = BEST_POTIONS.map((itemId) => ({ itemId, count: 20 }));
  state.cave.spiritStones = Math.max(state.cave.spiritStones, 9999);
  state.cave.mineLevel = 3;
  state.cave.alchemyLevel = 3;
  state.cave.forgeLevel = 3;
  ensureMineFields(state);
  state.cave.mineBreath = mineBreathMax(3);
  state.cave.mineBreathAt = Date.now();
  state.inventory.warehouseCapacity = Math.max(state.inventory.warehouseCapacity, 80);
  const stash = [
    { itemId: 'pill_heal_6', count: 30 },
    { itemId: 'pill_mana_6', count: 30 },
    { itemId: 'pill_escape_6', count: 20 },
    { itemId: 'immortal_ash', count: 12 },
    { itemId: 'void_crystal', count: 12 }
  ];
  for (const stack of stash) {
    state.inventory.warehouse = addItem(
      state.inventory.warehouse,
      state.inventory.warehouseCapacity,
      stack.itemId,
      stack.count
    ).stacks;
  }
  recalculatePlayer(state, true);
  message(state, '风灵月影已开：化神满配。再点一次可恢复开启前存档。');
}

function restoreCheat(state: GameState): GameState | null {
  if (!state.cheatRestore) return null;
  const restored = deepClone(state.cheatRestore);
  restored.cheatRestore = null;
  restored.meta.buildVersion = state.meta.buildVersion;
  restored.meta.message = '风灵月影已关，已恢复开启前状态。';
  return restored;
}

export function migrateGameState(raw: unknown): GameState {
  if (!raw || typeof raw !== 'object') throw new Error('存档状态无效');
  const state = deepClone(raw as GameState);
  const player = state.player as PlayerState & {
    equippedPassives?: string[];
    potionSlots?: Array<string | null>;
  };
  if (!player.equipment) player.equipment = { ...EMPTY_EQUIPMENT };
  for (const slot of Object.keys(EMPTY_EQUIPMENT) as EquipmentSlot[]) {
    if (!(slot in player.equipment)) player.equipment[slot] = null;
  }
  if (!player.passives) {
    player.passives = {};
    for (const name of player.equippedPassives ?? []) {
      if (name.includes('脱胎') || name.includes('吐纳')) player.passives.rebirth_body = (player.passives.rebirth_body ?? 0) + 1;
      if (name.includes('铁骨')) player.passives.iron_bone = (player.passives.iron_bone ?? 0) + 1;
    }
  }
  delete player.equippedPassives;
  if (!player.learnedSkills) {
    player.learnedSkills = [...(player.equippedSkills ?? ['firebolt', 'sword_art'])];
  }
  player.learnedSkills = player.learnedSkills.filter((id) => SKILLS[id]);
  if (player.learnedSkills.length === 0) player.learnedSkills = ['firebolt', 'sword_art'];
  player.equippedSkills = (player.equippedSkills ?? [])
    .filter((id) => player.learnedSkills.includes(id) && SKILLS[id])
    .slice(0, MAX_EQUIPPED_SKILLS);
  if (player.equippedSkills.length === 0) {
    player.equippedSkills = player.learnedSkills.slice(0, Math.min(2, MAX_EQUIPPED_SKILLS));
  }
  if (!player.potionBelt) {
    player.potionBelt = emptyPotionBelt();
    const legacy = player.potionSlots ?? [];
    legacy.forEach((itemId, index) => {
      if (!itemId || index >= MAX_POTION_SLOTS) return;
      const mapped = ITEM_ID_ALIASES[itemId] ?? (POTIONS[itemId] ? itemId : null);
      if (!mapped) return;
      const fromBag = itemCount(state.inventory.bag, itemId) + itemCount(state.inventory.bag, mapped);
      const count = Math.max(1, Math.min(3, fromBag || 1));
      if (itemCount(state.inventory.bag, itemId) > 0) {
        state.inventory.bag = removeItem(state.inventory.bag, itemId, count).stacks;
      } else if (itemCount(state.inventory.bag, mapped) > 0) {
        state.inventory.bag = removeItem(state.inventory.bag, mapped, count).stacks;
      }
      player.potionBelt[index] = { itemId: mapped, count };
    });
  }
  delete player.potionSlots;
  const remapStack = (stack: ItemStack): ItemStack => ({
    itemId: ITEM_ID_ALIASES[stack.itemId] ?? stack.itemId,
    count: stack.count
  });
  state.inventory.bag = state.inventory.bag.map(remapStack).filter((stack) => ITEMS[stack.itemId]);
  state.inventory.warehouse = state.inventory.warehouse.map(remapStack).filter((stack) => ITEMS[stack.itemId]);
  for (const slot of Object.keys(player.equipment) as EquipmentSlot[]) {
    const itemId = player.equipment[slot];
    if (itemId && !ITEMS[itemId]) player.equipment[slot] = null;
  }
  if (!state.reincarnation.offeredTalents) state.reincarnation.offeredTalents = [];
  if (state.combat) {
    state.combat.escapeReadyAt = state.combat.escapeReadyAt ?? 0;
    state.combat.nextEscapeBonus = state.combat.nextEscapeBonus ?? 0;
    state.combat.awaitingElapsedMs = state.combat.awaitingElapsedMs ?? 0;
    state.combat.enemyRank = state.combat.enemyRank ?? 'normal';
    if (state.combat.awaitingAnimation) {
      state.combat.awaitingAnimation = false;
      state.combat.awaitingElapsedMs = 0;
    }
  }
  if (player.realmLevel >= 5) player.realm = '化神';
  else if (player.realmLevel >= 4) player.realm = '元婴';
  else if (player.realmLevel >= 3) player.realm = '结丹';
  else if (player.realmLevel >= 2) player.realm = '筑基';
  else player.realm = '炼气';
  if (!('popup' in state) || state.popup === undefined) state.popup = null;
  if (!('cheatRestore' in state) || state.cheatRestore === undefined) state.cheatRestore = null;
  ensureMineFields(state);
  if (state.run?.floors) {
    for (const floor of state.run.floors) {
      for (const entity of floor.entities) {
        if ((entity.kind as string) === 'town') {
          entity.kind = 'spring';
          if (entity.id.startsWith('town-')) entity.id = entity.id.replace(/^town-/, 'spring-');
        }
        if (entity.kind === 'enemy' && !entity.enemyRank) entity.enemyRank = 'normal';
      }
    }
  }
  state.meta.saveVersion = SAVE_VERSION;
  state.meta.contentVersion = CONTENT_VERSION;
  recalculatePlayer(state);
  return state;
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
    case 'QUEUE_POTION': {
      if (command.slot < 0 || command.slot >= unlockedPotionSlots(state)) {
        message(state, '该丹药槽尚未解锁。');
        break;
      }
      const belt = state.player.potionBelt[command.slot];
      if (!belt || belt.count <= 0) {
        message(state, '该丹药槽为空。');
        break;
      }
      if (state.combat) {
        if (state.combat.outcome !== 'active') break;
        if (state.combat.clockMs < state.combat.potionReadyAt) {
          message(state, '丹药仍在冷却。');
          break;
        }
        state.combat.queuedPotionSlot = command.slot;
        message(state, '丹药已排队，将在当前动作结束后服用。');
      } else usePotionOutsideCombat(state, command.slot);
      break;
    }
    case 'ASSIGN_POTION': assignPotion(state, command.itemId, command.slot); break;
    case 'CLEAR_POTION_SLOT': clearPotionSlot(state, command.slot); break;
    case 'ATTEMPT_ESCAPE': attemptEscape(state); break;
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
    case 'MANUAL_MINE':
      manualMineStrike(state);
      break;
    case 'UPGRADE_FACILITY': upgradeFacility(state, command.facility); break;
    case 'CRAFT': craft(state, command.recipeId); break;
    case 'EQUIP': equipItem(state, command.itemId); break;
    case 'TOGGLE_SKILL': toggleSkill(state, command.skillId); break;
    case 'BUY_TALENT': buyTalent(state, command.talentId); break;
    case 'REINCARNATE': reincarnate(state); break;
    case 'APPLY_CHEAT': {
      const restored = restoreCheat(state);
      if (restored) return { state: restored, shouldSave: true };
      applyCheat(state);
      break;
    }
    case 'RESET_GAME': return { state: createInitialState(input.meta.buildVersion, input.meta.diagnosticSeed), shouldSave: true };
    case 'SET_MESSAGE': message(state, command.message); break;
    case 'DISMISS_POPUP':
      state.popup = null;
      break;
  }
  return { state, shouldSave };
}

export function talentCost(state: GameState, talentId: string): number {
  return 10 * ((state.reincarnation.talents[talentId] ?? 0) + 1);
}
