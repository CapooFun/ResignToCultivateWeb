export type SceneId = 'cave' | 'select' | 'explore' | 'reincarnation';
export type MapTier = 'S' | 'M' | 'L';
export type Realm = '炼气' | '筑基' | '结丹' | '元婴' | '化神';
export type Terrain = 'plain' | 'forest' | 'water' | 'mountain';
export type EntityKind = 'enemy' | 'resource' | 'spring' | 'secret' | 'return' | 'depth';
export type EnemyRank = 'normal' | 'elite' | 'boss';
export type ItemKind = 'material' | 'potion' | 'equipment';
export type EquipmentSlot = 'melee' | 'ranged' | 'armor' | 'ring' | 'shoes' | 'belt';
export type DamageType = 'physical' | 'spell';
export type PotionEffect = 'heal' | 'mana' | 'escape';
/** 与裸辞修仙传 Enums.Quality 对齐：凡品/灵器/灵宝/玄天灵宝/通天灵宝/？？？ */
export type ItemQuality = '凡品' | '灵器' | '灵宝' | '玄天灵宝' | '通天灵宝' | '？？？';

export interface Position {
  x: number;
  y: number;
}

export interface Tile {
  terrain: Terrain;
  revealed: boolean;
}

export interface MapEntity {
  id: string;
  kind: EntityKind;
  position: Position;
  enemyId?: string;
  enemyRank?: EnemyRank;
  itemId?: string;
  count?: number;
  rewardId?: string;
  passiveId?: string;
  skillId?: string;
  cleared?: boolean;
}

export interface FloorSnapshot {
  floor: number;
  width: number;
  height: number;
  seed: number;
  tiles: Tile[][];
  entities: MapEntity[];
  spawn: Position;
}

export interface RunSession {
  runId: string;
  seed: number;
  baseSeed: number;
  generatorVersion: number;
  sizeTier: MapTier;
  floor: number;
  maxFloors: number;
  travelCostYears: number;
  travelCostPaid: boolean;
  playerPosition: Position;
  stepRemainder: number;
  totalSteps: number;
  spentYears: number;
  floors: FloorSnapshot[];
  pendingInteractionId: string | null;
}

export interface ItemStack {
  itemId: string;
  count: number;
}

export interface PotionBeltSlot {
  itemId: string;
  count: number;
}

export interface ItemDefinition {
  id: string;
  name: string;
  kind: ItemKind;
  description: string;
  maxStack: number;
  quality?: ItemQuality;
  equipmentSlot?: EquipmentSlot;
  bagSlots?: number;
  physicalAttack?: number;
  spellAttack?: number;
  physicalDefense?: number;
  spellDefense?: number;
  escapeChanceBonus?: number;
  escapeCooldownReductionMs?: number;
  potionSlotBonus?: number;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  damageType: DamageType;
  multiplier: number;
  mpCost: number;
  cooldownMs: number;
  priority: number;
  quality?: ItemQuality;
}

export interface PotionDefinition {
  itemId: string;
  effect: PotionEffect;
  healHp: number;
  restoreMp: number;
  escapeBonus: number;
  glyph: '血' | '灵' | '遁';
  tier?: number;
}

export interface PassiveDefinition {
  id: string;
  name: string;
  description: string;
  maxStacks: number;
  quality?: ItemQuality;
  hpPercentPerStack?: number;
  mpPercentPerStack?: number;
  physicalDefensePerStack?: number;
  spellDefensePerStack?: number;
  physicalAttackPerStack?: number;
  spellAttackPerStack?: number;
  hitPerStack?: number;
  critPerStack?: number;
  apsPercentPerStack?: number;
  lifespanPerStack?: number;
}

export interface EnemyDefinition {
  id: string;
  name: string;
  maxHp: number;
  physicalAttack: number;
  physicalDefense: number;
  spellDefense: number;
  attacksPerSecond: number;
  exp: number;
  loot: ItemStack[];
  passiveLoot?: string[];
  skillLoot?: string[];
  quality?: ItemQuality;
}

export interface RecipeDefinition {
  id: string;
  name: string;
  facility: 'alchemy' | 'forge';
  ingredients: ItemStack[];
  spiritStoneCost: number;
  output: ItemStack;
  requiredLevel?: number;
}

export interface TalentDefinition {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  quality?: ItemQuality;
}

export interface PlayerState {
  realm: Realm;
  realmLevel: number;
  exp: number;
  peakRealmLevel: number;
  lifespan: number;
  maxLifespan: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  strength: number;
  constitution: number;
  spirit: number;
  sense: number;
  agility: number;
  physicalAttack: number;
  spellAttack: number;
  physicalDefense: number;
  spellDefense: number;
  hitRate: number;
  critChance: number;
  critMultiplier: number;
  attacksPerSecond: number;
  learnedSkills: string[];
  equippedSkills: string[];
  passives: Record<string, number>;
  equipment: Record<EquipmentSlot, string | null>;
  potionBelt: Array<PotionBeltSlot | null>;
}

