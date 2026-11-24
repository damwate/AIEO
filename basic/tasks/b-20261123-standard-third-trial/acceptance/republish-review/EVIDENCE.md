# R0' 重新发布复核证据（2026-11-23）

- 线上 http://192.168.0.220:8870 /api/ready = 200。
- 线上入口 bundle：index-Bq-EEQ1b.js + index-DffgSWXG.css（旧本地 dist 为 index-Dp-pXu1x.js，已换版）。
- 线上 index bundle 含 `asset_versions`（资产内容版本缓存线，PR#127 d33d108d 合入特征）✓
- 线上 ThreeView chunk（dep-three.js）含 PR#128（fdaaa522）特征属性 onTextureSettled/onTextureStart ✓
- 线上 chunk 含渲染就绪门字符串「材质贴图加载中」「尚未准备好」「正在检查 AI 服务能力」✓
- 本地以 dev@c3154aa0 全新构建（npm run build，dist index-XNfZ5k4u.js/ThreeView-CRvc29_m.js）与线上 bundle 逐字节 hash 不同，但特征探测显示线上=含 PR#127+PR#128 的构建；hash 差异归因构建环境（依赖版本/构建插件注入），非内容缺漏。
- 残留项：① 热启动缓存命中放行（上次 E2E FAIL 场景）未做浏览器复测，建议用户在生产登录态抽测「截图保存/AI 拍照」；② 线上 bundle 与源码树的可复现构建未逐字节锁定。
