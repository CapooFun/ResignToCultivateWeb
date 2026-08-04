# 系统设计要点（Demo）

**阶段**: Demo  
**工程版本**: v0.1.0  
**SAVE_VERSION**: 3 · **CONTENT_VERSION**: 6 · **GENERATOR_VERSION**: 5  
**最后更新**: 2026-08-04  
**事实来源**: `src/game/*.ts`（冲突以代码为准）

工程骨架已在代码中；本页记**当前契约摘要**。

## 1. 架构

```
React UI / Phaser MapView
        │ 派发 GameCommand
        ▼
   gameStore（订阅 + 串行自动存档）
        ▼
dispatchGameCommand → core.ts（纯规则）
        │
   content.ts（表） · mapGenerator.ts（生成） · inventory.ts（堆叠）
```

| 层 | 职责 | 入口 |
|----|------|------|
| 规则 | 状态迁移、战斗结算、采矿、轮回 | `src/game/core.ts` |
| 内容 | 物品/敌人/配方/品质/校验 | `src/game/content.ts` |
| 地图 | 种子生成、迷雾视野、实体放置 | `src/game/mapGenerator.ts` + `noise.ts` |
| 存档 | IndexedDB 双份 + JSON 导入导出 | `src/game/save.ts` |
| 派发 | 订阅、命令、自动保存 | `src/game/store.ts` |
| 音频 | BGM/SFX、手势解锁、静音 | `src/game/audio.ts` |
| 视图 | HUD / 洞府面板 / Phaser | `App.tsx`、`MapView.tsx`、`MinePanel.tsx` |

规则层不依赖 DOM；视图只渲染与派发。

## 2. 存档

| 字段 | 当前 |
|------|------|
| `SAVE_VERSION` | **3** |
| `CONTENT_VERSION` | **6** |
| 存储 | IndexedDB：`current` + `backup`；主档失败尝试备份 |
| 迁移 | `migrateGameState`（见下） |

### 迁移要点

- 拒绝高于当前 `SAVE_VERSION` 的档
- `saveVersion` 落后或 `contentVersion !== 6` 时跑迁移
- 补齐：六装备槽、心法叠层、`learnedSkills`、装配秘术 ≤ 6
- 旧 `potionSlots` → `potionBelt`；旧物品 ID 别名映射
- 过滤失效物品/装备；补逃跑字段、`offeredTalents`、弹窗、采矿灵息字段
- 地图旧实体 `town` → `spring`；敌人默认 `enemyRank: 'normal'`

内容或字段大改时同步抬 `CONTENT_VERSION` / `SAVE_VERSION`，并保证旧档可迁。

## 3. 关键状态字段（相对首版增量）

**玩家**

- `learnedSkills` / `equippedSkills`（≤ `MAX_EQUIPPED_SKILLS = 6`）
- `passives: Record<id, stacks>`
- `equipment` 六槽：melee / ranged / armor / ring / belt / shoes（UI 顺序同此）
- `potionBelt`（与背包分离，战斗只扣腰带）

**洞府 `CaveState`（采矿）**

| 字段 | 含义 |
|------|------|
| `mineLevel` / `mineStored` | 矿场等级、待收灵石 |
| `mineBreath` / `mineBreathAt` | 当前灵息、上次结算时间戳 |
| `mineRngState` / `mineStrikeSeq` | 手动采矿 RNG / 序号 |
| `lastMineStrike` | 最近一次叩击结果（含 jackpot） |

**轮回**

- `offeredTalents: string[3]`（每次死亡重抽，仅可强化这三项）

## 4. 命令 `GameCommand`

| 组 | Command | 用途 |
|----|---------|------|
| 场景 | `OPEN_SELECT` / `CLOSE_SELECT` / `START_RUN` | 选图进出 |
| 探索 | `MOVE` / `RETURN_CAVE` / `ADVANCE_FLOOR` | 移动、回府、下层 |
| 战斗 | `TICK_COMBAT` / `QUEUE_POTION` / `ATTEMPT_ESCAPE` / `COMBAT_ANIMATION_DONE` | 结算、用药、逃跑、动画锁 |
| 丹药 | `ASSIGN_POTION` / `CLEAR_POTION_SLOT` | 腰带挂卸 |
| 洞府 | `COLLECT_MINE` / `MANUAL_MINE` / `UPGRADE_FACILITY` / `CRAFT` | 收矿、叩击、升级、炼制 |
| 库存 | `TRANSFER_ITEM` / `TRANSFER_ALL_TO_WAREHOUSE` / `EQUIP` | 转移、装备 |
| 成长 | `TOGGLE_SKILL` / `BUY_TALENT` / `REINCARNATE` | 秘术装配、买天赋、转世 |
| 调试/UI | `APPLY_CHEAT` / `RESET_GAME` / `SET_MESSAGE` / `DISMISS_POPUP` | 风灵月影、清档、文案、关弹窗 |

完整联合类型见 `types.ts`。

## 5. 地图生成（GENERATOR_VERSION 5）

- **确定性种子**；地形用四个 `Noise2D` 场（海拔 / 湿度 / 细节 / 山脊）+ FBM
- 映射：`plain` / `forest` / `water` / `mountain`；两轮孤立格合并；边界为山
- 强制连通：出生点 ↔ 两处回府；非末层再通深层传送点；BFS 校验
- **实体** `EntityKind`：`enemy` / `resource` / `spring` / `secret` / `return` / `depth`
- 每层：2×回府、1×灵泉、1×秘境、资源与普通敌；固定 1 精英；中/大图末层 +1 首领
- 敌人池：`ENEMIES_BY_LAYER` 六层各 3（共 18）

### 迷雾与视野

| 项 | 规则 |
|----|------|
| 初始揭示 | 出生点半径 2 |
| 移动揭示 | `fogRevealRadius(realm)`：炼气/筑基 2；结丹/元婴 3；化神 4 |
| 揭示形状 | 曼哈顿距离 ≤ radius + 1 |
| 可视窗格 | 基础 7×9；筑基/结丹 9×11；元婴 11×13；化神 13×15 |
| 未揭示 | `MapView` 暗色，不渲染实体 |

### 地形门槛（进入）

- 平原/林：炼气可入  
- 水：筑基  
- 山：结丹  

## 6. 音频

- `src/game/audio.ts`：BGM（洞府 / 探索 / 战斗）+ 系统/战斗 SFX
- `main.tsx`：`bindUnlock` + `preload`（需用户手势）
- `App.tsx`：按场景切 BGM；点击/胜负/逃跑/弹窗等 SFX；设置可静音（持久化）
- `MapView`：成功移动播移动音

资源目录：`public/audio/bgm/`、`combat_sfx/`、`system_sfx/`。

## 7. 品质（系统侧）

- 类型：`ItemQuality` = 凡品 / 灵器 / 灵宝 / 玄天灵宝 / 通天灵宝 / ？？？
- 色板与 CSS 类：`ITEM_QUALITY_COLORS` / `ITEM_QUALITY_CSS` / `qualityCssClass()`（`content.ts`）
- 对齐裸辞修仙传 `Enums.Quality` + `QualityDisplayService` 色值
- Demo **不做**独立词条实例系统；品质主要用于分档展示与外框

## 8. 验证入口

```bash
npm run check      # 单测 + 生产构建
npm run test:e2e   # 可选
```

- `validateContent()` 在 `main.tsx` 启动时执行，失败则阻断启动
- 当前单测约 29 项（`tests/`，随 Demo 增减）
