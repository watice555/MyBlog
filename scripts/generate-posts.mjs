import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const postsDirectory = join(projectRoot, "content", "posts");
const outputFile = join(projectRoot, "app", "generated-posts.ts");

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

function requiredText(value, field, filename) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${filename}: Front Matter 缺少 ${field}`);
  return text;
}

function normalizeDate(value, filename) {
  const date = value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${filename}: date 必须使用 YYYY-MM-DD 格式`);
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`${filename}: date 不是有效日期`);
  }
  return date;
}

function normalizeAiParticipation(value, filename) {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error(`${filename}: aiParticipation 必须是 1 到 5 之间的整数`);
  }
  return value;
}

function calculateReadTime(content) {
  const characters = content.replace(/\s/g, "").length;
  return `${Math.max(1, Math.ceil(characters / 400))} 分钟`;
}

async function generatePosts() {
  await mkdir(postsDirectory, { recursive: true });
  const entries = await readdir(postsDirectory, { withFileTypes: true });
  const filenames = entries
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".md")
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "zh-CN"));

  const slugs = new Map();
  const posts = [];

  for (const filename of filenames) {
    const source = await readFile(join(postsDirectory, filename), "utf8");
    const { data, content } = matter(source);
    const body = content.trim();
    if (!body) throw new Error(`${filename}: 正文不能为空`);

    const slug = normalizeSlug(data.slug || parse(filename).name);
    if (!slug) throw new Error(`${filename}: 无法生成有效 slug`);
    if (slugs.has(slug)) {
      throw new Error(`${filename}: slug “${slug}” 与 ${slugs.get(slug)} 重复`);
    }
    slugs.set(slug, filename);

    const date = normalizeDate(data.date, filename);
    const excerpt = String(data.excerpt ?? "").trim();
    posts.push({
      id: slug,
      title: requiredText(data.title, "title", filename),
      excerpt,
      category: String(data.category ?? "评论").trim() || "评论",
      aiParticipation: normalizeAiParticipation(data.aiParticipation, filename),
      date: date.replaceAll("-", "."),
      readTime: calculateReadTime(body),
      content: body,
      sortDate: date,
    });
  }

  posts.sort((left, right) => right.sortDate.localeCompare(left.sortDate));
  const publicPosts = posts.map((post) => ({
    id: post.id,
    title: post.title,
    excerpt: post.excerpt,
    category: post.category,
    aiParticipation: post.aiParticipation,
    date: post.date,
    readTime: post.readTime,
    content: post.content,
  }));
  const output = [
    "// 此文件由 scripts/generate-posts.mjs 自动生成，请勿手动修改。",
    `export const generatedPosts = ${JSON.stringify(publicPosts, null, 2)} as const;`,
    "",
  ].join("\n");

  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, output, "utf8");
  console.log(`已从 content/posts 生成 ${publicPosts.length} 篇文章。`);
}

generatePosts().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
