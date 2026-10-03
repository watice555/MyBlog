import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import createLocalPostsPlugin from "../build/local-posts-plugin.mjs";
import { normalizeDate } from "../lib/content-utils.mjs";
import { parseFrontMatter } from "../lib/front-matter.mjs";
import { generatePosts } from "../scripts/generate-posts.mjs";

const outputPaths = ["app/generated-posts.ts", "app/generated-post-content.ts", "public/search-index.json"];
const article = (slug, date = "2026-10-02", body = "正文ＡＢＣ", extra = "") => `---\ntitle: ${slug}\nslug: ${slug}\ndate: ${date}\naiParticipation: 1\n${extra}---\n${body}\n`;

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "blog-content-pipeline-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "content/posts"), { recursive: true });
  return root;
}

test("YAML parser preserves dates and rejects executable front matter and tags", () => {
  for (const newline of ["\n", "\r\n"]) {
    const { data } = parseFrontMatter(article("valid", "2024-02-29").replaceAll("\n", newline), "test.md");
    assert.equal(data.date, "2024-02-29");
    assert.equal(normalizeDate(data.date, "test.md"), "2024-02-29");
  }
  for (const date of ["2026-02-29", "2026-02-31", "2026-04-31", "2026-13-01", "2026-00-01"]) {
    const { data } = parseFrontMatter(article("invalid", date), "test.md");
    assert.throws(() => normalizeDate(data.date, "test.md"), /有效日期/);
  }
  for (const language of ["js", "javascript", "yaml"]) {
    assert.throws(() => parseFrontMatter(`---${language}\nglobalThis.__blogFrontMatterExecuted = true\n---\nbody`, "test.md"), /Front Matter/);
  }
  assert.equal(globalThis.__blogFrontMatterExecuted, undefined);
  assert.throws(() => parseFrontMatter("---\ndate: !!timestamp 2026-02-31\n---\nbody", "test.md"), /解析失败/);
});

test("500-article generation keeps full bodies out of metadata and normalizes search once", async (t) => {
  const root = await fixture(t);
  const body = "ＡＢＣ 汉字\n".repeat(300);
  await Promise.all(Array.from({ length: 500 }, (_, index) => writeFile(join(root, "content/posts", `post-${index}.md`), article(`post-${index}`, "2026-10-02", body))));
  const posts = await generatePosts(root);
  assert.equal(posts.length, 500);
  assert.equal(posts[0].dateISO, "2026-10-02");
  assert.equal(posts[0].date, "2026.10.02");
  assert.equal(posts[0].wordCount, 1500);
  assert.equal(posts[0].readTime, "4 分钟");
  assert.equal("content" in posts[0], false);
  const [metadata, content, searchText] = await Promise.all(outputPaths.map((path) => readFile(join(root, path), "utf8")));
  assert.ok(!metadata.includes("ＡＢＣ"));
  assert.ok(content.includes("ＡＢＣ"));
  assert.ok(Buffer.byteLength(metadata) < Buffer.byteLength(content) / 5);
  const search = JSON.parse(searchText);
  assert.equal(search.length, 500);
  assert.ok(search.every((entry) => entry.text.includes("abc 汉字")));
  assert.deepEqual(new Set(search.map((entry) => entry.id)), new Set(posts.map((post) => post.id)));
});

test("generator validates the entire collection before replacing existing outputs", async (t) => {
  const root = await fixture(t);
  const source = join(root, "content/posts/first.md");
  await writeFile(source, article("first"));
  await generatePosts(root);
  const before = await Promise.all(outputPaths.map((path) => readFile(join(root, path), "utf8")));
  for (const [markdown, message] of [
    [article("first", "2026-02-31"), /有效日期/],
    [article("first", "2026-10-02", ""), /正文不能为空/],
    [article("first").replace("title: first", "title: ''"), /缺少 title/],
    [article("first").replace("aiParticipation: 1", "aiParticipation: 6"), /aiParticipation/],
  ]) {
    await writeFile(source, markdown);
    await assert.rejects(generatePosts(root), message);
    assert.deepEqual(await Promise.all(outputPaths.map((path) => readFile(join(root, path), "utf8"))), before);
  }
  await writeFile(source, article("first"));
  await writeFile(join(root, "content/posts/second.md"), article("ＦＩＲＳＴ"));
  await assert.rejects(generatePosts(root), /重复/);
});

