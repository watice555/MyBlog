import { generatedPosts } from "../generated-posts";
import { absoluteUrl, articlePath, siteDescription, siteTitle } from "../../lib/site";

export const dynamic = "force-static";

function xml(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;",
  })[character]!);
}

export function GET() {
  const items = generatedPosts.map((article) => {
    const url = xml(absoluteUrl(articlePath(article.id)));
    return `<item><title>${xml(article.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><pubDate>${new Date(`${article.dateISO}T00:00:00+08:00`).toUTCString()}</pubDate><category>${xml(article.category)}</category>${article.excerpt ? `<description>${xml(article.excerpt)}</description>` : ""}</item>`;
  }).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${xml(siteTitle)}</title><link>${xml(absoluteUrl())}</link><description>${xml(siteDescription)}</description><language>zh-CN</language><atom:link href="${xml(absoluteUrl("feed.xml"))}" rel="self" type="application/rss+xml"/>${items}</channel></rss>`;
  return new Response(body, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
