# 凝泠 · watice’s blog

一个关注金融、科技与时代变化的中文评论博客。站点以“冷静观察、独立判断”为核心，包含首页、文章归档、文章阅读、关于页面，以及一个仅在本机显示的轻量 Markdown 编辑器。

## 本地预览

需要 Node.js 22.13.0 或更高版本。

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 即可预览。

`npm run dev` 和 `npm run edit:local` 默认都使用 `http://localhost:3000`。如果 `3000` 已被其他程序占用，一键编辑脚本会自动向上查找可用端口（最多 100 个端口），并打印实际地址；也可以用 `PORT` 环境变量指定固定端口。

## 使用编辑器

页面右上角的「写文章」会打开编辑器：

- `content/posts/` 是正式文章的数据源；`content/drafts/` 是被 Git 忽略的本地草稿箱，两者都以 Markdown 文件为权威，不使用浏览器存储；
- 「保存到草稿箱」会把当前内容写入 `content/drafts/`，草稿可以在本地草稿箱中浏览、重新打开和继续编辑；
- 「正式保存并发布」或「正式保存修改」会把 Markdown 写入 `content/posts/`，执行 GitHub Pages 静态构建，然后定向提交当前文章、两个生成的文章数据模块和正文引用的本地图片，并推送到 `origin/main`；
- 本地页面会自动重新读取 `content/posts/`，所以从网页保存和直接修改 Markdown 文件效果相同；
- 编辑中的改动每 10 秒原子写入 `content/drafts/.recovery/editor-autosave.json`；再次打开编辑器时，必须明确确认将临时文件存入草稿箱、保存为正文或永久丢弃，处理前编辑器不会覆盖它；
- 「插入图片」会把图片保存到 `public/images/posts/年/月/`，并在当前光标处自动插入 Markdown 引用；
- 配置本机模型后，「AI 智能总结」会站在作者立场、以“本文……”的方式生成文章简介；
- 「AI 检查语病与错别字」只列出校对建议，不会替换或改动正文；
- 正式保存成功后会自动重建文章列表，并从草稿箱移除对应草稿；推送失败时草稿仍会保留，页面会显示可重试的错误；
- 提交完成前发生生成、构建或发布错误时，会恢复文章以及修改前的元数据、正文和搜索索引三份产物；已经成功提交、仅推送失败时则保留该提交和文章；
- 为避免混入无关内容，如果 `content/posts/` 里还有其他未提交文章，正式保存会停止并提示先处理这些文件。

支持 PNG、JPEG、GIF、WebP 和 AVIF，单张不超过 12 MB。图片名会附加内容摘要以避免同名覆盖；同一张图片重复上传会复用已有文件。正式保存时，正文实际引用的 `public/images/posts/` 图片会自动包含在该文章的提交中。

编辑器只允许从本机回环地址访问文件写入、Git 发布和 AI 接口，浏览器请求还必须同源（包含端口），JSON 写接口要求 `application/json`。Front Matter 只接受普通 YAML，不执行 JavaScript 引擎；日期保持原字符串后进行真实日历校验。不在浏览器中保存 GitHub 密钥；推送使用本机已有的 Git 凭据。本机模型设置保存在不会提交的 `.local/llm-config.json` 中。

也可以双击 `scripts/start-local-editor.command` 一键启动开发服务并直接打开编辑器。首次启动时脚本会自动安装依赖；关闭脚本打开的终端窗口或按 `Control-C` 即可停止服务。

## 管理 Markdown 文章

`content/posts/` 是正式文章的数据源。每篇文章对应一个 `.md` 文件：

```md
---
slug: "my-first-post"
title: "我的第一篇文章"
date: "2026-07-29"
category: "评论"
aiParticipation: 1
excerpt: "这篇文章的简短摘要。"
---

这里是 Markdown 正文。
```

- `slug` 是稳定的文章标识和地址；省略时会使用文件名；
- `title` 和 `date` 必填，日期必须是有效的 `YYYY-MM-DD`（例如拒绝 `2026-02-31`）；
- `category` 默认是「评论」；
- `aiParticipation` 必填，使用 `1`–`5` 的整数，依次对应「纯人工」「AI辅助」「AI协作」「人类辅助」「纯AI」；
- `excerpt` 可以省略或留空；留空时文章列表和文章页都不会显示摘要；
- 阅读时间根据正文长度自动计算；
- slug 重复、日期错误或正文为空时，构建会给出明确提示并停止。

