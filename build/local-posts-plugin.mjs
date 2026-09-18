import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { extname, parse, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import matter from "gray-matter";

const execFileAsync = promisify(execFile);
const postRoute = "/api/local-post";
const draftRoute = "/api/local-draft";
const recoveryRoute = "/api/local-recovery";
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

function isAllowedOrigin(origin, host) {
  // A same-origin request carries an Origin that matches the Host header exactly
  // (hostname and port). Comparing only the hostname would let any page served
  // from another local port pose as the loopback editor.
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    return originUrl.protocol === "http:" && originUrl.host === new URL(`http://${host}`).host;
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

function formatError(error, fallback) {
  if (!(error instanceof Error)) return fallback;
  const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";
  const message = stderr || error.message || fallback;
  return message.length > 1800 ? `${message.slice(0, 1800)}…` : message;
}

async function readJsonBody(request) {
  // Requiring application/json forces browsers through a CORS preflight before
  // a cross-origin write can reach these endpoints.
  const contentType = String(request.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new Error("请求必须使用 application/json 格式");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error("文章内容过长，无法保存");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("请求内容不是有效的 JSON");
  }
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
  // The custom header forces browsers through a CORS preflight, so a plain
  // cross-origin form post cannot reach the filesystem write.
  if (!request.headers["x-file-name"]) throw new Error("缺少图片文件名请求头");
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

function articleDate(data, filename, { draft = false } = {}) {
  const rawDate = data.date instanceof Date
    ? data.date.toISOString().slice(0, 10)
    : String(data.date ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;
  if (draft && !rawDate) return new Date().toISOString().slice(0, 10);
  throw new Error(`${filename}: Markdown 日期必须使用 YYYY-MM-DD 格式`);
}

function articleReadTime(body) {
  return `${Math.max(1, Math.ceil(body.replace(/\s/g, "").length / 400))} 分钟`;
}

function parseFrontMatter(markdown, filename) {
  // gray-matter routes `---js`/`---javascript` blocks to an eval-based engine,
  // so only plain YAML front matter may ever reach it.
  if (!/^---\r?\n/.test(markdown)) {
    throw new Error(`${filename}: Markdown 必须以 “---” Front Matter 开头`);
  }
  try {
    return matter(markdown);
  } catch (error) {
    throw new Error(`${filename}: Front Matter 解析失败：${error instanceof Error ? error.message : error}`);
  }
}

function parseArticle(markdown, filename, expectedSlug) {
  const { data, content } = parseFrontMatter(markdown, filename);
  const id = normalizeSlug(data.slug || parse(filename).name);
  if (!id || (expectedSlug && id !== expectedSlug)) {
    throw new Error("Markdown 中的 slug 与文件名不一致");
  }

  const title = String(data.title ?? "").trim();
  if (!title) throw new Error(`${filename}: Markdown 缺少标题`);
  const rawDate = articleDate(data, filename);
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
    readTime: articleReadTime(body),
    content: body,
  };
}

function parseDraft(markdown, filename, expectedSlug) {
  const { data, content } = parseFrontMatter(markdown, filename);
  const id = normalizeSlug(data.slug || parse(filename).name);
  if (!id || (expectedSlug && id !== expectedSlug)) {
    throw new Error("草稿 Markdown 中的 slug 与文件名不一致");
  }
  const rawDate = articleDate(data, filename, { draft: true });
  const rawAiParticipation = Number(data.aiParticipation ?? 1);
  const aiParticipation = Number.isInteger(rawAiParticipation) && rawAiParticipation >= 1 && rawAiParticipation <= 5
    ? rawAiParticipation
    : 1;
  const sourceArticleId = normalizeSlug(data.sourceArticle);
  const body = content.trim();

  return {
    id,
    title: String(data.title ?? "").trim(),
    excerpt: String(data.excerpt ?? "").trim(),
    category: String(data.category ?? "评论").trim() || "评论",
    aiParticipation,
    date: rawDate.replaceAll("-", "."),
    readTime: articleReadTime(body),
    content: body,
    ...(sourceArticleId ? { sourceArticleId } : {}),
  };
}

function normalizeRecoveryId(value, label) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return undefined;
  const normalized = normalizeSlug(rawValue);
  if (!normalized || normalized !== rawValue) {
    throw new Error(`临时文件中的 ${label} 无效`);
  }
  return normalized;
}

function normalizeRecoveryDraft(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("临时文件缺少编辑内容");
  }

  const articleId = normalizeRecoveryId(value.articleId, "articleId");
  const draftId = normalizeRecoveryId(value.draftId, "draftId");
  const rawSlug = String(value.slug ?? "").trim();
  const slug = rawSlug ? normalizeRecoveryId(rawSlug, "slug") : "";
  const originalDate = String(value.originalDate ?? "").trim();
  if (originalDate && !/^\d{4}[.-]\d{2}[.-]\d{2}$/.test(originalDate)) {
    throw new Error("临时文件中的日期无效");
  }
  const aiParticipation = Number(value.aiParticipation);
  if (!Number.isInteger(aiParticipation) || aiParticipation < 1 || aiParticipation > 5) {
    throw new Error("临时文件中的 aiParticipation 必须是 1 到 5 之间的整数");
  }

  return {
    ...(articleId ? { articleId } : {}),
    ...(draftId ? { draftId } : {}),
    ...(originalDate ? { originalDate } : {}),
    slug,
    title: String(value.title ?? ""),
    excerpt: String(value.excerpt ?? ""),
    category: String(value.category ?? "评论"),
    aiParticipation,
    content: String(value.content ?? ""),
  };
}

async function readRecoverySnapshot(recoveryPath) {
  let source;
  try {
    source = await readFile(recoveryPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null;
    throw error;
  }

  let payload;
  try {
    payload = JSON.parse(source);
  } catch {
    throw new Error("编辑器临时文件已损坏，请先手动备份或修复");
  }
  const savedAt = String(payload.savedAt ?? "");
  if (!savedAt || Number.isNaN(Date.parse(savedAt))) {
    throw new Error("编辑器临时文件缺少有效的保存时间");
  }
  return { draft: normalizeRecoveryDraft(payload.draft), savedAt };
}

async function findMarkdown(directory, slug, parser) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".md") continue;
    const source = await readFile(resolve(directory, entry.name), "utf8");
    const article = parser(source, entry.name);
    if (article.id === slug) return { filename: entry.name, article, markdown: source };
  }
  return undefined;
}

