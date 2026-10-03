import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateReadTime, countWords, normalizeDate, normalizeSlug, normalizeAiParticipation, normalizeSearchText } from "../lib/content-utils.mjs";
import { parseFrontMatter } from "../lib/front-matter.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

function requiredText(value, field, filename) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${filename}: Front Matter 缺少 ${field}`);
  return text;
}

/** Generate in an explicit root so tests can use disposable article collections.
 * @param {string} root */
export async function generatePosts(root = projectRoot) {
  const postsDirectory = join(root, "content", "posts");
  const outputFile = join(root, "app", "generated-posts.ts");
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
    const { data, content } = parseFrontMatter(source, filename);
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
      dateISO: date,
      wordCount: countWords(body),
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
    dateISO: post.dateISO,
    wordCount: post.wordCount,
    readTime: post.readTime,
  }));
  const output = [
    "// 此文件由 scripts/generate-posts.mjs 自动生成，请勿手动修改。",
    `export const generatedPosts = ${JSON.stringify(publicPosts, null, 2)} as const;`,
    "",
  ].join("\n");

  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, output, "utf8");
  await writeFile(join(root, "app", "generated-post-content.ts"), [
    "// 此文件由 scripts/generate-posts.mjs 自动生成，请勿手动修改。",
    `export const generatedPostContent: Record<string, string> = ${JSON.stringify(Object.fromEntries(posts.map((post) => [post.id, post.content])), null, 2)};`,
    "",
  ].join("\n"), "utf8");
  await mkdir(join(root, "public"), { recursive: true });
  await writeFile(join(root, "public", "search-index.json"), JSON.stringify(posts.map((post) => ({
    id: post.id,
    text: normalizeSearchText([post.title, post.excerpt, post.category, post.content].join("\n")),
  }))), "utf8");
  return publicPosts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generatePosts().then((posts) => console.log(`已从 content/posts 生成 ${posts.length} 篇文章。`)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
