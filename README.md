# 辞职修仙传（网页版）

竖屏手机网页修仙肉鸽 Demo。洞府备战后进入小/中/大格子地图，采集、触发事件并进行格上 CD 自动战斗；回府沉淀战利品，死亡后通过轮回天赋继续成长。

## 当前首版

- Phaser 地图、点击相邻格/滑动/WASD 移动与格上 Tween
- 攻速普攻 + 秘术独立 CD；三个手动丹药快捷槽
- S/M/L 三档地图、1/2/3 层、确定性 seed 与连通性验证
- 洞府仓库、采矿、炼丹、炼器、装配
- 死亡轮回与三项永久天赋
- IndexedDB 双份本地存档、JSON 导入导出、PWA 离线壳

## 验证

```bash
npm run check
npm run test:e2e
```

本地首版已通过 14 项核心测试、S/M/L 各 100 个地图 seed，以及生产包桌面 Chromium / iPhone 15 尺寸移动 WebKit / PWA 端到端回归。详细证据见 `docs/2026-08-04_首版验收记录.md`。

## 发布

项目包含 `vercel.json`，连接 Vercel 后先运行 `npx vercel --yes` 创建 Preview，线上验收后再运行 `npx vercel --prod --yes`。

也支持 GitHub Pages：将工程放进名为 `ResignToCultivateWeb` 的 GitHub 仓库并推送 `main` 后，`.github/workflows/deploy-pages.yml` 会自动构建发布。项目站点地址通常是 `https://<用户名>.github.io/ResignToCultivateWeb/`；Vite、PWA manifest 和 Service Worker 已按仓库子路径适配。首次需要在仓库 Settings → Pages 中将 Source 设为 GitHub Actions。

工程本体与测试证据保留在本目录；玩法权威规格位于 Infans_Vault 的 `30_事业顺利/游戏开发/辞职修仙传/`。

接手开发前请先阅读根目录的 [开发交接.md](./开发交接.md)。
