import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as contentUtils from "../lib/content-utils.mjs";

const hookSource = await readFile(new URL("../app/hooks/use-local-editor.ts", import.meta.url), "utf8");
const navigationSource = await readFile(new URL("../lib/navigation.ts", import.meta.url), "utf8");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

const article = {
  id: "draft-a", title: "原始标题", excerpt: "摘要", category: "评论",
  aiParticipation: 1, date: "2026-10-03", readTime: "1 分钟", content: "已保存正文",
};

// Execute the real hook callbacks/effects with deterministic hook slots, timers
// and HTTP responses. No DOM, listening port, real drafts or Git operations.
// This models state/ref/effect ordering, not React's concurrent renderer or UI.
function createEditor({ drafts = [], posts = [], hash = "#editor", request } = {}) {
  const slots = [];
  const effects = [];
  const listeners = new Map();
  const calls = [];
  let cursor = 0;
  let dirty = true;
  let current;
  let confirmationCount = 0;
  const fakeWindow = {
    location: {
      hostname: "localhost", hash,
      assign(value) {
        if (this.hash === value) return;
        this.hash = value;
        for (const callback of listeners.get("hashchange") || []) callback();
      },
    },
    addEventListener(event, callback) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(callback);
    },
    removeEventListener(event, callback) { listeners.get(event)?.delete(callback); },
    setTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    confirm() { confirmationCount++; return true; },
  };
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      const set = (update) => {
        const next = typeof update === "function" ? update(slots[index].value) : update;
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; }
      };
      return [slots[index].value, set];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ||= { current: initial };
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) slots[index] = { deps, callback };
      return slots[index].callback;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps };
        effects.push(() => {
          previous?.cleanup?.();
          slots[index].cleanup = callback();
        });
      }
    },
    useSyncExternalStore(_subscribe, snapshot) { cursor++; return snapshot(); },
  };
  const context = vm.createContext({
    window: fakeWindow,
    document: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} },
    process: { env: { NODE_ENV: "development" } },
    fetch: async (url, options = {}) => {
      const call = { url, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null };
      calls.push(call);
      const custom = request?.(call);
      if (custom !== undefined) return custom;
      if (url === "/api/local-draft" && call.method === "GET") return response({ drafts });
      if (url === "/api/local-post" && call.method === "GET") return response({ articles: posts });
      if (url === "/api/local-recovery") {
        if (call.method === "GET") return response({ recovery: null });
        if (call.method === "DELETE") return response({ deleted: true });
        if (call.method === "PUT") return response({ recovery: { draft: call.body.draft, savedAt: "2026-10-03T04:00:00Z" } });
      }
      throw new Error(`Unexpected request: ${call.method} ${url}`);
    },
  });
  function evaluate(source, imports = {}) {
    context.exports = {};
    context.require = (name) => {
      assert.ok(name in imports, `Unexpected import: ${name}`);
      return imports[name];
    };
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    vm.runInContext(`(function () { ${compiled.outputText}\n })()`, context);
    return context.exports;
  }
  const navigation = evaluate(navigationSource);
  const { useLocalEditor } = evaluate(hookSource, {
    react, "../../lib/content-utils.mjs": contentUtils, "../../lib/navigation": navigation,
  });
  function render() {
    for (let attempts = 0; dirty; attempts++) {
      assert.ok(attempts < 30, "Hook effects did not settle");
      dirty = false;
      cursor = 0;
      // eslint-disable-next-line react-hooks/rules-of-hooks -- This harness supplies React's hook slots for each simulated render.
      current = useLocalEditor();
      for (const effect of effects.splice(0)) effect();
    }
    return current;
  }
  return {
    get current() { return render(); },
    get confirmations() { return confirmationCount; },
    window: fakeWindow, calls,
    async settle() {
      for (let i = 0; i < 6; i++) { render(); await setImmediate(); }
      return render();
    },
    dirtyBeforeUnload() {
      render();
      let prevented = false;
      const event = { preventDefault() { prevented = true; } };
      for (const callback of listeners.get("beforeunload") || []) callback(event);
      return prevented;
    },
  };
}

function savedResponse(saved = article) {
  return response({ filename: `${saved.id}.md`, draft: saved });
}

test("draft save preserves typing before its delayed response, identity and recovery", async () => {
  const pending = deferred();
  const editor = createEditor({ request: ({ method, url }) => method === "POST" && url === "/api/local-draft" ? pending.promise : undefined });
  await editor.settle();
  editor.current.setDraft({ ...editor.current.draft, title: article.title, content: article.content });
  const save = editor.current.saveToDraftBox();
  const newer = { ...editor.current.draft, title: "新标题", content: "保存后新输入", excerpt: "新摘要", category: "笔记", aiParticipation: 3 };
  editor.current.setDraft(newer); // Intentionally no intervening render/effect.
  pending.resolve(savedResponse());
  await save;
  await editor.settle();
  for (const field of ["title", "content", "excerpt", "category", "aiParticipation"]) assert.equal(editor.current.draft[field], newer[field]);
  assert.equal(editor.current.draft.draftId, article.id);
  assert.equal(editor.dirtyBeforeUnload(), true);
  assert.match(editor.current.toast, /后续修改已保留/);
  assert.equal(editor.calls.filter((call) => call.method === "DELETE").length, 0);
  assert.equal(editor.calls.findLast((call) => call.method === "PUT").body.draft.content, newer.content);
  assert.equal(editor.calls.find((call) => call.method === "POST").body.markdown.includes(newer.content), false);
});

