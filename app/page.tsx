"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import ReactMarkdown from "react-markdown";
import { generatedPosts } from "./generated-posts";

type Article = {
  id: string;
  title: string;
  excerpt: string;
  category: string;
  date: string;
  readTime: string;
  content: string;
  local?: boolean;
};

type Draft = {
  articleId?: string;
  originalDate?: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  content: string;
};

type SummaryResponse = {
  summary?: string;
  provider?: string;
  error?: string;
};

type PostSaveResponse = {
  filename?: string;
  error?: string;
};

type View =
  | { name: "home" | "archive" | "about" | "editor" }
  | { name: "article"; id: string };

const repositoryArticles: Article[] = generatedPosts;

const emptyDraft: Draft = {
  slug: "",
  title: "",
  excerpt: "",
  category: "随笔",
  content: "",
};

function localEditorAvailable() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(window.location.hostname);
}

function subscribeToEditorEnvironment() {
  return () => {};
}

function routeFromHash(): View {
  if (typeof window === "undefined") return { name: "home" };
  const value = window.location.hash.replace(/^#/, "");
  if (value.startsWith("article/")) {
    return { name: "article", id: decodeURIComponent(value.slice(8)) };
  }
  if (value === "editor") {
    return localEditorAvailable() ? { name: "editor" } : { name: "home" };
  }
  if (["archive", "about"].includes(value)) {
    return { name: value as "archive" | "about" | "editor" };
  }
  return { name: "home" };
}

function formatDate(date: Date) {
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).replaceAll("/", ".");
}

