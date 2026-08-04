import type {
  EnemyDefinition,
  EnemyRank,
  ItemDefinition,
  ItemQuality,
  ItemStack,
  MapTier,
  PassiveDefinition,
  PotionDefinition,
  RecipeDefinition,
  SkillDefinition,
  TalentDefinition
} from './types';

export const MAP_TIERS: Record<MapTier, { name: string; size: number; floors: number; cost: number; recommended: string }> = {
  S: { name: '青石谷', size: 16, floors: 1, cost: 3, recommended: '炼气' },
  M: { name: '云梦泽', size: 24, floors: 2, cost: 6, recommended: '筑基～结丹' },
  L: { name: '太玄山', size: 32, floors: 3, cost: 12, recommended: '元婴～化神' }
};

/** 全局难度层：S-1=1，M-1/2=2/3，L-1/2/3=4/5/6，对应炼气→化神强敌 */
export function difficultyLayer(tier: MapTier, floor: number): number {
  if (tier === 'S') return 1;
  if (tier === 'M') return 1 + floor;
  return 3 + floor;
}

/** 洞府设施升级灵石：180 → 540（×3） */
export function facilityUpgradeCost(currentLevel: number): number {
  return Math.round(180 * Math.pow(3, currentLevel - 1));
}

/** 采矿年产出基数：80 → 160 → 320（×2） */
export function mineYieldPerYear(mineLevel: number): number {
  return Math.round(80 * Math.pow(2, mineLevel - 1));
}

/** 手动叩击：灵息上限 15 → 20 → 25 */
export function mineBreathMax(mineLevel: number): number {
  return 10 + Math.max(1, Math.min(3, mineLevel)) * 5;
}

/** 手动叩击：灵息回复间隔 3.5s → 3.0s → 2.5s */
export function mineBreathRegenMs(mineLevel: number): number {
  return 3500 - (Math.max(1, Math.min(3, mineLevel)) - 1) * 500;
}

/**
 * 手动叩击收益表（矿场等级越高，普击与爆发量越大、爆发率越高）。
 * Lv1: 1–4 / 6% → 24–48；Lv2: 2–8 / 9% → 55–96；Lv3: 4–14 / 13% → 110–200
 */
export function manualMineStrikeTable(mineLevel: number): {
  min: number;
  max: number;
  jackpotChance: number;
  jackpotMin: number;
  jackpotMax: number;
} {
  const level = Math.max(1, Math.min(3, mineLevel));
  if (level >= 3) return { min: 4, max: 14, jackpotChance: 0.13, jackpotMin: 110, jackpotMax: 200 };
  if (level >= 2) return { min: 2, max: 8, jackpotChance: 0.09, jackpotMin: 55, jackpotMax: 96 };
  return { min: 1, max: 4, jackpotChance: 0.06, jackpotMin: 24, jackpotMax: 48 };
}

/** 修为累计阈值：筑基/结丹/元婴/化神 */
export const REALM_EXP_THRESHOLDS = [0, 200, 700, 2200, 7000] as const;

export const ENEMIES_BY_LAYER: Record<number, string[]> = {
  1: ['mountain_wolf', 'gale_bat', 'fire_crow'],
  2: ['swamp_serpent', 'stone_puppet', 'mist_toad'],
  3: ['thunder_lizard', 'frost_spirit', 'blood_boar'],
  4: ['shadow_fox', 'spirit_golem', 'jade_serpent'],
  5: ['heaven_crane', 'ash_fiend', 'void_wraith'],
  6: ['immortal_colossus', 'chaos_fiend', 'star_hydra']
};

/** 精英约 +30% 面板、经验/掉落 +200%；首领约 +100% 面板、经验/掉落 +500% */
export const ENEMY_RANK_MULTIPLIERS = {
  normal: { power: 1, exp: 1, loot: 1 },
  elite: { power: 1.3, exp: 3, loot: 3 },
  boss: { power: 2, exp: 6, loot: 6 }
} as const;

export const ITEM_QUALITY_ORDER = ['凡品', '灵器', '灵宝', '玄天灵宝', '通天灵宝', '？？？'] as const;

/** 国风品质色（与 QuitToCultivate QualityDisplayService 一致） */
export const ITEM_QUALITY_COLORS: Record<(typeof ITEM_QUALITY_ORDER)[number], string> = {
  '凡品': '#3A3C3E',
  '灵器': '#549688',
  '灵宝': '#1661AB',
  '玄天灵宝': '#6D28D9',
  '通天灵宝': '#CA6924',
  '？？？': '#AB3B3A'
};

export const ITEM_QUALITY_CSS: Record<(typeof ITEM_QUALITY_ORDER)[number], string> = {
  '凡品': 'q-common',
  '灵器': 'q-uncommon',
  '灵宝': 'q-rare',
  '玄天灵宝': 'q-epic',
  '通天灵宝': 'q-legendary',
  '？？？': 'q-unknown'
};

export function qualityCssClass(quality?: ItemQuality | null): string {
  if (!quality) return 'q-common';
  return ITEM_QUALITY_CSS[quality] ?? 'q-common';
}
export const MAX_EQUIPPED_SKILLS = 6;

