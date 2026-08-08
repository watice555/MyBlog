import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { extname, parse, resolve } from "node:path";
import { promisify } from "node:util";
import matter from "gray-matter";

const execFileAsync = promisify(execFile);
const postRoute = "/api/local-post";
const imageRoute = "/api/local-image";
const generateRoute = "/api/local-content-generate";
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const maxImageBytes = 12 * 1024 * 1024;

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

function isAllowedHost(host) {
  if (!host) return false;
  try {
    return loopbackHosts.has(new URL(`http://${host}`).hostname);
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

async function readImageBody(request) {
  const declaredSize = Number(request.headers["content-length"] || 0);
  if (declaredSize > maxImageBytes) throw new Error("图片不能超过 12 MB");

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxImageBytes) throw new Error("图片不能超过 12 MB");
    chunks.push(chunk);
  }
  if (!size) throw new Error("没有收到图片内容");
  return Buffer.concat(chunks);
}

function detectImageType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { extension: "png", mediaType: "image/png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: "jpg", mediaType: "image/jpeg" };
  }
  const signature = buffer.subarray(0, 12).toString("ascii");
  if (signature.startsWith("GIF87a") || signature.startsWith("GIF89a")) {
    return { extension: "gif", mediaType: "image/gif" };
  }
  if (signature.startsWith("RIFF") && signature.slice(8, 12) === "WEBP") {
    return { extension: "webp", mediaType: "image/webp" };
  }
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii");
    if (brand === "avif" || brand === "avis") {
      return { extension: "avif", mediaType: "image/avif" };
    }
  }
  throw new Error("只支持 PNG、JPEG、GIF、WebP 或 AVIF 图片");
}

function safeImageStem(filename) {
  let decodedName = "";
  try {
    decodedName = decodeURIComponent(String(filename || ""));
  } catch {
    throw new Error("图片文件名无法识别");
  }
  return parse(decodedName)
    .name
    .normalize("NFKC")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "image";
}

async function saveImage(request, publicDirectory) {
  const body = await readImageBody(request);
  const type = detectImageType(body);
  const stem = safeImageStem(request.headers["x-file-name"]);
  const digest = createHash("sha256").update(body).digest("hex").slice(0, 12);
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const directory = resolve(publicDirectory, "images", "posts", year, month);
  const filename = `${stem}-${digest}.${type.extension}`;
  const destination = resolve(directory, filename);

  await mkdir(directory, { recursive: true });
  if (!existsSync(destination)) {
    const temporary = resolve(directory, `.${filename}.${process.pid}.${randomUUID()}.tmp`);
    await writeFile(temporary, body, { flag: "wx" });
    try {
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }

  return {
    // Keep the URL relative so GitHub Pages project subpaths work as well as localhost.
    path: `images/posts/${year}/${month}/${filename}`,
    filename,
    mediaType: type.mediaType,
  };
}

function parseArticle(markdown, filename, expectedSlug) {
  const { data, content } = matter(markdown);
  const id = normalizeSlug(data.slug || parse(filename).name);
  if (expectedSlug && id !== expectedSlug) {
    throw new Error("Markdown 中的 slug 与文件名不一致");
  }

  const title = String(data.title ?? "").trim();
  if (!title) throw new Error(`${filename}: Markdown 缺少标题`);

  const rawDate = data.date instanceof Date
    ? data.date.toISOString().slice(0, 10)
    : String(data.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    throw new Error(`${filename}: Markdown 日期必须使用 YYYY-MM-DD 格式`);
  }

  const body = content.trim();
  if (!body) throw new Error(`${filename}: Markdown 正文不能为空`);

  const aiParticipation = data.aiParticipation;
  if (!Number.isInteger(aiParticipation) || aiParticipation < 1 || aiParticipation > 5) {
    throw new Error(`${filename}: aiParticipation 必须是 1 到 5 之间的整数`);
  }

  return {
    id,
    title,
    excerpt: String(data.excerpt ?? "").trim(),
    category: String(data.category ?? "评论").trim() || "评论",
    aiParticipation,
    date: rawDate.replaceAll("-", "."),
    readTime: `${Math.max(1, Math.ceil(body.replace(/\s/g, "").length / 400))} 分钟`,
    content: body,
  };
}

async function findPost(postsDirectory, slug) {
  const entries = await readdir(postsDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".md") continue;
    const source = await readFile(resolve(postsDirectory, entry.name), "utf8");
    const article = parseArticle(source, entry.name);
    if (article.id === slug) return { filename: entry.name, article, markdown: source };
  }
  return undefined;
}