function normalizeSlug(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

function readTime(text: string) {
  return `${Math.max(1, Math.ceil(text.replace(/\s/g, "").length / 400))} 分钟`;
}

function removeLegacyAutoExcerpt(article: Article) {
  const oldAutomaticExcerpt = article.content.trim().slice(0, 76);
  return article.excerpt === oldAutomaticExcerpt
    ? { ...article, excerpt: "" }
    : article;
}

function Markdown({ source }: { source: string }) {
  return (
    <div className="prose">
      <ReactMarkdown>{source}</ReactMarkdown>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>({ name: "home" });
  const [localArticles, setLocalArticles] = useState<Article[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [draftReady, setDraftReady] = useState(false);
  const [toast, setToast] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [savingMarkdown, setSavingMarkdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const localAiEnabled = process.env.NODE_ENV === "development";
  const editorEnabled = useSyncExternalStore(
    subscribeToEditorEnvironment,
    localEditorAvailable,
    () => false,
  );

  const articles = useMemo(() => {
    const localIds = new Set(localArticles.map((article) => article.id));
    return [
      ...localArticles,
      ...repositoryArticles.filter((article) => !localIds.has(article.id)),
    ];
  }, [localArticles]);

  const categories = useMemo(
    () => Array.from(new Set(articles.map((article) => article.category))).filter(Boolean),
    [articles],
  );

  const filteredArticles = useMemo(() => {
    const keyword = searchQuery.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");

    return articles.filter((article) => {
      if (selectedCategory && article.category !== selectedCategory) return false;
      if (!keyword) return true;

      return [article.title, article.excerpt, article.content, article.category]
        .join("\n")
        .normalize("NFKC")
        .toLocaleLowerCase("zh-CN")
        .includes(keyword);
    });
  }, [articles, searchQuery, selectedCategory]);

  const clearArchiveFilters = () => {
    setSearchQuery("");
    setSelectedCategory("");
  };

  useEffect(() => {
    const syncRoute = () => setView(routeFromHash());
    syncRoute();
    window.addEventListener("hashchange", syncRoute);

    const loadFrame = window.requestAnimationFrame(() => {
      if (!localEditorAvailable()) {
        setDraftReady(true);
        return;
      }
      try {
        const storedArticles = JSON.parse(localStorage.getItem("corner-posts") || "[]");
        const storedDraft = JSON.parse(localStorage.getItem("corner-draft") || "null");
        if (Array.isArray(storedArticles)) {
          const needsExcerptMigration = localStorage.getItem("corner-excerpt-policy") !== "manual-only";
          const nextArticles = needsExcerptMigration
            ? storedArticles.map(removeLegacyAutoExcerpt)
            : storedArticles;
          setLocalArticles(nextArticles);
          if (needsExcerptMigration) {
            localStorage.setItem("corner-posts", JSON.stringify(nextArticles));
            localStorage.setItem("corner-excerpt-policy", "manual-only");
          }
        }
        if (storedDraft) {
          const isLegacyPlaceholder =
            storedDraft.content === "从这里开始写下今天的想法……" &&
            !storedDraft.title &&
            !storedDraft.excerpt;
          setDraft({
            ...emptyDraft,
            ...storedDraft,
            content: isLegacyPlaceholder ? "" : storedDraft.content,
          });
        }
      } catch {
        // Ignore malformed local data and keep the starter content available.
      } finally {
        setDraftReady(true);
      }
    });

    return () => {
      window.cancelAnimationFrame(loadFrame);
      window.removeEventListener("hashchange", syncRoute);
    };
  }, []);

  useEffect(() => {
    if (!draftReady || !editorEnabled) return;
    localStorage.setItem("corner-draft", JSON.stringify(draft));
  }, [draft, draftReady, editorEnabled]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const publishLocal = () => {
    if (!draft.title.trim() || !draft.content.trim()) {
      notify("请先写下标题和正文");
      return;
    }

    const resolvedSlug = normalizeSlug(draft.articleId || draft.slug || draft.title);
    if (!resolvedSlug) {
      notify("请填写有效的 slug");
      return;
    }
    if (!draft.articleId && articles.some((article) => article.id === resolvedSlug)) {
      notify("这个 slug 已被其他文章使用");
      return;
    }

    const editingArticle = draft.articleId
      ? articles.find((article) => article.id === draft.articleId)
      : undefined;
    const article: Article = {
      id: resolvedSlug,
      title: draft.title.trim(),
      excerpt: draft.excerpt.trim(),
      category: draft.category.trim() || "随笔",
      date: draft.originalDate || editingArticle?.date || formatDate(new Date()),
      readTime: readTime(draft.content),
      content: draft.content,
      local: true,
    };
    const next = [
      article,
      ...localArticles.filter((item) => item.id !== article.id && item.id !== draft.articleId),
    ];
    setLocalArticles(next);
    localStorage.setItem("corner-posts", JSON.stringify(next));
    notify(draft.articleId ? "文章修改已保存" : "已发布到这台设备");
    setDraft({ ...emptyDraft });
    window.location.hash = `article/${encodeURIComponent(article.id)}`;
  };

  const editArticle = (article: Article) => {
    const hasOtherDraft = Boolean(
      draft.articleId !== article.id &&
      (draft.title.trim() || draft.excerpt.trim() || draft.content.trim()),
    );
    if (hasOtherDraft && !window.confirm("打开这篇文章会替换当前草稿，是否继续？")) return;

    setDraft({
      articleId: article.id,
      originalDate: article.date,
      slug: article.id,
      title: article.title,
      excerpt: article.excerpt,
      category: article.category,
      content: article.content,
    });
    window.location.hash = "editor";
  };

  const startNewDraft = () => {
    const hasDraft = Boolean(draft.title.trim() || draft.excerpt.trim() || draft.content.trim());
    if (hasDraft && !window.confirm("开始新文章会清空当前编辑内容，是否继续？")) return;
    setDraft({ ...emptyDraft });
    window.location.hash = "editor";
  };

  const saveDraft = () => {
    localStorage.setItem("corner-draft", JSON.stringify(draft));
    notify("草稿已保存在浏览器中");
  };

  const summarizeDraft = async () => {
    if (!draft.content.trim()) {
      notify("请先写下正文");
      return;
    }

    setSummarizing(true);
    try {
      const response = await fetch("/api/local-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim(),
          content: draft.content.trim(),
        }),
      });
      const responseText = await response.text();
      let result: SummaryResponse = {};
      try {
        result = JSON.parse(responseText) as SummaryResponse;
      } catch {
        if (response.status === 404) {
          throw new Error("本机摘要服务未启动，请重启 npm run dev");
        }
        throw new Error("本机摘要服务返回了无法识别的响应");
      }
      if (!response.ok || !result.summary) {
        throw new Error(result.error || "智能总结失败");
      }
      setDraft((current) => ({ ...current, excerpt: result.summary || "" }));
      notify(`${result.provider || "本机模型"} 已生成摘要`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "智能总结失败");
    } finally {
      setSummarizing(false);
    }
  };

  const saveMarkdownToProject = async () => {
    if (!draft.title.trim() || !draft.content.trim()) {
      notify("请先写下标题和正文");
      return;
    }

    const slug = normalizeSlug(draft.articleId || draft.slug || draft.title);
    if (!slug) {
      notify("请填写有效的 slug");
      return;
    }

    const date = draft.originalDate?.replaceAll(".", "-") || new Date().toISOString().slice(0, 10);
    const frontmatter = [
      "---",
      `slug: ${JSON.stringify(slug)}`,
      `title: ${JSON.stringify(draft.title.trim())}`,
      `date: ${JSON.stringify(date)}`,
      `category: ${JSON.stringify(draft.category.trim() || "随笔")}`,
      `excerpt: ${JSON.stringify(draft.excerpt.trim())}`,
      "---",
      "",
      "",
    ].join("\n");
    setSavingMarkdown(true);
    try {
      const response = await fetch("/api/local-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          markdown: frontmatter + draft.content,
          overwrite: Boolean(draft.articleId),
        }),
      });
      const responseText = await response.text();
      let result: PostSaveResponse = {};
      try {
        result = JSON.parse(responseText) as PostSaveResponse;
      } catch {
        if (response.status === 404) {
          throw new Error("本机文章保存服务未启动，请重启 npm run dev");
        }
        throw new Error("本机文章保存服务返回了无法识别的响应");
      }
      if (!response.ok || !result.filename) {
        throw new Error(result.error || "Markdown 保存失败");
      }
      setDraft((current) => ({ ...current, articleId: slug, originalDate: date, slug }));
      notify(`已保存到 content/posts/${result.filename}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Markdown 保存失败");
    } finally {
      setSavingMarkdown(false);
    }
  };

  const activeNav = view.name === "article" ? "home" : view.name;

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#home" aria-label="一隅博客首页">
          <span className="brand-mark">一隅</span>
          <span className="brand-note">CORNER NOTES</span>
        </a>
        <nav className="site-nav" aria-label="主导航">
          <a className={activeNav === "home" ? "active" : ""} href="#home">首页</a>
          <a className={activeNav === "archive" ? "active" : ""} href="#archive">文章</a>
          <a className={activeNav === "about" ? "active" : ""} href="#about">关于</a>
          {editorEnabled && <a className="editor-link" href="#editor">写文章 <span aria-hidden="true">↗</span></a>}
        </nav>
      </header>

      <main>
        {view.name === "home" && (
          <>
            <section className="hero" aria-labelledby="hero-title">
              <div className="hero-copy">
                <p className="eyebrow"><span /> PERSONAL WRITING · SINCE 2026</p>
                <h1 id="hero-title">把日子写成<br />慢慢展开的纸</h1>
                <p className="hero-intro">这里收藏日常、阅读和偶尔路过心里的念头。<br />不赶时间，只认真写下值得记住的部分。</p>
                <a className="primary-link" href="#archive">开始阅读 <span aria-hidden="true">→</span></a>
              </div>
              <aside className="today-note" aria-label="今日札记">
                <span className="note-index">N° 01</span>
                <p>“风从窗边经过，<br />纸页替我记住了它。”</p>
                <span className="note-date">今日札记 · 七月</span>
              </aside>
            </section>

            <section className="latest" aria-labelledby="latest-title">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">RECENT STORIES</p>
                  <h2 id="latest-title">最近写下的</h2>
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
              <p className="section-kicker">A SMALL NOTE</p>
              <p>愿每一次书写，都让混乱的世界安静一点。</p>
              <span aria-hidden="true">✦</span>
            </section>
          </>
        )}

        {view.name === "archive" && (
          <section className="inner-page archive-page">
            <PageIntro label="ALL STORIES" title="文章归档" text="按写下的时间排列。慢慢读，不必一次看完。" />
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
              {filteredArticles.length === articles.length
                ? `共 ${articles.length} 篇`
                : `找到 ${filteredArticles.length} 篇 · 共 ${articles.length} 篇`}
            </div>
            <div className="article-list archive-list">
              {filteredArticles.map((article, index) => (
                <ArticleRow article={article} index={index + 1} key={article.id} />
              ))}
            </div>
            {filteredArticles.length === 0 && (
              <div className="archive-empty">
                <p>没有找到符合条件的文章。</p>
                <button type="button" onClick={clearArchiveFilters}>清除筛选</button>
              </div>
            )}
          </section>
        )}

        {view.name === "about" && (
          <section className="inner-page about-page">
            <PageIntro label="ABOUT THIS PLACE" title="关于一隅" text="一小块属于文字，也属于自己的安静地方。" />
            <div className="about-grid">
              <div className="about-number">01</div>
              <div className="about-copy prose">
                <p>你好，我是这个博客的作者。这里写生活里的细枝末节，也写阅读、行走和那些还没有答案的问题。</p>
                <p>“一隅”不是躲开世界，而是给自己留一个能够好好观察世界的位置。文章没有固定更新频率，有想说的话时就回来写一篇。</p>
                <blockquote>保持好奇，保持善意，也保持一点不被催促的空白。</blockquote>
                <p className="contact-line">联系我 · hello@example.com</p>
              </div>
            </div>
          </section>
        )}

        {view.name === "editor" && editorEnabled && (
          <section className="editor-page">
            <div className="editor-topbar">
              <div>
                <p className="section-kicker">QUIET EDITOR</p>
                <h1>{draft.articleId ? "编辑文章" : "写一篇新文章"}</h1>
              </div>
              <div className="editor-actions">
                {draft.articleId && <button className="secondary-button" type="button" onClick={startNewDraft}>新建文章</button>}
                <button className="secondary-button" type="button" onClick={saveDraft}>保存草稿</button>
                <button className="secondary-button" type="button" onClick={saveMarkdownToProject} disabled={savingMarkdown}>
                  {savingMarkdown ? "正在保存…" : "保存到文章目录"}
                </button>
                <button className="primary-button" type="button" onClick={publishLocal}>{draft.articleId ? "保存修改" : "发布到本机"}</button>
              </div>
            </div>
            <p className="editor-tip">{draft.articleId ? "正在编辑已发布文章；保存后会直接更新 content/posts 中对应的 Markdown 文件。" : "支持 Markdown。保存后会直接写入 content/posts，并自动更新文章列表。"}</p>
            <div className="editor-meta">
              <label>
                <span>标题</span>
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="给这篇文章一个名字" />
              </label>
              <label>
                <span>Slug（文章地址）</span>
                <input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: normalizeSlug(event.target.value) })} placeholder="留空则根据标题生成" disabled={Boolean(draft.articleId)} />
              </label>
              <label>
                <span>分类</span>
                <input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="随笔" />
              </label>
              <label className="excerpt-field">
                <span className="excerpt-label">
                  <span>摘要</span>
                  {localAiEnabled && (
                    <button type="button" onClick={summarizeDraft} disabled={summarizing}>
                      {summarizing ? "正在总结…" : "AI 智能总结"}
                    </button>
                  )}
                </span>
                <textarea
                  value={draft.excerpt}
                  onChange={(event) => setDraft({ ...draft, excerpt: event.target.value })}
                  placeholder="用一小段话介绍这篇文章（可选）"
                  rows={4}
                />
              </label>
            </div>
            <div className="editor-workspace">
              <label className="writing-pane">
                <span className="pane-label">MARKDOWN</span>
                <textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder="从这里开始写下今天的想法……" aria-label="Markdown 正文" spellCheck="true" />
              </label>
              <section className="preview-pane" aria-label="文章实时预览">
                <span className="pane-label">PREVIEW</span>
                <article>
                  <p className="article-category">{draft.category || "未分类"}</p>
                  <h1>{draft.title || "未命名的文章"}</h1>
                  <div className="article-meta">{draft.originalDate || formatDate(new Date())} · {readTime(draft.content)}</div>
                  <Markdown source={draft.content} />
                </article>
              </section>
            </div>
          </section>
        )}

        {view.name === "article" && (
          <ArticlePage article={articles.find((article) => article.id === view.id)} onEdit={editArticle} canEdit={editorEnabled} />
        )}
      </main>

      <footer className="site-footer">
        <div>
          <span className="footer-brand">一隅</span>
          <p>在喧闹世界里，留一页纸给自己。</p>
        </div>
        <div className="footer-links">
          <a href="#home">首页</a>
          <a href="#archive">文章</a>
          <a href="#about">关于</a>
          {editorEnabled && <a href="#editor">编辑器</a>}
        </div>
        <p className="copyright">© 2026 一隅 · Built for slow reading</p>
      </footer>

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}

function ArticleRow({ article, index }: { article: Article; index: number }) {
  return (
    <article className="article-row">
      <span className="article-index">{String(index).padStart(2, "0")}</span>
      <div className="article-body">
        <div className="article-overline">
          <span>{article.category}</span>
          <span>{article.date}</span>
          {article.local && <span className="local-badge">本机</span>}
        </div>
        <h3><a href={`#article/${encodeURIComponent(article.id)}`}>{article.title}</a></h3>
        {article.excerpt && <p>{article.excerpt}</p>}
      </div>
      <div className="article-tail">
        <span>{article.readTime}</span>
        <a href={`#article/${encodeURIComponent(article.id)}`} aria-label={`阅读《${article.title}》`}>↗</a>
      </div>
    </article>
  );
}

function PageIntro({ label, title, text }: { label: string; title: string; text: string }) {
  return (
    <header className="page-intro">
      <p className="section-kicker">{label}</p>
      <h1>{title}</h1>
      <p>{text}</p>
    </header>
  );
}

function ArticlePage({ article, onEdit, canEdit }: { article?: Article; onEdit: (article: Article) => void; canEdit: boolean }) {
  if (!article) {
    return (
      <section className="inner-page missing-page">
        <p className="section-kicker">NOT FOUND</p>
        <h1>这篇文章暂时找不到</h1>
        <a className="primary-link" href="#archive">回到文章列表 →</a>
      </section>
    );
  }

  return (
    <article className="reading-page">
      <a className="back-link" href="#archive">← 返回文章</a>
      <header className="reading-header">
        <p className="article-category">{article.category}</p>
        <h1>{article.title}</h1>
        {article.excerpt && <p className="reading-deck">{article.excerpt}</p>}
        <div className="article-meta">{article.date} · {article.readTime}</div>
      </header>
      <Markdown source={article.content} />
      <footer className="reading-footer">
        <span>写于一隅</span>
        <div className="reading-actions">
          {canEdit && <button type="button" onClick={() => onEdit(article)}>编辑文章</button>}
          <a href="#archive">继续阅读 →</a>
        </div>
      </footer>
    </article>
  );
}
