"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { generatedPosts } from "./generated-posts";

const AI_PARTICIPATION_LABELS = ["纯人工", "AI辅助", "AI协作", "人类辅助", "纯AI"] as const;

type AiParticipationLevel = 1 | 2 | 3 | 4 | 5;

type Article = {
  id: string;
  title: string;
  excerpt: string;
  category: string;
  aiParticipation: AiParticipationLevel;
  date: string;
  readTime: string;
  content: string;
};

type Draft = {
  articleId?: string;
  originalDate?: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  aiParticipation: AiParticipationLevel;
  content: string;
};

type LocalAiResponse = {
  summary?: string;
  suggestions?: string;
  provider?: string;
  error?: string;
};

type PostSaveResponse = {
  filename?: string;
  article?: Article;
  error?: string;
};

type PostListResponse = {
  articles?: Article[];
  count?: number;
  error?: string;
};

type ImageSaveResponse = {
  path?: string;
  error?: string;
};

type View =
  | { name: "home" | "archive" | "about" }
  | { name: "editor"; id?: string }
  | { name: "article"; id: string };

const repositoryArticles: Article[] = generatedPosts.map((article) => ({ ...article }));

const emptyDraft: Draft = {
  slug: "",
  title: "",
  excerpt: "",
  category: "评论",
  aiParticipation: 1,
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
  if (value.startsWith("editor/")) {
    return localEditorAvailable()
      ? { name: "editor", id: decodeURIComponent(value.slice(7)) }
      : { name: "home" };
  }
  if (value === "editor") {
    return localEditorAvailable() ? { name: "editor" } : { name: "home" };
  }
  if (["archive", "about"].includes(value)) {
    return { name: value as "archive" | "about" };
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

function normalizeMathDelimiters(source: string) {
  return source
    .replace(/^([ \t]*)\\\[\s*$/gm, (_match, indentation: string) => `${indentation}$$`)
    .replace(/^([ \t]*)\\\]\s*$/gm, (_match, indentation: string) => `${indentation}$$`)
    .replace(/\\\((.+?)\\\)/g, (_match, expression: string) => `$${expression}$`);
}

function Markdown({ source }: { source: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          table: ({ children, ...props }) => (
            <div className="table-scroll">
              <table {...props}>{children}</table>
            </div>
          ),
        }}
      >
        {normalizeMathDelimiters(source)}
      </ReactMarkdown>
    </div>
  );
}

function draftFromArticle(article: Article): Draft {
  return {
    articleId: article.id,
    originalDate: article.date,
    slug: article.id,
    title: article.title,
    excerpt: article.excerpt,
    category: article.category,
    aiParticipation: article.aiParticipation,
    content: article.content,
  };
}

