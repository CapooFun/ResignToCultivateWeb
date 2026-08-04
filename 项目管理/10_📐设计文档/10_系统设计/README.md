# 系统设计

**阶段**: Demo  
**最后更新**: 2026-08-04

| 文档 | 说明 |
|------|------|
| [Demo系统契约.md](./Demo系统契约.md) | 架构、存档 v3、CONTENT v6、GENERATOR v5、命令全表、地图/迷雾、音频、品质系统侧 |

| 主题 | 代码入口 | 文档状态 |
|------|----------|----------|
| 规则与命令 | `src/game/core.ts` | 契约已写 |
| 内容与品质 | `src/game/content.ts` | 契约 + 数值文档 |
| 地图生成 | `src/game/mapGenerator.ts` + `noise.ts` | 契约已写（v5） |
| 存档 | `src/game/save.ts` | 契约已写 |
| 状态派发 | `src/game/store.ts` | 以代码为准 |
| 音频 | `src/game/audio.ts` | 契约已写 |
| Phaser 地图视图 | `src/components/MapView.tsx` | 契约摘要 + UI 文档 |
| 采矿面板 | `src/components/MinePanel.tsx` | UI 文档 |
| PWA / SW | `vite.config.ts` + `vite-plugin-pwa` | 以代码为准 |
