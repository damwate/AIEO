# S1 历史证据找回与线上验证评估

核对基准：AIEO `59609e6bde4cd7c23d63d1f8f6f3ea3a46fee27a`，GDC `c3154aa0fcf0a8fdddb7b1c6f14e6ea205b439fc`。历史 seq8、seq12 REJECT 保留。此次为原始记录检索与只读交叉核验，S1 仍待正式裁定。

## E1 · 找回历史发布执行证据

- 220 留存 `/home/yotin/migration-221/core-releases/c3154aa0/build.log`，SHA256 `bb602dbd59a53c0a6bd96a4b00344a96c4be41023908262e18e28d7a5a114b1d`。该日志产出 `index-Bq-EEQ1b.js`、`ThreeView-BOVZr-LS.js`，并将镜像标为完整 GDC SHA。镜像清单 ID `sha256:b7cdf51bd93ebd52dde25e5b7d1cfb4fbaaba7ab087cfd4ecdb5dd04c9cdb82c` 与正在运行的 web 容器一致。
- 220 上 `migration-221/garden/compose.json.bak-20261123T095807Z-before-c3154aa0` 指向前版 `d33d108d`，现用 Compose 指向完整 `c3154aa0`。web 容器于 2026-11-23 17:58:36 +0800 启动，绑定 8870，至本次核查重启数为 0。API 和 worker 同次重建。发布源包的两端 SHA256 一致，为 `294c3e4340bb6d62db5b2425e555cf2249e7ac7aede99441513dcbd8ffeaa8d9`。
- 2026-11-23 的 Codex 会话 `01a20709-2f96-7d02-bff0-5d3a575fad17` 保有用户发布指令及当时 Docker Compose 构建、重建和健康检查原输出。附录给出工具事件定位和 SHA256，原始会话文件保留在执行机器上。

## E2 · 尚未找到用户抽测原始记录

现有「还行」仍只见 AIEO 过程转述。检索了本机可用的对应日期会话记录及相关产物，未找到可绑定 11 月 23 日约 20:30 的用户原消息、操作步骤、截图或录屏。恢复路径是原执行端会话或用户持有的原始载体。当前再抽测可形成新证据，不能替代该时段记录。

## E3 · 找回历史线上冒烟输出，浏览器行为仍缺证

同一 Codex 会话在 2026-11-23 17:58:52 +0800 保存了重发后真实探测输出，内容为公网新前端 `/assets/index-Bq-EEQ1b.js`、API ready、用户方案 17 个 KTX2 均为 immutable。220 的 web 容器也保留该发布时间窗口的 HTTP 访问日志。冒烟只覆盖入口、就绪和缓存响应头，热启动缓存命中后的 AI 快拍放行仍无浏览器复测原始日志。历史 E3 如限定为上述冒烟，可按实提交。行为级证据可在现有环境新测。

## E4 · 找回本地对照产物，同时绑定两个线上文件

本地 `/home/yotin/GDC-3d-followup-20261123/src/frontend/dist/` 找到先前报告点名的产物。该 worktree HEAD 为 `fdaaa52272f19ab18c6ef110413c275cbd3a926f`，与合并提交 `c3154aa0` 的完整 Git tree 均为 `c515bff531bf796d1c58c8a0988f58b9eb5c5ea9`。产物时间为 2026-11-23 17:54:58 +0800，早于合并提交时间，登记为相同源码树的本地前置构建。

| 产物 | SHA256 |
|---|---|
| 本地 `assets/index-XNfZ5k4u.js` | `db21890ac238ba11d65359f3db7507865904510dd8b03c927e8cb5fa5e18d7ab` |
| 本地 `assets/ThreeView-CRvc29_m.js` | `a72c3d50f8b8a61967e47a71620f928de97a3bd1ff773ffcac0ba293070212e4` |
| 220 `assets/index-Bq-EEQ1b.js` | `177b71b4df0391350fb35f085b234d8ff02dad937b3afa446fb6d10ba3612ab8` |
| 220 `assets/ThreeView-BOVZr-LS.js` | `0886ca74a36ab900a8d8c1755931fc7ce8433ee68f01f9faa6401e52dfe9a61f` |

两份线上 JS 的容器内字节、8870 HTTP 返回字节和既有 AIEO 归档 `dep-index.js`、`dep-three.js` 一致。本地前置构建与线上产物字节不同，尚无独立复现构建证明全部部署产物逐字节一致。

## 是否需要发布到线上验证

8870 已运行目标镜像，无须为 S1 再发布。若用户要验证生产浏览器行为，可在现有 8870 用既有方案热启动复测，记录本次日期、镜像、浏览器、操作、观察结果和脱敏证据。若需要触发请求或写入数据的完整流程，可优先选隔离验收环境和 mock。新验证记录独立成档。现阶段结论为 **PARTIAL / NOT VERIFIED**，保留 E2 与行为级缺口，由正式验收方按实际证据裁定。

## 历史原始工具事件定位

原始文件位于本机 Codex 会话 `2026/11/23` 下，对应上述会话 ID。下列 SHA256 覆盖各事件的原始 JSONL 行（含行尾换行）。

| 时间 UTC | 事件 | SHA256 |
|---|---|---|
| 09:58:21.081 | Docker 镜像构建完成并切换服务 | `2cead3cd8361cf626ad566ca4dad89ccae63fef5b2cca0c5bcc7a46540e2fc33` |
| 09:58:37.489 | API、web、worker 健康检查通过 | `628a13b933248992c96460428652b268ee41412b1fe8c93d9dc0ab7573863b01` |
| 09:58:52.463 | 公网入口、API ready、17 个 KTX2 的响应头探测 | `3187f9a4f0bd3576506765bec185efffa3425fd02f4bbf4ac6943624b0d85cf7` |
