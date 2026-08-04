# 经验扩展

**最后更新**: 2026-08-04

可复用的踩坑与最佳实践按主题存放（例如 `Phaser/`、`PWA/`、`存档/`）。

从开发日志里提炼「以后还会再用」的结论写到这里，避免日志变成唯一知识库。

## 已有种子（可后续成文）

- React StrictMode 下 WebKit 重复挂载 Phaser 画布 → 需防双挂载
- 动画完成回执可被渲染更新取消 → 需动画锁 / 测试覆盖
- Playwright WebKit 离线模拟不可靠 → iOS 离线冷启动改真机验收
- GitHub Pages 子路径：`base` / manifest / SW / 静态资源须带仓库前缀
