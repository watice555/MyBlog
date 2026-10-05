import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve("out");
const budget = JSON.parse(await readFile(new URL("./budget.json", import.meta.url), "utf8"));
const pages = ["index.html", ...(await readdir(resolve(root, "article"))).map((slug) => `article/${slug}/index.html`)];
const maxima = { stylesheets: 0, cssGzip: 0, jsGzip: 0 };
for (const page of pages) {
  const html = await readFile(resolve(root, page), "utf8");
  const styles = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map((match) => match[1]);
  const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>/g)].filter((match) => !/noModule/i.test(match[0])).map((match) => match[1]);
  const bytes = async (urls) => {
    let total = 0;
    for (const url of new Set(urls)) {
      const path = url.slice(url.indexOf("_next/"));
      assert.ok(path.startsWith("_next/"), `Unexpected resource ${url}`);
      total += gzipSync(await readFile(resolve(root, path))).length;
    }
    return total;
  };
  const metrics = { stylesheets: styles.length, cssGzip: await bytes(styles) + [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].reduce((sum, match) => sum + gzipSync(match[1]).length, 0), jsGzip: await bytes(scripts) };
  for (const [key, value] of Object.entries(metrics)) {
    maxima[key] = Math.max(maxima[key], value);
    assert.ok(value <= budget[key], `${page}: ${key} ${value} exceeds ${budget[key]}`);
  }
}
console.log(`Performance budget passed for ${pages.length} pages: ${JSON.stringify(maxima)}`);