async function request(middleware, url, input) {
  const stream = Readable.from([Buffer.from(JSON.stringify(input))]);
  Object.assign(stream, { url, method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" } });
  let body;
  const response = { statusCode: 200, setHeader() {}, end(value) { body = JSON.parse(value); } };
  await middleware(stream, response, () => assert.fail("Unexpected middleware fallthrough"));
  return { status: response.statusCode, body };
}

test("local API rejects invalid calendar dates and restores every generated artifact on failed publish", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, "content/posts/existing.md"), article("existing"));
  await generatePosts(root);
  await mkdir(join(root, "scripts"));
  const generatorUrl = new URL("../scripts/generate-posts.mjs", import.meta.url).href;
  await writeFile(join(root, "scripts/generate-posts.mjs"), `import { generatePosts } from ${JSON.stringify(generatorUrl)}; await generatePosts(${JSON.stringify(root)});`);
  let middleware;
  createLocalPostsPlugin(root, { publishPost: async () => { throw new Error("simulated publish failure"); } }).configureServer({ middlewares: { use(handler) { middleware = handler; } } });
  for (const route of ["/api/local-post", "/api/local-draft"]) {
    const result = await request(middleware, route, { slug: "invalid", markdown: article("invalid", "2026-02-31") });
    assert.equal(result.status, 400);
    assert.match(result.body.error, /有效日期/);
  }
  const before = await Promise.all(outputPaths.map((path) => readFile(join(root, path), "utf8")));
  const failed = await request(middleware, "/api/local-post", { slug: "new", markdown: article("new") });
  assert.equal(failed.status, 500);
  assert.match(failed.body.error, /simulated publish failure/);
  assert.deepEqual(await Promise.all(outputPaths.map((path) => readFile(join(root, path), "utf8"))), before);
  await assert.rejects(readFile(join(root, "content/posts/new.md")), { code: "ENOENT" });
  const oldMarkdown = await readFile(join(root, "content/posts/existing.md"), "utf8");
  const update = await request(middleware, "/api/local-post", { slug: "existing", overwrite: true, markdown: article("existing", "2026-10-03", "修改正文") });
  assert.equal(update.status, 500);
  assert.equal(await readFile(join(root, "content/posts/existing.md"), "utf8"), oldMarkdown);
  assert.deepEqual(await Promise.all(outputPaths.map((path) => readFile(join(root, path), "utf8"))), before);
});

test("failed push marks the source draft without parsing or changing its Markdown body", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "scripts"));
  const generatorUrl = new URL("../scripts/generate-posts.mjs", import.meta.url).href;
  await writeFile(join(root, "scripts/generate-posts.mjs"), `import { generatePosts } from ${JSON.stringify(generatorUrl)}; await generatePosts(${JSON.stringify(root)});`);
  let middleware;
  createLocalPostsPlugin(root, {
    publishPost: async () => ({ commit: "fixture-commit", pushed: false, error: "simulated push failure" }),
  }).configureServer({ middlewares: { use(handler) { middleware = handler; } } });
  t.after(() => { delete globalThis.__blogDraftStringifyExecuted; });

  const bodies = [
    "---js\n(globalThis.__blogDraftStringifyExecuted = true, {})\n---\n\n正文",
    "---\ntitle: 这是正文中的 YAML，不是文章元数据\n---\n\n正文  \n\n",
    "\n\n开头空行与末尾空格也属于正文。  ",
  ];
  for (const [index, body] of bodies.entries()) {
    const slug = `draft-body-${index}`;
    const markdown = article(slug, "2026-10-03", body).slice(0, -1);
    const saved = await request(middleware, "/api/local-draft", { slug, markdown });
    assert.equal(saved.status, 200);
    const original = parseFrontMatter(markdown, `${slug}.md`);
    assert.equal(original.content, body);

    const result = await request(middleware, "/api/local-post", { slug, markdown, sourceDraftSlug: slug });
    assert.equal(result.status, 502);
    assert.equal(result.body.commit, "fixture-commit");
    assert.equal(result.body.pushed, false);
    assert.match(result.body.error, /simulated push failure/);
    assert.equal(globalThis.__blogDraftStringifyExecuted, undefined, "Markdown must never execute during draft serialization");

    const updated = parseFrontMatter(await readFile(join(root, "content/drafts", `${slug}.md`), "utf8"), `${slug}.md`);
    assert.equal(updated.data.sourceArticle, slug, "the retained draft must record the locally committed article");
    assert.equal(updated.data.title, original.data.title);
    assert.equal(updated.content, original.content, "the complete body, including whitespace, must remain unchanged");
    assert.equal(await readFile(join(root, "content/posts", `${slug}.md`), "utf8"), markdown);
  }
});
