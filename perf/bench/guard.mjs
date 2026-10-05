import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { serve } from "./serve.mjs";

const [directoryA, directoryB = directoryA] = process.argv.slice(2);
if (!directoryA) throw new Error("Usage: node perf/bench/guard.mjs DIRECTORY_A [DIRECTORY_B]");
const servers = [await serve(directoryA), await serve(directoryB)];
const browser = await chromium.launch();
const routes = ["/MyBlog/", "/MyBlog/article/2026-10-04-合并日报/", "/MyBlog/article/扒开那个半仓港股qdii的底裤/"];
await mkdir(".local/perf/screenshots", { recursive: true });
try {
  for (const width of [1440, 390]) {
    for (const [index, route] of routes.entries()) {
      const results = [];
      for (const [version, server] of servers.entries()) {
        const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
        try {
          const page = await context.newPage();
          const errors = [];
          page.on("pageerror", (error) => errors.push(error.message));
          await page.goto(server.url + route, { waitUntil: "networkidle" });
          await page.evaluate(() => document.fonts.ready);
          const golden = await page.evaluate(() => ({
            content: document.querySelector(".site-shell").outerHTML,
            seo: [...document.querySelectorAll('title, meta[name], meta[property], link[rel="canonical"], link[rel="alternate"], script[type="application/ld+json"]')].map((element) => element.outerHTML),
            overflow: document.documentElement.scrollWidth > innerWidth,
          }));
          assert.deepEqual(errors, [], `console errors: ${route}`);
          assert.equal(golden.overflow, false, `overflow: ${route}`);
          const screenshot = await page.screenshot({ animations: "disabled" });
          await writeFile(`.local/perf/screenshots/${width}-${index}-${version}.png`, screenshot);
          results.push({ golden, screenshot });
          if (index === 0) {
            await page.locator('.site-nav a[href="./#archive"]').click();
            await page.locator('input[type="search"]').fill("AI");
            await page.waitForFunction(() => document.querySelectorAll(".archive-list article").length > 0);
            assert.ok(await page.locator('input[type="search"]').inputValue() === "AI");
            await page.locator('.site-nav a[href="./#about"]').click();
            await page.getByRole("heading", { name: "关于凝泠", exact: true }).waitFor();
            await page.goto(server.url + "/MyBlog/#article/2026-10-04-合并日报");
            await page.waitForURL("**/article/**");
            await page.locator(".reading-header h1").waitFor();
          }
        } finally { await context.close(); }
      }
      assert.deepEqual(results[1].golden, results[0].golden, `${width} ${route}: content/SEO`);
      assert.ok(results[1].screenshot.equals(results[0].screenshot), `${width} ${route}: screenshot differs`);
      console.log(`PASS ${width} ${route}: identical content, SEO and screenshot`);
    }
  }
} finally {
  await browser.close();
  await Promise.all(servers.map((server) => server.close()));
}
