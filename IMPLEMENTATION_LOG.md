# 实施记录

## 2026-09-08 19:15:11 Asia/Shanghai — 收紧 Markdown 引用样式

- 阶段总结：引用块改用正文大小和墨色文字、深绿左边线及更浅的背景；缩小内外留白，清除首尾子元素多余边距，收紧多段引用的段间距。
- 已执行的验证：`npm run lint`；`npm test`（18 项全部通过）；带 GitHub Pages /MyBlog 子路径环境的 `npm run build:github`；`git diff --check`；本地浏览器检查实际文章在 1440×900 和 390×844 下的引用显示，确认尾部空白消除、手机换行正常。本次仅调整 CSS，采用实际页面视觉验证，未新增重复样式声明的测试；构建仅有 chunk 体积提示。
- 写入者模型：GPT-6
- 设备：TianhaodeMacBook-Pro（macOS 26.6.2，arm64）

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

## 2026-09-08 21:02:55 Asia/Shanghai — 补发布 9 月 6 日日报

- 阶段总结：按用户要求新增 9 月 6 日合并日报文章，使用博客本地模型生成简介并更新文章索引。
- 已执行的验证：正文逐字匹配来源日报（仅移除重复标题和来源行）；content:generate 通过，共 44 篇；正式 GitHub Pages 子路径下 build:github 静态导出及 TypeScript 检查通过。本次只补文章，未修改应用逻辑；应用测试留由发布 CI 执行。
- 写入者模型：GPT-6
- 设备：TianhaodeMacBook-Pro（macOS 26.6.2，arm64）

## 2026-09-08 21:04:43 Asia/Shanghai — 修复补发布遇到的 CI 路径检查失败

- 阶段总结：9 月 6 日补发布与此前一次发布均因渲染测试请求根路径而收到 404；测试请求现按 GitHub Pages 构建环境使用仓库子路径，同时保留普通本地构建及用户站点的根路径。未修改应用行为。
- 已执行的验证：模拟正式 GitHub Actions 环境执行 npm test，18 项全部通过；npm run lint 通过；文章静态导出已通过，后续仅修改测试；git diff --check 通过。
- 写入者模型：GPT-6
- 设备：TianhaodeMacBook-Pro（macOS 26.6.2，arm64）

## 2026-09-28 03:15:11 Asia/Shanghai — 更新 PR #3 并修复当前依赖审计问题

- 阶段总结：同步已验证的 PR #2 与最新 main；解决 ESLint 配置冲突，同时保留 hash 路由规则例外与 build/ 安全插件的 lint 覆盖。将 baseline-browser-mapping 从 2.10.30 更新到 2.11.26，修复本次 npm 审计发现的中危问题；未执行全量 audit fix。
- 已执行的验证：npm ci；npm run lint；模拟 GitHub Pages /MyBlog 环境的 npm test（18/18）和 npm run build:github；npm audit --omit=dev（0 漏洞）；git diff --check。完整依赖审计仍报告开发依赖漏洞，本阶段未扩大升级范围。远程 PR CI 将在推送后执行，本地结果不等同于 CI 已通过。无可见界面改动，未进行人工视口检查。
- 写入者模型：GPT-6
- 设备：TianhaodeMacBook-Pro（macOS 27.0，arm64）

## 2026-09-28 03:17:41 Asia/Shanghai — 核验并合并 PR #1、#2、#3

- 阶段总结：逐项审查安全补丁、模板清理和依赖升级；确认 #2 仅移除 83 个锁定依赖且未升级保留的依赖。同步基线并触发真实 PR CI，按 #2 → #1 → #3 合并；#3 解决配置冲突并补修生产依赖审计发现的问题，更新 PR 描述。三个 PR 均已合并，本地 main 同步至 e73df8a。设置 main 必需检查为 GitHub Actions 的 validate，要求分支与 main 同步，禁止强推和删除；保留管理员豁免以兼容本仓库直接维护 main 的约定，故该门禁不限制管理员绕过。
- 已执行的验证：#2 CI 36343472124（18/18）；#1 在 #2 合并后重跑 CI 36343606929（21/21）；#3 在 #1、#2 合并后的最终 head 35dd69c 上通过 CI 36343698636（21/21）。上述 CI 均实际完成 npm ci、lint、Vinext 构建及测试、GitHub Pages 静态导出。#3 本地生产依赖审计为 0 漏洞，开发依赖问题仍存在。合并后在主工作区 npm ci 成功；GitHub API 确认三个 PR 状态为 MERGED，分支保护设置已回读核验。未重复执行已通过的同代码本地测试；无可见界面改动，未做人工视口检查。最终日志提交推送后继续核验 Pages 部署。
- 写入者模型：GPT-6
- 设备：TianhaodeMacBook-Pro（macOS 27.0，arm64）