export const ITEMS: Record<string, ItemDefinition> = {
  spirit_herb: {
    id: 'spirit_herb',
    name: '青灵草',
    kind: 'material',
    description: '低阶炼丹。',
    maxStack: 99,
    quality: '凡品'
  },
  iron_ore: {
    id: 'iron_ore',
    name: '赤铜矿',
    kind: 'material',
    description: '低阶炼器。',
    maxStack: 99,
    quality: '凡品'
  },
  frost_petal: {
    id: 'frost_petal',
    name: '霜华瓣',
    kind: 'material',
    description: '中阶炼丹。',
    maxStack: 99,
    quality: '凡品'
  },
  dawn_root: {
    id: 'dawn_root',
    name: '朝露根',
    kind: 'material',
    description: '高阶炼丹。',
    maxStack: 99,
    quality: '凡品'
  },
  spirit_silk: {
    id: 'spirit_silk',
    name: '灵蚕丝',
    kind: 'material',
    description: '鞋履腰带。',
    maxStack: 99,
    quality: '凡品'
  },
  cloud_sand: {
    id: 'cloud_sand',
    name: '云纹砂',
    kind: 'material',
    description: '护甲炼制。',
    maxStack: 99,
    quality: '凡品'
  },
  thunder_copper: {
    id: 'thunder_copper',
    name: '雷纹铜',
    kind: 'material',
    description: '中阶兵器。',
    maxStack: 99,
    quality: '凡品'
  },
  moon_dew: {
    id: 'moon_dew',
    name: '月华露',
    kind: 'material',
    description: '高阶丹药。',
    maxStack: 99,
    quality: '凡品'
  },
  dragon_bone: {
    id: 'dragon_bone',
    name: '龙骨屑',
    kind: 'material',
    description: '高阶防具。',
    maxStack: 99,
    quality: '凡品'
  },
  phoenix_plume: {
    id: 'phoenix_plume',
    name: '凰羽',
    kind: 'material',
    description: '遁法鞋履。',
    maxStack: 99,
    quality: '凡品'
  },
  void_crystal: {
    id: 'void_crystal',
    name: '虚空晶',
    kind: 'material',
    description: '顶尖炼器。',
    maxStack: 99,
    quality: '凡品'
  },
  immortal_ash: {
    id: 'immortal_ash',
    name: '仙烬',
    kind: 'material',
    description: '仙品材料。',
    maxStack: 99,
    quality: '凡品'
  },
  pill_heal_1: {
    id: 'pill_heal_1',
    name: '一品还丹',
    kind: 'potion',
    description: '回血。',
    maxStack: 20,
    quality: '凡品'
  },
  pill_heal_2: {
    id: 'pill_heal_2',
    name: '二品还丹',
    kind: 'potion',
    description: '回血并微量回灵。',
    maxStack: 20,
    quality: '灵器'
  },
  pill_heal_3: {
    id: 'pill_heal_3',
    name: '三品还丹',
    kind: 'potion',
    description: '回血回灵。',
    maxStack: 20,
    quality: '灵宝'
  },
  pill_heal_4: {
    id: 'pill_heal_4',
    name: '四品还丹',
    kind: 'potion',
    description: '回血回灵，略增逃跑。',
    maxStack: 20,
    quality: '玄天灵宝'
  },
  pill_heal_5: {
    id: 'pill_heal_5',
    name: '五品还丹',
    kind: 'potion',
    description: '大补气血，增逃跑。',
    maxStack: 20,
    quality: '通天灵宝'
  },
  pill_heal_6: {
    id: 'pill_heal_6',
    name: '六品还丹',
    kind: 'potion',
    description: '仙品回春，气血双复并增逃跑。',
    maxStack: 20,
    quality: '？？？'
  },
  pill_mana_1: {
    id: 'pill_mana_1',
    name: '一品聚灵丹',
    kind: 'potion',
    description: '回灵。',
    maxStack: 20,
    quality: '凡品'
  },
  pill_mana_2: {
    id: 'pill_mana_2',
    name: '二品聚灵丹',
    kind: 'potion',
    description: '回灵并微量回血。',
    maxStack: 20,
    quality: '灵器'
  },
  pill_mana_3: {
    id: 'pill_mana_3',
    name: '三品聚灵丹',
    kind: 'potion',
    description: '回灵回血。',
    maxStack: 20,
    quality: '灵宝'
  },
  pill_mana_4: {
    id: 'pill_mana_4',
    name: '四品聚灵丹',
    kind: 'potion',
    description: '回灵并略增逃跑。',
    maxStack: 20,
    quality: '玄天灵宝'
  },
  pill_mana_5: {
    id: 'pill_mana_5',
    name: '五品聚灵丹',
    kind: 'potion',
    description: '大补灵气。',
    maxStack: 20,
    quality: '通天灵宝'
  },
  pill_mana_6: {
    id: 'pill_mana_6',
    name: '六品聚灵丹',
    kind: 'potion',
    description: '仙品聚灵。',
    maxStack: 20,
    quality: '？？？'
  },
  pill_escape_1: {
    id: 'pill_escape_1',
    name: '一品遁影丹',
    kind: 'potion',
    description: '下次逃跑+8%。',
    maxStack: 20,
    quality: '凡品'
  },
  pill_escape_2: {
    id: 'pill_escape_2',
    name: '二品遁影丹',
    kind: 'potion',
    description: '下次逃跑+12%。',
    maxStack: 20,
    quality: '灵器'
  },
  pill_escape_3: {
    id: 'pill_escape_3',
    name: '三品遁影丹',
    kind: 'potion',
    description: '下次逃跑+18%。',
    maxStack: 20,
    quality: '灵宝'
  },
  pill_escape_4: {
    id: 'pill_escape_4',
    name: '四品遁影丹',
    kind: 'potion',
    description: '下次逃跑+24%。',
    maxStack: 20,
    quality: '玄天灵宝'
  },
  pill_escape_5: {
    id: 'pill_escape_5',
    name: '五品遁影丹',
    kind: 'potion',
    description: '下次逃跑+32%。',
    maxStack: 20,
    quality: '通天灵宝'
  },
  pill_escape_6: {
    id: 'pill_escape_6',
    name: '六品遁影丹',
    kind: 'potion',
    description: '下次逃跑+42%。',
    maxStack: 20,
    quality: '？？？'
  },
  melee_1: {
    id: 'melee_1',
    name: '赤铜剑',
    kind: 'equipment',
    description: '物攻 +6。',
    maxStack: 1,
    quality: '凡品',
    equipmentSlot: 'melee',
    physicalAttack: 6,
    spellAttack: 0
  },
  melee_2: {
    id: 'melee_2',
    name: '青锋剑',
    kind: 'equipment',
    description: '物攻 +13。',
    maxStack: 1,
    quality: '灵器',
    equipmentSlot: 'melee',
    physicalAttack: 13,
    spellAttack: 0
  },
  melee_3: {
    id: 'melee_3',
    name: '霜刃',
    kind: 'equipment',
    description: '物攻 +20。',
    maxStack: 1,
    quality: '灵宝',
    equipmentSlot: 'melee',
    physicalAttack: 20,
    spellAttack: 0
  },
  melee_4: {
    id: 'melee_4',
    name: '玄铁斩',
    kind: 'equipment',
    description: '物攻 +27。',
    maxStack: 1,
    quality: '玄天灵宝',
    equipmentSlot: 'melee',
    physicalAttack: 27,
    spellAttack: 0
  },
  melee_5: {
    id: 'melee_5',
    name: '天罡剑',
    kind: 'equipment',
    description: '物攻 +34。',
    maxStack: 1,
    quality: '通天灵宝',
    equipmentSlot: 'melee',
    physicalAttack: 34,
    spellAttack: 4
  },
  melee_6: {
    id: 'melee_6',
    name: '仙诛剑',
    kind: 'equipment',
    description: '物攻 +41。',
    maxStack: 1,
    quality: '？？？',
    equipmentSlot: 'melee',
    physicalAttack: 41,
    spellAttack: 4
  },
  ranged_1: {
    id: 'ranged_1',
    name: '青木弓',
    kind: 'equipment',
    description: '物攻 +4，法攻 +3。',
    maxStack: 1,
    quality: '凡品',
    equipmentSlot: 'ranged',
    physicalAttack: 4,
    spellAttack: 3
  },
  ranged_2: {
    id: 'ranged_2',
    name: '星月弓',
    kind: 'equipment',
    description: '物攻 +9，法攻 +7。',
    maxStack: 1,
    quality: '灵器',
    equipmentSlot: 'ranged',
    physicalAttack: 9,
    spellAttack: 7
  },
  ranged_3: {
    id: 'ranged_3',
    name: '雷羽弓',
    kind: 'equipment',
    description: '物攻 +14，法攻 +11。',
    maxStack: 1,
    quality: '灵宝',
    equipmentSlot: 'ranged',
    physicalAttack: 14,
    spellAttack: 11
  },
  ranged_4: {
    id: 'ranged_4',
    name: '穿云弩',
    kind: 'equipment',
    description: '物攻 +19，法攻 +15。',
    maxStack: 1,
    quality: '玄天灵宝',
    equipmentSlot: 'ranged',
    physicalAttack: 19,
    spellAttack: 15
  },
  ranged_5: {
    id: 'ranged_5',
    name: '天机弓',
    kind: 'equipment',
    description: '物攻 +24，法攻 +19。',
    maxStack: 1,
    quality: '通天灵宝',
    equipmentSlot: 'ranged',
    physicalAttack: 24,
    spellAttack: 19
  },
  ranged_6: {
    id: 'ranged_6',
    name: '仙虹弓',
    kind: 'equipment',
    description: '物攻 +29，法攻 +23。',
    maxStack: 1,
    quality: '？？？',
    equipmentSlot: 'ranged',
    physicalAttack: 29,
    spellAttack: 23
  },
  armor_1: {
    id: 'armor_1',
    name: '云纹袍',
    kind: 'equipment',
    description: '双防 +4。',
    maxStack: 1,
    quality: '凡品',
    equipmentSlot: 'armor',
    physicalDefense: 4,
    spellDefense: 4
  },
  armor_2: {
    id: 'armor_2',
    name: '玄甲衣',
    kind: 'equipment',
    description: '双防 +9。',
    maxStack: 1,
    quality: '灵器',
    equipmentSlot: 'armor',
    physicalDefense: 9,
    spellDefense: 9
  },
  armor_3: {
    id: 'armor_3',
    name: '罡风铠',
    kind: 'equipment',
    description: '双防 +14。',
    maxStack: 1,
    quality: '灵宝',
    equipmentSlot: 'armor',
    physicalDefense: 14,
    spellDefense: 14
  },
  armor_4: {
    id: 'armor_4',
    name: '地灵铠',
    kind: 'equipment',
    description: '双防 +19。',
    maxStack: 1,
    quality: '玄天灵宝',
    equipmentSlot: 'armor',
    physicalDefense: 19,
    spellDefense: 19
  },
  armor_5: {
    id: 'armor_5',
    name: '天蚕甲',
    kind: 'equipment',
    description: '双防 +24。',
    maxStack: 1,
    quality: '通天灵宝',
    equipmentSlot: 'armor',
    physicalDefense: 24,
    spellDefense: 24
  },
  armor_6: {
    id: 'armor_6',
    name: '仙霞衣',
    kind: 'equipment',
    description: '双防 +29。',
    maxStack: 1,
    quality: '？？？',
    equipmentSlot: 'armor',
    physicalDefense: 29,
    spellDefense: 29
  },
  ring_1: {
    id: 'ring_1',
    name: '纳物戒',
    kind: 'equipment',
    description: '物攻 +2，格子 +2。',
    maxStack: 1,
    quality: '凡品',
    equipmentSlot: 'ring',
    physicalAttack: 2,
    bagSlots: 2
  },
  ring_2: {
    id: 'ring_2',
    name: '破军戒',
    kind: 'equipment',
    description: '物攻 +5，格子 +3。',
    maxStack: 1,
    quality: '灵器',
    equipmentSlot: 'ring',
    physicalAttack: 5,
    bagSlots: 3
  },
  ring_3: {
    id: 'ring_3',
    name: '聚灵戒',
    kind: 'equipment',
    description: '物攻 +8，格子 +4。',
    maxStack: 1,
    quality: '灵宝',
    equipmentSlot: 'ring',
    physicalAttack: 8,
    bagSlots: 4
  },
  ring_4: {
    id: 'ring_4',
    name: '镇岳戒',
    kind: 'equipment',
    description: '物攻 +11，格子 +5。',
    maxStack: 1,
    quality: '玄天灵宝',
    equipmentSlot: 'ring',
    physicalAttack: 11,
    bagSlots: 5
  },
  ring_5: {
    id: 'ring_5',
    name: '天道戒',
    kind: 'equipment',
    description: '物攻 +14，格子 +6。',
    maxStack: 1,
    quality: '通天灵宝',
    equipmentSlot: 'ring',
    physicalAttack: 14,
    bagSlots: 6
  },
  ring_6: {
    id: 'ring_6',
    name: '仙府戒',
    kind: 'equipment',
    description: '物攻 +17，格子 +7。',
    maxStack: 1,
    quality: '？？？',
    equipmentSlot: 'ring',
    physicalAttack: 17,
    bagSlots: 7
  },
  shoes_1: {
    id: 'shoes_1',
    name: '流云履',
    kind: 'equipment',
    description: '逃跑 +5%，CD −1.5秒。',
    maxStack: 1,
    quality: '凡品',
    equipmentSlot: 'shoes',
    escapeChanceBonus: 0.05,
    escapeCooldownReductionMs: 1500
  },
  shoes_2: {
    id: 'shoes_2',
    name: '影踪靴',
    kind: 'equipment',
    description: '逃跑 +9%，CD −2.7秒。',
    maxStack: 1,
    quality: '灵器',
    equipmentSlot: 'shoes',
    escapeChanceBonus: 0.09,
    escapeCooldownReductionMs: 2700
  },
  shoes_3: {
    id: 'shoes_3',
    name: '踏浪靴',
    kind: 'equipment',
    description: '逃跑 +13%，CD −3.9秒。',
    maxStack: 1,
    quality: '灵宝',
    equipmentSlot: 'shoes',
    escapeChanceBonus: 0.13,
    escapeCooldownReductionMs: 3900
  },
  shoes_4: {
    id: 'shoes_4',
    name: '追风靴',
    kind: 'equipment',
    description: '逃跑 +17%，CD −5.1秒。',
    maxStack: 1,
    quality: '玄天灵宝',
    equipmentSlot: 'shoes',
    escapeChanceBonus: 0.17,
    escapeCooldownReductionMs: 5100
  },
  shoes_5: {
    id: 'shoes_5',
    name: '天行履',
    kind: 'equipment',
    description: '逃跑 +21%，CD −6.3秒。',
    maxStack: 1,
    quality: '通天灵宝',
    equipmentSlot: 'shoes',
    escapeChanceBonus: 0.21,
    escapeCooldownReductionMs: 6300
  },
  shoes_6: {
    id: 'shoes_6',
    name: '仙遁靴',
    kind: 'equipment',
    description: '逃跑 +25%，CD −7.5秒。',
    maxStack: 1,
    quality: '？？？',
    equipmentSlot: 'shoes',
    escapeChanceBonus: 0.25,
    escapeCooldownReductionMs: 7500
  },
  belt_1: {
    id: 'belt_1',
    name: '韧皮腰带',
    kind: 'equipment',
    description: '双防 +2，丹药槽上限 2。',
    maxStack: 1,
    quality: '凡品',
    equipmentSlot: 'belt',
    physicalDefense: 2,
    spellDefense: 2,
    potionSlotBonus: 1
  },
  belt_2: {
    id: 'belt_2',
    name: '玄铁腰带',
    kind: 'equipment',
    description: '双防 +5，丹药槽上限 3。',
    maxStack: 1,
    quality: '灵器',
    equipmentSlot: 'belt',
    physicalDefense: 5,
    spellDefense: 5,
    potionSlotBonus: 2
  },
  belt_3: {
    id: 'belt_3',
    name: '聚灵腰带',
    kind: 'equipment',
    description: '双防 +8，丹药槽上限 3。',
    maxStack: 1,
    quality: '灵宝',
    equipmentSlot: 'belt',
    physicalDefense: 8,
    spellDefense: 8,
    potionSlotBonus: 2
  },
  belt_4: {
    id: 'belt_4',
    name: '镇魂腰带',
    kind: 'equipment',
    description: '双防 +11，丹药槽上限 3。',
    maxStack: 1,
    quality: '玄天灵宝',
    equipmentSlot: 'belt',
    physicalDefense: 11,
    spellDefense: 11,
    potionSlotBonus: 2
  },
  belt_5: {
    id: 'belt_5',
    name: '天罗带',
    kind: 'equipment',
    description: '双防 +14，丹药槽上限 3。',
    maxStack: 1,
    quality: '通天灵宝',
    equipmentSlot: 'belt',
    physicalDefense: 14,
    spellDefense: 14,
    potionSlotBonus: 2
  },
  belt_6: {
    id: 'belt_6',
    name: '仙蚕带',
    kind: 'equipment',
    description: '双防 +17，丹药槽上限 3。',
    maxStack: 1,
    quality: '？？？',
    equipmentSlot: 'belt',
    physicalDefense: 17,
    spellDefense: 17,
    potionSlotBonus: 2
  },
  pill_heal_s: {
    id: 'pill_heal_s',
    name: '一品还丹',
    kind: 'potion',
    description: '回血。',
    maxStack: 20,
    quality: '凡品'
  },
  pill_heal_m: {
    id: 'pill_heal_m',
    name: '三品还丹',
    kind: 'potion',
    description: '回血回灵。',
    maxStack: 20,
    quality: '灵宝'
  },
  pill_heal_l: {
    id: 'pill_heal_l',
    name: '五品还丹',
    kind: 'potion',
    description: '大补气血，增逃跑。',
    maxStack: 20,
    quality: '通天灵宝'
  },
  pill_mana_s: {
    id: 'pill_mana_s',
    name: '一品聚灵丹',
    kind: 'potion',
    description: '回灵。',
    maxStack: 20,
    quality: '凡品'
  },
  pill_mana_m: {
    id: 'pill_mana_m',
    name: '三品聚灵丹',
    kind: 'potion',
    description: '回灵回血。',
    maxStack: 20,
    quality: '灵宝'
  },
  pill_mana_l: {
    id: 'pill_mana_l',
    name: '五品聚灵丹',
    kind: 'potion',
    description: '大补灵气。',
    maxStack: 20,
    quality: '通天灵宝'
  },
  pill_escape_s: {
    id: 'pill_escape_s',
    name: '一品遁影丹',
    kind: 'potion',
    description: '下次逃跑+8%。',
    maxStack: 20,
    quality: '凡品'
  },
  pill_escape_m: {
    id: 'pill_escape_m',
    name: '三品遁影丹',
    kind: 'potion',
    description: '下次逃跑+18%。',
    maxStack: 20,
    quality: '灵宝'
  },
  pill_escape_l: {
    id: 'pill_escape_l',
    name: '五品遁影丹',
    kind: 'potion',
    description: '下次逃跑+32%。',
    maxStack: 20,
    quality: '通天灵宝'
  },
  bronze_sword: {
    id: 'bronze_sword',
    name: '赤铜剑',
    kind: 'equipment',
    description: '物攻 +6。',
    maxStack: 1,
    quality: '凡品',
    equipmentSlot: 'melee',
    physicalAttack: 6,
    spellAttack: 0
  },
  spirit_bow: {
    id: 'spirit_bow',
    name: '青木弓',
    kind: 'equipment',
    description: '物攻 +4，法攻 +3。',
    maxStack: 1,
    quality: '凡品',
    equipmentSlot: 'ranged',
    physicalAttack: 4,
    spellAttack: 3
  },
  cloth_armor: {
    id: 'cloth_armor',
    name: '云纹袍',
    kind: 'equipment',
    description: '双防 +4。',
    maxStack: 1,
    quality: '凡品',
    equipmentSlot: 'armor',
    physicalDefense: 4,
    spellDefense: 4
  },
  storage_ring: {
    id: 'storage_ring',
    name: '纳物戒',
    kind: 'equipment',
    description: '物攻 +2，格子 +2。',
    maxStack: 1,
    quality: '凡品',
    equipmentSlot: 'ring',
    physicalAttack: 2,
    bagSlots: 2
  },
  attack_ring: {
    id: 'attack_ring',
    name: '破军戒',
    kind: 'equipment',
    description: '物攻 +5，格子 +3。',
    maxStack: 1,
    quality: '灵器',
    equipmentSlot: 'ring',
    physicalAttack: 5,
    bagSlots: 3
  },
  cloud_shoes: {
    id: 'cloud_shoes',
    name: '流云履',
    kind: 'equipment',
    description: '逃跑 +5%，CD −1.5秒。',
    maxStack: 1,
    quality: '凡品',
    equipmentSlot: 'shoes',
    escapeChanceBonus: 0.05,
    escapeCooldownReductionMs: 1500
  },
  shadow_shoes: {
    id: 'shadow_shoes',
    name: '影踪靴',
    kind: 'equipment',
    description: '逃跑 +9%，CD −2.7秒。',
    maxStack: 1,
    quality: '灵器',
    equipmentSlot: 'shoes',
    escapeChanceBonus: 0.09,
    escapeCooldownReductionMs: 2700
  },
  wind_shoes: {
    id: 'wind_shoes',
    name: '踏浪靴',
    kind: 'equipment',
    description: '逃跑 +13%，CD −3.9秒。',
    maxStack: 1,
    quality: '灵宝',
    equipmentSlot: 'shoes',
    escapeChanceBonus: 0.13,
    escapeCooldownReductionMs: 3900
  },
  leather_belt: {
    id: 'leather_belt',
    name: '韧皮腰带',
    kind: 'equipment',
    description: '双防 +2，丹药槽上限 2。',
    maxStack: 1,
    quality: '凡品',
    equipmentSlot: 'belt',
    physicalDefense: 2,
    spellDefense: 2,
    potionSlotBonus: 1
  },
  iron_belt: {
    id: 'iron_belt',
    name: '玄铁腰带',
    kind: 'equipment',
    description: '双防 +5，丹药槽上限 3。',
    maxStack: 1,
    quality: '灵器',
    equipmentSlot: 'belt',
    physicalDefense: 5,
    spellDefense: 5,
    potionSlotBonus: 2
  },
  spirit_belt: {
    id: 'spirit_belt',
    name: '聚灵腰带',
    kind: 'equipment',
    description: '双防 +8，丹药槽上限 3。',
    maxStack: 1,
    quality: '灵宝',
    equipmentSlot: 'belt',
    physicalDefense: 8,
    spellDefense: 8,
    potionSlotBonus: 2
  }
};

