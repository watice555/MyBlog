import type { ArticleMetadata } from "../../app/components/home-views";
import { articlePath } from "../../lib/site";
import { AiParticipationIndicator } from "../../app/components/article-ui";

export function OriginalHome({ articles }: { articles: readonly ArticleMetadata[] }) {
return (
          <>
            <section className="hero" aria-labelledby="hero-title">
              <div className="hero-copy">
                <p className="eyebrow"><span /> COMMENTARY · FINANCE · TECHNOLOGY</p>
                <h1 id="hero-title">在噪声里<br />辨认真实</h1>
                <p className="hero-intro">这里写金融、科技，以及它们如何改变商业与生活。<br />记录事实，拆解叙事，也保留可被修正的判断。</p>
                <a className="primary-link" href="#archive">开始阅读 <span aria-hidden="true">→</span></a>
              </div>
            </section>

            <section className="latest" aria-labelledby="latest-title">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">RECENT ARTICLES</p>
                  <h2 id="latest-title">最近文章</h2>
                </div>
                <a href="#archive">查看全部 {String(articles.length).padStart(2, "0")} <span aria-hidden="true">↗</span></a>
              </div>
              <div className="article-list">
                {articles.slice(0, 3).map((article, index) => (
                  <ArticleRow article={article} index={index + 1} key={article.id} />
                ))}
              </div>
            </section>

            <section className="home-note">
              <p className="section-kicker">A CLEARER VIEW</p>
              <p>在信息不断升温的时代，保持一份清醒的判断。</p>
              <span aria-hidden="true">✦</span>
            </section>
          </>);
}

function ArticleRow({ article, index }: { article: ArticleMetadata; index: number }) {
  return (
    <article className="article-row">
      <span className="article-index">{String(index).padStart(2, "0")}</span>
      <div className="article-body">
        <div className="article-overline">
          <span>{article.category}</span>
          <span>{article.date}</span>
          <AiParticipationIndicator value={article.aiParticipation} variant="dots" />
        </div>
        <h3><a href={articlePath(article.id)}>{article.title}</a></h3>
        {article.excerpt && <p>{article.excerpt}</p>}
      </div>
      <div className="article-tail">
        <span>{`${article.wordCount.toLocaleString("zh-CN")} 字`} · {article.readTime}</span>
        <a href={articlePath(article.id)} aria-label={`阅读《${article.title}》`}>↗</a>
      </div>
    </article>
  );
}
