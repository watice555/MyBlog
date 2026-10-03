import { useState, type MouseEvent } from "react";
import "@fontsource-variable/source-serif-4/wght.css";
import "@fontsource-variable/source-serif-4/wght-italic.css";
import "../../app/globals.css";
import "./preview.css";
import { generatedPosts } from "../../app/generated-posts";
import { HomeView } from "../../app/components/home-views";
import { SiteHeader, SiteFooter } from "../../app/components/site-chrome";
import { AiParticipationIndicator } from "../../app/components/article-ui";
import { absoluteUrl, articlePath, siteUrl } from "../../lib/site";

function ProposedHome() {
  const latest = generatedPosts[0];
  return <main className="proposed-home">
    <section className="preview-hero" aria-labelledby="preview-title">
      <div className="preview-intro">
        <p className="eyebrow"><span />COMMENTARY · FINANCE · TECHNOLOGY</p>
        <h1 id="preview-title">在噪声里<br />辨认真实</h1>
        <p className="hero-intro">这里写金融、科技，以及它们如何改变商业与生活。<br />记录事实，拆解叙事，也保留可被修正的判断。</p>
        <a className="primary-link" href="#recent">开始阅读 <span aria-hidden="true">↓</span></a>
      </div>
      {latest && <article className="featured-article" aria-labelledby="featured-title">
        <p className="featured-label"><span />最新文章 <span className="featured-en">LATEST ENTRY</span></p>
        <div className="featured-meta"><span>{latest.category}</span><time dateTime={latest.dateISO}>{latest.date}</time></div>
        <h2 id="featured-title"><a href={absoluteUrl(articlePath(latest.id))}>{latest.title}</a></h2>
        <p className="featured-excerpt">{latest.excerpt}</p>
        <div className="featured-details"><span>{latest.wordCount.toLocaleString("zh-CN")} 字 · {latest.readTime}</span><AiParticipationIndicator value={latest.aiParticipation} variant="label" /></div>
        <a className="primary-link" href={absoluteUrl(articlePath(latest.id))}>阅读全文 <span aria-hidden="true">↗</span></a>
      </article>}
    </section>
    <section className="preview-recent" id="recent" aria-labelledby="recent-title">
      <div className="preview-section-heading">
        <div><h2 id="recent-title">最近文章</h2><span className="section-kicker">RECENT ARTICLES</span></div>
        <a href={absoluteUrl("#archive")}>全部 {generatedPosts.length} 篇 <span aria-hidden="true">↗</span></a>
      </div>
      <div className="article-list">
        {generatedPosts.slice(1, 5).map((article, index) => <article className="preview-row" key={article.id}>
          <span className="article-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <div className="article-body">
            <div className="article-overline"><span>{article.category}</span><time dateTime={article.dateISO}>{article.date}</time><AiParticipationIndicator value={article.aiParticipation} variant="dots" /></div>
            <h3><a href={absoluteUrl(articlePath(article.id))}>{article.title}</a></h3>
            <p>{article.excerpt}</p>
          </div>
          <div className="article-tail"><span>{article.readTime}</span><a href={absoluteUrl(articlePath(article.id))} aria-label={`阅读《${article.title}》`}>↗</a></div>
        </article>)}
      </div>
    </section>
  </main>;
}

function resolveOriginalLinks(element: HTMLElement | null) {
  element?.querySelectorAll("a").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (href) anchor.href = absoluteUrl(href);
  });
}

export default function Preview() {
  const [original, setOriginal] = useState(false);
  // Existing homepage components retain their real links in the comparison.
  function followLink(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href");
    if (href === `${siteUrl}#home`) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
  return <>
    <div className="preview-toolbar">
      <span>本地布局预览</span>
      <div role="group" aria-label="首页布局对比">
        <button type="button" aria-pressed={!original} onClick={() => setOriginal(false)}>新布局</button>
        <button type="button" aria-pressed={original} onClick={() => setOriginal(true)}>原布局</button>
      </div>
      <a href={siteUrl} target="_blank" rel="noreferrer">打开正式站 ↗</a>
    </div>
    <div className={`site-shell ${original ? "original-layout" : "proposed-layout"}`} onClick={followLink}>
      <SiteHeader root={siteUrl} />
      {original ? <main ref={resolveOriginalLinks}><HomeView articles={generatedPosts} /></main> : <ProposedHome />}
      <SiteFooter root={siteUrl} />
    </div>
  </>;
}