export const POTIONS: Record<string, PotionDefinition> = {
  pill_heal_1: {
    itemId: 'pill_heal_1',
    effect: 'heal',
    healHp: 35,
    restoreMp: 0,
    escapeBonus: 0,
    glyph: '血',
    tier: 1
  },
  pill_heal_2: {
    itemId: 'pill_heal_2',
    effect: 'heal',
    healHp: 55,
    restoreMp: 8,
    escapeBonus: 0,
    glyph: '血',
    tier: 2
  },
  pill_heal_3: {
    itemId: 'pill_heal_3',
    effect: 'heal',
    healHp: 80,
    restoreMp: 15,
    escapeBonus: 0,
    glyph: '血',
    tier: 3
  },
  pill_heal_4: {
    itemId: 'pill_heal_4',
    effect: 'heal',
    healHp: 110,
    restoreMp: 22,
    escapeBonus: 0.03,
    glyph: '血',
    tier: 4
  },
  pill_heal_5: {
    itemId: 'pill_heal_5',
    effect: 'heal',
    healHp: 150,
    restoreMp: 35,
    escapeBonus: 0.05,
    glyph: '血',
    tier: 5
  },
  pill_heal_6: {
    itemId: 'pill_heal_6',
    effect: 'heal',
    healHp: 220,
    restoreMp: 50,
    escapeBonus: 0.08,
    glyph: '血',
    tier: 6
  },
  pill_mana_1: {
    itemId: 'pill_mana_1',
    effect: 'mana',
    healHp: 0,
    restoreMp: 22,
    escapeBonus: 0,
    glyph: '灵',
    tier: 1
  },
  pill_mana_2: {
    itemId: 'pill_mana_2',
    effect: 'mana',
    healHp: 8,
    restoreMp: 38,
    escapeBonus: 0,
    glyph: '灵',
    tier: 2
  },
  pill_mana_3: {
    itemId: 'pill_mana_3',
    effect: 'mana',
    healHp: 15,
    restoreMp: 55,
    escapeBonus: 0,
    glyph: '灵',
    tier: 3
  },
  pill_mana_4: {
    itemId: 'pill_mana_4',
    effect: 'mana',
    healHp: 20,
    restoreMp: 75,
    escapeBonus: 0.02,
    glyph: '灵',
    tier: 4
  },
  pill_mana_5: {
    itemId: 'pill_mana_5',
    effect: 'mana',
    healHp: 30,
    restoreMp: 105,
    escapeBonus: 0.04,
    glyph: '灵',
    tier: 5
  },
  pill_mana_6: {
    itemId: 'pill_mana_6',
    effect: 'mana',
    healHp: 45,
    restoreMp: 150,
    escapeBonus: 0.06,
    glyph: '灵',
    tier: 6
  },
  pill_escape_1: {
    itemId: 'pill_escape_1',
    effect: 'escape',
    healHp: 0,
    restoreMp: 0,
    escapeBonus: 0.08,
    glyph: '遁',
    tier: 1
  },
  pill_escape_2: {
    itemId: 'pill_escape_2',
    effect: 'escape',
    healHp: 0,
    restoreMp: 5,
    escapeBonus: 0.12,
    glyph: '遁',
    tier: 2
  },
  pill_escape_3: {
    itemId: 'pill_escape_3',
    effect: 'escape',
    healHp: 10,
    restoreMp: 0,
    escapeBonus: 0.18,
    glyph: '遁',
    tier: 3
  },
  pill_escape_4: {
    itemId: 'pill_escape_4',
    effect: 'escape',
    healHp: 0,
    restoreMp: 10,
    escapeBonus: 0.24,
    glyph: '遁',
    tier: 4
  },
  pill_escape_5: {
    itemId: 'pill_escape_5',
    effect: 'escape',
    healHp: 15,
    restoreMp: 15,
    escapeBonus: 0.32,
    glyph: '遁',
    tier: 5
  },
  pill_escape_6: {
    itemId: 'pill_escape_6',
    effect: 'escape',
    healHp: 25,
    restoreMp: 25,
    escapeBonus: 0.42,
    glyph: '遁',
    tier: 6
  },
  pill_heal_s: {
    itemId: 'pill_heal_s',
    effect: 'heal',
    healHp: 35,
    restoreMp: 0,
    escapeBonus: 0,
    glyph: '血',
    tier: 1
  },
  pill_heal_m: {
    itemId: 'pill_heal_m',
    effect: 'heal',
    healHp: 80,
    restoreMp: 15,
    escapeBonus: 0,
    glyph: '血',
    tier: 3
  },
  pill_heal_l: {
    itemId: 'pill_heal_l',
    effect: 'heal',
    healHp: 150,
    restoreMp: 35,
    escapeBonus: 0.05,
    glyph: '血',
    tier: 5
  },
  pill_mana_s: {
    itemId: 'pill_mana_s',
    effect: 'mana',
    healHp: 0,
    restoreMp: 22,
    escapeBonus: 0,
    glyph: '灵',
    tier: 1
  },
  pill_mana_m: {
    itemId: 'pill_mana_m',
    effect: 'mana',
    healHp: 15,
    restoreMp: 55,
    escapeBonus: 0,
    glyph: '灵',
    tier: 3
  },
  pill_mana_l: {
    itemId: 'pill_mana_l',
    effect: 'mana',
    healHp: 30,
    restoreMp: 105,
    escapeBonus: 0.04,
    glyph: '灵',
    tier: 5
  },
  pill_escape_s: {
    itemId: 'pill_escape_s',
    effect: 'escape',
    healHp: 0,
    restoreMp: 0,
    escapeBonus: 0.1,
    glyph: '遁',
    tier: 1
  },
  pill_escape_m: {
    itemId: 'pill_escape_m',
    effect: 'escape',
    healHp: 10,
    restoreMp: 0,
    escapeBonus: 0.18,
    glyph: '遁',
    tier: 3
  },
  pill_escape_l: {
    itemId: 'pill_escape_l',
    effect: 'escape',
    healHp: 15,
    restoreMp: 15,
    escapeBonus: 0.32,
    glyph: '遁',
    tier: 5
  }
};

