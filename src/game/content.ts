import type {
  EnemyDefinition,
  ItemDefinition,
  MapTier,
  PotionDefinition,
  RecipeDefinition,
  SkillDefinition,
  TalentDefinition
} from './types';

export const MAP_TIERS: Record<MapTier, { name: string; size: number; floors: number; cost: number; recommended: string }> = {
  S: { name: '青石谷', size: 16, floors: 1, cost: 3, recommended: '炼气' },
  M: { name: '云梦泽', size: 24, floors: 2, cost: 5, recommended: '筑基' },
  L: { name: '太玄山', size: 32, floors: 3, cost: 10, recommended: '结丹' }
};

export const ITEMS: Record<string, ItemDefinition> = {
  iron_ore: { id: 'iron_ore', name: '赤铜矿', kind: 'material', description: '炼器用的基础灵材。', maxStack: 99 },
  spirit_herb: { id: 'spirit_herb', name: '青灵草', kind: 'herb', description: '炼丹用的基础灵药。', maxStack: 99 },
  healing_pill: { id: 'healing_pill', name: '回春丹', kind: 'potion', description: '恢复 55 点生命。', maxStack: 20 },
  mana_pill: { id: 'mana_pill', name: '聚灵丹', kind: 'potion', description: '恢复 38 点灵气。', maxStack: 20 },
  balanced_pill: { id: 'balanced_pill', name: '归元丹', kind: 'potion', description: '恢复 28 点生命与 18 点灵气。', maxStack: 20 },
  bronze_sword: {
    id: 'bronze_sword', name: '赤铜剑', kind: 'equipment', description: '物攻 +8。', maxStack: 1,
    equipmentSlot: 'melee', physicalAttack: 8
  },
  spirit_bow: {
    id: 'spirit_bow', name: '青木弓', kind: 'equipment', description: '物攻 +5，法攻 +3。', maxStack: 1,
    equipmentSlot: 'ranged', physicalAttack: 5, spellAttack: 3
  },
  cloth_armor: {
    id: 'cloth_armor', name: '云纹袍', kind: 'equipment', description: '双防 +5。', maxStack: 1,
    equipmentSlot: 'armor', physicalDefense: 5, spellDefense: 5
  },
  storage_ring: {
    id: 'storage_ring', name: '纳物戒', kind: 'equipment', description: '身上格子 +4。', maxStack: 1,
    equipmentSlot: 'ring', bagSlots: 4
  }
};

export const POTIONS: Record<string, PotionDefinition> = {
  healing_pill: { itemId: 'healing_pill', healHp: 55, restoreMp: 0 },
  mana_pill: { itemId: 'mana_pill', healHp: 0, restoreMp: 38 },
  balanced_pill: { itemId: 'balanced_pill', healHp: 28, restoreMp: 18 }
};

export const SKILLS: Record<string, SkillDefinition> = {
  sword_art: {
    id: 'sword_art', name: '御剑诀', description: '造成 145% 物理伤害。', damageType: 'physical',
    multiplier: 1.45, mpCost: 8, cooldownMs: 4200, priority: 10
  },
  firebolt: {
    id: 'firebolt', name: '火弹术', description: '造成 170% 法术伤害。', damageType: 'spell',
    multiplier: 1.7, mpCost: 14, cooldownMs: 6800, priority: 20
  }
};

export const ENEMIES: Record<string, EnemyDefinition> = {
  mountain_wolf: {
    id: 'mountain_wolf', name: '山狼', maxHp: 105, physicalAttack: 18, physicalDefense: 9,
    spellDefense: 7, attacksPerSecond: 0.65, exp: 38, loot: [{ itemId: 'spirit_herb', count: 1 }]
  },
  fire_crow: {
    id: 'fire_crow', name: '火鸦', maxHp: 160, physicalAttack: 25, physicalDefense: 13,
    spellDefense: 15, attacksPerSecond: 0.78, exp: 62, loot: [{ itemId: 'iron_ore', count: 2 }]
  },
  stone_puppet: {
    id: 'stone_puppet', name: '石傀儡', maxHp: 245, physicalAttack: 32, physicalDefense: 24,
    spellDefense: 18, attacksPerSecond: 0.58, exp: 95, loot: [{ itemId: 'iron_ore', count: 3 }]
  }
};

export const RECIPES: Record<string, RecipeDefinition> = {
  healing_recipe: {
    id: 'healing_recipe', name: '炼制回春丹', facility: 'alchemy',
    ingredients: [{ itemId: 'spirit_herb', count: 2 }], spiritStoneCost: 10,
    output: { itemId: 'healing_pill', count: 2 }
  },
  mana_recipe: {
    id: 'mana_recipe', name: '炼制聚灵丹', facility: 'alchemy',
    ingredients: [{ itemId: 'spirit_herb', count: 2 }], spiritStoneCost: 12,
    output: { itemId: 'mana_pill', count: 2 }
  },
  sword_recipe: {
    id: 'sword_recipe', name: '炼制赤铜剑', facility: 'forge',
    ingredients: [{ itemId: 'iron_ore', count: 3 }], spiritStoneCost: 30,
    output: { itemId: 'bronze_sword', count: 1 }
  },
  ring_recipe: {
    id: 'ring_recipe', name: '炼制纳物戒', facility: 'forge',
    ingredients: [{ itemId: 'iron_ore', count: 4 }], spiritStoneCost: 45,
    output: { itemId: 'storage_ring', count: 1 }
  }
};

export const TALENTS: Record<string, TalentDefinition> = {
  sturdy_body: { id: 'sturdy_body', name: '强身', description: '每级新一世最大生命 +12。', maxLevel: 5 },
  clear_mind: { id: 'clear_mind', name: '澄心', description: '每级新一世最大灵气 +8。', maxLevel: 5 },
  bigger_bag: { id: 'bigger_bag', name: '袖里乾坤', description: '每级身上格子 +2。', maxLevel: 3 }
};

export const CONTENT_VERSION = 1;

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
  }
  return errors;
}