test("unchanged successful save cleans recovery and marks the returned snapshot saved", async () => {
  const editor = createEditor({ request: ({ method }) => method === "POST" ? savedResponse() : undefined });
  await editor.settle();
  editor.current.setDraft({ ...editor.current.draft, title: article.title, content: article.content });
  await editor.current.saveToDraftBox();
  await editor.settle();
  assert.equal(editor.current.draft.content, article.content);
  assert.equal(editor.current.draft.draftId, article.id);
  assert.equal(editor.dirtyBeforeUnload(), false);
  assert.equal(editor.calls.filter((call) => call.method === "DELETE").length, 1);
  assert.equal(editor.calls.filter((call) => call.method === "PUT").length, 0);
});

test("typing while recovery deletion is pending is preserved and immediately backed up", async () => {
  const deleting = deferred();
  const editor = createEditor({ request: ({ method }) => method === "POST" ? savedResponse() : method === "DELETE" ? deleting.promise : undefined });
  await editor.settle();
  editor.current.setDraft({ ...editor.current.draft, title: article.title, content: article.content });
  const save = editor.current.saveToDraftBox();
  await editor.settle();
  assert.equal(editor.calls.some((call) => call.method === "DELETE"), true);
  editor.current.setDraft({ ...editor.current.draft, content: "清理期间输入" });
  deleting.resolve(response({ deleted: true }));
  await save;
  await editor.settle();
  assert.equal(editor.current.draft.content, "清理期间输入");
  assert.equal(editor.dirtyBeforeUnload(), true);
  assert.equal(editor.calls.findLast((call) => call.method === "PUT").body.draft.content, "清理期间输入");
});

test("reopening the same draft preserves unsaved edits and its dirty baseline", async () => {
  const editor = createEditor({ drafts: [article], hash: `#editor/draft/${article.id}` });
  await editor.settle();
  editor.current.setDraft({ ...editor.current.draft, content: "尚未存回的修改" });
  editor.window.location.assign("#drafts");
  await editor.settle();
  await editor.current.editSavedDraft(article);
  await editor.settle();
  assert.equal(editor.current.draft.content, "尚未存回的修改");
  assert.equal(editor.dirtyBeforeUnload(), true);
  assert.equal(editor.confirmations, 0);
  assert.equal(editor.calls.filter((call) => call.method === "DELETE").length, 0);
});

test("a late save response cannot replace a different editing session or its recovery", async () => {
  const pending = deferred();
  const other = { ...article, id: "draft-b", content: "另一篇正文" };
  const editor = createEditor({ drafts: [article, other], hash: `#editor/draft/${article.id}`, request: ({ method }) => method === "POST" ? pending.promise : undefined });
  await editor.settle();
  const save = editor.current.saveToDraftBox();
  await editor.current.editSavedDraft(other);
  editor.current.setDraft({ ...editor.current.draft, content: "另一篇的新修改" });
  pending.resolve(savedResponse());
  await save;
  await editor.settle();
  assert.equal(editor.current.draft.draftId, other.id);
  assert.equal(editor.current.draft.content, "另一篇的新修改");
  assert.equal(editor.window.location.hash, `#editor/draft/${other.id}`);
  assert.equal(editor.dirtyBeforeUnload(), true);
  assert.equal(editor.calls.filter((call) => call.method === "DELETE").length, 0);
});

test("failed saves preserve current edits, leave them dirty and resume recovery", async () => {
  const pending = deferred();
  const editor = createEditor({ request: ({ method }) => method === "POST" ? pending.promise : undefined });
  await editor.settle();
  editor.current.setDraft({ ...editor.current.draft, title: article.title, content: article.content });
  const save = editor.current.saveToDraftBox();
  editor.current.setDraft({ ...editor.current.draft, content: "失败期间新输入" });
  pending.resolve(response({ error: "保存失败测试" }, 500));
  await save;
  await editor.settle();
  assert.equal(editor.current.draft.content, "失败期间新输入");
  assert.equal(editor.current.draft.draftId, undefined);
  assert.equal(editor.dirtyBeforeUnload(), true);
  assert.match(editor.current.toast, /保存失败测试/);
  assert.equal(editor.calls.findLast((call) => call.method === "PUT").body.draft.content, "失败期间新输入");
});

test("duplicate saves and publishing cannot overlap an in-flight draft save", async () => {
  const pending = deferred();
  const editor = createEditor({ request: ({ method }) => method === "POST" ? pending.promise : undefined });
  await editor.settle();
  editor.current.setDraft({ ...editor.current.draft, title: article.title, content: article.content });
  const handlers = editor.current;
  const save = handlers.saveToDraftBox();
  await handlers.saveToDraftBox();
  await handlers.saveMarkdownToProject();
  assert.equal(editor.calls.filter((call) => call.method === "POST").length, 1);
  pending.resolve(savedResponse());
  await save;
  await editor.settle();
});

test("saving an existing article as a draft does not reload the article after list refresh", async () => {
  const post = { ...article, id: "published-post" };
  const saved = { ...article, id: post.id, sourceArticleId: post.id, content: "文章的新草稿" };
  const editor = createEditor({ posts: [post], hash: `#editor/${post.id}`, request: ({ method }) => method === "POST" ? savedResponse(saved) : undefined });
  await editor.settle();
  editor.current.setDraft({ ...editor.current.draft, content: saved.content });
  await editor.current.saveToDraftBox();
  await editor.settle();
  assert.equal(editor.current.draft.draftId, saved.id);
  assert.equal(editor.current.draft.content, saved.content);
  assert.equal(editor.window.location.hash, `#editor/draft/${saved.id}`);
});