export const PASSIVES: Record<string, PassiveDefinition> = {
  rebirth_body: {
    id: 'rebirth_body',
    name: '脱胎换骨',
    description: '每层最大生命 +8%。',
    maxStacks: 10,
    quality: '凡品',
    hpPercentPerStack: 0.08
  },
  iron_bone: {
    id: 'iron_bone',
    name: '铁骨诀',
    description: '每层物防 +2。',
    maxStacks: 10,
    quality: '凡品',
    physicalDefensePerStack: 2
  },
  clear_spirit: {
    id: 'clear_spirit',
    name: '澄神诀',
    description: '每层最大灵气 +6%。',
    maxStacks: 10,
    quality: '灵器',
    mpPercentPerStack: 0.06
  },
  sharp_eye: {
    id: 'sharp_eye',
    name: '锐目',
    description: '每层命中 +1%。',
    maxStacks: 10,
    quality: '灵器',
    hitPerStack: 0.01
  },
  crit_heart: {
    id: 'crit_heart',
    name: '杀意',
    description: '每层暴击 +1.5%。',
    maxStacks: 10,
    quality: '灵宝',
    critPerStack: 0.015
  },
  swift_wind: {
    id: 'swift_wind',
    name: '疾风',
    description: '每层攻速 +3%。',
    maxStacks: 10,
    quality: '灵宝',
    apsPercentPerStack: 0.03
  },
  thick_skin: {
    id: 'thick_skin',
    name: '厚土',
    description: '每层法防 +2。',
    maxStacks: 10,
    quality: '玄天灵宝',
    spellDefensePerStack: 2
  },
  blood_rage: {
    id: 'blood_rage',
    name: '血气',
    description: '每层物攻 +2。',
    maxStacks: 10,
    quality: '玄天灵宝',
    physicalAttackPerStack: 2
  },
  mana_well: {
    id: 'mana_well',
    name: '灵泉',
    description: '每层法攻 +2。',
    maxStacks: 10,
    quality: '通天灵宝',
    spellAttackPerStack: 2
  },
  long_life: {
    id: 'long_life',
    name: '延寿',
    description: '每层寿元上限 +8。',
    maxStacks: 10,
    quality: '通天灵宝',
    lifespanPerStack: 8
  },
  bagua: {
    id: 'bagua',
    name: '八卦',
    description: '每层双防 +1。',
    maxStacks: 10,
    quality: '？？？',
    physicalDefensePerStack: 1,
    spellDefensePerStack: 1
  },
  immortal_seed: {
    id: 'immortal_seed',
    name: '仙胎',
    description: '每层生命与灵气 +4%。',
    maxStacks: 10,
    quality: '？？？',
    hpPercentPerStack: 0.04,
    mpPercentPerStack: 0.04
  }
};

export const SKILLS: Record<string, SkillDefinition> = {
  sword_art: {
    id: 'sword_art',
    name: '御剑诀',
    description: '造成 145% 物理伤害。',
    damageType: 'physical',
    multiplier: 1.45,
    mpCost: 8,
    cooldownMs: 4200,
    priority: 10,
    quality: '凡品'
  },
  firebolt: {
    id: 'firebolt',
    name: '火弹术',
    description: '造成 170% 法术伤害。',
    damageType: 'spell',
    multiplier: 1.7,
    mpCost: 14,
    cooldownMs: 6800,
    priority: 20,
    quality: '凡品'
  },
  stone_skin_strike: {
    id: 'stone_skin_strike',
    name: '碎岩击',
    description: '造成 155% 物理伤害。',
    damageType: 'physical',
    multiplier: 1.55,
    mpCost: 10,
    cooldownMs: 5000,
    priority: 12,
    quality: '灵器'
  },
  water_arrow: {
    id: 'water_arrow',
    name: '水箭术',
    description: '造成 150% 法术伤害。',
    damageType: 'spell',
    multiplier: 1.5,
    mpCost: 10,
    cooldownMs: 5200,
    priority: 14,
    quality: '灵器'
  },
  wind_slash: {
    id: 'wind_slash',
    name: '风切',
    description: '造成 165% 物理伤害。',
    damageType: 'physical',
    multiplier: 1.65,
    mpCost: 12,
    cooldownMs: 5600,
    priority: 16,
    quality: '灵宝'
  },
  lightning_bead: {
    id: 'lightning_bead',
    name: '雷珠',
    description: '造成 185% 法术伤害。',
    damageType: 'spell',
    multiplier: 1.85,
    mpCost: 16,
    cooldownMs: 7200,
    priority: 22,
    quality: '灵宝'
  },
  blood_draw: {
    id: 'blood_draw',
    name: '抽血斩',
    description: '造成 175% 物理伤害。',
    damageType: 'physical',
    multiplier: 1.75,
    mpCost: 14,
    cooldownMs: 6000,
    priority: 18,
    quality: '玄天灵宝'
  },
  frost_nova: {
    id: 'frost_nova',
    name: '霜爆',
    description: '造成 190% 法术伤害。',
    damageType: 'spell',
    multiplier: 1.9,
    mpCost: 18,
    cooldownMs: 7600,
    priority: 24,
    quality: '玄天灵宝'
  },
  shadow_pierce: {
    id: 'shadow_pierce',
    name: '影刺',
    description: '造成 200% 物理伤害。',
    damageType: 'physical',
    multiplier: 2,
    mpCost: 16,
    cooldownMs: 6400,
    priority: 26,
    quality: '通天灵宝'
  },
  spirit_burst: {
    id: 'spirit_burst',
    name: '灵爆',
    description: '造成 210% 法术伤害。',
    damageType: 'spell',
    multiplier: 2.1,
    mpCost: 20,
    cooldownMs: 8000,
    priority: 28,
    quality: '通天灵宝'
  },
  heaven_cut: {
    id: 'heaven_cut',
    name: '天斩',
    description: '造成 225% 物理伤害。',
    damageType: 'physical',
    multiplier: 2.25,
    mpCost: 22,
    cooldownMs: 7000,
    priority: 30,
    quality: '？？？'
  },
  immortal_flame: {
    id: 'immortal_flame',
    name: '仙炎',
    description: '造成 240% 法术伤害。',
    damageType: 'spell',
    multiplier: 2.4,
    mpCost: 26,
    cooldownMs: 8600,
    priority: 32,
    quality: '？？？'
  }
};