async function listPosts(postsDirectory) {
  const entries = await readdir(postsDirectory, { withFileTypes: true });
  const articles = [];
  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".md") continue;
    const source = await readFile(resolve(postsDirectory, entry.name), "utf8");
    articles.push(parseArticle(source, entry.name));
  }
  return articles.sort((left, right) => right.date.localeCompare(left.date));
}

export default function createLocalPostsPlugin(projectRoot = process.cwd()) {
  const postsDirectory = resolve(projectRoot, "content", "posts");
  const publicDirectory = resolve(projectRoot, "public");
  const generatorPath = resolve(projectRoot, "scripts", "generate-posts.mjs");
  let generatedSourceHash = "";

  async function loadPostsFromFiles({ forceGenerate = false } = {}) {
    const articles = await listPosts(postsDirectory);
    const sourceHash = createHash("sha256").update(JSON.stringify(articles)).digest("hex");
    if (forceGenerate || sourceHash !== generatedSourceHash) {
      await execFileAsync(process.execPath, [generatorPath], { cwd: projectRoot });
      generatedSourceHash = sourceHash;
    }
    return articles;
  }

  return {
    name: "local-post-writer",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url || "/", "http://localhost").pathname;
        if (pathname !== postRoute && pathname !== imageRoute && pathname !== generateRoute) return next();
        if (!isAllowedHost(request.headers.host)) {
          sendJson(response, 403, { error: "只允许通过本机回环地址使用博客编辑器" });
          return;
        }
        if (!isAllowedOrigin(request.headers.origin)) {
          sendJson(response, 403, { error: "只允许从本机博客编辑器发起请求" });
          return;
        }
        if (pathname === generateRoute) {
          if (request.method !== "POST") {
            sendJson(response, 405, { error: "只支持 POST 请求" });
            return;
          }
          try {
            await mkdir(postsDirectory, { recursive: true });
            const articles = await loadPostsFromFiles({ forceGenerate: true });
            sendJson(response, 200, { articles, count: articles.length });
          } catch (error) {
            const message = error instanceof Error ? error.message : "文章列表生成失败";
            sendJson(response, 500, { error: message });
          }
          return;
        }
        if (pathname === imageRoute) {
          if (request.method !== "POST") {
            sendJson(response, 405, { error: "只支持 POST 请求" });
            return;
          }
          try {
            sendJson(response, 200, await saveImage(request, publicDirectory));
          } catch (error) {
            const message = error instanceof Error ? error.message : "图片保存失败";
            sendJson(response, 400, { error: message });
          }
          return;
        }
        if (request.method === "GET") {
          try {
            await mkdir(postsDirectory, { recursive: true });
            sendJson(response, 200, { articles: await loadPostsFromFiles() });
          } catch (error) {
            const message = error instanceof Error ? error.message : "文章列表读取失败";
            sendJson(response, 500, { error: message });
          }
          return;
        }
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "只支持 GET 和 POST 请求" });
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
          const article = parseArticle(markdown, `${slug}.md`, slug);

          await mkdir(postsDirectory, { recursive: true });
          const existingPost = await findPost(postsDirectory, slug);
          if (existingPost && !input.overwrite) {
            sendJson(response, 409, {
              error: "这个 slug 已有正式文章，未执行覆盖",
              filename: existingPost.filename,
              article: existingPost.article,
            });
            return;
          }

          const filename = existingPost?.filename || `${slug}.md`;
          const destination = resolve(postsDirectory, filename);
          if (!existingPost && existsSync(destination)) {
            sendJson(response, 409, { error: `文件 ${filename} 已存在，未执行覆盖` });
            return;
          }

          const temporary = resolve(postsDirectory, `.${slug}.${process.pid}.tmp`);
          await writeFile(temporary, markdown, "utf8");
          await rename(temporary, destination);
          try {
            const articles = await loadPostsFromFiles();
            const savedArticle = articles.find((item) => item.id === slug) || article;
            sendJson(response, 200, { filename, article: savedArticle });
          } catch (error) {
            if (existingPost) {
              const rollback = resolve(postsDirectory, `.${slug}.${process.pid}.rollback.tmp`);
              await writeFile(rollback, existingPost.markdown, "utf8");
              await rename(rollback, destination);
            } else {
              await unlink(destination);
            }
            generatedSourceHash = "";
            throw error;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Markdown 保存失败";
          sendJson(response, 500, { error: message });
        }
      });
    },
  };
}
