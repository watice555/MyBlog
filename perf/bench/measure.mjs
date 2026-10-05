import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { serve } from "./serve.mjs";

const [directoryA, directoryB, output = ".local/perf/paired.json"] = process.argv.slice(2);
if (!directoryA) throw new Error("Usage: node perf/bench/measure.mjs DIRECTORY_A [DIRECTORY_B] [OUTPUT]");
const runs = Number(process.env.PERF_RUNS || 10);
const width = Number(process.env.PERF_WIDTH || 1440);
const height = width < 600 ? 844 : 900;
const routes = (process.env.PERF_ROUTES || "/MyBlog/|/MyBlog/article/2026-10-04-合并日报/").split("|");
const servers = { A: await serve(directoryA, { editorFixture: true }) };
if (directoryB) servers.B = await serve(directoryB, { editorFixture: true });
const browser = await chromium.launch();
const samples = [];
const started = new Date().toISOString();
try {
  for (const route of routes) {
    for (let i = 0; i < runs; i++) {
      const order = Object.keys(servers);
      if (i % 2) order.reverse();
      for (const version of order) {
        const context = await browser.newContext({ viewport: { width, height } });
        try {
          const page = await context.newPage();
          const errors = [];
          page.on("pageerror", (error) => errors.push(error.message));
          const cdp = await context.newCDPSession(page);
          await cdp.send("Network.enable");
          await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
          await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 20, downloadThroughput: 4 * 1024 * 1024 / 8, uploadThroughput: 3 * 1024 * 1024 / 8 });
          await page.addInitScript(() => {
            window.__perf = { lcp: null, longtask: 0 };
            new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__perf.lcp = entry.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
            new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__perf.longtask += entry.duration; }).observe({ type: "longtask", buffered: true });
            document.addEventListener("DOMContentLoaded", () => {
              const selector = location.hash === "#archive" ? '.archive-page input[type="search"]' : location.hash === "#editor" ? 'textarea[aria-label="Markdown 正文"]' : ".reading-header h1, #featured-title";
              const check = async () => {
                const target = document.querySelector(selector);
                if (!target?.getBoundingClientRect().width || document.querySelector("dialog[open]")) {
                  requestAnimationFrame(check);
                  return;
                }
                await document.fonts.ready;
                requestAnimationFrame(() => requestAnimationFrame(() => { window.__perf.ready = performance.now(); }));
              };
              void check();
            });
          });
          await page.goto(servers[version].url + route, { waitUntil: "commit" });
          await page.waitForFunction(() => window.__perf.ready > 0);
          let actionMs = null;
          if (route.endsWith("#archive")) {
            const start = await page.evaluate(() => performance.now());
            await page.locator('input[type="search"]').fill("AI");
            await page.waitForFunction(() => document.querySelectorAll(".archive-list article").length > 0 && !document.querySelector('[role="status"]'));
            actionMs = await page.evaluate(() => performance.now()) - start;
          } else if (route.endsWith("#editor")) {
            await page.getByRole("textbox", { name: "Markdown 正文", exact: true }).fill("性能测试正文 $x^2$\n");
            await page.locator(".prose .katex").waitFor();
            if (await page.getByRole("textbox", { name: "Markdown 正文", exact: true }).inputValue() !== "性能测试正文 $x^2$\n") throw new Error("Editor lost input");
          }
          await page.waitForLoadState("networkidle");
          const data = await page.evaluate(() => {
            const resources = performance.getEntriesByType("resource").map((r) => ({ name: new URL(r.name).pathname, type: r.initiatorType, bytes: r.encodedBodySize, end: r.responseEnd }));
            return { ...window.__perf, fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime, resources, bytes: resources.reduce((n, r) => n + r.bytes, performance.getEntriesByType("navigation")[0].encodedBodySize) };
          });
          if (errors.length) throw new Error(errors.join("\n"));
          samples.push({ route, version, iteration: i, actionMs, ...data });
          console.log(`${route} ${version} ${i + 1}/${runs}: ready=${Math.round(data.ready)} LCP=${Math.round(data.lcp)} bytes=${data.bytes}`);
        } finally { await context.close(); }
      }
    }
  }
} finally {
  await browser.close();
  await Promise.all(Object.values(servers).map((server) => server.close()));
}
function percentile(values, p) {
  values.sort((a, b) => a - b);
  const index = (values.length - 1) * p;
  return Math.round(values[Math.floor(index)] + (values[Math.ceil(index)] - values[Math.floor(index)]) * (index % 1));
}
const summary = routes.flatMap((route) => Object.keys(servers).map((version) => {
  const group = samples.filter((sample) => sample.route === route && sample.version === version);
  return { route, version, n: group.length, ...Object.fromEntries(["ready", "lcp", "fcp", "longtask", "bytes"].map((metric) => [metric, Object.fromEntries([50, 75, 95].map((p) => [`p${p}`, percentile(group.map((row) => row[metric]), p / 100)]))])) };
}));
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ started, finished: new Date().toISOString(), config: { width, height, runs, network: "20ms RTT; 4 Mi bps down / 3 Mi bps up; cold cache; CPU 1x; gzip" }, summary, samples }, null, 2));
console.log(JSON.stringify(summary, null, 2));