export const ENEMIES: Record<string, EnemyDefinition> = {
  // 1-1 炼气
  mountain_wolf: {
    id: 'mountain_wolf', name: '山狼', quality: '凡品',
    maxHp: 110, physicalAttack: 17, physicalDefense: 8, spellDefense: 6, attacksPerSecond: 0.65, exp: 36,
    loot: [{ itemId: 'spirit_herb', count: 1 }],
    passiveLoot: ['rebirth_body'], skillLoot: ['sword_art']
  },
  gale_bat: {
    id: 'gale_bat', name: '风蝠', quality: '凡品',
    maxHp: 95, physicalAttack: 16, physicalDefense: 7, spellDefense: 9, attacksPerSecond: 0.95, exp: 32,
    loot: [{ itemId: 'spirit_silk', count: 1 }],
    passiveLoot: ['swift_wind'], skillLoot: ['wind_slash']
  },
  fire_crow: {
    id: 'fire_crow', name: '火鸦', quality: '凡品',
    maxHp: 130, physicalAttack: 20, physicalDefense: 10, spellDefense: 12, attacksPerSecond: 0.78, exp: 42,
    loot: [{ itemId: 'iron_ore', count: 1 }],
    passiveLoot: ['iron_bone'], skillLoot: ['firebolt']
  },
  // 2-1 筑基
  swamp_serpent: {
    id: 'swamp_serpent', name: '泽蛇', quality: '灵器',
    maxHp: 210, physicalAttack: 32, physicalDefense: 16, spellDefense: 18, attacksPerSecond: 0.7, exp: 90,
    loot: [{ itemId: 'spirit_herb', count: 2 }, { itemId: 'frost_petal', count: 1 }],
    passiveLoot: ['clear_spirit'], skillLoot: ['water_arrow']
  },
  stone_puppet: {
    id: 'stone_puppet', name: '石傀儡', quality: '灵器',
    maxHp: 290, physicalAttack: 36, physicalDefense: 28, spellDefense: 20, attacksPerSecond: 0.55, exp: 105,
    loot: [{ itemId: 'iron_ore', count: 2 }, { itemId: 'spirit_silk', count: 1 }],
    passiveLoot: ['rebirth_body', 'thick_skin'], skillLoot: ['stone_skin_strike']
  },
  mist_toad: {
    id: 'mist_toad', name: '雾蟾', quality: '灵器',
    maxHp: 240, physicalAttack: 30, physicalDefense: 18, spellDefense: 24, attacksPerSecond: 0.62, exp: 95,
    loot: [{ itemId: 'frost_petal', count: 2 }, { itemId: 'moon_dew', count: 1 }],
    passiveLoot: ['mana_well'], skillLoot: ['frost_nova']
  },
  // 2-2 结丹
  thunder_lizard: {
    id: 'thunder_lizard', name: '雷蜥', quality: '灵宝',
    maxHp: 360, physicalAttack: 50, physicalDefense: 28, spellDefense: 30, attacksPerSecond: 0.72, exp: 220,
    loot: [{ itemId: 'thunder_copper', count: 3 }],
    passiveLoot: ['sharp_eye'], skillLoot: ['lightning_bead']
  },
  frost_spirit: {
    id: 'frost_spirit', name: '霜灵', quality: '灵宝',
    maxHp: 330, physicalAttack: 46, physicalDefense: 24, spellDefense: 38, attacksPerSecond: 0.75, exp: 240,
    loot: [{ itemId: 'frost_petal', count: 3 }, { itemId: 'moon_dew', count: 2 }],
    passiveLoot: ['clear_spirit'], skillLoot: ['frost_nova']
  },
  blood_boar: {
    id: 'blood_boar', name: '血豕', quality: '玄天灵宝',
    maxHp: 420, physicalAttack: 58, physicalDefense: 32, spellDefense: 22, attacksPerSecond: 0.6, exp: 270,
    loot: [{ itemId: 'dragon_bone', count: 2 }, { itemId: 'dawn_root', count: 2 }],
    passiveLoot: ['blood_rage', 'crit_heart'], skillLoot: ['blood_draw']
  },
  // 3-1 元婴
  shadow_fox: {
    id: 'shadow_fox', name: '影狐', quality: '玄天灵宝',
    maxHp: 520, physicalAttack: 72, physicalDefense: 30, spellDefense: 36, attacksPerSecond: 0.95, exp: 560,
    loot: [{ itemId: 'phoenix_plume', count: 3 }, { itemId: 'cloud_sand', count: 2 }],
    passiveLoot: ['swift_wind', 'crit_heart'], skillLoot: ['shadow_pierce']
  },
  spirit_golem: {
    id: 'spirit_golem', name: '灵傀', quality: '通天灵宝',
    maxHp: 680, physicalAttack: 78, physicalDefense: 52, spellDefense: 50, attacksPerSecond: 0.52, exp: 640,
    loot: [{ itemId: 'void_crystal', count: 2 }, { itemId: 'cloud_sand', count: 3 }],
    passiveLoot: ['mana_well', 'bagua'], skillLoot: ['spirit_burst']
  },
  jade_serpent: {
    id: 'jade_serpent', name: '玉蟒', quality: '通天灵宝',
    maxHp: 600, physicalAttack: 74, physicalDefense: 40, spellDefense: 48, attacksPerSecond: 0.7, exp: 600,
    loot: [{ itemId: 'moon_dew', count: 4 }, { itemId: 'dragon_bone', count: 3 }],
    passiveLoot: ['long_life'], skillLoot: ['water_arrow']
  },
  // 3-2 化神（略缓，仍明显高于元婴）
  heaven_crane: {
    id: 'heaven_crane', name: '天鹤', quality: '通天灵宝',
    maxHp: 720, physicalAttack: 88, physicalDefense: 42, spellDefense: 48, attacksPerSecond: 0.85, exp: 1400,
    loot: [{ itemId: 'phoenix_plume', count: 4 }, { itemId: 'dawn_root', count: 4 }],
    passiveLoot: ['long_life', 'sharp_eye'], skillLoot: ['heaven_cut']
  },
  ash_fiend: {
    id: 'ash_fiend', name: '烬魔', quality: '？？？',
    maxHp: 820, physicalAttack: 100, physicalDefense: 52, spellDefense: 52, attacksPerSecond: 0.68, exp: 1650,
    loot: [{ itemId: 'immortal_ash', count: 4 }, { itemId: 'void_crystal', count: 4 }],
    passiveLoot: ['immortal_seed', 'rebirth_body'], skillLoot: ['immortal_flame']
  },
  void_wraith: {
    id: 'void_wraith', name: '虚影', quality: '？？？',
    maxHp: 700, physicalAttack: 96, physicalDefense: 38, spellDefense: 58, attacksPerSecond: 0.9, exp: 1500,
    loot: [{ itemId: 'void_crystal', count: 5 }, { itemId: 'phoenix_plume', count: 3 }],
    passiveLoot: ['bagua', 'swift_wind'], skillLoot: ['shadow_pierce']
  },
  // 3-3 化神较强（可挑战，仍需高阶装）
  immortal_colossus: {
    id: 'immortal_colossus', name: '仙傀', quality: '？？？',
    maxHp: 1180, physicalAttack: 128, physicalDefense: 72, spellDefense: 70, attacksPerSecond: 0.5, exp: 3200,
    loot: [{ itemId: 'void_crystal', count: 7 }, { itemId: 'immortal_ash', count: 5 }, { itemId: 'cloud_sand', count: 5 }],
    passiveLoot: ['immortal_seed', 'thick_skin'], skillLoot: ['spirit_burst']
  },
  chaos_fiend: {
    id: 'chaos_fiend', name: '混沌魔', quality: '？？？',
    maxHp: 1080, physicalAttack: 142, physicalDefense: 62, spellDefense: 62, attacksPerSecond: 0.72, exp: 3500,
    loot: [{ itemId: 'immortal_ash', count: 7 }, { itemId: 'void_crystal', count: 6 }, { itemId: 'dragon_bone', count: 4 }],
    passiveLoot: ['blood_rage', 'immortal_seed'], skillLoot: ['immortal_flame']
  },
  star_hydra: {
    id: 'star_hydra', name: '星渊蛟', quality: '？？？',
    maxHp: 1280, physicalAttack: 136, physicalDefense: 68, spellDefense: 78, attacksPerSecond: 0.6, exp: 3800,
    loot: [{ itemId: 'immortal_ash', count: 6 }, { itemId: 'phoenix_plume', count: 6 }, { itemId: 'moon_dew', count: 6 }],
    passiveLoot: ['long_life', 'mana_well'], skillLoot: ['heaven_cut']
  }
};

