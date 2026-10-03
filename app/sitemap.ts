import type { MetadataRoute } from "next";
import { generatedPosts } from "./generated-posts";
import { absoluteUrl, articlePath } from "../lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: absoluteUrl() }, ...generatedPosts.map((article) => ({
    url: absoluteUrl(articlePath(article.id)),
  }))];
}