async function listMarkdown(directory, parser) {
  await mkdir(directory, { recursive: true });
  const entries = await readdir(directory, { withFileTypes: true });
  const articles = [];
  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".md") continue;
    const source = await readFile(resolve(directory, entry.name), "utf8");
    articles.push(parser(source, entry.name));
  }
  return articles.sort((left, right) => right.date.localeCompare(left.date) || left.title.localeCompare(right.title, "zh-CN"));
}

async function atomicWrite(directory, filename, content) {
  await mkdir(directory, { recursive: true });
  const temporary = resolve(directory, `.${filename}.${process.pid}.${randomUUID()}.tmp`);
  await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporary, resolve(directory, filename));
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function markDraftAsPublishedLocally(draftsDirectory, sourceDraft, articleSlug) {
  const parsed = parseFrontMatter(sourceDraft.markdown, sourceDraft.filename);
  parsed.data.sourceArticle = articleSlug;
  await atomicWrite(
    draftsDirectory,
    sourceDraft.filename,
    matter.stringify(parsed.content.trim(), parsed.data),
  );
}

function referencedPostImages(markdown, projectRoot) {
  const imagesRoot = resolve(projectRoot, "public", "images", "posts");
  const paths = new Set();
  for (const match of markdown.matchAll(/\bimages\/posts\/[^\s)"'<>]+/g)) {
    let decoded = match[0].replace(/[?#].*$/, "");
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      continue;
    }
    const absolute = resolve(projectRoot, "public", decoded);
    if (absolute !== imagesRoot && !absolute.startsWith(`${imagesRoot}${sep}`)) continue;
    if (existsSync(absolute)) paths.add(relative(projectRoot, absolute));
  }
  return [...paths];
}

async function assertNoOtherPostChanges(projectRoot, intendedPostPath) {
  const [{ stdout: tracked = "" }, { stdout: untracked = "" }] = await Promise.all([
    execFileAsync("git", ["-c", "core.quotePath=false", "diff", "--name-only", "HEAD", "--", "content/posts"], { cwd: projectRoot }),
    execFileAsync("git", ["-c", "core.quotePath=false", "ls-files", "--others", "--exclude-standard", "--", "content/posts"], { cwd: projectRoot }),
  ]);
  const otherPaths = [...new Set(`${tracked}\n${untracked}`.split(/\r?\n/).filter(Boolean))]
    .filter((path) => path !== intendedPostPath);
  if (otherPaths.length) {
    throw new Error(`还有其他正式文章未提交（${otherPaths.join("、")}），请先处理后再发布，避免混入本次提交`);
  }
}

async function publishPostToGit({ projectRoot, filename, markdown, title, isUpdate }) {
  const intendedPostPath = `content/posts/${filename}`;
  const { stdout: branchOutput = "" } = await execFileAsync("git", ["branch", "--show-current"], { cwd: projectRoot });
  const branch = branchOutput.trim();
  if (branch !== "main") {
    throw new Error(`当前分支是 ${branch || "游离 HEAD"}，请切换到 main 后再正式发布`);
  }

  await assertNoOtherPostChanges(projectRoot, intendedPostPath);

  try {
    await execFileAsync("npm", ["run", "build:github"], {
      cwd: projectRoot,
      env: { ...process.env, NODE_ENV: "production" },
      maxBuffer: 12 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
    });
  } catch (error) {
    throw new Error(`发布前的静态构建未通过：${formatError(error, "构建失败")}`);
  }

  const paths = [intendedPostPath, "app/generated-posts.ts", ...referencedPostImages(markdown, projectRoot)];
  try {
    await execFileAsync("git", ["add", "--", ...paths], { cwd: projectRoot });
    const { stdout: stagedOutput = "" } = await execFileAsync(
      "git",
      ["diff", "--cached", "--name-only", "--", ...paths],
      { cwd: projectRoot },
    );
    if (stagedOutput.trim()) {
      const cleanTitle = title.replace(/[\r\n]+/g, " ").trim().slice(0, 72);
      const message = `${isUpdate ? "Update" : "Publish"} ${cleanTitle || filename}`;
      await execFileAsync("git", ["commit", "--only", "-m", message, "--", ...paths], {
        cwd: projectRoot,
        maxBuffer: 4 * 1024 * 1024,
      });
    }
  } catch (error) {
    await execFileAsync("git", ["reset", "-q", "HEAD", "--", ...paths], { cwd: projectRoot }).catch(() => {});
    throw new Error(`文章已经写入，但 Git 提交失败：${formatError(error, "提交失败")}`);
  }

  const { stdout: commitOutput = "" } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], { cwd: projectRoot });
  const commit = commitOutput.trim();
  try {
    await execFileAsync("git", ["push", "origin", "main"], {
      cwd: projectRoot,
      maxBuffer: 4 * 1024 * 1024,
      timeout: 2 * 60 * 1000,
    });
    return { commit, pushed: true };
  } catch (error) {
    return {
      commit,
      pushed: false,
      error: `文章已提交为 ${commit}，但推送失败；草稿仍保留，可稍后再次正式保存：${formatError(error, "推送失败")}`,
    };
  }
}