export const RECIPES: Record<string, RecipeDefinition> = {
  recipe_pill_heal_1: {
    id: 'recipe_pill_heal_1',
    name: '炼制一品还丹',
    facility: 'alchemy',
    requiredLevel: 1,
    ingredients: [
      {
        itemId: 'spirit_herb',
        count: 2
      },
      {
        itemId: 'iron_ore',
        count: 1
      }
    ],
    spiritStoneCost: 12,
    output: {
      itemId: 'pill_heal_1',
      count: 2
    }
  },
  recipe_pill_heal_2: {
    id: 'recipe_pill_heal_2',
    name: '炼制二品还丹',
    facility: 'alchemy',
    requiredLevel: 1,
    ingredients: [
      {
        itemId: 'spirit_herb',
        count: 4
      },
      {
        itemId: 'frost_petal',
        count: 2
      }
    ],
    spiritStoneCost: 30,
    output: {
      itemId: 'pill_heal_2',
      count: 2
    }
  },
  recipe_pill_heal_3: {
    id: 'recipe_pill_heal_3',
    name: '炼制三品还丹',
    facility: 'alchemy',
    requiredLevel: 2,
    ingredients: [
      {
        itemId: 'frost_petal',
        count: 7
      },
      {
        itemId: 'thunder_copper',
        count: 3
      }
    ],
    spiritStoneCost: 75,
    output: {
      itemId: 'pill_heal_3',
      count: 2
    }
  },
  recipe_pill_heal_4: {
    id: 'recipe_pill_heal_4',
    name: '炼制四品还丹',
    facility: 'alchemy',
    requiredLevel: 2,
    ingredients: [
      {
        itemId: 'dawn_root',
        count: 12
      },
      {
        itemId: 'cloud_sand',
        count: 5
      }
    ],
    spiritStoneCost: 180,
    output: {
      itemId: 'pill_heal_4',
      count: 2
    }
  },
  recipe_pill_heal_5: {
    id: 'recipe_pill_heal_5',
    name: '炼制五品还丹',
    facility: 'alchemy',
    requiredLevel: 3,
    ingredients: [
      {
        itemId: 'moon_dew',
        count: 12
      },
      {
        itemId: 'dragon_bone',
        count: 6
      }
    ],
    spiritStoneCost: 320,
    output: {
      itemId: 'pill_heal_5',
      count: 1
    }
  },
  recipe_pill_heal_6: {
    id: 'recipe_pill_heal_6',
    name: '炼制六品还丹',
    facility: 'alchemy',
    requiredLevel: 3,
    ingredients: [
      {
        itemId: 'void_crystal',
        count: 18
      },
      {
        itemId: 'immortal_ash',
        count: 8
      }
    ],
    spiritStoneCost: 750,
    output: {
      itemId: 'pill_heal_6',
      count: 1
    }
  },
  recipe_pill_mana_1: {
    id: 'recipe_pill_mana_1',
    name: '炼制一品聚灵丹',
    facility: 'alchemy',
    requiredLevel: 1,
    ingredients: [
      {
        itemId: 'spirit_herb',
        count: 2
      },
      {
        itemId: 'iron_ore',
        count: 1
      }
    ],
    spiritStoneCost: 12,
    output: {
      itemId: 'pill_mana_1',
      count: 2
    }
  },
  recipe_pill_mana_2: {
    id: 'recipe_pill_mana_2',
    name: '炼制二品聚灵丹',
    facility: 'alchemy',
    requiredLevel: 1,
    ingredients: [
      {
        itemId: 'spirit_herb',
        count: 4
      },
      {
        itemId: 'frost_petal',
        count: 2
      }
    ],
    spiritStoneCost: 30,
    output: {
      itemId: 'pill_mana_2',
      count: 2
    }
  },
  recipe_pill_mana_3: {
    id: 'recipe_pill_mana_3',
    name: '炼制三品聚灵丹',
    facility: 'alchemy',
    requiredLevel: 2,
    ingredients: [
      {
        itemId: 'frost_petal',
        count: 7
      },
      {
        itemId: 'thunder_copper',
        count: 3
      }
    ],
    spiritStoneCost: 75,
    output: {
      itemId: 'pill_mana_3',
      count: 2
    }
  },
  recipe_pill_mana_4: {
    id: 'recipe_pill_mana_4',
    name: '炼制四品聚灵丹',
    facility: 'alchemy',
    requiredLevel: 2,
    ingredients: [
      {
        itemId: 'dawn_root',
        count: 12
      },
      {
        itemId: 'cloud_sand',
        count: 5
      }
    ],
    spiritStoneCost: 180,
    output: {
      itemId: 'pill_mana_4',
      count: 2
    }
  },
  recipe_pill_mana_5: {
    id: 'recipe_pill_mana_5',
    name: '炼制五品聚灵丹',
    facility: 'alchemy',
    requiredLevel: 3,
    ingredients: [
      {
        itemId: 'moon_dew',
        count: 12
      },
      {
        itemId: 'dragon_bone',
        count: 6
      }
    ],
    spiritStoneCost: 320,
    output: {
      itemId: 'pill_mana_5',
      count: 1
    }
  },
  recipe_pill_mana_6: {
    id: 'recipe_pill_mana_6',
    name: '炼制六品聚灵丹',
    facility: 'alchemy',
    requiredLevel: 3,
    ingredients: [
      {
        itemId: 'void_crystal',
        count: 18
      },
      {
        itemId: 'immortal_ash',
        count: 8
      }
    ],
    spiritStoneCost: 750,
    output: {
      itemId: 'pill_mana_6',
      count: 1
    }
  },
  recipe_pill_escape_1: {
    id: 'recipe_pill_escape_1',
    name: '炼制一品遁影丹',
    facility: 'alchemy',
    requiredLevel: 1,
    ingredients: [
      {
        itemId: 'spirit_herb',
        count: 2
      },
      {
        itemId: 'iron_ore',
        count: 1
      }
    ],
    spiritStoneCost: 12,
    output: {
      itemId: 'pill_escape_1',
      count: 2
    }
  },
  recipe_pill_escape_2: {
    id: 'recipe_pill_escape_2',
    name: '炼制二品遁影丹',
    facility: 'alchemy',
    requiredLevel: 1,
    ingredients: [
      {
        itemId: 'spirit_herb',
        count: 4
      },
      {
        itemId: 'frost_petal',
        count: 2
      }
    ],
    spiritStoneCost: 30,
    output: {
      itemId: 'pill_escape_2',
      count: 2
    }
  },
  recipe_pill_escape_3: {
    id: 'recipe_pill_escape_3',
    name: '炼制三品遁影丹',
    facility: 'alchemy',
    requiredLevel: 2,
    ingredients: [
      {
        itemId: 'frost_petal',
        count: 7
      },
      {
        itemId: 'thunder_copper',
        count: 3
      }
    ],
    spiritStoneCost: 75,
    output: {
      itemId: 'pill_escape_3',
      count: 2
    }
  },
  recipe_pill_escape_4: {
    id: 'recipe_pill_escape_4',
    name: '炼制四品遁影丹',
    facility: 'alchemy',
    requiredLevel: 2,
    ingredients: [
      {
        itemId: 'dawn_root',
        count: 12
      },
      {
        itemId: 'cloud_sand',
        count: 5
      }
    ],
    spiritStoneCost: 180,
    output: {
      itemId: 'pill_escape_4',
      count: 2
    }
  },
  recipe_pill_escape_5: {
    id: 'recipe_pill_escape_5',
    name: '炼制五品遁影丹',
    facility: 'alchemy',
    requiredLevel: 3,
    ingredients: [
      {
        itemId: 'moon_dew',
        count: 12
      },
      {
        itemId: 'dragon_bone',
        count: 6
      }
    ],
    spiritStoneCost: 320,
    output: {
      itemId: 'pill_escape_5',
      count: 1
    }
  },
  recipe_pill_escape_6: {
    id: 'recipe_pill_escape_6',
    name: '炼制六品遁影丹',
    facility: 'alchemy',
    requiredLevel: 3,
    ingredients: [
      {
        itemId: 'void_crystal',
        count: 18
      },
      {
        itemId: 'immortal_ash',
        count: 8
      }
    ],
    spiritStoneCost: 750,
    output: {
      itemId: 'pill_escape_6',
      count: 1
    }
  },
  recipe_melee_1: {
    id: 'recipe_melee_1',
    name: '炼制赤铜剑',
    facility: 'forge',
    requiredLevel: 1,
    ingredients: [
      {
        itemId: 'spirit_herb',
        count: 2
      },
      {
        itemId: 'iron_ore',
        count: 1
      }
    ],
    spiritStoneCost: 25,
    output: {
      itemId: 'melee_1',
      count: 1
    }
  },
  recipe_melee_2: {
    id: 'recipe_melee_2',
    name: '炼制青锋剑',
    facility: 'forge',
    requiredLevel: 1,
    ingredients: [
      {
        itemId: 'spirit_herb',
        count: 4
      },
      {
        itemId: 'frost_petal',
        count: 2
      }
    ],
    spiritStoneCost: 60,
    output: {
      itemId: 'melee_2',
      count: 1
    }
  },
  recipe_melee_3: {
    id: 'recipe_melee_3',
    name: '炼制霜刃',
    facility: 'forge',
    requiredLevel: 2,
    ingredients: [
      {
        itemId: 'frost_petal',
        count: 7
      },
      {
        itemId: 'thunder_copper',
        count: 3
      }
    ],
    spiritStoneCost: 150,
    output: {
      itemId: 'melee_3',
      count: 1
    }
  },
  recipe_melee_4: {
    id: 'recipe_melee_4',
    name: '炼制玄铁斩',
    facility: 'forge',
    requiredLevel: 2,
    ingredients: [
      {
        itemId: 'dawn_root',
        count: 12
      },
      {
        itemId: 'cloud_sand',
        count: 5
      }
    ],
    spiritStoneCost: 380,
    output: {
      itemId: 'melee_4',
      count: 1
    }
  },
  recipe_melee_5: {
    id: 'recipe_melee_5',
    name: '炼制天罡剑',
    facility: 'forge',
    requiredLevel: 3,
    ingredients: [
      {
        itemId: 'moon_dew',
        count: 12
      },
      {
        itemId: 'dragon_bone',
        count: 6
      }
    ],
    spiritStoneCost: 650,
    output: {
      itemId: 'melee_5',
      count: 1
    }
  },
  recipe_melee_6: {
    id: 'recipe_melee_6',
    name: '炼制仙诛剑',
    facility: 'forge',
    requiredLevel: 3,
    ingredients: [
      {
        itemId: 'void_crystal',
        count: 18
      },
      {
        itemId: 'immortal_ash',
        count: 8
      }
    ],
    spiritStoneCost: 1500,
    output: {
      itemId: 'melee_6',
      count: 1
    }
  },
  recipe_ranged_1: {
    id: 'recipe_ranged_1',
    name: '炼制青木弓',
    facility: 'forge',
    requiredLevel: 1,
    ingredients: [
      {
        itemId: 'spirit_herb',
        count: 2
      },
      {
        itemId: 'iron_ore',
        count: 1
      }
    ],
    spiritStoneCost: 25,
    output: {
      itemId: 'ranged_1',
      count: 1
    }
  },
  recipe_ranged_2: {
    id: 'recipe_ranged_2',
    name: '炼制星月弓',
    facility: 'forge',
    requiredLevel: 1,
    ingredients: [
      {
        itemId: 'spirit_herb',
        count: 4
      },
      {
        itemId: 'frost_petal',
        count: 2
      }
    ],
    spiritStoneCost: 60,
    output: {
      itemId: 'ranged_2',
      count: 1
    }
  },
  recipe_ranged_3: {
    id: 'recipe_ranged_3',
    name: '炼制雷羽弓',
    facility: 'forge',
    requiredLevel: 2,
    ingredients: [
      {
        itemId: 'frost_petal',
        count: 7
      },
      {
        itemId: 'thunder_copper',
        count: 3
      }
    ],
    spiritStoneCost: 150,
    output: {
      itemId: 'ranged_3',
      count: 1
    }
  },
  recipe_ranged_4: {
    id: 'recipe_ranged_4',
    name: '炼制穿云弩',
    facility: 'forge',
    requiredLevel: 2,
    ingredients: [
      {
        itemId: 'dawn_root',
        count: 12
      },
      {
        itemId: 'cloud_sand',
        count: 5
      }
    ],
    spiritStoneCost: 380,
    output: {
      itemId: 'ranged_4',
      count: 1
    }
  },
  recipe_ranged_5: {
    id: 'recipe_ranged_5',
    name: '炼制天机弓',
    facility: 'forge',
    requiredLevel: 3,
    ingredients: [
      {
        itemId: 'moon_dew',
        count: 12
      },
      {
        itemId: 'dragon_bone',
        count: 6
      }
    ],
    spiritStoneCost: 650,
    output: {
      itemId: 'ranged_5',
      count: 1
    }
  },
  recipe_ranged_6: {
    id: 'recipe_ranged_6',
    name: '炼制仙虹弓',
    facility: 'forge',
    requiredLevel: 3,
    ingredients: [
      {
        itemId: 'void_crystal',
        count: 18
      },
      {
        itemId: 'immortal_ash',
        count: 8
      }
    ],
    spiritStoneCost: 1500,
    output: {
      itemId: 'ranged_6',
      count: 1
    }
  },
  recipe_armor_1: {
    id: 'recipe_armor_1',
    name: '炼制云纹袍',
    facility: 'forge',
    requiredLevel: 1,
    ingredients: [
      {
        itemId: 'spirit_herb',
        count: 2
      },
      {
        itemId: 'iron_ore',
        count: 1
      }
    ],
    spiritStoneCost: 25,
    output: {
      itemId: 'armor_1',
      count: 1
    }
  },
  recipe_armor_2: {
    id: 'recipe_armor_2',
    name: '炼制玄甲衣',
    facility: 'forge',
    requiredLevel: 1,
    ingredients: [
      {
        itemId: 'spirit_herb',
        count: 4
      },
      {
        itemId: 'frost_petal',
        count: 2
      }
    ],
    spiritStoneCost: 60,
    output: {
      itemId: 'armor_2',
      count: 1
    }
  },
  recipe_armor_3: {
    id: 'recipe_armor_3',
    name: '炼制罡风铠',
    facility: 'forge',
    requiredLevel: 2,
    ingredients: [
      {
        itemId: 'frost_petal',
        count: 7
      },
      {
        itemId: 'thunder_copper',
        count: 3
      }
    ],
    spiritStoneCost: 150,
    output: {
      itemId: 'armor_3',
      count: 1
    }
  },
  recipe_armor_4: {
    id: 'recipe_armor_4',
    name: '炼制地灵铠',
    facility: 'forge',
    requiredLevel: 2,
    ingredients: [
      {
        itemId: 'dawn_root',
        count: 12
      },
      {
        itemId: 'cloud_sand',
        count: 5
      }
    ],
    spiritStoneCost: 380,
    output: {
      itemId: 'armor_4',
      count: 1
    }
  },
  recipe_armor_5: {
    id: 'recipe_armor_5',
    name: '炼制天蚕甲',
    facility: 'forge',
    requiredLevel: 3,
    ingredients: [
      {
        itemId: 'moon_dew',
        count: 12
      },
      {
        itemId: 'dragon_bone',
        count: 6
      }
    ],
    spiritStoneCost: 650,
    output: {
      itemId: 'armor_5',
      count: 1
    }
  },
  recipe_armor_6: {
    id: 'recipe_armor_6',
    name: '炼制仙霞衣',
    facility: 'forge',
    requiredLevel: 3,
    ingredients: [
      {
        itemId: 'void_crystal',
        count: 18
      },
      {
        itemId: 'immortal_ash',
        count: 8
      }
    ],
    spiritStoneCost: 1500,
    output: {
      itemId: 'armor_6',
      count: 1
    }
  },
  recipe_ring_1: {
    id: 'recipe_ring_1',
    name: '炼制纳物戒',
    facility: 'forge',
    requiredLevel: 1,
    ingredients: [
      {
        itemId: 'spirit_herb',
        count: 2
      },
      {
        itemId: 'iron_ore',
        count: 1
      }
    ],
    spiritStoneCost: 25,
    output: {
      itemId: 'ring_1',
      count: 1
    }
  },
  recipe_ring_2: {
    id: 'recipe_ring_2',
    name: '炼制破军戒',
    facility: 'forge',
    requiredLevel: 1,
    ingredients: [
      {
        itemId: 'spirit_herb',
        count: 4
      },
      {
        itemId: 'frost_petal',
        count: 2
      }
    ],
    spiritStoneCost: 60,
    output: {
      itemId: 'ring_2',
      count: 1
    }
  },
  recipe_ring_3: {
    id: 'recipe_ring_3',
    name: '炼制聚灵戒',
    facility: 'forge',
    requiredLevel: 2,
    ingredients: [
      {
        itemId: 'frost_petal',
        count: 7
      },
      {
        itemId: 'thunder_copper',
        count: 3
      }
    ],
    spiritStoneCost: 150,
    output: {
      itemId: 'ring_3',
      count: 1
    }
  },
  recipe_ring_4: {
    id: 'recipe_ring_4',
    name: '炼制镇岳戒',
    facility: 'forge',
    requiredLevel: 2,
    ingredients: [
      {
        itemId: 'dawn_root',
        count: 12
      },
      {
        itemId: 'cloud_sand',
        count: 5
      }
    ],
    spiritStoneCost: 380,
    output: {
      itemId: 'ring_4',
      count: 1
    }
  },
  recipe_ring_5: {
    id: 'recipe_ring_5',
    name: '炼制天道戒',
    facility: 'forge',
    requiredLevel: 3,
    ingredients: [
      {
        itemId: 'moon_dew',
        count: 12
      },
      {
        itemId: 'dragon_bone',
        count: 6
      }
    ],
    spiritStoneCost: 650,
    output: {
      itemId: 'ring_5',
      count: 1
    }
  },
  recipe_ring_6: {
    id: 'recipe_ring_6',
    name: '炼制仙府戒',
    facility: 'forge',
    requiredLevel: 3,
    ingredients: [
      {
        itemId: 'void_crystal',
        count: 18
      },
      {
        itemId: 'immortal_ash',
        count: 8
      }
    ],
    spiritStoneCost: 1500,
    output: {
      itemId: 'ring_6',
      count: 1
    }
  },
  recipe_shoes_1: {
    id: 'recipe_shoes_1',
    name: '炼制流云履',
    facility: 'forge',
    requiredLevel: 1,
    ingredients: [
      {
        itemId: 'spirit_silk',
        count: 1
      },
      {
        itemId: 'spirit_herb',
        count: 1
      }
    ],
    spiritStoneCost: 25,
    output: {
      itemId: 'shoes_1',
      count: 1
    }
  },
  recipe_shoes_2: {
    id: 'recipe_shoes_2',
    name: '炼制影踪靴',
    facility: 'forge',
    requiredLevel: 1,
    ingredients: [
      {
        itemId: 'spirit_silk',
        count: 2
      },
      {
        itemId: 'spirit_herb',
        count: 2
      }
    ],
    spiritStoneCost: 60,
    output: {
      itemId: 'shoes_2',
      count: 1
    }
  },
  recipe_shoes_3: {
    id: 'recipe_shoes_3',
    name: '炼制踏浪靴',
    facility: 'forge',
    requiredLevel: 2,
    ingredients: [
      {
        itemId: 'spirit_silk',
        count: 4
      },
      {
        itemId: 'frost_petal',
        count: 4
      }
    ],
    spiritStoneCost: 150,
    output: {
      itemId: 'shoes_3',
      count: 1
    }
  },
  recipe_shoes_4: {
    id: 'recipe_shoes_4',
    name: '炼制追风靴',
    facility: 'forge',
    requiredLevel: 2,
    ingredients: [
      {
        itemId: 'spirit_silk',
        count: 7
      },
      {
        itemId: 'dawn_root',
        count: 7
      }
    ],
    spiritStoneCost: 380,
    output: {
      itemId: 'shoes_4',
      count: 1
    }
  },
  recipe_shoes_5: {
    id: 'recipe_shoes_5',
    name: '炼制天行履',
    facility: 'forge',
    requiredLevel: 3,
    ingredients: [
      {
        itemId: 'spirit_silk',
        count: 8
      },
      {
        itemId: 'moon_dew',
        count: 8
      }
    ],
    spiritStoneCost: 650,
    output: {
      itemId: 'shoes_5',
      count: 1
    }
  },
  recipe_shoes_6: {
    id: 'recipe_shoes_6',
    name: '炼制仙遁靴',
    facility: 'forge',
    requiredLevel: 3,
    ingredients: [
      {
        itemId: 'spirit_silk',
        count: 12
      },
      {
        itemId: 'void_crystal',
        count: 12
      }
    ],
    spiritStoneCost: 1500,
    output: {
      itemId: 'shoes_6',
      count: 1
    }
  },
  recipe_belt_1: {
    id: 'recipe_belt_1',
    name: '炼制韧皮腰带',
    facility: 'forge',
    requiredLevel: 1,
    ingredients: [
      {
        itemId: 'spirit_silk',
        count: 1
      },
      {
        itemId: 'spirit_herb',
        count: 1
      }
    ],
    spiritStoneCost: 25,
    output: {
      itemId: 'belt_1',
      count: 1
    }
  },
  recipe_belt_2: {
    id: 'recipe_belt_2',
    name: '炼制玄铁腰带',
    facility: 'forge',
    requiredLevel: 1,
    ingredients: [
      {
        itemId: 'spirit_silk',
        count: 2
      },
      {
        itemId: 'spirit_herb',
        count: 2
      }
    ],
    spiritStoneCost: 60,
    output: {
      itemId: 'belt_2',
      count: 1
    }
  },
  recipe_belt_3: {
    id: 'recipe_belt_3',
    name: '炼制聚灵腰带',
    facility: 'forge',
    requiredLevel: 2,
    ingredients: [
      {
        itemId: 'spirit_silk',
        count: 4
      },
      {
        itemId: 'frost_petal',
        count: 4
      }
    ],
    spiritStoneCost: 150,
    output: {
      itemId: 'belt_3',
      count: 1
    }
  },
  recipe_belt_4: {
    id: 'recipe_belt_4',
    name: '炼制镇魂腰带',
    facility: 'forge',
    requiredLevel: 2,
    ingredients: [
      {
        itemId: 'spirit_silk',
        count: 7
      },
      {
        itemId: 'dawn_root',
        count: 7
      }
    ],
    spiritStoneCost: 380,
    output: {
      itemId: 'belt_4',
      count: 1
    }
  },
  recipe_belt_5: {
    id: 'recipe_belt_5',
    name: '炼制天罗带',
    facility: 'forge',
    requiredLevel: 3,
    ingredients: [
      {
        itemId: 'spirit_silk',
        count: 8
      },
      {
        itemId: 'moon_dew',
        count: 8
      }
    ],
    spiritStoneCost: 650,
    output: {
      itemId: 'belt_5',
      count: 1
    }
  },
  recipe_belt_6: {
    id: 'recipe_belt_6',
    name: '炼制仙蚕带',
    facility: 'forge',
    requiredLevel: 3,
    ingredients: [
      {
        itemId: 'spirit_silk',
        count: 12
      },
      {
        itemId: 'void_crystal',
        count: 12
      }
    ],
    spiritStoneCost: 1500,
    output: {
      itemId: 'belt_6',
      count: 1
    }
  }
};

