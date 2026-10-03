/** The published address is stable even when a build runs outside GitHub Actions. */
const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://watice555.github.io/MyBlog/";
const parsedUrl = new URL(configuredUrl);
if (!/^https?:$/.test(parsedUrl.protocol) || ["localhost", "127.0.0.1", "[::1]"].includes(parsedUrl.hostname)) {
  throw new Error("NEXT_PUBLIC_SITE_URL must be a public HTTP(S) address");
}
export const siteUrl = `${parsedUrl.origin}${parsedUrl.pathname.replace(/\/$/, "")}/`;
export const siteTitle = "凝泠｜watice’s blog";
export const siteDescription = "关于金融、科技与时代变化的独立评论。记录事实，拆解叙事，在噪声里寻找清晰判断。";

export function absoluteUrl(path = "") {
  return new URL(path.replace(/^\//, ""), siteUrl).href;
}

export function articlePath(id: string) {
  return `article/${encodeURIComponent(id)}/`;
}

/** Relative to the document, so root and GitHub Pages subpath builds both work. */
export function resolvePostUrl(url: string, root: string) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) return url;
  return `${root}${url.replace(/^\.?\//, "")}`;
}

export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
