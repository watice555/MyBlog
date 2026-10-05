import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const report = JSON.parse(await readFile(process.argv[2], "utf8"));
assert.ok(report.config.runs >= 10, "Final paired measurements require >= 10 runs per version");
for (const before of report.summary.filter((row) => row.version === "A")) {
  const after = report.summary.find((row) => row.version === "B" && row.route === before.route);
  assert.ok(after && after.n === before.n && before.n >= 10, `Missing pair: ${before.route}`);
  // Latency is noisy: permit 5% or one 60Hz frame, whichever is larger.
  // Deterministic resource budgets in budget.mjs have no such allowance.
  const limit = before.ready.p75 + Math.max(1000 / 60, before.ready.p75 * 0.05);
  assert.ok(after.ready.p75 <= limit, `${before.route}: ready p75 ${after.ready.p75} > ${limit.toFixed(1)}`);
  console.log(`${before.route}: ${before.ready.p75} → ${after.ready.p75} ms (${((1 - after.ready.p75 / before.ready.p75) * 100).toFixed(1)}% reduction)`);
}