export const TALENTS: Record<string, TalentDefinition> = {
  sturdy_body: {
    id: 'sturdy_body',
    name: '强身',
    description: '每级新一世最大生命 +12。',
    maxLevel: 5,
    quality: '凡品'
  },
  clear_mind: {
    id: 'clear_mind',
    name: '澄心',
    description: '每级新一世最大灵气 +8。',
    maxLevel: 5,
    quality: '凡品'
  },
  bigger_bag: {
    id: 'bigger_bag',
    name: '袖里乾坤',
    description: '每级身上格子 +2。',
    maxLevel: 5,
    quality: '灵器'
  },
  keen_blade: {
    id: 'keen_blade',
    name: '利刃',
    description: '每级物攻 +3。',
    maxLevel: 5,
    quality: '灵器'
  },
  spirit_focus: {
    id: 'spirit_focus',
    name: '凝神',
    description: '每级法攻 +3。',
    maxLevel: 5,
    quality: '灵宝'
  },
  iron_wall: {
    id: 'iron_wall',
    name: '铁壁',
    description: '每级物防 +2。',
    maxLevel: 5,
    quality: '灵宝'
  },
  mana_shield: {
    id: 'mana_shield',
    name: '灵盾',
    description: '每级法防 +2。',
    maxLevel: 5,
    quality: '玄天灵宝'
  },
  fleet_foot: {
    id: 'fleet_foot',
    name: '捷足',
    description: '每级攻速 +4%。',
    maxLevel: 5,
    quality: '玄天灵宝'
  },
  lucky_drop: {
    id: 'lucky_drop',
    name: '奇遇',
    description: '每级掉落数量倾向 +1。',
    maxLevel: 5,
    quality: '通天灵宝'
  },
  long_breath: {
    id: 'long_breath',
    name: '绵长',
    description: '每级寿元上限 +15。',
    maxLevel: 5,
    quality: '通天灵宝'
  },
  escape_artist: {
    id: 'escape_artist',
    name: '脱身',
    description: '每级逃跑成功率 +3%。',
    maxLevel: 5,
    quality: '？？？'
  },
  alchemy_gift: {
    id: 'alchemy_gift',
    name: '丹缘',
    description: '每级炼丹产物 +1。',
    maxLevel: 5,
    quality: '？？？'
  }
};

