import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { generatedPosts } from "../../generated-posts";
import { generatedPostContent } from "../../generated-post-content";
import { absoluteUrl, articlePath, jsonLd } from "../../../lib/site";
import { AiParticipationIndicator } from "../../components/article-ui";
import { Markdown } from "../../components/markdown";
import { SiteHeader, SiteFooter } from "../../components/site-chrome";
import { LocalArticleActions } from "../../components/local-article-actions";
import "katex/dist/katex.min.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return generatedPosts.map((article) => ({ slug: article.id }));
}

type Props = { params: Promise<{ slug: string }> };

// Next/Vinext can pass either decoded or URL-encoded dynamic params depending
// on the render phase. Decode once; malformed/unknown values still reach 404.
function articleSlug(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = articleSlug((await params).slug);
  const article = generatedPosts.find((candidate) => candidate.id === slug);
  if (!article) return {};
  const url = absoluteUrl(articlePath(article.id));
  return {
    title: article.title,
    description: article.excerpt || undefined,
    alternates: { canonical: url },
    openGraph: {
      title: article.title,
      description: article.excerpt || undefined,
      url,
      type: "article",
      locale: "zh_CN",
      publishedTime: article.dateISO,
      authors: ["watice"],
      images: [{ url: absoluteUrl("og.png"), width: 1200, height: 630, alt: "凝泠 watice’s blog" }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.excerpt || undefined,
      images: [absoluteUrl("og.png")],
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const slug = articleSlug((await params).slug);
  const article = generatedPosts.find((candidate) => candidate.id === slug);
  if (!article || typeof generatedPostContent[slug] !== "string") notFound();
  const url = absoluteUrl(articlePath(article.id));
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.excerpt || undefined,
    datePublished: article.dateISO,
    inLanguage: "zh-CN",
    wordCount: article.wordCount,
    author: { "@type": "Person", name: "watice" },
    publisher: { "@type": "Organization", name: "凝泠" },
    mainEntityOfPage: url,
    url,
    image: absoluteUrl("og.png"),
  };
  return <div className="site-shell">
    <SiteHeader active="archive" root="../../" />
    <main>
      <article className="reading-page">
        <div className="reading-topbar">
          <a className="back-link" href="../../#archive">← 返回文章</a>
          <LocalArticleActions id={article.id} />
        </div>
        <header className="reading-header">
          <p className="article-category">{article.category}</p>
          <h1>{article.title}</h1>
          {article.excerpt && <p className="reading-deck">{article.excerpt}</p>}
          <div className="article-meta">
            <span><time dateTime={article.dateISO}>{article.date}</time> · {article.wordCount.toLocaleString("zh-CN")} 字 · {article.readTime}</span>
            <AiParticipationIndicator value={article.aiParticipation} variant="label" />
          </div>
        </header>
        <Markdown source={generatedPostContent[slug]} root="../../" />
        <footer className="reading-footer">
          <span>写于凝泠</span>
          <div className="reading-actions"><LocalArticleActions id={article.id} /><a href="../../#archive">继续阅读 →</a></div>
        </footer>
      </article>
    </main>
    <SiteFooter root="../../" />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
  </div>;
}
