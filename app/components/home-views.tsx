import { generatedPosts } from "../generated-posts";
import { articlePath } from "../../lib/site";
import { AiParticipationIndicator, PageIntro } from "./article-ui";

export type ArticleMetadata = (typeof generatedPosts)[number];
const EXTERNAL_PROJECTS = [
  {
    name: "循环提醒",
    description: "离线优先的循环任务 PWA",
    href: "https://watice555.github.io/reminder/",
  },
  {
    name: "城市传染病指数",
    description: "56 城疾病搜索指数历史",
    href: "https://watice555.github.io/meituan-infection-index/",
  },
  {
    name: "LOF iNAV",
    description: "跨市场 LOF 日内估值实验台",
    href: "https://github.com/watice555/lof-inav",
  },
  {
    name: "Gacha Links",
    description: "抽卡二游资料与工具导航",
    href: "https://watice555.github.io/gachalinks/",
  },
  {
    name: "异环手账",
    description: "《异环》轻量资料站",
    href: "https://watice555.github.io/nte-notes/",
  },
] as const;


export function HomeView({ articles }: { articles: readonly ArticleMetadata[] }) {
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

export function AboutView() {
return (
          <section className="inner-page about-page">
            <PageIntro label="ABOUT WATICE" title="关于凝泠" text="在快速变化的世界里，保持冷静、清澈而诚实的观察。" />
            <div className="about-grid">
              <div className="about-copy prose">
                <p>你好，我是 watice。这里主要写金融、科技，以及它们与商业、社会和个人选择的交汇。</p>
                <p>“凝”是停下来凝视与沉淀，“泠”是清澈而冷静。这个名字提醒我：面对快速变化的市场与技术，先看清事实，再形成判断。</p>
                <p>文章以评论为主，不追求仓促的结论，更在意论据、结构和长期变化。观点会更新，但对事实与逻辑的要求不会降低。</p>
                <p className="about-credo"><em>对信息保持敏感，对叙事保持距离，对判断保持诚实。</em></p>
                <p className="contact-line">关注主题 · 金融 / 科技 / 商业 / 社会</p>
              </div>
              <aside className="project-index" aria-labelledby="project-index-title">
                <p className="section-kicker">MY PROJECTS</p>
                <h2 id="project-index-title">我的项目</h2>
                <div className="project-list">
                  {EXTERNAL_PROJECTS.map((project, index) => (
                    <a
                      href={project.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${project.name}（在新标签页打开）`}
                      key={project.href}
                    >
                      <span className="project-number" aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="project-copy">
                        <strong>{project.name}</strong>
                        <small>{project.description}</small>
                      </span>
                      <span className="project-arrow" aria-hidden="true">↗</span>
                    </a>
                  ))}
                </div>
                <a
                  className="github-entry"
                  href="https://github.com/watice555"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub · watice555（在新标签页打开）"
                >
                  <span>GitHub · watice555</span>
                  <span>查看全部项目 <span aria-hidden="true">↗</span></span>
                </a>
              </aside>
            </div>
          </section>);
}

export function ArchiveView({ articles, filteredArticles, categories, searchQuery, setSearchQuery, selectedCategory, setSelectedCategory, searchStatus, retrySearch }: {
articles: readonly ArticleMetadata[]; filteredArticles: readonly ArticleMetadata[]; categories: string[]; searchQuery: string; setSearchQuery: (value: string) => void; selectedCategory: string; setSelectedCategory: (value: string) => void; searchStatus: string; retrySearch: () => void;
}) {
const clearArchiveFilters = () => { setSearchQuery(""); setSelectedCategory(""); };
return (
          <section className="inner-page archive-page">
            <PageIntro label="ALL ARTICLES" title="文章归档" text="围绕金融、科技与时代变化的文章，按发布时间排列。" />
            <div className="archive-tools" aria-label="文章搜索与分类筛选">
              <label className="archive-search">
                <span>搜索文章</span>
                <div>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="搜索标题、摘要或正文"
                  />
                  {searchQuery && (
                    <button type="button" onClick={() => setSearchQuery("")} aria-label="清空搜索">
                      清空
                    </button>
                  )}
                </div>
              </label>
              <div className="category-filter">
                <span>按分类查看</span>
                <div className="category-options" aria-label="文章分类">
                  <button
                    type="button"
                    className={!selectedCategory ? "active" : ""}
                    aria-pressed={!selectedCategory}
                    onClick={() => setSelectedCategory("")}
                  >
                    全部
                  </button>
                  {categories.map((category) => (
                    <button
                      type="button"
                      className={selectedCategory === category ? "active" : ""}
                      aria-pressed={selectedCategory === category}
                      onClick={() => setSelectedCategory(category)}
                      key={category}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="archive-count" aria-live="polite">
{searchStatus === "loading" && <p>正在加载全文搜索索引…</p>}
{searchStatus === "error" && <p role="alert">全文搜索暂时无法加载。<button type="button" onClick={retrySearch}>重试</button></p>}
{searchStatus !== "loading" && searchStatus !== "error" && <>
              {filteredArticles.length === articles.length
                ? `共 ${articles.length} 篇`
                : `找到 ${filteredArticles.length} 篇 · 共 ${articles.length} 篇`}
</>}
            </div>
            <div className="article-list archive-list">
              {filteredArticles.map((article, index) => (
                <ArticleRow article={article} index={index + 1} key={article.id} />
              ))}
            </div>
            {filteredArticles.length === 0 && searchStatus !== "loading" && searchStatus !== "error" && (
              <div className="archive-empty">
                <p>没有找到符合条件的文章。</p>
                <button type="button" onClick={clearArchiveFilters}>清除筛选</button>
              </div>
            )}
          </section>);
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
