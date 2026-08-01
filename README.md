# 一隅 · 个人文字博客

一个简约、清新的中文个人博客，适合发布随笔、阅读笔记和日常记录。包含首页、文章归档、文章阅读、关于页面，以及一个仅在本机显示的轻量 Markdown 编辑器。

## 本地预览

需要 Node.js 22 或更高版本。

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 即可预览。

## 使用编辑器

页面右上角的「写文章」会打开编辑器：

- 内容输入后会自动保存在当前浏览器；
- 「发布到本机」会让文章出现在这台设备的文章列表中；
- 「保存到文章目录」会把包含 slug、标题、日期、分类和摘要的 Markdown 文件直接写入 `content/posts/`；
- 保存后会自动重建文章列表；编辑正式文章时，会更新与该 slug 对应的原文件。

浏览器本地文章不会自动同步到其他设备，也不会直接写入 GitHub。这一设计避免在前端保存 GitHub 密钥。

## 管理 Markdown 文章

`content/posts/` 是正式文章的数据源。每篇文章对应一个 `.md` 文件：

```md
---
slug: "my-first-post"
title: "我的第一篇文章"
date: "2026-07-29"
category: "随笔"
excerpt: "这篇文章的简短摘要。"
---

这里是 Markdown 正文。
```

- `slug` 是稳定的文章标识和地址；省略时会使用文件名；
- `title` 和 `date` 必填，日期必须是 `YYYY-MM-DD`；
- `category` 默认是「随笔」；
- `excerpt` 可以省略或留空；留空时文章列表和文章页都不会显示摘要；
- 阅读时间根据正文长度自动计算；
- slug 重复、日期错误或正文为空时，构建会给出明确提示并停止。

添加或修改文章后运行 `npm run content:generate`，开发页面会立即更新；`npm run dev`、正式构建和 GitHub Pages 构建也都会自动执行这一步。

## 部署到 GitHub Pages

1. 在 GitHub 新建一个空仓库。
2. 将本目录提交并推送到仓库的 `main` 分支。
3. 在仓库的 **Settings → Pages → Build and deployment** 中，将 Source 设为 **GitHub Actions**。
4. 推送后，`Deploy blog to GitHub Pages` 工作流会自动构建并发布。

项目已自动适配 `username.github.io` 根域仓库和普通项目仓库的子路径。

## 常用定制位置

- 正式文章：`content/posts/*.md`
- 站名、导航和编辑器：`app/page.tsx`
- 颜色、字号与响应式排版：`app/globals.css`
- 页面标题和分享信息：`app/layout.tsx`
- GitHub Pages 自动发布：`.github/workflows/deploy.yml`

## 构建检查

```bash
npm run build
npm run build:github
npm test
```