添加或修改文章后运行 `npm run content:generate`，开发页面会立即更新；`npm run dev`、正式构建和 GitHub Pages 构建也都会自动执行这一步。

## 文章地址、订阅与数百篇文章的加载方式

每篇文章发布为独立的静态页面 `article/{slug}/`，包含正文、专属标题和摘要、canonical 地址、Open Graph 分享信息及 JSON-LD 文章信息。原来的 `#article/{slug}` 链接仍会跳转到对应文章；首页、归档和关于保留 hash 导航。

站点同时生成 `feed.xml`（RSS 订阅）、`sitemap.xml` 和 `robots.txt`。公开站点地址集中在 `lib/site.ts`，默认是 `https://watice555.github.io/MyBlog/`；部署到其他域名时，在构建时设置 `NEXT_PUBLIC_SITE_URL`，以便文章的正式地址、订阅和 sitemap 使用正确域名。GitHub Pages 的部署子路径仍由仓库名自动确定。

生成器将文章拆成三份产物，均不可手工编辑：

- `app/generated-posts.ts`：只有标题、摘要、分类、日期、阅读时长和字数等元数据，供首页及归档使用；其中 `dateISO` 是机器可读日期，`date` 保留点号展示格式。
- `app/generated-post-content.ts`：按 slug 保存完整正文，仅由服务端文章页面读取；不会把所有正文打进首页客户端包。
- `public/search-index.json`：全文搜索数据，包含预先规范化的文本，仅在使用搜索时加载，并在当前页面复用；该文件被 Git 忽略，每次构建重新生成。

修改文章时，提交 Markdown 以及前两份生成模块。阅读单篇文章不需要先下载全部文章；本地编辑器通过本机接口读取完整内容。生成器测试覆盖 500 篇文章的数据分离与搜索索引完整性。

## 部署到 GitHub Pages

1. 在 GitHub 新建一个空仓库。
2. 将本目录提交并推送到仓库的 `main` 分支。
3. 在仓库的 **Settings → Pages → Build and deployment** 中，将 Source 设为 **GitHub Actions**。
4. 推送后，`Deploy blog to GitHub Pages` 工作流会自动构建并发布。

项目已自动适配 `username.github.io` 根域仓库和普通项目仓库的子路径。

## 常用定制位置

- 正式文章：`content/posts/*.md`
- 首页与视图组合：`app/page.tsx`、`app/components/home-views.tsx`
- 站名与公开地址：`lib/site.ts`；导航与页脚：`app/components/site-chrome.tsx`
- 独立文章页与分享信息：`app/article/[slug]/page.tsx`
- Markdown 展示：`app/components/markdown.tsx`
- 本地编辑器：`app/components/local-workspace.tsx`、`app/hooks/use-local-editor.ts`
- 按需全文搜索：`app/hooks/use-article-search.ts`
- 颜色、字号与响应式排版：`app/globals.css`
- 页面标题和分享信息：`app/layout.tsx`
- GitHub Pages 自动发布：`.github/workflows/deploy.yml`

## 构建检查

```bash
npm run lint
npm run typecheck:local
npm test
npm run build:github
npm run test:export
```

`lint` 已包含本地插件的严格类型检查；`npm test` 构建 Vinext worker 后验证页面、本地接口和内容管线。`test:export` 检查已经生成的 `out/`，因此应在静态构建后执行；CI 还覆盖 GitHub Pages 子路径构建。只验证内容管线可运行 `node --test tests/content-pipeline.test.mjs`。

当前依赖维护基线为 Next/ESLint 配置 `16.3.8`、React/RSC `19.2.8`、Vite `8.0.16`、Vinext `1.0.1`、Cloudflare Vite 插件 `1.62.5`、Wrangler `4.147.0` 和 js-yaml `4.3.2`，实际安装版本以 `package-lock.json` 为准。后续维护仍需重新运行 `npm audit`，版本基线不代表永久没有新漏洞。
