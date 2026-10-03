import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { generatedPosts } from "../app/generated-posts.ts";

const output = new URL("../out/", import.meta.url);
const production = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://watice555.github.io/MyBlog/");
const repository = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const basePath = process.env.GITHUB_ACTIONS && repository && !repository.endsWith(".github.io") ? `/${repository}` : "";
const readOutput = (path) => readFile(new URL(path, output), "utf8");
const escapeHtml = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("'", "&#x27;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

test("exports every article with its own readable HTML and consistent metadata", async () => {
  assert.ok(generatedPosts.length > 0);
  for (const post of generatedPosts) {
    // Filesystem paths use the actual slug; public URLs encode Unicode.
    const html = await readOutput(`article/${encodeURIComponent(post.id)}/index.html`);
    const canonical = new URL(`article/${encodeURIComponent(post.id)}/`, production).href;
    assert.ok(html.includes(`<h1>${escapeHtml(post.title)}</h1>`), `${post.id}: missing rendered article heading`);
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.ok(html.includes(`rel="canonical" href="${canonical}"`), `${post.id}: canonical`);
    assert.ok(html.includes(`property="og:url" content="${canonical}"`), `${post.id}: OG URL`);
    assert.match(html, /property="og:type" content="article"/);
    assert.match(html, /class="prose"/);
    assert.doesNotMatch(html, /AI 智能总结|正式保存并发布|恢复临时文件|api\/local-summary/);
    const scripts = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1, `${post.id}: JSON-LD count`);
    const structured = JSON.parse(scripts[0][1]);
    assert.ok(["Article", "BlogPosting"].includes(structured["@type"]));
    assert.equal(structured.headline, post.title);
    assert.equal(structured.datePublished.slice(0, 10), post.dateISO);
    assert.equal(new URL("../../", new URL(canonical)).pathname, production.pathname);
    for (const [, url] of html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
      if (/^(?:https?:|data:|\/\/)/.test(url)) continue;
      const resolved = new URL(url, `https://example.test${basePath}/article/${encodeURIComponent(post.id)}/`);
      assert.ok(resolved.pathname.startsWith(`${basePath}/`));
      await access(resolve(new URL(output).pathname, decodeURIComponent(resolved.pathname.slice(basePath.length + 1))));
    }
  }
});

test("ships discoverable RSS, sitemap, robots and a complete separate search index", async () => {
  const [feed, sitemap, robots, home, search] = await Promise.all([
    readOutput("feed.xml"), readOutput("sitemap.xml"), readOutput("robots.txt"), readOutput("index.html"), readOutput("search-index.json"),
  ]);
  assert.match(home, /application\/rss\+xml/);
  assert.match(home, /id="recent"/);
  assert.doesNotMatch(home, /本地布局预览|首页布局对比/);
  for (const post of generatedPosts.slice(0, 5)) {
    const relativePath = `article/${encodeURIComponent(post.id)}/`;
    assert.ok(home.includes(`href="${relativePath}"`), `${post.id}: homepage article link`);
    assert.equal(new URL(relativePath, `https://example.test${basePath}/`).pathname, `${basePath}/${relativePath}`);
  }
  assert.equal((feed.match(/<item>/g) || []).length, generatedPosts.length);
  assert.ok(robots.includes(new URL("sitemap.xml", production).href));
  for (const post of generatedPosts) {
    const url = new URL(`article/${encodeURIComponent(post.id)}/`, production).href;
    assert.ok(feed.includes(url), `${post.id}: RSS`);
    assert.ok(sitemap.includes(url), `${post.id}: sitemap`);
  }
  assert.doesNotMatch(feed + sitemap + robots, /localhost|127\.0\.0\.1|#article\//);
  const entries = JSON.parse(search);
  assert.deepEqual(entries.map((entry) => entry.id).sort(), generatedPosts.map((post) => post.id).sort());
  assert.ok(entries.every((entry) => typeof entry.text === "string" && entry.text.length > 0));
});

test("home initial scripts contain metadata but no full article bodies or editor parser", async () => {
  const home = await readOutput("index.html");
  const scripts = [...home.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(scripts.length > 0);
  const sources = await Promise.all(scripts.map((src) => {
    const url = new URL(src, `https://example.test${basePath}/`);
    return readOutput(url.pathname.slice(basePath.length + 1));
  }));
  const initial = sources.join("\n");
  assert.doesNotMatch(initial, /正式保存并发布|正在保存图片…|katex\.version|KaTeX parse error/);
  assert.ok(generatedPosts.every((post) => !("content" in post)));
  const { generatedPostContent } = await import("../app/generated-post-content.ts");
  for (const post of generatedPosts) {
    const body = generatedPostContent[post.id];
    assert.ok(typeof body === "string" && body.length > 0);
    const sample = body.slice(0, 180);
    assert.ok(!initial.includes(JSON.stringify(sample).slice(1, -1)), `${post.id}: full body leaked into initial JS`);
  }
});