export const BEST_GEAR: Record<string, string> = {
  melee: 'melee_6', ranged: 'ranged_6', armor: 'armor_6', ring: 'ring_6', shoes: 'shoes_6', belt: 'belt_6'
};

export const BEST_POTIONS = ['pill_heal_6', 'pill_mana_6', 'pill_escape_6'] as const;

export const CONTENT_VERSION = 6;
export const BASE_ESCAPE_CHANCE = 0.5;
export const BASE_ESCAPE_COOLDOWN_MS = 20000;
export const MAX_ESCAPE_CHANCE = 0.95;
export const MAX_POTION_SLOTS = 3;

export function enemyDisplayName(enemyId: string, rank: EnemyRank = 'normal'): string {
  const name = ENEMIES[enemyId]?.name ?? enemyId;
  if (rank === 'elite') return `精英·${name}`;
  if (rank === 'boss') return `首领·${name}`;
  return name;
}

export function scaleEnemyCombatStats(enemyId: string, rank: EnemyRank = 'normal') {
  const base = ENEMIES[enemyId];
  const power = ENEMY_RANK_MULTIPLIERS[rank].power;
  return {
    maxHp: Math.round(base.maxHp * power),
    physicalAttack: Math.round(base.physicalAttack * power),
    physicalDefense: Math.round(base.physicalDefense * power),
    spellDefense: Math.round(base.spellDefense * power),
    attacksPerSecond: base.attacksPerSecond
  };
}

export function scaledEnemyExp(enemyId: string, rank: EnemyRank = 'normal'): number {
  return Math.round(ENEMIES[enemyId].exp * ENEMY_RANK_MULTIPLIERS[rank].exp);
}

export function scaledEnemyLoot(enemyId: string, rank: EnemyRank = 'normal'): ItemStack[] {
  const multiplier = ENEMY_RANK_MULTIPLIERS[rank].loot;
  return ENEMIES[enemyId].loot.map((stack) => ({
    itemId: stack.itemId,
    count: Math.max(1, Math.round(stack.count * multiplier))
  }));
}

export function validateContent(): string[] {
  const errors: string[] = [];
  for (const potion of Object.values(POTIONS)) {
    if (!ITEMS[potion.itemId] || ITEMS[potion.itemId].kind !== 'potion') errors.push(`丹药引用无效: ${potion.itemId}`);
  }
  for (const recipe of Object.values(RECIPES)) {
    if (!ITEMS[recipe.output.itemId]) errors.push(`配方产物不存在: ${recipe.id}`);
    for (const ingredient of recipe.ingredients) if (!ITEMS[ingredient.itemId]) errors.push(`配方材料不存在: ${recipe.id}/${ingredient.itemId}`);
  }
  for (const enemy of Object.values(ENEMIES)) {
    for (const loot of enemy.loot) if (!ITEMS[loot.itemId]) errors.push(`敌人掉落不存在: ${enemy.id}/${loot.itemId}`);
    for (const passiveId of enemy.passiveLoot ?? []) if (!PASSIVES[passiveId]) errors.push(`敌人心法掉落无效: ${enemy.id}/${passiveId}`);
    for (const skillId of enemy.skillLoot ?? []) if (!SKILLS[skillId]) errors.push(`敌人秘术掉落无效: ${enemy.id}/${skillId}`);
  }
  if (Object.keys(SKILLS).length !== 12) errors.push('秘术数量应为 12');
  if (Object.keys(PASSIVES).length !== 12) errors.push('心法数量应为 12');
  if (Object.keys(ENEMIES).length !== 18) errors.push('敌人数量应为 18');
  if (Object.keys(TALENTS).length !== 12) errors.push('天赋数量应为 12');
  for (const [layer, ids] of Object.entries(ENEMIES_BY_LAYER)) {
    for (const id of ids) {
      if (!ENEMIES[id]) errors.push(`难度层 ${layer} 敌人不存在: ${id}`);
    }
  }
  return errors;
}
