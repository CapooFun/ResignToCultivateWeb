# Demo 内容规模与契约

**阶段**: Demo  
**工程**: v0.1.0  
**CONTENT_VERSION**: **6**  
**SAVE_VERSION**: **3**  
**GENERATOR_VERSION**: **5**  
**最后更新**: 2026-08-04  
**事实来源**: `src/game/content.ts`、`src/game/types.ts`、`src/game/mapGenerator.ts`（改表以代码为准）

## 1. 规模一览

| 类型 | 数量 | 备注 |
|------|------|------|
| 秘术 | 12 | 掉落/秘境；装配上限 `MAX_EQUIPPED_SKILLS = 6` |
| 心法 | 12 | 掉落/秘境；叠层 `maxStacks` |
| 敌人 | 18 | 6 难度层各 3（`ENEMIES_BY_LAYER`） |
| 轮回天赋 | 12 | 每次死亡 `offeredTalents` 抽 3 个供强化 |
| 灵材 | 12 | 与炼丹/炼器配方对应 |
| 法宝 | 每槽 6 | melee / ranged / armor / ring / belt / shoes（UI：戒→腰→鞋） |
| 丹药 | 每类 6 | 血 / 灵 / 遁；可复合 healHp / restoreMp / escapeBonus |
| 品质 | 6 档 | 凡品 → 灵器 → 灵宝 → 玄天灵宝 → 通天灵宝 → ？？？ |

另有少量 **旧 ID 别名**（如 `pill_heal_s`、`bronze_sword`、`iron_belt`）方便存档与测试兼容，不计入「正式阶」叙事。

## 2. 六层难度与境界

| 全局层 | 地图 | 对应境界 | 敌例 |
|--------|------|----------|------|
| 1 | 青石谷 1 | 炼气 | 山狼 / 风蝠 / 火鸦 |
| 2 | 云梦泽 1 | 筑基 | 泽蛇 / 石傀儡 / 雾蟾 |
| 3 | 云梦泽 2 | 结丹 | 雷蜥 / 霜灵 / 血豕 |
| 4 | 太玄山 1 | 元婴 | 影狐 / 灵傀 / 玉蟒 |
| 5 | 太玄山 2 | 化神 | 天鹤 / 烬魔 / 虚影 |
| 6 | 太玄山 3 | 化神较强 | 仙傀 / 混沌魔 / 星渊蛟 |

奖励（修为、掉落量、资源点数量）与敌人面板均按层指数拉开；高层收益远高于低层。  
精英约 +30% 面板、经验/掉落 ×3；首领约 +100% 面板、经验/掉落 ×6（`ENEMY_RANK_MULTIPLIERS`）。

## 3. 品质与色板

字段：`ItemQuality`。对齐裸辞修仙传 `Enums.Quality`；色值对齐 `QualityDisplayService`。

| 档 | 名称 | Hex | CSS |
|----|------|-----|-----|
| 0 | 凡品 | `#3A3C3E` | `q-common` |
| 1 | 灵器 | `#549688` | `q-uncommon` |
| 2 | 灵宝 | `#1661AB` | `q-rare` |
| 3 | 玄天灵宝 | `#6D28D9` | `q-epic` |
| 4 | 通天灵宝 | `#CA6924` | `q-legendary` |
| 5 | ？？？ | `#AB3B3A` | `q-unknown` |

常量：`ITEM_QUALITY_ORDER` / `ITEM_QUALITY_COLORS` / `ITEM_QUALITY_CSS` / `qualityCssClass()`。  
出现在物品 / 秘术 / 心法 / 敌人 / 天赋定义上。Demo 主要用于展示、分档与外框辨识，**不做**独立词条系统。

## 4. 配方与设施

- 炼丹 / 炼器配方挂在 `RECIPES`；`requiredLevel` 1–3
- 洞府设施 Demo 上限仍为 **3 级**；升级灵石 `facilityUpgradeCost`：`180 × 3^(level-1)` → 180 → 540
- 采矿年产 `mineYieldPerYear`：80 → 160 → 320（×2）；回府按本趟寿元计入待收
- **手动叩击** `manualMineStrikeTable`：
  - Lv1：普击 1–4 · 爆发 6%→24–48
  - Lv2：2–8 · 9%→55–96
  - Lv3：4–14 · 13%→110–200
- 灵息上限 `mineBreathMax`：15 → 20 → 25；回复间隔 3.5s → 3.0s → 2.5s
- 丹药炼制灵石约 **12 / 30 / 75 / 180 / 320 / 750**
- 法宝炼制灵石约 **25 / 60 / 150 / 380 / 650 / 1500**
- 材料数量随品阶近似指数增长；五六品已略缓，逼玩家去更高层但仍可追
- 天赋「丹缘」：每级炼丹产物 +1（已生效）

## 5. 境界与修为（累计阈值）

| realmLevel | 境界 | 修为阈值 |
|------------|------|----------|
| 1 | 炼气 | — |
| 2 | 筑基 | ≥ 200 |
| 3 | 结丹 | ≥ 700 |
| 4 | 元婴 | ≥ 2200 |
| 5 | 化神 | ≥ 7000 |

`REALM_EXP_THRESHOLDS = [0, 200, 700, 2200, 7000]`

## 6. 逃跑相关数值（摘要）

- 基础成功率 50%，上限 95%；基础 CD 20s，下限 4s
- 顶级鞋 `shoes_6`：成功率 +25%、CD −7.5s
- 遁药写入 `nextEscapeBonus`（下一次逃跑）

## 7. 测试常量

- `BEST_GEAR` / `BEST_POTIONS`：风灵月影作弊装用
- 作弊命令：`APPLY_CHEAT`（洞府 UI「风灵月影」）

## 8. 校验

`validateContent()`（启动时执行）：

- 检查丹药 / 配方 / 掉落引用
- 断言秘术 / 心法 / 天赋为 12、敌人为 18
- 断言 `ENEMIES_BY_LAYER` 引用有效
