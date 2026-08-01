import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { extname, parse, resolve } from "node:path";
import { promisify } from "node:util";
import matter from "gray-matter";

const execFileAsync = promisify(execFile);
const route = "/api/local-post";
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    return loopbackHosts.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function normalizeSlug(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error("文章内容过长，无法保存");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function findPostFilename(postsDirectory, slug) {
  const entries = await readdir(postsDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".md") continue;
    const source = await readFile(resolve(postsDirectory, entry.name), "utf8");
    const { data } = matter(source);
    const existingSlug = normalizeSlug(data.slug || parse(entry.name).name);
    if (existingSlug === slug) return entry.name;
  }
  return undefined;
}

function validateMarkdown(markdown, slug) {
  const { data, content } = matter(markdown);
  if (normalizeSlug(data.slug) !== slug) throw new Error("Markdown 中的 slug 与文件名不一致");
  if (!String(data.title ?? "").trim()) throw new Error("Markdown 缺少标题");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.date ?? "").trim())) {
    throw new Error("Markdown 日期必须使用 YYYY-MM-DD 格式");
  }
  if (!content.trim()) throw new Error("Markdown 正文不能为空");
}

export default function createLocalPostsPlugin(projectRoot = process.cwd()) {
  const postsDirectory = resolve(projectRoot, "content", "posts");
  const generatorPath = resolve(projectRoot, "scripts", "generate-posts.mjs");

  return {
    name: "local-post-writer",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url || "/", "http://localhost").pathname;
        if (pathname !== route) return next();
        if (!isAllowedOrigin(request.headers.origin)) {
          sendJson(response, 403, { error: "只允许从本机博客编辑器保存文章" });
          return;
        }
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "只支持 POST 请求" });
          return;
        }

        try {
          const input = await readJsonBody(request);
          const slug = normalizeSlug(input.slug);
          const markdown = String(input.markdown ?? "");
          if (!slug || slug !== input.slug) {
            sendJson(response, 400, { error: "请填写有效的 slug" });
            return;
          }
          validateMarkdown(markdown, slug);

          await mkdir(postsDirectory, { recursive: true });
          const existingFilename = await findPostFilename(postsDirectory, slug);
          if (existingFilename && !input.overwrite) {
            sendJson(response, 409, { error: "这个 slug 已有正式文章，未执行覆盖" });
            return;
          }

          const filename = existingFilename || `${slug}.md`;
          const destination = resolve(postsDirectory, filename);
          if (!existingFilename && existsSync(destination)) {
            sendJson(response, 409, { error: `文件 ${filename} 已存在，未执行覆盖` });
            return;
          }

          const temporary = resolve(postsDirectory, `.${slug}.${process.pid}.tmp`);
          await writeFile(temporary, markdown, "utf8");
          await rename(temporary, destination);
          await execFileAsync(process.execPath, [generatorPath], { cwd: projectRoot });
          sendJson(response, 200, { filename });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Markdown 保存失败";
          sendJson(response, 500, { error: message });
        }
      });
    },
  };
}
