import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import matter from "gray-matter";

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

test("server-renders the finished blog", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /<title>一隅｜个人文字博客<\/title>/);
  assert.match(html, /把日子写成/);
  assert.match(html, /最近写下的/);
  assert.doesNotMatch(html, /写文章|编辑文章|href="#editor"/);
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
  assert.match(nextConfig, /output:\s*"export"/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("uses a standard Markdown renderer with emphasis styles", async () => {
  const [page, styles, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /import ReactMarkdown from "react-markdown"/);
  assert.match(page, /<ReactMarkdown>\{source\}<\/ReactMarkdown>/);
  assert.match(page, /content:\s*""/);
  assert.match(page, /placeholder="从这里开始写下今天的想法……"/);
  assert.match(page, /placeholder="用一小段话介绍这篇文章（可选）"/);
  assert.match(page, /rows=\{4\}/);
  assert.match(styles, /\.editor-meta textarea\s*\{/);
  assert.match(styles, /resize:\s*vertical/);
  assert.match(styles, /\.prose strong\s*\{/);
  assert.match(styles, /\.prose em\s*\{/);
  assert.match(packageJson, /"react-markdown"/);
});

test("supports editing and updating existing articles", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /articleId\?: string/);
  assert.match(page, /const editArticle = \(article: Article\)/);
  assert.match(page, /localArticles\.filter\(\(item\) => item\.id !== article\.id/);
  assert.match(page, /onEdit=\{editArticle\}/);
  assert.match(page, />编辑文章<\/button>/);
  assert.match(page, /draft\.articleId \? "保存修改" : "发布到本机"/);
  assert.match(page, /normalizeSlug\(draft\.title\) !== normalizeSlug\(draft\.slug\)/);
  assert.match(page, /标题与 Slug 不同：文章列表将显示标题，链接将继续使用此 Slug。/);
  assert.match(styles, /\.editor-meta \.slug-hint\s*\{/);
});

test("keeps author controls local and hides them from public readers", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /function localEditorAvailable\(\)/);
  assert.match(page, /\["localhost", "127\.0\.0\.1", "::1", "\[::1\]"\]/);
  assert.match(page, /editorEnabled && <a className="editor-link"/);
  assert.match(page, /view\.name === "editor" && editorEnabled/);
  assert.match(page, /canEdit && <button type="button" onClick=\{\(\) => onEdit\(article\)\}>编辑文章<\/button>/);
  assert.match(page, /if \(!localEditorAvailable\(\)\) \{/);
  assert.match(page, /if \(!draftReady \|\| !editorEnabled\) return/);
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
    assert.ok(content.trim());
    assert.match(generated, new RegExp(`"id": "${data.slug}"`));
  }

  assert.match(page, /import \{ generatedPosts \} from "\.\/generated-posts"/);
  assert.doesNotMatch(page, /const starterArticles/);
  assert.match(generator, /slug .* 重复/);
  assert.match(generator, /const excerpt = String\(data\.excerpt \?\? ""\)\.trim\(\)/);
  assert.doesNotMatch(generator, /createExcerpt|自动提取/);
  assert.match(packageJson, /"content:generate": "node scripts\/generate-posts\.mjs"/);
  assert.match(packageJson, /"prebuild:github": "npm run content:generate"/);
  assert.match(page, /`slug: \$\{JSON\.stringify\(slug\)\}`/);
  assert.match(page, /fetch\("\/api\/local-post"/);
  assert.match(page, /cache: "no-store"/);
  assert.match(page, /setProjectArticles/);
  assert.match(page, /保存到文章目录/);
  assert.match(page, /文章列表已更新/);
  assert.match(page, /localStorage\.setItem\("corner-draft", JSON\.stringify\(emptyDraft\)\)/);
  assert.match(localPostsPlugin, /const postRoute = "\/api\/local-post"/);
  assert.match(localPostsPlugin, /request\.method === "GET"/);
  assert.match(localPostsPlugin, /article: existingPost\.article/);
  assert.match(localPostsPlugin, /resolve\(projectRoot, "content", "posts"\)/);
  assert.match(localPostsPlugin, /await rename\(temporary, destination\)/);
  assert.match(localPostsPlugin, /await unlink\(destination\)/);
  assert.match(localPostsPlugin, /existingPost\.markdown/);
  assert.match(localPostsPlugin, /execFileAsync\(process\.execPath/);
  assert.doesNotMatch(page, /excerpt:\s*draft\.excerpt\.trim\(\) \|\| draft\.content/);
  assert.match(page, /article\.excerpt && <p>\{article\.excerpt\}<\/p>/);
  assert.match(page, /article\.excerpt && <p className="reading-deck">/);
  assert.match(page, /function removeLegacyAutoExcerpt\(article: Article\)/);
  assert.match(page, /corner-excerpt-policy/);
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
