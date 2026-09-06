# 实施记录

## 2026-09-07 01:33 Asia/Shanghai — 完善 CI 与部署验证

- 阶段总结：新增 PR CI，执行依赖安装、lint、测试和静态导出；部署前增加 lint 与测试，并设置构建和部署超时；将 build/ 插件源码纳入 ESLint；忽略本地 .zcode/ 目录。本次配置更改在 main 上验证并提交，未包含 ci/validate 分支已有的独立安全修复提交。
- 已执行的验证：`npm run lint`；`npm test`（main 上 18 项全部通过）；设置 GitHub Actions 与仓库环境变量后的 `npm run build:github`（验证 /MyBlog 子路径）；`git diff --check`；`git check-ignore` 确认 .zcode/ 已忽略。此前通过 ESLint API 确认三个 build/ 插件未被忽略。验证环境为本地 Node 24，未在本地复现 Ubuntu / Node 22；构建仅有大体积 chunk 提示。
- 写入者模型：GPT-6
- 设备：TianhaodeMacBook-Pro（macOS 26.6.2，arm64）

## 2026-08-30 14:26 Asia/Shanghai — 精简首页 Hero 区域

- 阶段总结：删除首页右侧“观点可以鲜明，判断必须克制。”及“凝泠札记 · 长期观察”卡片，将 Hero 调整为更紧凑的单栏布局，并收紧桌面端与移动端的纵向留白；补充公开渲染回归断言，确保已删除文案不会再次出现。
- 已执行的验证：`git diff --check`；`npm run lint`；`npm test`（18 项全部通过）；`npm run build:github`；本地浏览器检查 1440×900 桌面端和 390×844 移动端首页，浏览器控制台无错误。
- 写入者模型：未知（运行环境未暴露）
- 设备：Mac17,6（macOS 26.6.2，arm64）

## 2026-08-30 15:04 Asia/Shanghai — 关于页增加“我的项目”

- 阶段总结：将关于页扩展为左侧个人介绍、右侧“我的项目”的双栏布局，加入五个项目及 GitHub 总入口；将原引文框改为无装饰的单行衬线斜体信条，并为桌面、中等宽度和移动端补齐比例、间距与堆叠样式。
- 已执行的验证：聚焦项目索引测试；`git diff --check`；`npm run lint`；`npm test`（18 项全部通过）；`npm run build:github`；本地浏览器检查 1440×900 桌面端和 390×844 移动端关于页，确认桌面端两栏尺寸约为 637×627px 与 443×627px、上下边界对齐，移动端正确堆叠，六个外链安全属性完整，浏览器控制台无警告或错误。
- 写入者模型：未知（运行环境未暴露）
- 设备：Mac17,6（macOS 26.6.2，arm64）

## 2026-09-06 16:31:49 Asia/Shanghai — 补齐 9 月 3–5 日合并日报

- 阶段总结：按用户要求同步恢复后的日报到现有 GitHub Pages 博客。9 月 2 日文章正文已与恢复产物一致，复用现有文章；新增 9 月 3、4、5 日三篇合并日报，使用博客本地模型配置生成简介，并更新文章索引至 41 篇。同步工作在独立的 main 工作目录中完成，保留原开发目录的分支与未提交修改；不补发 Telegram。
- 已执行的验证：逐篇核对 9 月 2–5 日博客正文与来源日报一致（仅移除重复标题和来源行），确认简介及 front matter 可复用；`npm run content:generate` 通过；带正式 GitHub Pages 子路径环境的 `npm run build:github` 静态导出通过，TypeScript 检查通过；`git diff --check` 通过。本次只新增文章，不改应用或渲染逻辑，未重复运行应用测试套件。
- 写入者模型：GPT-6
- 设备：TianhaodeMacBook-Pro（macOS 26.6.2，arm64）
