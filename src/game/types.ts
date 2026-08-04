export type SceneId = 'cave' | 'select' | 'explore' | 'reincarnation';
export type MapTier = 'S' | 'M' | 'L';
export type Realm = '炼气' | '筑基' | '结丹';
export type Terrain = 'plain' | 'forest' | 'water' | 'mountain';
export type EntityKind = 'enemy' | 'resource' | 'town' | 'secret' | 'return' | 'depth';
export type ItemKind = 'material' | 'herb' | 'potion' | 'equipment';
export type EquipmentSlot = 'melee' | 'ranged' | 'armor' | 'ring';
export type DamageType = 'physical' | 'spell';

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
  itemId?: string;
  count?: number;
  rewardId?: string;
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

export interface ItemDefinition {
  id: string;
  name: string;
  kind: ItemKind;
  description: string;
  maxStack: number;
  equipmentSlot?: EquipmentSlot;
  bagSlots?: number;
  physicalAttack?: number;
  spellAttack?: number;
  physicalDefense?: number;
  spellDefense?: number;
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
}

export interface PotionDefinition {
  itemId: string;
  healHp: number;
  restoreMp: number;
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
}

export interface RecipeDefinition {
  id: string;
  name: string;
  facility: 'alchemy' | 'forge';
  ingredients: ItemStack[];
  spiritStoneCost: number;
  output: ItemStack;
}

export interface TalentDefinition {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
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
  equippedSkills: string[];
  equippedPassives: string[];
  equipment: Record<EquipmentSlot, string | null>;
  potionSlots: Array<string | null>;
}

export interface CaveState {
  spiritStones: number;
  mineLevel: number;
  mineStored: number;
  alchemyLevel: number;
  forgeLevel: number;
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
  kind: 'basic' | 'skill' | 'potion';
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
  awaitingAnimation: boolean;
  outcome: 'active' | 'victory' | 'defeat';
  lastAction: CombatActionEvent | null;
  nextActionId: number;
}

export interface ReincarnationState {
  karma: number;
  totalDeaths: number;
  talents: Record<string, number>;
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

export interface GameState {
  scene: SceneId;
  meta: MetaState;
  player: PlayerState;
  cave: CaveState;
  inventory: InventoryState;
  run: RunSession | null;
  combat: CombatState | null;
  reincarnation: ReincarnationState;
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
  | { type: 'TICK_COMBAT'; deltaMs: number }
  | { type: 'COMBAT_ANIMATION_DONE' }
  | { type: 'TRANSFER_ALL_TO_WAREHOUSE' }
  | { type: 'TRANSFER_ITEM'; itemId: string; direction: 'toWarehouse' | 'toBag' }
  | { type: 'COLLECT_MINE' }
  | { type: 'UPGRADE_FACILITY'; facility: 'mine' | 'alchemy' | 'forge' }
  | { type: 'CRAFT'; recipeId: string }
  | { type: 'EQUIP'; itemId: string }
  | { type: 'BUY_TALENT'; talentId: string }
  | { type: 'REINCARNATE' }
  | { type: 'RESET_GAME' }
  | { type: 'SET_MESSAGE'; message: string };

export interface DispatchResult {
  state: GameState;
  shouldSave: boolean;
}
