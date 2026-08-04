# 辞职修仙传（网页版）

竖屏手机网页修仙肉鸽 **Demo**。洞府备战后进入小/中/大格子地图，采集、触发事件并进行格上 CD 自动战斗；回府沉淀战利品，死亡后通过轮回天赋继续成长。

> 当前仍是 **Demo 阶段**：可玩、可测、可持续改；规格未冻结。公开站可能落后于本地构建。

## 当前 Demo 能力（摘要）

- Phaser 地图（噪声地形 GENERATOR v5）、点击相邻格/滑动/WASD、迷雾视野、格上 Tween
- 攻速普攻 + 最多 6 门已装配秘术独立 CD；腰带丹药快捷槽（血/灵/遁）；逃跑
- S/M/L 三档地图、合计 6 难度层、确定性 seed；敌人/秘境可掉心法与秘术
- 洞府仓库、**叩击灵脉采矿**、炼丹、炼器、六槽装配；品质凡品→？？？外框（CONTENT v6）
- 死亡轮回：12 天赋池，**每次只给 3 个选项**强化
- IndexedDB 双份本地存档、JSON 导入导出、PWA 离线壳、BGM/SFX
- Demo 测试钮「风灵月影」（一键化神满配）

设计落地说明：[项目管理/10_📐设计文档/](./项目管理/10_📐设计文档/README.md)

**最新试玩**：本工程目录执行 `npm run dev`（勿与梅凝工作台抢 5173；可用 `--port 5180`）。公开站可能落后。


## 项目管理

过程文档、设计分层、开发日志、版本快照统一在 [项目管理/](./项目管理/README.md)（含 **中转站**、制作人待办等）。

接手开发请先读 [开发交接.md](./开发交接.md)。

## 验证

```bash
npm run check
npm run test:e2e
```

首版验收证据见 [`项目管理/30_📦版本快照/2026-08-04_v0.1.0_首版.md`](./项目管理/30_📦版本快照/2026-08-04_v0.1.0_首版.md)。之后 Demo 迭代以设计文档与单测为准。

## 发布

项目包含 `vercel.json`，连接 Vercel 后先运行 `npx vercel --yes` 创建 Preview，线上验收后再运行 `npx vercel --prod --yes`。

也支持 GitHub Pages：将工程放进名为 `ResignToCultivateWeb` 的 GitHub 仓库并推送 `main` 后，`.github/workflows/deploy-pages.yml` 会自动构建发布。项目站点地址通常是 `https://<用户名>.github.io/ResignToCultivateWeb/`；Vite、PWA manifest 和 Service Worker 已按仓库子路径适配。首次需要在仓库 Settings → Pages 中将 Source 设为 GitHub Actions。

工程本体与测试证据保留在本目录；玩法权威规格位于 Infans_Vault 的 `30_事业顺利/游戏开发/辞职修仙传/`。
