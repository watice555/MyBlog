import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("local launcher reports the server exit code without a zsh variable error", { skip: process.platform !== "darwin" }, () => {
  const script = fileURLToPath(new URL("../scripts/start-local-editor.command", import.meta.url));
  const result = spawnSync("/bin/zsh", ["-c", `
    npm() { return 23; }
    curl() { return 1; }
    lsof() { return 1; }
    read() { return 0; }
    source "$0"
  `, script], { encoding: "utf8", timeout: 10000 });
  assert.ifError(result.error);
  assert.equal(result.status, 23);
  assert.match(result.stdout, /本地服务启动失败（退出码：23）/);
  assert.doesNotMatch(result.stderr, /read-only variable/);
});
