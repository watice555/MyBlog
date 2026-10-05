import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve("out");
const budget = JSON.parse(await readFile(new URL("./budget.json", import.meta.url), "utf8"));
// Published metadata legitimately grows with new posts; keep the code budget fixed.
const metadataGzip = gzipSync(await readFile(new URL("../../app/generated-posts.ts", import.meta.url))).length;
const jsLimit = budget.jsGzip + Math.max(0, metadataGzip - budget.metadataGzip);
const indexFont = await readFile(new URL("../../app/fonts/index-digits.woff2", import.meta.url));
assert.equal(indexFont.toString("ascii", 0, 4), "wOF2");
assert.ok(indexFont.length <= budget.indexFontBytes, `Index font ${indexFont.length} exceeds ${budget.indexFontBytes}`);
const pages = ["index.html", ...(await readdir(resolve(root, "article"))).map((slug) => `article/${slug}/index.html`)];
const maxima = { stylesheets: 0, cssGzip: 0, jsGzip: 0 };
for (const page of pages) {
  const html = await readFile(resolve(root, page), "utf8");
  const styles = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map((match) => match[1]);
  const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>/g)].filter((match) => !/noModule/i.test(match[0])).map((match) => match[1]);
  if (page === "index.html") {
    const sheets = await Promise.all(styles.map(async (url) => ({ url, css: await readFile(resolve(root, url.slice(url.indexOf("_next/"))), "utf8") })));
    const css = sheets.map((sheet) => sheet.css).join("\n");
    assert.match(css, /\.article-index\{[^}]*font-family:"?Ningling Index Serif/, "Article indices must use the small font");
    const facePattern = /@font-face\{[^}]*font-family:"?Ningling Index Serif[^}]*\}/;
    const sheet = sheets.find((sheet) => facePattern.test(sheet.css));
    const face = sheet?.css.match(facePattern)?.[0];
    assert.ok(face, "Missing index font face");
    assert.match(face, /unicode-range:[^;}]*(?:u\+20|u\+0020)/i, "Space is required to avoid fetching the full fallback font");
    const fontUrl = face.match(/url\(["']?([^"')]+)/)?.[1];
    assert.ok(fontUrl, "Missing exported font asset URL");
    const fontPath = new URL(fontUrl, new URL(sheet.url, "https://example.test/")).pathname;
    assert.ok(fontPath.includes("_next/"), "Unexpected font path");
    const exportedFont = await readFile(resolve(root, fontPath.slice(fontPath.indexOf("_next/"))));
    assert.ok(exportedFont.equals(indexFont), "Export must ship the measured font subset");
  }
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
    const limit = key === "jsGzip" ? jsLimit : budget[key];
    assert.ok(value <= limit, `${page}: ${key} ${value} exceeds ${limit}`);
  }
}
console.log(`Performance budget passed for ${pages.length} pages: ${JSON.stringify(maxima)}, index font ${indexFont.length} bytes`);