/** 最近一次手动叩击结果，供 UI 播动画；不参与长期规则。 */
export interface MineStrikeFx {
  id: number;
  amount: number;
  jackpot: boolean;
  breathLeft: number;
  breathMax: number;
}

export interface CaveState {
  spiritStones: number;
  mineLevel: number;
  mineStored: number;
  alchemyLevel: number;
  forgeLevel: number;
  /** 当前灵息（可小数，用于平滑回复展示） */
  mineBreath: number;
  /** 上次结算灵息时的时间戳 */
  mineBreathAt: number;
  mineRngState: number;
  mineStrikeSeq: number;
  lastMineStrike: MineStrikeFx | null;
}

export interface InventoryState {
  capacity: number;
  bag: ItemStack[];
  warehouseCapacity: number;
  warehouse: ItemStack[];
}

export interface CombatantSnapshot {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  physicalAttack: number;
  spellAttack: number;
  physicalDefense: number;
  spellDefense: number;
  attacksPerSecond: number;
}

export interface CombatActionEvent {
  id: number;
  actor: 'player' | 'enemy';
  kind: 'basic' | 'skill' | 'potion' | 'escape';
  name: string;
  damage: number;
  healing: number;
  mpDelta: number;
  critical: boolean;
  missed: boolean;
}

export interface CombatState {
  enemyEntityId: string;
  enemyId: string;
  enemyRank: EnemyRank;
  targetPosition: Position;
  clockMs: number;
  rngState: number;
  player: CombatantSnapshot;
  enemy: CombatantSnapshot;
  playerBasicReadyAt: number;
  enemyBasicReadyAt: number;
  skillReadyAt: Record<string, number>;
  queuedPotionSlot: number | null;
  potionReadyAt: number;
  escapeReadyAt: number;
  nextEscapeBonus: number;
  awaitingAnimation: boolean;
  awaitingElapsedMs: number;
  outcome: 'active' | 'victory' | 'defeat' | 'fled';
  lastAction: CombatActionEvent | null;
  nextActionId: number;
}

export interface ReincarnationState {
  karma: number;
  totalDeaths: number;
  talents: Record<string, number>;
  offeredTalents: string[];
  pendingKarma: number;
  lastDeathReason: string | null;
}

export interface MetaState {
  saveVersion: number;
  contentVersion: number;
  buildVersion: string;
  createdAt: number;
  updatedAt: number;
  message: string;
  diagnosticSeed: number;
}

/** 关键奖励 / 事件结果弹窗；底部通知条只承载次要提示。 */
export interface GamePopup {
  title: string;
  lines: string[];
}

export interface GameState {
  scene: SceneId;
  meta: MetaState;
  player: PlayerState;
  cave: CaveState;
  inventory: InventoryState;
  run: RunSession | null;
  combat: CombatState | null;
  reincarnation: ReincarnationState;
  popup: GamePopup | null;
}

export interface SaveEnvelope {
  saveVersion: number;
  contentVersion: number;
  buildVersion: string;
  savedAt: number;
  state: GameState;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export type GameCommand =
  | { type: 'OPEN_SELECT' }
  | { type: 'CLOSE_SELECT' }
  | { type: 'START_RUN'; tier: MapTier; seed?: number }
  | { type: 'MOVE'; direction: Direction }
  | { type: 'RETURN_CAVE' }
  | { type: 'ADVANCE_FLOOR' }
  | { type: 'QUEUE_POTION'; slot: number }
  | { type: 'ASSIGN_POTION'; itemId: string; slot: number }
  | { type: 'CLEAR_POTION_SLOT'; slot: number }
  | { type: 'ATTEMPT_ESCAPE' }
  | { type: 'TICK_COMBAT'; deltaMs: number }
  | { type: 'COMBAT_ANIMATION_DONE' }
  | { type: 'TRANSFER_ALL_TO_WAREHOUSE' }
  | { type: 'TRANSFER_ITEM'; itemId: string; direction: 'toWarehouse' | 'toBag' }
  | { type: 'COLLECT_MINE' }
  | { type: 'MANUAL_MINE' }
  | { type: 'UPGRADE_FACILITY'; facility: 'mine' | 'alchemy' | 'forge' }
  | { type: 'CRAFT'; recipeId: string }
  | { type: 'EQUIP'; itemId: string }
  | { type: 'TOGGLE_SKILL'; skillId: string }
  | { type: 'BUY_TALENT'; talentId: string }
  | { type: 'REINCARNATE' }
  | { type: 'APPLY_CHEAT' }
  | { type: 'RESET_GAME' }
  | { type: 'SET_MESSAGE'; message: string }
  | { type: 'DISMISS_POPUP' };

export interface DispatchResult {
  state: GameState;
  shouldSave: boolean;
}