export default function createLocalPostsPlugin(projectRoot = process.cwd(), options = {}) {
  const postsDirectory = resolve(projectRoot, "content", "posts");
  const draftsDirectory = resolve(projectRoot, "content", "drafts");
  const recoveryDirectory = resolve(draftsDirectory, ".recovery");
  const recoveryFilename = "editor-autosave.json";
  const recoveryPath = resolve(recoveryDirectory, recoveryFilename);
  const publicDirectory = resolve(projectRoot, "public");
  const generatedPath = resolve(projectRoot, "app", "generated-posts.ts");
  const generatorPath = resolve(projectRoot, "scripts", "generate-posts.mjs");
  const publishPost = options.publishPost || publishPostToGit;
  let generatedSourceHash = "";

  async function loadPostsFromFiles({ forceGenerate = false } = {}) {
    const articles = await listMarkdown(postsDirectory, parseArticle);
    const sourceHash = createHash("sha256").update(JSON.stringify(articles)).digest("hex");
    if (forceGenerate || sourceHash !== generatedSourceHash) {
      await execFileAsync(process.execPath, [generatorPath], { cwd: projectRoot });
      generatedSourceHash = sourceHash;
    }
    return articles;
  }

  async function restorePublishedFiles(existingPost, destination, previousGeneratedSource) {
    if (existingPost) {
      await atomicWrite(postsDirectory, existingPost.filename, existingPost.markdown);
    } else {
      await unlink(destination).catch(() => {});
    }
    if (previousGeneratedSource === undefined) {
      await unlink(generatedPath).catch(() => {});
    } else {
      await atomicWrite(resolve(projectRoot, "app"), "generated-posts.ts", previousGeneratedSource);
    }
    generatedSourceHash = "";
  }

  return {
    name: "local-post-writer",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url || "/", "http://localhost").pathname;
        if (![postRoute, draftRoute, recoveryRoute, imageRoute, generateRoute].includes(pathname)) return next();
        if (!isAllowedHost(request.headers.host)) {
          sendJson(response, 403, { error: "只允许通过本机回环地址使用博客编辑器" });
          return;
        }
        if (!isAllowedOrigin(request.headers.origin, request.headers.host)) {
          sendJson(response, 403, { error: "只允许从本机博客编辑器发起请求" });
          return;
        }

        if (pathname === generateRoute) {
          if (request.method !== "POST") {
            sendJson(response, 405, { error: "只支持 POST 请求" });
            return;
          }
          try {
            const articles = await loadPostsFromFiles({ forceGenerate: true });
            sendJson(response, 200, { articles, count: articles.length });
          } catch (error) {
            sendJson(response, 500, { error: formatError(error, "文章列表生成失败") });
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
            sendJson(response, 400, { error: formatError(error, "图片保存失败") });
          }
          return;
        }

        if (pathname === recoveryRoute) {
          if (request.method === "GET") {
            try {
              sendJson(response, 200, { recovery: await readRecoverySnapshot(recoveryPath) });
            } catch (error) {
              sendJson(response, 500, { error: formatError(error, "编辑器临时文件读取失败") });
            }
            return;
          }
          if (request.method === "DELETE") {
            try {
              await unlink(recoveryPath).catch((error) => {
                if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
              });
              sendJson(response, 200, { deleted: true });
            } catch (error) {
              sendJson(response, 500, { error: formatError(error, "编辑器临时文件删除失败") });
            }
            return;
          }
          if (request.method !== "PUT") {
            sendJson(response, 405, { error: "只支持 GET、PUT 和 DELETE 请求" });
            return;
          }
          try {
            const input = await readJsonBody(request);
            const recovery = {
              draft: normalizeRecoveryDraft(input.draft),
              savedAt: new Date().toISOString(),
            };
            await atomicWrite(recoveryDirectory, recoveryFilename, `${JSON.stringify(recovery, null, 2)}\n`);
            sendJson(response, 200, { recovery });
          } catch (error) {
            sendJson(response, 400, { error: formatError(error, "编辑器临时文件保存失败") });
          }
          return;
        }

        if (pathname === draftRoute) {
          if (request.method === "GET") {
            try {
              const drafts = await listMarkdown(draftsDirectory, parseDraft);
              sendJson(response, 200, { drafts, count: drafts.length });
            } catch (error) {
              sendJson(response, 500, { error: formatError(error, "草稿箱读取失败") });
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
            const draft = parseDraft(markdown, `${slug}.md`, slug);
            await mkdir(draftsDirectory, { recursive: true });
            const existingDraft = await findMarkdown(draftsDirectory, slug, parseDraft);
            if (existingDraft && !input.overwrite) {
              sendJson(response, 409, {
                error: "草稿箱中已有相同 slug 的草稿，未执行覆盖",
                filename: existingDraft.filename,
                draft: existingDraft.article,
              });
              return;
            }
            const filename = existingDraft?.filename || `${slug}.md`;
            if (!existingDraft && existsSync(resolve(draftsDirectory, filename))) {
              sendJson(response, 409, { error: `草稿文件 ${filename} 已存在，未执行覆盖` });
              return;
            }
            await atomicWrite(draftsDirectory, filename, markdown);
            sendJson(response, 200, { filename, draft });
          } catch (error) {
            sendJson(response, 400, { error: formatError(error, "草稿保存失败") });
          }
          return;
        }

        if (request.method === "GET") {
          try {
            sendJson(response, 200, { articles: await loadPostsFromFiles() });
          } catch (error) {
            sendJson(response, 500, { error: formatError(error, "文章列表读取失败") });
          }
          return;
        }
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "只支持 GET 和 POST 请求" });
          return;
        }

        let existingPost;
        let destination;
        let previousGeneratedSource;
        let wrotePost = false;
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
          existingPost = await findMarkdown(postsDirectory, slug, parseArticle);
          if (existingPost && !input.overwrite) {
            sendJson(response, 409, {
              error: "这个 slug 已有正式文章，未执行覆盖",
              filename: existingPost.filename,
              article: existingPost.article,
            });
            return;
          }

          const filename = existingPost?.filename || `${slug}.md`;
          destination = resolve(postsDirectory, filename);
          if (!existingPost && existsSync(destination)) {
            sendJson(response, 409, { error: `文件 ${filename} 已存在，未执行覆盖` });
            return;
          }

          previousGeneratedSource = existsSync(generatedPath) ? await readFile(generatedPath, "utf8") : undefined;
          await atomicWrite(postsDirectory, filename, markdown);
          wrotePost = true;
          const articles = await loadPostsFromFiles();
          const savedArticle = articles.find((item) => item.id === slug) || article;
          const publishResult = await publishPost({
            projectRoot,
            filename,
            markdown,
            title: savedArticle.title,
            isUpdate: Boolean(existingPost),
          });
          // A returned result may already represent a local commit, so later cleanup
          // failures must never roll published files back.
          wrotePost = false;
          if (!publishResult.pushed) {
            const sourceDraftSlug = normalizeSlug(input.sourceDraftSlug);
            if (sourceDraftSlug && sourceDraftSlug === input.sourceDraftSlug) {
              const sourceDraft = await findMarkdown(draftsDirectory, sourceDraftSlug, parseDraft).catch(() => undefined);
              if (sourceDraft) {
                await markDraftAsPublishedLocally(draftsDirectory, sourceDraft, slug).catch(() => {});
              }
            }
            sendJson(response, 502, {
              filename,
              article: savedArticle,
              commit: publishResult.commit,
              pushed: false,
              error: publishResult.error || "Git 推送失败",
            });
            return;
          }

          const sourceDraftSlug = normalizeSlug(input.sourceDraftSlug);
          if (sourceDraftSlug && sourceDraftSlug === input.sourceDraftSlug) {
            const sourceDraft = await findMarkdown(draftsDirectory, sourceDraftSlug, parseDraft).catch(() => undefined);
            if (sourceDraft) await unlink(resolve(draftsDirectory, sourceDraft.filename)).catch(() => {});
          }
          sendJson(response, 200, {
            filename,
            article: savedArticle,
            commit: publishResult.commit,
            pushed: true,
          });
        } catch (error) {
          if (wrotePost && destination) {
            await restorePublishedFiles(existingPost, destination, previousGeneratedSource).catch(() => {});
          }
          sendJson(response, wrotePost ? 500 : 400, { error: formatError(error, "Markdown 发布失败") });
        }
      });
    },
  };
}