export default function Home() {
  const [view, setView] = useState<View>({ name: "home" });
  const [projectArticles, setProjectArticles] = useState<Article[]>(repositoryArticles);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [toast, setToast] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [proofreading, setProofreading] = useState(false);
  const [proofreadingSuggestions, setProofreadingSuggestions] = useState("");
  const [savingMarkdown, setSavingMarkdown] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const markdownTextareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const localAiEnabled = process.env.NODE_ENV === "development";
  const slugDiffersFromTitle = Boolean(
    draft.title.trim() &&
    draft.slug.trim() &&
    normalizeSlug(draft.title) !== normalizeSlug(draft.slug),
  );
  const editorEnabled = useSyncExternalStore(
    subscribeToEditorEnvironment,
    localEditorAvailable,
    () => false,
  );

  const articles = projectArticles;

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

  const refreshProjectArticles = useCallback(async () => {
    const response = await fetch("/api/local-post", { cache: "no-store" });
    if (!response.ok) throw new Error("无法从 content/posts 读取文章");
    const result = await response.json() as PostListResponse;
    if (!Array.isArray(result.articles)) throw new Error("本机文章服务返回的数据无效");
    setProjectArticles(result.articles);
    return result;
  }, []);

  useEffect(() => {
    const syncRoute = () => setView(routeFromHash());
    syncRoute();
    window.addEventListener("hashchange", syncRoute);

    if (!localEditorAvailable()) {
      return () => window.removeEventListener("hashchange", syncRoute);
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshProjectArticles().catch(() => {
          // Keep the last valid file snapshot while an external edit is incomplete.
        });
      }
    };
    refreshWhenVisible();
    const refreshInterval = window.setInterval(refreshWhenVisible, 2000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("hashchange", syncRoute);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshProjectArticles]);

  useEffect(() => {
    const restoreEditorDraft = () => {
      const currentView = routeFromHash();
      if (currentView.name !== "editor" || !currentView.id) return;
      const article = articles.find((candidate) => candidate.id === currentView.id);
      if (!article) return;
      setDraft((current) => current.articleId === article.id ? current : draftFromArticle(article));
    };

    restoreEditorDraft();
    window.addEventListener("hashchange", restoreEditorDraft);
    return () => window.removeEventListener("hashchange", restoreEditorDraft);
  }, [articles]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const editArticle = (article: Article) => {
    const hasOtherDraft = Boolean(
      draft.articleId !== article.id &&
      (draft.title.trim() || draft.excerpt.trim() || draft.content.trim()),
    );
    if (hasOtherDraft && !window.confirm("打开这篇文章会替换当前草稿，是否继续？")) return;

    setDraft(draftFromArticle(article));
    setProofreadingSuggestions("");
    window.location.hash = `editor/${encodeURIComponent(article.id)}`;
  };

  const startNewDraft = () => {
    const hasDraft = Boolean(draft.title.trim() || draft.excerpt.trim() || draft.content.trim());
    if (hasDraft && !window.confirm("开始新文章会清空当前编辑内容，是否继续？")) return;
    setDraft({ ...emptyDraft });
    setProofreadingSuggestions("");
    window.location.hash = "editor";
  };

  const requestLocalAi = async (task: "summary" | "proofread") => {
    const response = await fetch("/api/local-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task,
        title: draft.title.trim(),
        content: draft.content.trim(),
      }),
    });
    const responseText = await response.text();
    let result: LocalAiResponse = {};
    try {
      result = JSON.parse(responseText) as LocalAiResponse;
    } catch {
      if (response.status === 404) {
        throw new Error("本机文字助手服务未启动，请重启 npm run dev");
      }
      throw new Error("本机文字助手返回了无法识别的响应");
    }
    if (!response.ok) throw new Error(result.error || "本机文字助手调用失败");
    return result;
  };

  const summarizeDraft = async () => {
    if (!draft.content.trim()) {
      notify("请先写下正文");
      return;
    }

    setSummarizing(true);
    try {
      const result = await requestLocalAi("summary");
      if (!result.summary) throw new Error("本机模型没有返回摘要");
      setDraft((current) => ({ ...current, excerpt: result.summary || "" }));
      notify(`${result.provider || "本机模型"} 已生成摘要`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "智能总结失败");
    } finally {
      setSummarizing(false);
    }
  };

  const proofreadDraft = async () => {
    if (!draft.content.trim()) {
      notify("请先写下正文");
      return;
    }

    setProofreading(true);
    setProofreadingSuggestions("");
    try {
      const result = await requestLocalAi("proofread");
      if (!result.suggestions) throw new Error("本机模型没有返回检查建议");
      setProofreadingSuggestions(result.suggestions);
      notify(`${result.provider || "本机模型"} 已完成文字检查`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "文字检查失败");
    } finally {
      setProofreading(false);
    }
  };

  const insertMarkdownImage = (path: string, alt: string) => {
    const textarea = markdownTextareaRef.current;
    const start = textarea?.selectionStart ?? draft.content.length;
    const end = textarea?.selectionEnd ?? start;

    setDraft((current) => {
      const before = current.content.slice(0, start);
      const after = current.content.slice(end);
      const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
      const suffix = after && !after.startsWith("\n") ? "\n\n" : "";
      const markdown = `![${alt}](${path})`;
      const nextCursor = before.length + prefix.length + markdown.length;

      window.requestAnimationFrame(() => {
        markdownTextareaRef.current?.focus();
        markdownTextareaRef.current?.setSelectionRange(nextCursor, nextCursor);
      });
      return { ...current, content: before + prefix + markdown + suffix + after };
    });
  };

  const uploadImage = async (file: File) => {
    if (file.size > 12 * 1024 * 1024) {
      notify("图片不能超过 12 MB");
      return;
    }
    setUploadingImage(true);
    try {
      const response = await fetch("/api/local-image", {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      });
      const responseText = await response.text();
      let result: ImageSaveResponse = {};
      try {
        result = JSON.parse(responseText) as ImageSaveResponse;
      } catch {
        if (response.status === 404) {
          throw new Error("本机图片保存服务未启动，请重启 npm run dev");
        }
        throw new Error("本机图片保存服务返回了无法识别的响应");
      }
      if (!response.ok || !result.path) {
        throw new Error(result.error || "图片保存失败");
      }
      const alt = file.name
        .replace(/\.[^.]+$/, "")
        .replace(/[\\\[\]\r\n]+/g, " ")
        .trim() || "图片";
      insertMarkdownImage(result.path, alt);
      notify("图片已保存并插入正文");
    } catch (error) {
      notify(error instanceof Error ? error.message : "图片保存失败");
    } finally {
      setUploadingImage(false);
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
      `category: ${JSON.stringify(draft.category.trim() || "评论")}`,
      `aiParticipation: ${draft.aiParticipation}`,
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
      await refreshProjectArticles();
      setDraft({ ...emptyDraft });
      notify(`已写入 content/posts/${result.filename}`);
      window.location.hash = `article/${encodeURIComponent(slug)}`;
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
        <a className="brand" href="#home" aria-label="凝泠博客首页">
          <span className="brand-mark">凝泠</span>
          <span className="brand-note">watice’s blog</span>
        </a>
        <nav className="site-nav" aria-label="主导航">
          <a className={activeNav === "home" ? "active" : ""} href="#home">首页</a>
          <a className={activeNav === "archive" ? "active" : ""} href="#archive">文章</a>
          <a className={activeNav === "about" ? "active" : ""} href="#about">关于</a>
          {editorEnabled && (
            <a className="editor-link" href="#editor">写文章 <span aria-hidden="true">↗</span></a>
          )}
        </nav>
      </header>

      <main>
        {view.name === "home" && (
          <>
            <section className="hero" aria-labelledby="hero-title">
              <div className="hero-copy">
                <p className="eyebrow"><span /> COMMENTARY · FINANCE · TECHNOLOGY</p>
                <h1 id="hero-title">在噪声里<br />辨认真实</h1>
                <p className="hero-intro">这里写金融、科技，以及它们如何改变商业与生活。<br />记录事实，拆解叙事，也保留可被修正的判断。</p>
                <a className="primary-link" href="#archive">开始阅读 <span aria-hidden="true">→</span></a>
              </div>
              <aside className="today-note" aria-label="凝泠札记">
                <span className="note-index">N° 01</span>
                <p>“观点可以鲜明，<br />判断必须克制。”</p>
                <span className="note-date">凝泠札记 · 长期观察</span>
              </aside>
            </section>

            <section className="latest" aria-labelledby="latest-title">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">RECENT COMMENTARY</p>
                  <h2 id="latest-title">最近评论</h2>
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
          </>
        )}

        {view.name === "archive" && (
          <section className="inner-page archive-page">
            <PageIntro label="ALL COMMENTARY" title="文章归档" text="围绕金融、科技与时代变化的评论，按发布时间排列。" />
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
            <PageIntro label="ABOUT WATICE" title="关于凝泠" text="在快速变化的世界里，保持冷静、清澈而诚实的观察。" />
            <div className="about-grid">
              <div className="about-copy prose">
                <p>你好，我是 watice。这里主要写金融、科技，以及它们与商业、社会和个人选择的交汇。</p>
                <p>“凝”是停下来凝视与沉淀，“泠”是清澈而冷静。这个名字提醒我：面对快速变化的市场与技术，先看清事实，再形成判断。</p>
                <p>文章以评论为主，不追求仓促的结论，更在意论据、结构和长期变化。观点会更新，但对事实与逻辑的要求不会降低。</p>
                <blockquote>对信息保持敏感，对叙事保持距离，对判断保持诚实。</blockquote>
                <p className="contact-line">关注主题 · 金融 / 科技 / 商业 / 社会</p>
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
                <button className="primary-button" type="button" onClick={saveMarkdownToProject} disabled={savingMarkdown}>
                  {savingMarkdown ? "正在保存…" : draft.articleId ? "保存修改" : "保存文章"}
                </button>
              </div>
            </div>
            <p className="editor-tip">文章以 content/posts 中的 Markdown 文件为准；网页保存和直接修改文件会更新同一份内容。</p>
            <div className="editor-meta">
              <label className="title-field">
                <span>标题</span>
                <textarea
                  className="title-input"
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  placeholder="给这篇文章一个名字"
                  rows={2}
                />
              </label>
              <label>
                <span>Slug（文章地址）</span>
                <input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: normalizeSlug(event.target.value) })} placeholder="留空则根据标题生成" disabled={Boolean(draft.articleId)} />
                {slugDiffersFromTitle && (
                  <small className="slug-hint">标题与 Slug 不同：文章列表将显示标题，链接将继续使用此 Slug。</small>
                )}
              </label>
              <label>
                <span>分类</span>
                <input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="评论" />
              </label>
              <AiParticipationSlider
                value={draft.aiParticipation}
                onChange={(aiParticipation) => setDraft({ ...draft, aiParticipation })}
              />
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
            {proofreadingSuggestions && (
              <section className="proofreading-panel" aria-live="polite">
                <div className="proofreading-heading">
                  <div>
                    <p className="section-kicker">AI PROOFREADING</p>
                    <h2>文字检查建议</h2>
                  </div>
                  <button type="button" onClick={() => setProofreadingSuggestions("")} aria-label="关闭文字检查建议">关闭</button>
                </div>
                <Markdown source={proofreadingSuggestions} />
                <p className="proofreading-note">检查结果仅供参考，不会自动改动正文。</p>
              </section>
            )}
            <div className="editor-workspace">
              <section className="writing-pane">
                <div className="writing-toolbar">
                  <span className="pane-label">MARKDOWN</span>
                  <div className="writing-tools">
                    {localAiEnabled && (
                      <button
                        type="button"
                        onClick={proofreadDraft}
                        disabled={proofreading}
                        title="只给修改建议，不会改动正文"
                      >
                        {proofreading ? "正在检查…" : "AI 检查语病与错别字"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={uploadingImage}
                    >
                      {uploadingImage ? "正在保存图片…" : "＋ 插入图片"}
                    </button>
                  </div>
                  <input
                    ref={imageInputRef}
                    className="visually-hidden"
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
                    aria-label="选择要插入的图片"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      if (file) void uploadImage(file);
                    }}
                  />
                </div>
                <textarea
                  ref={markdownTextareaRef}
                  value={draft.content}
                  onChange={(event) => {
                    setDraft({ ...draft, content: event.target.value });
                    setProofreadingSuggestions("");
                  }}
                  placeholder="从这里开始写下今天的想法……"
                  aria-label="Markdown 正文"
                  spellCheck="true"
                />
              </section>
              <section className="preview-pane" aria-label="文章实时预览">
                <span className="pane-label">PREVIEW</span>
                <article>
                  <p className="article-category">{draft.category || "未分类"}</p>
                  <h1>{draft.title || "未命名的文章"}</h1>
                  <div className="article-meta">
                    <span>{draft.originalDate || formatDate(new Date())} · {readTime(draft.content)}</span>
                    <AiParticipationIndicator value={draft.aiParticipation} />
                  </div>
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
          <span className="footer-brand">凝泠</span>
          <p>在噪声里保持清醒，在变化中寻找结构。</p>
        </div>
        <div className="footer-links">
          <a href="#home">首页</a>
          <a href="#archive">文章</a>
          <a href="#about">关于</a>
          {editorEnabled && <a href="#editor">编辑器</a>}
        </div>
        <p className="copyright">© 2026 凝泠 · watice’s blog</p>
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
          <AiParticipationIndicator value={article.aiParticipation} />
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

function aiParticipationLabel(value: AiParticipationLevel) {
  return AI_PARTICIPATION_LABELS[value - 1];
}

function AiParticipationIndicator({ value }: { value: AiParticipationLevel }) {
  const label = aiParticipationLabel(value);
  return (
    <span className="ai-participation-indicator" aria-label={`AI 参与度：${label}`}>
      {label}
    </span>
  );
}

function AiParticipationSlider({ value, onChange }: { value: AiParticipationLevel; onChange: (value: AiParticipationLevel) => void }) {
  const sliderValue = value - 1;
  const label = aiParticipationLabel(value);
  const sliderStyle = { "--ai-progress": `${sliderValue * 25}%` } as CSSProperties;

  return (
    <fieldset className="ai-participation-field">
      <legend className="visually-hidden">AI 参与度</legend>
      <div className="ai-participation-heading">
        <span>AI 参与度</span>
        <strong>{label}</strong>
      </div>
      <div className="ai-slider-control">
        <input
          type="range"
          min="0"
          max="4"
          step="1"
          value={sliderValue}
          aria-label="AI 参与度"
          aria-valuetext={label}
          style={sliderStyle}
          onChange={(event) => onChange((Number(event.target.value) + 1) as AiParticipationLevel)}
        />
        <div className="ai-slider-ticks" aria-hidden="true">
          {AI_PARTICIPATION_LABELS.map((tickLabel) => <span key={tickLabel} />)}
        </div>
      </div>
    </fieldset>
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
      <div className="reading-topbar">
        <a className="back-link" href="#archive">← 返回文章</a>
        {canEdit && <button type="button" onClick={() => onEdit(article)}>编辑文章</button>}
      </div>
      <header className="reading-header">
        <p className="article-category">{article.category}</p>
        <h1>{article.title}</h1>
        {article.excerpt && <p className="reading-deck">{article.excerpt}</p>}
        <div className="article-meta">
          <span>{article.date} · {article.readTime}</span>
          <AiParticipationIndicator value={article.aiParticipation} />
        </div>
      </header>
      <Markdown source={article.content} />
      <footer className="reading-footer">
        <span>写于凝泠</span>
        <div className="reading-actions">
          {canEdit && <button type="button" onClick={() => onEdit(article)}>编辑文章</button>}
          <a href="#archive">继续阅读 →</a>
        </div>
      </footer>
    </article>
  );
}
