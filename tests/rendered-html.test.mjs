import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import matter from "gray-matter";
import createLocalPostsPlugin from "../build/local-posts-plugin.mjs";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

function normalizeSlug(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

async function createLocalApiFixture(testContext) {
  const projectRoot = await mkdtemp(resolve(tmpdir(), "watice-local-content-"));
  testContext.after(() => rm(projectRoot, { recursive: true, force: true }));

  const postsDirectory = resolve(projectRoot, "content", "posts");
  const scriptsDirectory = resolve(projectRoot, "scripts");
  await mkdir(postsDirectory, { recursive: true });
  await mkdir(scriptsDirectory, { recursive: true });
  await writeFile(resolve(postsDirectory, "fixture.md"), `---
slug: "fixture"
title: "Fixture"
date: "2026-08-06"
category: "评论"
aiParticipation: 1
excerpt: ""
---

Fixture body.
`, "utf8");
  await writeFile(resolve(scriptsDirectory, "generate-posts.mjs"), `import { readFile, writeFile } from "node:fs/promises";
const marker = new URL("../generated.marker", import.meta.url);
let count = 0;
try { count = Number(await readFile(marker, "utf8")); } catch {}
await writeFile(marker, String(count + 1), "utf8");
`, "utf8");

  let middleware;
  createLocalPostsPlugin(projectRoot).configureServer({
    middlewares: {
      use(handler) {
        middleware = handler;
      },
    },
  });
  assert.equal(typeof middleware, "function");
  return { middleware, projectRoot };
}

async function requestLocalGenerate(middleware, { host = "localhost:3000", method = "POST", origin = "http://localhost:3000" } = {}) {
  let body = "";
  const response = {
    statusCode: 200,
    setHeader() {},
    end(chunk = "") {
      body += chunk;
    },
  };
  await middleware({ headers: { host, origin }, method, url: "/api/local-content-generate" }, response, () => {});
  return { body: JSON.parse(body), status: response.statusCode };
}

async function requestLocalPosts(middleware, { host = "localhost:3000", origin = "http://localhost:3000" } = {}) {
  let body = "";
  const response = {
    statusCode: 200,
    setHeader() {},
    end(chunk = "") {
      body += chunk;
    },
  };
  await middleware({ headers: { host, origin }, method: "GET", url: "/api/local-post" }, response, () => {});
  return { body: JSON.parse(body), status: response.statusCode };
}

test("server-renders the finished blog", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /<title>凝泠｜watice’s blog<\/title>/);
  assert.match(html, /在噪声里/);
  assert.match(html, /辨认真实/);
  assert.match(html, /COMMENTARY · FINANCE · TECHNOLOGY/);
  assert.match(html, /watice’s blog/);
  assert.doesNotMatch(html, /一隅|CORNER NOTES|PERSONAL WRITING/);
  assert.match(html, /最近评论/);
  assert.match(html, /金融、科技/);
  assert.doesNotMatch(html, /写文章|编辑文章|同步文章|href="#editor"/);
  assert.doesNotMatch(html, /AI 智能总结|api\/local-summary/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("ships GitHub Pages and social metadata", async () => {
  const [layout, nextConfig, workflow, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /og\.png/);
  assert.match(layout, /@fontsource-variable\/source-serif-4\/wght\.css/);
  assert.match(layout, /@fontsource-variable\/source-serif-4\/wght-italic\.css/);
  assert.match(nextConfig, /output:\s*"export"/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("renders GFM tables and mathematical formulas with responsive styles", async () => {
  const [page, layout, styles, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /import ReactMarkdown from "react-markdown"/);
  assert.match(page, /import remarkGfm from "remark-gfm"/);
  assert.match(page, /import remarkMath from "remark-math"/);
  assert.match(page, /import rehypeKatex from "rehype-katex"/);
  assert.match(page, /remarkPlugins=\{\[remarkGfm, remarkMath\]\}/);
  assert.match(page, /rehypePlugins=\{\[rehypeKatex\]\}/);
  assert.match(page, /normalizeMathDelimiters\(source\)/);
  assert.match(page, /className="table-scroll"/);
  assert.match(page, /content:\s*""/);
  assert.match(page, /placeholder="从这里开始写下今天的想法……"/);
  assert.match(page, /placeholder="用一小段话介绍这篇文章（可选）"/);
  assert.match(page, /category:\s*"评论"/);
  assert.match(page, /placeholder="评论"/);
  assert.match(page, /rows=\{4\}/);
  assert.match(styles, /\.editor-meta textarea\s*\{/);
  assert.match(styles, /resize:\s*vertical/);
  assert.match(styles, /\.prose strong\s*\{/);
  assert.match(styles, /\.prose em\s*\{/);
  assert.match(styles, /\.prose ul\s*\{[\s\S]*?list-style:\s*disc/);
  assert.match(styles, /\.prose ol\s*\{[\s\S]*?list-style:\s*decimal/);
  assert.match(styles, /\.prose li::marker\s*\{/);
  assert.match(styles, /\.prose \.table-scroll\s*\{/);
  assert.match(styles, /\.prose \.katex-display\s*\{/);
  assert.match(styles, /--serif:\s*"Source Serif 4 Variable", "Songti SC", "STSong"/);
  assert.doesNotMatch(styles, /Georgia/);
  assert.match(layout, /import "katex\/dist\/katex\.min\.css"/);
  assert.match(packageJson, /"@fontsource-variable\/source-serif-4"/);
  assert.match(packageJson, /"react-markdown"/);
  assert.match(packageJson, /"remark-gfm"/);
  assert.match(packageJson, /"remark-math"/);
  assert.match(packageJson, /"rehype-katex"/);
});

test("supports editing and updating existing articles", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /articleId\?: string/);
  assert.match(page, /const editArticle = \(article: Article\)/);
  assert.match(page, /value\.startsWith\("editor\/"\)/);
  assert.match(page, /\{ name: "editor", id: decodeURIComponent\(value\.slice\(7\)\) \}/);
  assert.match(page, /window\.location\.hash = `editor\/\$\{encodeURIComponent\(article\.id\)\}`/);
  assert.match(page, /const restoreEditorDraft = \(\) =>/);
  assert.match(page, /articles\.find\(\(candidate\) => candidate\.id === currentView\.id\)/);
  assert.match(page, /current\.articleId === article\.id \? current : draftFromArticle\(article\)/);
  assert.doesNotMatch(page, /localArticles|corner-posts|corner-draft|localStorage/);
  assert.match(page, /onEdit=\{editArticle\}/);
  assert.match(page, />编辑文章<\/button>/);
  assert.match(page, /draft\.articleId \? "保存修改" : "保存文章"/);
  assert.match(page, /onClick=\{saveMarkdownToProject\}/);
  assert.match(page, /normalizeSlug\(draft\.title\) !== normalizeSlug\(draft\.slug\)/);
  assert.match(page, /标题与 Slug 不同：文章列表将显示标题，链接将继续使用此 Slug。/);
  assert.match(styles, /\.editor-meta \.slug-hint\s*\{/);
});

test("keeps author controls local and hides them from public readers", async () => {
  const [page, startScript, readme] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/start-local-editor.command", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(page, /function localEditorAvailable\(\)/);
  assert.match(page, /\["localhost", "127\.0\.0\.1", "::1", "\[::1\]"\]/);
  assert.match(page, /editorEnabled && \(/);
  assert.doesNotMatch(page, /className="sync-link"/);
  assert.match(page, /<a className="editor-link"/);
  assert.match(page, /view\.name === "editor" && editorEnabled/);
  assert.match(page, /canEdit && <button type="button" onClick=\{\(\) => onEdit\(article\)\}>编辑文章<\/button>/);
  assert.match(page, /if \(!localEditorAvailable\(\)\) \{/);
  assert.match(page, /window\.setInterval\(refreshWhenVisible, 2000\)/);
  assert.match(startScript, /PORT="\$\{PORT:-3000\}"/);
  assert.match(startScript, /BASE_URL="http:\/\/localhost:\$\{PORT\}"/);
  assert.match(startScript, /--hostname localhost/);
  assert.match(readme, /npm run dev` 和 `npm run edit:local` 默认都使用 `http:\/\/localhost:3000`/);
});

test("offers public article search and category filtering", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const \[searchQuery, setSearchQuery\] = useState\(""\)/);
  assert.match(page, /const \[selectedCategory, setSelectedCategory\] = useState\(""\)/);
  assert.match(page, /article\.title, article\.excerpt, article\.content, article\.category/);
  assert.match(page, /aria-label="文章搜索与分类筛选"/);
  assert.match(page, /placeholder="搜索标题、摘要或正文"/);
  assert.match(page, /aria-pressed=\{selectedCategory === category\}/);
  assert.match(page, /filteredArticles\.map/);
  assert.match(page, /没有找到符合条件的文章/);
  assert.match(styles, /\.archive-tools\s*\{/);
  assert.match(styles, /\.category-options button\.active\s*\{/);
});

test("stores numeric AI participation levels and maps them to public labels", async () => {
  const [page, styles, generator, localPostsPlugin] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../scripts/generate-posts.mjs", import.meta.url), "utf8"),
    readFile(new URL("../build/local-posts-plugin.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(page, /AI_PARTICIPATION_LABELS = \["纯人工", "AI辅助", "AI协作", "人类辅助", "纯AI"\] as const/);
  assert.match(page, /type AiParticipationLevel = 1 \| 2 \| 3 \| 4 \| 5/);
  assert.match(page, /AI_PARTICIPATION_LABELS\[value - 1\]/);
  assert.match(page, /type="range"/);
  assert.match(page, /aria-valuetext=\{label\}/);
  assert.match(page, /`aiParticipation: \$\{draft\.aiParticipation\}`/);
  assert.match(page, /<AiParticipationIndicator value=\{article\.aiParticipation\} showPrefix=\{false\} \/>/);
  assert.match(styles, /\.ai-slider-control input\s*\{/);
  assert.match(styles, /\.ai-slider-ticks\s*\{/);
  assert.match(styles, /\.ai-participation-indicator\s*\{/);
  assert.doesNotMatch(styles, /\.ai-slider-labels\s*\{/);
  assert.match(generator, /normalizeAiParticipation\(data\.aiParticipation, filename\)/);
  assert.match(generator, /Number\.isInteger\(value\)/);
  assert.match(localPostsPlugin, /const aiParticipation = data\.aiParticipation/);
});

test("keeps the about page focused on the written introduction", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /title="关于凝泠"/);
  assert.doesNotMatch(page, /about-number|>01<\/div>/);
  assert.match(styles, /\.about-grid\s*\{[\s\S]*?max-width:\s*630px/);
  assert.doesNotMatch(styles, /\.about-number\s*\{/);
});

test("generates the article list from Markdown Front Matter", async () => {
  const [page, packageJson, generator, generated, localPostsPlugin, filenames] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/generate-posts.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/generated-posts.ts", import.meta.url), "utf8"),
    readFile(new URL("../build/local-posts-plugin.mjs", import.meta.url), "utf8"),
    readdir(new URL("../content/posts/", import.meta.url)),
  ]);

  const markdownFiles = filenames.filter((filename) => filename.endsWith(".md"));
  assert.ok(markdownFiles.length >= 3);
  for (const filename of markdownFiles) {
    const source = await readFile(new URL(`../content/posts/${filename}`, import.meta.url), "utf8");
    const { data, content } = matter(source);
    assert.ok(data.slug);
    assert.ok(data.title);
    assert.match(String(data.date instanceof Date ? data.date.toISOString().slice(0, 10) : data.date), /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Number.isInteger(data.aiParticipation));
    assert.ok(data.aiParticipation >= 1 && data.aiParticipation <= 5);
    assert.ok(content.trim());
    assert.match(generated, new RegExp(`"id": "${normalizeSlug(data.slug)}"`));
  }

  assert.match(page, /import \{ generatedPosts \} from "\.\/generated-posts"/);
  assert.doesNotMatch(page, /const starterArticles/);
  assert.match(generator, /slug .* 重复/);
  assert.match(generator, /const excerpt = String\(data\.excerpt \?\? ""\)\.trim\(\)/);
  assert.match(generator, /data\.category \?\? "评论"/);
  assert.doesNotMatch(generator, /createExcerpt|自动提取/);
  assert.match(packageJson, /"content:generate": "node scripts\/generate-posts\.mjs"/);
  assert.match(packageJson, /"prebuild:github": "npm run content:generate"/);
  assert.match(page, /`slug: \$\{JSON\.stringify\(slug\)\}`/);
  assert.match(page, /fetch\("\/api\/local-post"/);
  assert.match(page, /cache: "no-store"/);
  assert.match(page, /setProjectArticles/);
  assert.match(page, /const refreshProjectArticles = useCallback/);
  assert.match(page, /await refreshProjectArticles\(\)/);
  assert.match(page, /文章以 content\/posts 中的 Markdown 文件为准/);
  assert.doesNotMatch(page, /localStorage|保存草稿|发布到本机|保存到文章目录/);
  assert.match(localPostsPlugin, /const postRoute = "\/api\/local-post"/);
  assert.match(localPostsPlugin, /const generateRoute = "\/api\/local-content-generate"/);
  assert.match(localPostsPlugin, /isAllowedHost\(request\.headers\.host\)/);
  assert.match(localPostsPlugin, /pathname === generateRoute/);
  assert.match(localPostsPlugin, /articles, count: articles\.length/);
  assert.match(localPostsPlugin, /request\.method === "GET"/);
  assert.match(localPostsPlugin, /loadPostsFromFiles\(\)/);
  assert.match(localPostsPlugin, /sourceHash !== generatedSourceHash/);
  assert.match(localPostsPlugin, /article: existingPost\.article/);
  assert.match(localPostsPlugin, /resolve\(projectRoot, "content", "posts"\)/);
  assert.match(localPostsPlugin, /await rename\(temporary, destination\)/);
  assert.match(localPostsPlugin, /await unlink\(destination\)/);
  assert.match(localPostsPlugin, /existingPost\.markdown/);
  assert.match(localPostsPlugin, /data\.category \?\? "评论"/);
  assert.match(localPostsPlugin, /execFileAsync\(process\.execPath/);
  assert.doesNotMatch(page, /excerpt:\s*draft\.excerpt\.trim\(\) \|\| draft\.content/);
  assert.match(page, /article\.excerpt && <p>\{article\.excerpt\}<\/p>/);
  assert.match(page, /article\.excerpt && <p className="reading-deck">/);
  assert.doesNotMatch(page, /removeLegacyAutoExcerpt|corner-excerpt-policy|local-badge/);
});

test("regenerates content only through the loopback editor API", async (testContext) => {
  const { middleware, projectRoot } = await createLocalApiFixture(testContext);
  const marker = resolve(projectRoot, "generated.marker");

  const remoteHost = await requestLocalGenerate(middleware, { host: "blog.example.com" });
  assert.equal(remoteHost.status, 403);
  await assert.rejects(access(marker));

  const remoteOrigin = await requestLocalGenerate(middleware, { origin: "https://example.com" });
  assert.equal(remoteOrigin.status, 403);
  await assert.rejects(access(marker));

  const wrongMethod = await requestLocalGenerate(middleware, { method: "GET" });
  assert.equal(wrongMethod.status, 405);
  await assert.rejects(access(marker));

  const success = await requestLocalGenerate(middleware);
  assert.equal(success.status, 200);
  assert.equal(success.body.count, 1);
  assert.equal(success.body.articles[0].id, "fixture");
  assert.equal(await readFile(marker, "utf8"), "1");
});

test("keeps local article reads and generated content synchronized with Markdown files", async (testContext) => {
  const { middleware, projectRoot } = await createLocalApiFixture(testContext);
  const postPath = resolve(projectRoot, "content", "posts", "fixture.md");
  const marker = resolve(projectRoot, "generated.marker");

  const first = await requestLocalPosts(middleware);
  assert.equal(first.status, 200);
  assert.equal(first.body.articles[0].title, "Fixture");
  assert.equal(await readFile(marker, "utf8"), "1");

  await writeFile(postPath, `---
slug: "fixture"
title: "Updated on disk"
date: "2026-08-06"
category: "评论"
aiParticipation: 3
excerpt: ""
---

Updated body.
`, "utf8");

  const second = await requestLocalPosts(middleware);
  assert.equal(second.status, 200);
  assert.equal(second.body.articles[0].title, "Updated on disk");
  assert.equal(second.body.articles[0].aiParticipation, 3);
  assert.equal(second.body.articles[0].content, "Updated body.");
  assert.equal(await readFile(marker, "utf8"), "2");

  await requestLocalPosts(middleware);
  assert.equal(await readFile(marker, "utf8"), "2");
});

test("keeps AI summarization local to the development editor", async () => {
  const [page, viteConfig, gitignore] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
  ]);

  assert.match(page, /process\.env\.NODE_ENV === "development"/);
  assert.match(page, /fetch\("\/api\/local-summary"/);
  assert.match(page, /localAiEnabled && \(/);
  assert.match(page, /本机摘要服务未启动，请重启 npm run dev/);
  assert.match(viteConfig, /\.local\/llm-summary-plugin\.mjs/);
  assert.match(viteConfig, /existsSync\(localLlmPluginPath\)/);
  assert.match(gitignore, /^\/\.local\/$/m);
});

test("uploads article images into the public post asset directory", async () => {
  const [page, styles, localPostsPlugin, readme] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../build/local-posts-plugin.mjs", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(page, /fetch\("\/api\/local-image"/);
  assert.match(page, /uploadingImage \? "正在保存图片…" : "＋ 插入图片"/);
  assert.match(page, /accept="image\/png,image\/jpeg,image\/gif,image\/webp,image\/avif"/);
  assert.match(page, /insertMarkdownImage\(result\.path, alt\)/);
  assert.match(page, /markdownTextareaRef\.current\?\.setSelectionRange/);
  assert.match(styles, /\.prose img\s*\{/);
  assert.match(styles, /\.writing-toolbar\s*\{/);
  assert.match(localPostsPlugin, /const imageRoute = "\/api\/local-image"/);
  assert.match(localPostsPlugin, /resolve\(publicDirectory, "images", "posts", year, month\)/);
  assert.match(localPostsPlugin, /createHash\("sha256"\)/);
  assert.match(localPostsPlugin, /图片不能超过 12 MB/);
  assert.match(localPostsPlugin, /path: `images\/posts\/\$\{year\}\/\$\{month\}\//);
  assert.match(readme, /public\/images\/posts\/年\/月\//);
});
