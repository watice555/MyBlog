import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import matter from "gray-matter";
import createLocalLlmPlugin from "../build/local-llm-plugin.mjs";
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

async function createLocalApiFixture(testContext, options = {}) {
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
  createLocalPostsPlugin(projectRoot, options).configureServer({
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

async function requestLocalJson(
  middleware,
  url,
  { method = "GET", input, host = "localhost:3000", origin = "http://localhost:3000" } = {},
) {
  let body = "";
  const response = {
    statusCode: 200,
    setHeader() {},
    end(chunk = "") {
      body += chunk;
    },
  };
  const request = input === undefined
    ? Readable.from([])
    : Readable.from([Buffer.from(JSON.stringify(input))]);
  Object.assign(request, {
    headers: { host, origin, ...(input === undefined ? {} : { "content-type": "application/json" }) },
    method,
    url,
  });
  await middleware(request, response, () => {});
  return { body: JSON.parse(body), status: response.statusCode };
}

async function createLocalLlmFixture(testContext) {
  const projectRoot = await mkdtemp(resolve(tmpdir(), "watice-local-llm-"));
  testContext.after(() => rm(projectRoot, { recursive: true, force: true }));
  await mkdir(resolve(projectRoot, ".local"), { recursive: true });
  await writeFile(resolve(projectRoot, ".local", "llm-config.json"), JSON.stringify({
    provider: "local_test",
    providers: {
      local_test: {
        display_name: "本机测试模型",
        model: "test-model",
        base_url: "http://127.0.0.1:11434/v1",
        api_key_required: false,
      },
    },
    max_output_tokens: 180,
  }), "utf8");

  const upstreamRequests = [];
  const fetchImpl = async (_url, options) => {
    const payload = JSON.parse(options.body);
    upstreamRequests.push(payload);
    const content = payload.messages[0].content.includes("校对编辑")
      ? "- 原文“这个问题值得商确”：建议改为“这个问题值得商榷”；原因：错别字。"
      : "本文梳理本地写作工具如何帮助作者保持清晰表达，并讨论其适用边界。";
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
  };

  let middleware;
  createLocalLlmPlugin(projectRoot, { fetchImpl }).configureServer({
    middlewares: {
      use(handler) {
        middleware = handler;
      },
    },
  });
  assert.equal(typeof middleware, "function");
  return { middleware, upstreamRequests };
}

async function requestLocalAi(middleware, input, { host = "localhost:3000", origin = "http://localhost:3000" } = {}) {
  let body = "";
  const response = {
    statusCode: 200,
    setHeader() {},
    end(chunk = "") {
      body += chunk;
    },
  };
  const request = Readable.from([Buffer.from(JSON.stringify(input))]);
  Object.assign(request, {
    headers: { host, origin },
    method: "POST",
    url: "/api/local-summary",
  });
  await middleware(request, response, () => {});
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
  assert.match(html, /最近文章/);
  assert.match(html.replaceAll("<!-- -->", ""), /\d[\d,]* 字 · \d+ 分钟/);
  assert.doesNotMatch(html, /RECENT COMMENTARY|ALL COMMENTARY|最近评论/);
  assert.match(html, /金融、科技/);
  assert.doesNotMatch(html, /写文章|编辑文章|同步文章|href="#editor"/);
  assert.doesNotMatch(html, /草稿箱|本地草稿/);
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
  assert.match(page, /function escapeLiteralDollarSigns\(source: string\)/);
  assert.match(page, /\[A-Z\]\[A-Z0-9\]\{1,\}/);
  assert.match(page, /return escapeLiteralDollarSigns\(source\)/);
  assert.match(page, /className="table-scroll"/);
  assert.match(page, /content:\s*""/);
  assert.match(page, /placeholder="从这里开始写下今天的想法……"/);
  assert.match(page, /placeholder="用一小段话介绍这篇文章（可选）"/);
  assert.match(page, /className="title-input"[\s\S]*?placeholder="给这篇文章一个名字"[\s\S]*?rows=\{2\}/);
  assert.match(page, /className="editor-meta-side"[\s\S]*?placeholder="评论"[\s\S]*?<AiParticipationSlider/);
  assert.match(page, /category:\s*"评论"/);
  assert.match(page, /placeholder="评论"/);
  assert.match(page, /rows=\{4\}/);
  assert.match(styles, /\.editor-meta textarea\s*\{/);
  assert.match(styles, /\.editor-meta label\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(styles, /\.editor-meta \.title-input\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(styles, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(190px, 260px\) minmax\(200px, 260px\)/);
  assert.match(styles, /\.editor-meta-side\s*\{[\s\S]*?align-content:\s*start/);
  assert.match(styles, /resize:\s*vertical/);
  assert.match(styles, /\.prose strong\s*\{/);
  assert.match(styles, /\.prose em\s*\{/);
  assert.match(styles, /\.prose ul\s*\{[\s\S]*?list-style:\s*disc/);
  assert.match(styles, /\.prose ol\s*\{[\s\S]*?list-style:\s*decimal/);
  assert.match(styles, /\.prose li::marker\s*\{/);
  assert.match(styles, /\.prose \.table-scroll\s*\{/);
  assert.match(styles, /\.prose \.katex-display\s*\{/);
  assert.match(styles, /@media \(min-width:\s*901px\)\s*\{[\s\S]*?\.editor-workspace\s*\{[\s\S]*?height:\s*clamp\(680px, 78vh, 900px\)/);
  assert.match(styles, /\.writing-pane textarea\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?resize:\s*none/);
  assert.match(styles, /\.article-body > p\s*\{[\s\S]*?width:\s*100%/);
  assert.doesNotMatch(styles, /\.article-body > p\s*\{[\s\S]*?max-width:\s*700px/);
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
  assert.match(page, /const editArticle = async \(article: Article\)/);
  assert.match(page, /value\.startsWith\("editor\/"\)/);
  assert.match(page, /\{ name: "editor", id: decodeURIComponent\(value\.slice\(7\)\) \}/);
  assert.match(page, /window\.location\.assign\(`#editor\/\$\{encodeURIComponent\(article\.id\)\}`\)/);
  assert.match(page, /const restoreEditorDraft = \(\) =>/);
  assert.match(page, /articles\.find\(\(candidate\) => candidate\.id === currentView\.id\)/);
  assert.match(page, /draftRef\.current\.articleId !== article\.id \|\| draftRef\.current\.draftId/);
  assert.doesNotMatch(page, /localArticles|corner-posts|corner-draft|localStorage/);
  assert.match(page, /onEdit=\{editArticle\}/);
  assert.match(page, />编辑文章<\/button>/);
  assert.match(page, /className="reading-topbar"/);
  assert.equal(page.match(/onClick=\{\(\) => onEdit\(article\)\}>编辑文章<\/button>/g)?.length, 2);
  assert.doesNotMatch(page, /AI · \$\{label\}/);
  assert.match(page, /draft\.articleId \? "正式保存修改" : "正式保存并发布"/);
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
  assert.equal(page.match(/canEdit && <button type="button" onClick=\{\(\) => onEdit\(article\)\}>编辑文章<\/button>/g)?.length, 2);
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
  assert.match(page, /`aiParticipation: \$\{targetDraft\.aiParticipation\}`/);
  assert.match(page, /function AiParticipationIndicator\(\{ value, variant \}: \{ value: AiParticipationLevel; variant: "dots" \| "label" \}\)/);
  assert.match(page, /AI_PARTICIPATION_LABELS\.map\(\(dotLabel, index\) =>/);
  assert.match(page, /active && variant === "label"/);
  assert.match(page, /<AiParticipationIndicator value=\{article\.aiParticipation\} variant="dots" \/>/);
  assert.match(page, /<AiParticipationIndicator value=\{article\.aiParticipation\} variant="label" \/>/);
  assert.doesNotMatch(page, /AI ·/);
  assert.match(styles, /\.ai-slider-control input\s*\{/);
  assert.match(styles, /\.ai-slider-ticks\s*\{/);
  assert.match(styles, /\.ai-participation-indicator\s*\{/);
  assert.match(styles, /\.ai-participation-dot\.active\s*\{[\s\S]*?background: var\(--coral\)/);
  assert.match(styles, /\.ai-participation-label,[\s\S]*?color: var\(--coral\)/);
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
  assert.match(page, /Promise\.all\(\[refreshProjectArticles\(\), refreshDraftArticles\(\)\]\)/);
  assert.match(page, /正式保存会写入 content\/posts/);
  assert.doesNotMatch(page, /localStorage|发布到本机|保存到文章目录/);
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

test("stores ignored Markdown drafts without publishing them", async (testContext) => {
  let publishCalls = 0;
  const { middleware, projectRoot } = await createLocalApiFixture(testContext, {
    publishPost: async () => {
      publishCalls += 1;
      return { commit: "unused", pushed: true };
    },
  });
  const markdown = `---
slug: "unfinished-note"
title: "还没写完"
date: "2026-08-12"
category: "评论"
aiParticipation: 2
excerpt: ""
---

草稿正文。
`;

  const saved = await requestLocalJson(middleware, "/api/local-draft", {
    method: "POST",
    input: { slug: "unfinished-note", markdown, overwrite: false },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.filename, "unfinished-note.md");
  assert.equal(saved.body.draft.title, "还没写完");
  assert.equal(publishCalls, 0);
  assert.match(await readFile(resolve(projectRoot, "content", "drafts", "unfinished-note.md"), "utf8"), /草稿正文/);

  const listed = await requestLocalJson(middleware, "/api/local-draft");
  assert.equal(listed.status, 200);
  assert.equal(listed.body.count, 1);
  assert.equal(listed.body.drafts[0].id, "unfinished-note");
  assert.equal((await requestLocalPosts(middleware)).body.articles.length, 1);
});

test("atomically stores one editor recovery file until the user resolves it", async (testContext) => {
  const { middleware, projectRoot } = await createLocalApiFixture(testContext);
  const recoveryPath = resolve(
    projectRoot,
    "content",
    "drafts",
    ".recovery",
    "editor-autosave.json",
  );
  const recoveryDraft = {
    slug: "",
    title: "还没来得及保存",
    excerpt: "",
    category: "评论",
    aiParticipation: 2,
    content: "这段正文必须能够恢复。",
  };

  const empty = await requestLocalJson(middleware, "/api/local-recovery");
  assert.equal(empty.status, 200);
  assert.equal(empty.body.recovery, null);

  const saved = await requestLocalJson(middleware, "/api/local-recovery", {
    method: "PUT",
    input: { draft: recoveryDraft },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.recovery.draft.title, recoveryDraft.title);
  assert.ok(Date.parse(saved.body.recovery.savedAt));
  assert.deepEqual(JSON.parse(await readFile(recoveryPath, "utf8")), saved.body.recovery);

  const listedDrafts = await requestLocalJson(middleware, "/api/local-draft");
  assert.equal(listedDrafts.body.count, 0);

  const remoteWrite = await requestLocalJson(middleware, "/api/local-recovery", {
    method: "PUT",
    input: { draft: { ...recoveryDraft, content: "不应写入" } },
    host: "blog.example.com",
  });
  assert.equal(remoteWrite.status, 403);
  assert.equal(JSON.parse(await readFile(recoveryPath, "utf8")).draft.content, recoveryDraft.content);

  const replaced = await requestLocalJson(middleware, "/api/local-recovery", {
    method: "PUT",
    input: { draft: { ...recoveryDraft, content: "十秒后的新内容。" } },
  });
  assert.equal(replaced.status, 200);
  assert.equal((await requestLocalJson(middleware, "/api/local-recovery")).body.recovery.draft.content, "十秒后的新内容。");

  const invalid = await requestLocalJson(middleware, "/api/local-recovery", {
    method: "PUT",
    input: { draft: { ...recoveryDraft, articleId: "Unsafe Slug" } },
  });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /articleId 无效/);
  assert.equal(JSON.parse(await readFile(recoveryPath, "utf8")).draft.content, "十秒后的新内容。");

  const wrongMethod = await requestLocalJson(middleware, "/api/local-recovery", {
    method: "POST",
    input: { draft: recoveryDraft },
  });
  assert.equal(wrongMethod.status, 405);

  const deleted = await requestLocalJson(middleware, "/api/local-recovery", { method: "DELETE" });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.deleted, true);
  await assert.rejects(access(recoveryPath));
  assert.equal((await requestLocalJson(middleware, "/api/local-recovery")).body.recovery, null);
});

test("publishes a draft and only removes it after a successful push", async (testContext) => {
  const publishCalls = [];
  const { middleware, projectRoot } = await createLocalApiFixture(testContext, {
    publishPost: async (input) => {
      publishCalls.push(input);
      return { commit: "abc1234", pushed: true };
    },
  });
  const markdown = `---
slug: "ready-note"
title: "准备发布"
date: "2026-08-12"
category: "科技"
aiParticipation: 3
excerpt: "摘要"
---

正式正文。
`;

  await requestLocalJson(middleware, "/api/local-draft", {
    method: "POST",
    input: { slug: "ready-note", markdown, overwrite: false },
  });
  const published = await requestLocalJson(middleware, "/api/local-post", {
    method: "POST",
    input: { slug: "ready-note", markdown, overwrite: false, sourceDraftSlug: "ready-note" },
  });

  assert.equal(published.status, 200);
  assert.equal(published.body.pushed, true);
  assert.equal(published.body.commit, "abc1234");
  assert.equal(publishCalls.length, 1);
  assert.equal(publishCalls[0].filename, "ready-note.md");
  await assert.rejects(access(resolve(projectRoot, "content", "drafts", "ready-note.md")));
  assert.match(await readFile(resolve(projectRoot, "content", "posts", "ready-note.md"), "utf8"), /正式正文/);
});

test("keeps a source draft when publishing fails and rolls back pre-commit failures", async (testContext) => {
  const pushFailure = await createLocalApiFixture(testContext, {
    publishPost: async () => ({ commit: "deadbee", pushed: false, error: "网络不可用" }),
  });
  const markdown = `---
slug: "retry-note"
title: "稍后重试"
date: "2026-08-12"
category: "评论"
aiParticipation: 1
excerpt: ""
---

需要保留的正文。
`;
  await requestLocalJson(pushFailure.middleware, "/api/local-draft", {
    method: "POST",
    input: { slug: "retry-note", markdown, overwrite: false },
  });
  const notPushed = await requestLocalJson(pushFailure.middleware, "/api/local-post", {
    method: "POST",
    input: { slug: "retry-note", markdown, sourceDraftSlug: "retry-note" },
  });
  assert.equal(notPushed.status, 502);
  assert.equal(notPushed.body.pushed, false);
  const retryDraft = await readFile(resolve(pushFailure.projectRoot, "content", "drafts", "retry-note.md"), "utf8");
  assert.match(retryDraft, /sourceArticle: retry-note/);
  await access(resolve(pushFailure.projectRoot, "content", "posts", "retry-note.md"));

  const draftsAfterReload = await requestLocalJson(pushFailure.middleware, "/api/local-draft");
  assert.equal(draftsAfterReload.body.drafts[0].sourceArticleId, "retry-note");

  const preCommitFailure = await createLocalApiFixture(testContext, {
    publishPost: async () => {
      throw new Error("静态构建失败");
    },
  });
  const rolledBack = await requestLocalJson(preCommitFailure.middleware, "/api/local-post", {
    method: "POST",
    input: { slug: "retry-note", markdown },
  });
  assert.equal(rolledBack.status, 500);
  assert.match(rolledBack.body.error, /静态构建失败/);
  await assert.rejects(access(resolve(preCommitFailure.projectRoot, "content", "posts", "retry-note.md")));
});

test("exposes the local draft box and one-click publish workflow only in the editor", async () => {
  const [page, styles, localPostsPlugin, gitignore] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../build/local-posts-plugin.mjs", import.meta.url), "utf8"),
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
  ]);

  assert.match(page, /fetch\("\/api\/local-draft"/);
  assert.match(page, /content\/drafts 中的本地 Markdown/);
  assert.match(page, />草稿箱<\/a>/);
  assert.match(page, /正式保存并发布/);
  assert.match(page, /sourceDraftSlug: targetDraft\.draftId/);
  assert.match(page, /fetch\("\/api\/local-recovery"/);
  assert.match(page, /window\.setInterval\(\(\) => writeRecoveryFile\(draftRef\.current\), 10_000\)/);
  assert.match(page, /存入草稿箱/);
  assert.match(page, /保存为正文/);
  assert.match(page, /丢弃临时文件/);
  assert.match(page, /确认把这份临时文件保存到草稿箱/);
  assert.match(page, /确认把这份临时文件保存为正文/);
  assert.match(page, /确认永久丢弃这份临时文件/);
  assert.match(page, /recoveryGateStatus === "ready"/);
  assert.match(styles, /\.draft-card\s*\{/);
  assert.match(styles, /\.recovery-gate\s*\{/);
  assert.match(localPostsPlugin, /const draftRoute = "\/api\/local-draft"/);
  assert.match(localPostsPlugin, /const recoveryRoute = "\/api\/local-recovery"/);
  assert.match(localPostsPlugin, /resolve\(draftsDirectory, "\.recovery"\)/);
  assert.match(localPostsPlugin, /await atomicWrite\(recoveryDirectory, recoveryFilename/);
  assert.match(localPostsPlugin, /execFileAsync\("npm", \["run", "build:github"\]/);
  assert.match(localPostsPlugin, /env: \{ \.\.\.process\.env, NODE_ENV: "production" \}/);
  assert.match(localPostsPlugin, /execFileAsync\("git", \["push", "origin", "main"\]/);
  assert.match(localPostsPlugin, /assertNoOtherPostChanges/);
  assert.match(localPostsPlugin, /core\.quotePath=false/);
  assert.match(gitignore, /^\/content\/drafts\/$/m);
});

test("keeps local AI writing tools author-oriented and suggestion-only", async (testContext) => {
  const [page, viteConfig, localLlmPlugin, gitignore] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../build/local-llm-plugin.mjs", import.meta.url), "utf8"),
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
  ]);

  assert.match(page, /process\.env\.NODE_ENV === "development"/);
  assert.match(page, /fetch\("\/api\/local-summary"/);
  assert.match(page, /requestLocalAi\("summary"\)/);
  assert.match(page, /requestLocalAi\("proofread"\)/);
  assert.match(page, /localAiEnabled && \(/);
  assert.match(page, /AI 检查语病与错别字/);
  assert.match(page, /setProofreadingSuggestions\(result\.suggestions\)/);
  assert.match(page, /检查结果仅供参考，不会自动改动正文/);
  assert.match(page, /本机文字助手服务未启动，请重启 npm run dev/);
  assert.match(viteConfig, /createLocalLlmPlugin from "\.\/build\/local-llm-plugin\.mjs"/);
  assert.match(viteConfig, /createLocalLlmPlugin\(\)/);
  assert.match(localLlmPlugin, /站在作者本人的立场/);
  assert.match(localLlmPlugin, /简介必须以“本文”开头/);
  assert.match(localLlmPlugin, /不要使用“我”“我们”“笔者”/);
  assert.match(localLlmPlugin, /不要使用“作者认为”“作者讨论”等旁观者口吻/);
  assert.match(localLlmPlugin, /绝对不要重写或修改原文/);
  assert.match(localLlmPlugin, /只给逐条建议/);
  assert.match(localLlmPlugin, /isAllowedHost\(request\.headers\.host\)/);
  assert.match(localLlmPlugin, /resolve\(projectRoot, "\.local", "llm-config\.json"\)/);
  assert.match(gitignore, /^\/\.local\/$/m);

  const { middleware, upstreamRequests } = await createLocalLlmFixture(testContext);
  const summary = await requestLocalAi(middleware, {
    task: "summary",
    title: "写作工具",
    content: "正文内容。",
  });
  assert.equal(summary.status, 200);
  assert.match(summary.body.summary, /^本文/);
  assert.equal(summary.body.provider, "本机测试模型");
  assert.equal(upstreamRequests[0].max_tokens, 180);
  assert.match(upstreamRequests[0].messages[0].content, /站在作者本人的立场/);
  assert.match(upstreamRequests[0].messages[0].content, /简介必须以“本文”开头/);

  const proofreading = await requestLocalAi(middleware, {
    task: "proofread",
    title: "写作工具",
    content: "这个问题值得商确。",
  });
  assert.equal(proofreading.status, 200);
  assert.match(proofreading.body.suggestions, /建议改为“这个问题值得商榷”/);
  assert.equal(upstreamRequests[1].max_tokens, 1200);
  assert.match(upstreamRequests[1].messages[0].content, /不要输出修改后的全文/);

  const invalidTask = await requestLocalAi(middleware, {
    task: "rewrite",
    content: "不要改写我。",
  });
  assert.equal(invalidTask.status, 400);
  assert.equal(upstreamRequests.length, 2);

  const remoteHost = await requestLocalAi(middleware, {
    task: "proofread",
    content: "正文内容。",
  }, { host: "blog.example.com" });
  assert.equal(remoteHost.status, 403);
  assert.equal(upstreamRequests.length, 2);
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
