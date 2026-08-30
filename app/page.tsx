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
  draftId?: string;
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
  commit?: string;
  pushed?: boolean;
  error?: string;
};

type PostListResponse = {
  articles?: Article[];
  count?: number;
  error?: string;
};

type DraftArticle = Article & {
  sourceArticleId?: string;
};

type DraftListResponse = {
  drafts?: DraftArticle[];
  count?: number;
  error?: string;
};

type DraftSaveResponse = {
  filename?: string;
  draft?: DraftArticle;
  error?: string;
};

type ImageSaveResponse = {
  path?: string;
  error?: string;
};

type RecoverySnapshot = {
  draft: Draft;
  savedAt: string;
};

type RecoveryResponse = {
  recovery?: RecoverySnapshot | null;
  deleted?: boolean;
  error?: string;
};

type RecoveryGateStatus = "idle" | "checking" | "ready" | "needs-action" | "error";
type RecoveryAction = "draft" | "post" | "discard" | null;

type View =
  | { name: "home" | "archive" | "about" | "drafts" }
  | { name: "editor"; id?: string; draftId?: string }
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

function draftSignature(draft: Draft) {
  return JSON.stringify(draft);
}

function recoveryFallbackSlug(savedAt: string) {
  return `recovered-${savedAt.slice(0, 19).replace(/\D+/g, "-")}`;
}

function formatRecoveryTime(savedAt: string) {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return savedAt;
  return date.toLocaleString("zh-CN", { hour12: false });
}

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
  if (value.startsWith("editor/draft/")) {
    return localEditorAvailable()
      ? { name: "editor", draftId: decodeURIComponent(value.slice(13)) }
      : { name: "home" };
  }
  if (value.startsWith("editor/")) {
    return localEditorAvailable()
      ? { name: "editor", id: decodeURIComponent(value.slice(7)) }
      : { name: "home" };
  }
  if (value === "editor") {
    return localEditorAvailable() ? { name: "editor" } : { name: "home" };
  }
  if (value === "drafts") {
    return localEditorAvailable() ? { name: "drafts" } : { name: "home" };
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

function wordCount(text: string) {
  return text.replace(/\s/g, "").length;
}

function formatWordCount(text: string) {
  return `${wordCount(text).toLocaleString("zh-CN")} 字`;
}

function readTime(text: string) {
  return `${Math.max(1, Math.ceil(wordCount(text) / 400))} 分钟`;
}

function escapeLiteralDollarSigns(source: string) {
  return source.replace(
    /(^|[^\\])\$(?=\d|[A-Z][A-Z0-9]{1,}\b)/gm,
    (_match, prefix: string) => `${prefix}\\$`,
  );
}

function normalizeMathDelimiters(source: string) {
  return escapeLiteralDollarSigns(source)
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

function draftFromDraftArticle(article: DraftArticle): Draft {
  return {
    articleId: article.sourceArticleId,
    draftId: article.id,
    originalDate: article.date,
    slug: article.sourceArticleId || article.id,
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
  const [draftArticles, setDraftArticles] = useState<DraftArticle[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [toast, setToast] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [proofreading, setProofreading] = useState(false);
  const [proofreadingSuggestions, setProofreadingSuggestions] = useState("");
  const [savingMarkdown, setSavingMarkdown] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [recovery, setRecovery] = useState<RecoverySnapshot | null>(null);
  const [recoveryGateStatus, setRecoveryGateStatus] = useState<RecoveryGateStatus>("idle");
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryAction, setRecoveryAction] = useState<RecoveryAction>(null);
  const [autosaveNotice, setAutosaveNotice] = useState("每 10 秒自动保存临时文件");
  const [autosaveFailed, setAutosaveFailed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const markdownTextareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<Draft>(draft);
  const autosaveBaselineRef = useRef(draftSignature(emptyDraft));
  const lastAutosavedSignatureRef = useRef("");
  const autosaveInFlightRef = useRef<Promise<void> | null>(null);
  const autosavePausedRef = useRef(false);
  const previousViewNameRef = useRef<View["name"]>("home");
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

  const refreshDraftArticles = useCallback(async () => {
    const response = await fetch("/api/local-draft", { cache: "no-store" });
    const result = await response.json() as DraftListResponse;
    if (!response.ok || !Array.isArray(result.drafts)) {
      throw new Error(result.error || "无法从 content/drafts 读取草稿");
    }
    setDraftArticles(result.drafts);
    return result;
  }, []);

  const loadDraftIntoEditor = useCallback((nextDraft: Draft) => {
    const signature = draftSignature(nextDraft);
    draftRef.current = nextDraft;
    autosaveBaselineRef.current = signature;
    lastAutosavedSignatureRef.current = "";
    setDraft(nextDraft);
    setAutosaveFailed(false);
    setAutosaveNotice("每 10 秒自动保存临时文件");
  }, []);

  const checkRecoveryFile = useCallback(async () => {
    autosavePausedRef.current = true;
    setRecoveryGateStatus("checking");
    setRecoveryError("");
    setRecoveryAction(null);
    try {
      const response = await fetch("/api/local-recovery", { cache: "no-store" });
      const result = await response.json() as RecoveryResponse;
      if (!response.ok) throw new Error(result.error || "无法读取编辑器临时文件");
      if (result.recovery) {
        setRecovery(result.recovery);
        setRecoveryGateStatus("needs-action");
        return;
      }
      setRecovery(null);
      setRecoveryGateStatus("ready");
      autosavePausedRef.current = false;
    } catch (error) {
      setRecovery(null);
      setRecoveryError(error instanceof Error ? error.message : "无法读取编辑器临时文件");
      setRecoveryGateStatus("error");
    }
  }, []);

  const deleteRecoveryFile = useCallback(async () => {
    if (autosaveInFlightRef.current) await autosaveInFlightRef.current;
    const response = await fetch("/api/local-recovery", { method: "DELETE" });
    const result = await response.json() as RecoveryResponse;
    if (!response.ok || result.deleted !== true) {
      throw new Error(result.error || "临时文件删除失败");
    }
    lastAutosavedSignatureRef.current = "";
  }, []);

  const writeRecoveryFile = useCallback((targetDraft: Draft) => {
    const signature = draftSignature(targetDraft);
    if (
      autosavePausedRef.current ||
      autosaveInFlightRef.current ||
      signature === autosaveBaselineRef.current ||
      signature === lastAutosavedSignatureRef.current
    ) return;

    setAutosaveFailed(false);
    setAutosaveNotice("正在自动保存临时文件…");
    const request = (async () => {
      try {
        const response = await fetch("/api/local-recovery", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft: targetDraft }),
        });
        const result = await response.json() as RecoveryResponse;
        if (!response.ok || !result.recovery) {
          throw new Error(result.error || "临时文件自动保存失败");
        }
        lastAutosavedSignatureRef.current = signature;
        setAutosaveNotice(`临时文件已保存 · ${new Date(result.recovery.savedAt).toLocaleTimeString("zh-CN", { hour12: false })}`);
      } catch (error) {
        setAutosaveFailed(true);
        setAutosaveNotice(error instanceof Error ? `自动保存失败：${error.message}` : "临时文件自动保存失败");
      }
    })();
    autosaveInFlightRef.current = request;
    void request.finally(() => {
      if (autosaveInFlightRef.current === request) autosaveInFlightRef.current = null;
    });
  }, []);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

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
        void refreshDraftArticles().catch(() => {
          // Keep the last valid draft snapshot while an external edit is incomplete.
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
  }, [refreshDraftArticles, refreshProjectArticles]);

  useEffect(() => {
    const enteredEditor = view.name === "editor" && previousViewNameRef.current !== "editor";
    previousViewNameRef.current = view.name;

    if (view.name !== "editor") {
      autosavePausedRef.current = true;
      return;
    }
    if (editorEnabled && (enteredEditor || recoveryGateStatus === "idle")) void checkRecoveryFile();
  }, [checkRecoveryFile, editorEnabled, recoveryGateStatus, view.name]);

  useEffect(() => {
    if (!editorEnabled || view.name !== "editor" || recoveryGateStatus !== "ready") return;
    const interval = window.setInterval(() => writeRecoveryFile(draftRef.current), 10_000);
    return () => window.clearInterval(interval);
  }, [editorEnabled, recoveryGateStatus, view.name, writeRecoveryFile]);

  useEffect(() => {
    if (!editorEnabled || view.name !== "editor") return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (draftSignature(draftRef.current) === autosaveBaselineRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [editorEnabled, view.name]);

  useEffect(() => {
    const restoreEditorDraft = () => {
      const currentView = routeFromHash();
      if (currentView.name !== "editor") return;
      if (currentView.draftId) {
        const savedDraft = draftArticles.find((candidate) => candidate.id === currentView.draftId);
        if (!savedDraft) return;
        if (draftRef.current.draftId !== savedDraft.id) loadDraftIntoEditor(draftFromDraftArticle(savedDraft));
        return;
      }
      if (currentView.id) {
        const article = articles.find((candidate) => candidate.id === currentView.id);
        if (!article) return;
        if (draftRef.current.articleId !== article.id || draftRef.current.draftId) {
          loadDraftIntoEditor(draftFromArticle(article));
        }
      }
    };

    restoreEditorDraft();
    window.addEventListener("hashchange", restoreEditorDraft);
    return () => window.removeEventListener("hashchange", restoreEditorDraft);
  }, [articles, draftArticles, loadDraftIntoEditor]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const clearRecoveryBeforeReplacement = async () => {
    if (draftSignature(draftRef.current) === autosaveBaselineRef.current) return true;
    autosavePausedRef.current = true;
    try {
      await deleteRecoveryFile();
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "无法清理当前临时文件");
      autosavePausedRef.current = false;
      return false;
    }
  };

  const editArticle = async (article: Article) => {
    const hasOtherDraft = Boolean(
      draft.articleId !== article.id &&
      (draft.title.trim() || draft.excerpt.trim() || draft.content.trim()),
    );
    if (hasOtherDraft && !window.confirm("打开这篇文章会替换当前草稿，是否继续？")) return;
    if (hasOtherDraft && !await clearRecoveryBeforeReplacement()) return;

    loadDraftIntoEditor(draftFromArticle(article));
    autosavePausedRef.current = false;
    setProofreadingSuggestions("");
    window.location.assign(`#editor/${encodeURIComponent(article.id)}`);
  };

  const editSavedDraft = async (savedDraft: DraftArticle) => {
    const hasOtherDraft = Boolean(
      draft.draftId !== savedDraft.id &&
      (draft.title.trim() || draft.excerpt.trim() || draft.content.trim()),
    );
    if (hasOtherDraft && !window.confirm("打开这份草稿会替换当前编辑内容，是否继续？")) return;
    if (hasOtherDraft && !await clearRecoveryBeforeReplacement()) return;

    loadDraftIntoEditor(draftFromDraftArticle(savedDraft));
    autosavePausedRef.current = false;
    setProofreadingSuggestions("");
    window.location.assign(`#editor/draft/${encodeURIComponent(savedDraft.id)}`);
  };

  const startNewDraft = async () => {
    const hasDraft = Boolean(draft.title.trim() || draft.excerpt.trim() || draft.content.trim());
    if (hasDraft && !window.confirm("开始新文章会清空当前编辑内容，是否继续？")) return;
    if (hasDraft && !await clearRecoveryBeforeReplacement()) return;
    loadDraftIntoEditor({ ...emptyDraft });
    autosavePausedRef.current = false;
    setProofreadingSuggestions("");
    window.location.assign("#editor");
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

  const markdownForDraft = (targetDraft: Draft, slug: string, { includeSourceArticle = false } = {}) => {
    const date = targetDraft.originalDate?.replaceAll(".", "-") || new Date().toISOString().slice(0, 10);
    return [
      "---",
      `slug: ${JSON.stringify(slug)}`,
      `title: ${JSON.stringify(targetDraft.title.trim())}`,
      `date: ${JSON.stringify(date)}`,
      `category: ${JSON.stringify(targetDraft.category.trim() || "评论")}`,
      `aiParticipation: ${targetDraft.aiParticipation}`,
      `excerpt: ${JSON.stringify(targetDraft.excerpt.trim())}`,
      ...(includeSourceArticle && targetDraft.articleId
        ? [`sourceArticle: ${JSON.stringify(targetDraft.articleId)}`]
        : []),
      "---",
      "",
      targetDraft.content,
      "",
    ].join("\n");
  };

  const saveToDraftBox = async () => {
    const targetDraft = draftRef.current;
    const slug = normalizeSlug(targetDraft.draftId || targetDraft.articleId || targetDraft.slug || targetDraft.title);
    if (!slug) {
      notify("请先填写标题或有效的 slug");
      return;
    }

    autosavePausedRef.current = true;
    setSavingDraft(true);
    try {
      if (autosaveInFlightRef.current) await autosaveInFlightRef.current;
      const response = await fetch("/api/local-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          markdown: markdownForDraft(targetDraft, slug, { includeSourceArticle: true }),
          overwrite: Boolean(targetDraft.draftId),
        }),
      });
      const responseText = await response.text();
      let result: DraftSaveResponse = {};
      try {
        result = JSON.parse(responseText) as DraftSaveResponse;
      } catch {
        throw new Error(response.status === 404
          ? "本机草稿服务未启动，请重启 npm run dev"
          : "本机草稿服务返回了无法识别的响应");
      }
      if (!response.ok || !result.filename || !result.draft) {
        throw new Error(result.error || "草稿保存失败");
      }
      loadDraftIntoEditor(draftFromDraftArticle(result.draft));
      await refreshDraftArticles();
      let cleanupWarning = "";
      try {
        await deleteRecoveryFile();
      } catch (error) {
        cleanupWarning = error instanceof Error ? error.message : "临时文件清理失败";
      }
      notify(cleanupWarning
        ? `草稿已保存，但${cleanupWarning}`
        : `已保存到草稿箱：${result.filename}`);
      window.location.assign(`#editor/draft/${encodeURIComponent(result.draft.id)}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "草稿保存失败");
    } finally {
      autosavePausedRef.current = false;
      setSavingDraft(false);
    }
  };

  const saveMarkdownToProject = async () => {
    const targetDraft = draftRef.current;
    if (!targetDraft.title.trim() || !targetDraft.content.trim()) {
      notify("正式发布前请写下标题和正文");
      return;
    }

    const slug = normalizeSlug(targetDraft.articleId || targetDraft.slug || targetDraft.draftId || targetDraft.title);
    if (!slug) {
      notify("请填写有效的 slug");
      return;
    }

    autosavePausedRef.current = true;
    setSavingMarkdown(true);
    try {
      if (autosaveInFlightRef.current) await autosaveInFlightRef.current;
      const response = await fetch("/api/local-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          markdown: markdownForDraft(targetDraft, slug),
          overwrite: Boolean(targetDraft.articleId),
          sourceDraftSlug: targetDraft.draftId,
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
      if (!response.ok || !result.filename || result.pushed !== true) {
        if (result.article) {
          const nextDraft = { ...draftRef.current, articleId: result.article.id || slug };
          draftRef.current = nextDraft;
          setDraft(nextDraft);
        }
        throw new Error(result.error || "Markdown 保存失败");
      }
      await Promise.all([refreshProjectArticles(), refreshDraftArticles()]);
      let cleanupWarning = "";
      try {
        await deleteRecoveryFile();
      } catch (error) {
        cleanupWarning = error instanceof Error ? error.message : "临时文件清理失败";
      }
      loadDraftIntoEditor({ ...emptyDraft });
      notify(cleanupWarning
        ? `正文已提交并推送，但${cleanupWarning}`
        : `已提交并推送 ${result.commit || "最新文章"}`);
      window.location.hash = `article/${encodeURIComponent(slug)}`;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Markdown 保存失败");
    } finally {
      autosavePausedRef.current = false;
      setSavingMarkdown(false);
    }
  };

  const saveRecoveryAsDraft = async () => {
    if (!recovery) return;
    if (!window.confirm("确认把这份临时文件保存到草稿箱？保存成功后，临时文件会被删除。")) return;

    const targetDraft = recovery.draft;
    const slug = normalizeSlug(
      targetDraft.draftId ||
      targetDraft.articleId ||
      targetDraft.slug ||
      targetDraft.title,
    ) || recoveryFallbackSlug(recovery.savedAt);
    setRecoveryAction("draft");
    setRecoveryError("");
    autosavePausedRef.current = true;
    let resolved = false;
    try {
      const response = await fetch("/api/local-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          markdown: markdownForDraft(targetDraft, slug, { includeSourceArticle: true }),
          overwrite: Boolean(targetDraft.draftId),
        }),
      });
      const result = await response.json() as DraftSaveResponse;
      if (!response.ok || !result.filename || !result.draft) {
        throw new Error(result.error || "临时文件保存到草稿箱失败");
      }

      const savedDraft = draftFromDraftArticle(result.draft);
      setRecovery((current) => current ? { ...current, draft: savedDraft } : current);
      await deleteRecoveryFile();
      await refreshDraftArticles();
      loadDraftIntoEditor(savedDraft);
      setRecovery(null);
      setRecoveryGateStatus("ready");
      resolved = true;
      notify(`临时文件已存入草稿箱：${result.filename}`);
      window.location.assign(`#editor/draft/${encodeURIComponent(result.draft.id)}`);
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : "临时文件保存到草稿箱失败");
    } finally {
      autosavePausedRef.current = !resolved;
      setRecoveryAction(null);
    }
  };

  const saveRecoveryAsPost = async () => {
    if (!recovery) return;
    const targetDraft = recovery.draft;
    if (!targetDraft.title.trim() || !targetDraft.content.trim()) {
      setRecoveryError("这份临时文件缺少标题或正文，暂时不能保存为正文；请先存入草稿箱。");
      return;
    }
    if (!window.confirm("确认把这份临时文件保存为正文？这会执行构建、Git 提交并推送到 main。")) return;

    const slug = normalizeSlug(
      targetDraft.articleId ||
      targetDraft.slug ||
      targetDraft.draftId ||
      targetDraft.title,
    ) || recoveryFallbackSlug(recovery.savedAt);
    setRecoveryAction("post");
    setRecoveryError("");
    autosavePausedRef.current = true;
    try {
      const response = await fetch("/api/local-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          markdown: markdownForDraft(targetDraft, slug),
          overwrite: Boolean(targetDraft.articleId),
          sourceDraftSlug: targetDraft.draftId,
        }),
      });
      const result = await response.json() as PostSaveResponse;
      if (!response.ok || !result.filename || result.pushed !== true) {
        if (response.status === 502 && result.article) {
          const partiallyPublishedDraft = { ...targetDraft, articleId: result.article.id || slug };
          const recoveryResponse = await fetch("/api/local-recovery", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ draft: partiallyPublishedDraft }),
          });
          const recoveryResult = await recoveryResponse.json() as RecoveryResponse;
          if (recoveryResponse.ok && recoveryResult.recovery) setRecovery(recoveryResult.recovery);
        }
        throw new Error(result.error || "临时文件保存为正文失败");
      }

      await Promise.all([refreshProjectArticles(), refreshDraftArticles()]);
      await deleteRecoveryFile();
      loadDraftIntoEditor({ ...emptyDraft });
      setRecovery(null);
      setRecoveryGateStatus("ready");
      notify(`临时文件已提交并推送 ${result.commit || "最新文章"}`);
      window.location.hash = `article/${encodeURIComponent(slug)}`;
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : "临时文件保存为正文失败");
    } finally {
      autosavePausedRef.current = true;
      setRecoveryAction(null);
    }
  };

  const discardRecovery = async () => {
    if (!recovery) return;
    if (!window.confirm("确认永久丢弃这份临时文件？此操作无法撤销。")) return;

    setRecoveryAction("discard");
    setRecoveryError("");
    autosavePausedRef.current = true;
    try {
      const [postResult, draftResult] = await Promise.all([
        refreshProjectArticles(),
        refreshDraftArticles(),
      ]);
      const requestedView = routeFromHash();
      let nextDraft = { ...emptyDraft };
      if (requestedView.name === "editor" && requestedView.id) {
        const article = postResult.articles?.find((candidate) => candidate.id === requestedView.id);
        if (article) nextDraft = draftFromArticle(article);
      } else if (requestedView.name === "editor" && requestedView.draftId) {
        const savedDraft = draftResult.drafts?.find((candidate) => candidate.id === requestedView.draftId);
        if (savedDraft) nextDraft = draftFromDraftArticle(savedDraft);
      }
      await deleteRecoveryFile();
      loadDraftIntoEditor(nextDraft);
      setRecovery(null);
      setRecoveryGateStatus("ready");
      notify("临时文件已丢弃");
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : "临时文件丢弃失败");
    } finally {
      autosavePausedRef.current = false;
      setRecoveryAction(null);
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
            <>
              <a className={activeNav === "drafts" ? "active" : ""} href="#drafts">草稿箱</a>
              <a className="editor-link" href="#editor">写文章 <span aria-hidden="true">↗</span></a>
            </>
          )}
        </nav>
      </header>

      {view.name === "editor" && editorEnabled && recoveryGateStatus !== "ready" && (
        <div className="recovery-gate" role="presentation">
          <section
            className="recovery-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recovery-dialog-title"
            aria-describedby="recovery-dialog-description"
          >
            <p className="section-kicker">EDITOR RECOVERY</p>
            {(recoveryGateStatus === "idle" || recoveryGateStatus === "checking") && (
              <>
                <h1 id="recovery-dialog-title">正在检查临时文件</h1>
                <p id="recovery-dialog-description">确认没有待处理的自动保存内容后，编辑器才会打开。</p>
              </>
            )}
            {recoveryGateStatus === "error" && (
              <>
                <h1 id="recovery-dialog-title">暂时不能打开编辑器</h1>
                <p id="recovery-dialog-description">为避免覆盖可能存在的临时文件，请先恢复本地保存服务。</p>
                <p className="recovery-error" role="alert">{recoveryError}</p>
                <div className="recovery-actions">
                  <button className="primary-button" type="button" onClick={() => void checkRecoveryFile()}>重新检查</button>
                </div>
              </>
            )}
            {recoveryGateStatus === "needs-action" && recovery && (
              <>
                <h1 id="recovery-dialog-title">发现未处理的临时文件</h1>
                <p id="recovery-dialog-description">
                  这是 {formatRecoveryTime(recovery.savedAt)} 自动保存的内容。请明确决定它的去向，处理前编辑器不会覆盖它。
                </p>
                <div className="recovery-summary">
                  <span>{recovery.draft.articleId ? "文章修改" : recovery.draft.draftId ? "草稿修改" : "新文章"}</span>
                  <strong>{recovery.draft.title.trim() || "未命名内容"}</strong>
                  <small>正文 {recovery.draft.content.length.toLocaleString("zh-CN")} 字符</small>
                  <p>{recovery.draft.content.trim().slice(0, 260) || "正文尚未填写"}</p>
                </div>
                {recoveryError && <p className="recovery-error" role="alert">{recoveryError}</p>}
                <div className="recovery-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void saveRecoveryAsDraft()}
                    disabled={recoveryAction !== null}
                  >
                    {recoveryAction === "draft" ? "正在存入草稿箱…" : "存入草稿箱"}
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void saveRecoveryAsPost()}
                    disabled={recoveryAction !== null || !recovery.draft.title.trim() || !recovery.draft.content.trim()}
                    title={!recovery.draft.title.trim() || !recovery.draft.content.trim() ? "需要完整的标题和正文" : undefined}
                  >
                    {recoveryAction === "post" ? "正在保存为正文…" : "保存为正文"}
                  </button>
                  <button
                    className="recovery-discard"
                    type="button"
                    onClick={() => void discardRecovery()}
                    disabled={recoveryAction !== null}
                  >
                    {recoveryAction === "discard" ? "正在丢弃…" : "丢弃临时文件"}
                  </button>
                </div>
                {(!recovery.draft.title.trim() || !recovery.draft.content.trim()) && (
                  <p className="recovery-note">临时内容不完整，只能先存入草稿箱或丢弃。</p>
                )}
              </>
            )}
          </section>
        </div>
      )}

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
          </>
        )}

        {view.name === "archive" && (
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

        {view.name === "drafts" && editorEnabled && (
          <section className="inner-page drafts-page">
            <PageIntro
              label="LOCAL DRAFTS"
              title="草稿箱"
              text="这里的 Markdown 只保存在本机 content/drafts，不会出现在公开文章列表或 Git 提交中。"
            />
            <div className="drafts-heading">
              <span>共 {draftArticles.length} 份本地草稿</span>
              <button className="primary-button" type="button" onClick={startNewDraft}>新建草稿</button>
            </div>
            <div className="draft-list">
              {draftArticles.map((savedDraft) => (
                <article className="draft-card" key={savedDraft.id}>
                  <div>
                    <p>{savedDraft.sourceArticleId ? "正式文章的修改草稿" : "未发布草稿"} · {savedDraft.date}</p>
                    <h2>{savedDraft.title || "未命名草稿"}</h2>
                    <span>{savedDraft.category} · {formatWordCount(savedDraft.content)} · {savedDraft.readTime}</span>
                  </div>
                  <button type="button" onClick={() => editSavedDraft(savedDraft)}>打开编辑</button>
                </article>
              ))}
            </div>
            {draftArticles.length === 0 && (
              <div className="drafts-empty">
                <p>草稿箱还是空的。编辑文章时点「存回草稿箱」，内容就会作为本地 Markdown 保存在这里。</p>
              </div>
            )}
          </section>
        )}

        {view.name === "editor" && editorEnabled && recoveryGateStatus === "ready" && (
          <section className="editor-page">
            <div className="editor-topbar">
              <div>
                <p className="section-kicker">QUIET EDITOR</p>
                <h1>{draft.draftId ? "编辑草稿" : draft.articleId ? "编辑文章" : "写一篇新文章"}</h1>
              </div>
              <div className="editor-actions">
                {(draft.articleId || draft.draftId) && <button className="secondary-button" type="button" onClick={startNewDraft}>新建文章</button>}
                <button className="secondary-button" type="button" onClick={saveToDraftBox} disabled={savingDraft || savingMarkdown}>
                  {savingDraft ? "正在保存草稿…" : draft.draftId ? "存回草稿箱" : "保存到草稿箱"}
                </button>
                <button className="primary-button" type="button" onClick={saveMarkdownToProject} disabled={savingMarkdown}>
                  {savingMarkdown ? "构建、提交并推送中…" : draft.articleId ? "正式保存修改" : "正式保存并发布"}
                </button>
              </div>
            </div>
            <p className={`editor-tip${autosaveFailed ? " autosave-failed" : ""}`}>
              草稿以 content/drafts 中的本地 Markdown 为准；正式保存会写入 content/posts，通过静态构建后提交并推送到 main。
              <span>{autosaveNotice}</span>
            </p>
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
                <input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: normalizeSlug(event.target.value) })} placeholder="留空则根据标题生成" disabled={Boolean(draft.articleId || draft.draftId)} />
                {slugDiffersFromTitle && (
                  <small className="slug-hint">标题与 Slug 不同：文章列表将显示标题，链接将继续使用此 Slug。</small>
                )}
              </label>
              <div className="editor-meta-side">
                <label>
                  <span>分类</span>
                  <input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="评论" />
                </label>
                <AiParticipationSlider
                  value={draft.aiParticipation}
                  onChange={(aiParticipation) => setDraft({ ...draft, aiParticipation })}
                />
              </div>
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
                    <span>{draft.originalDate || formatDate(new Date())} · {formatWordCount(draft.content)} · {readTime(draft.content)}</span>
                    <AiParticipationIndicator value={draft.aiParticipation} variant="label" />
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
          {editorEnabled && <a href="#drafts">草稿箱</a>}
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
          <AiParticipationIndicator value={article.aiParticipation} variant="dots" />
        </div>
        <h3><a href={`#article/${encodeURIComponent(article.id)}`}>{article.title}</a></h3>
        {article.excerpt && <p>{article.excerpt}</p>}
      </div>
      <div className="article-tail">
        <span>{formatWordCount(article.content)} · {article.readTime}</span>
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

function AiParticipationIndicator({ value, variant }: { value: AiParticipationLevel; variant: "dots" | "label" }) {
  const label = aiParticipationLabel(value);
  return (
    <span
      className={`ai-participation-indicator ai-participation-indicator--${variant}`}
      aria-label={`AI 参与度：${label}`}
      title={`AI 参与度：${label}`}
    >
      {AI_PARTICIPATION_LABELS.map((dotLabel, index) => {
        const active = index + 1 === value;
        if (active && variant === "label") {
          return <span className="ai-participation-label" key={dotLabel}>{dotLabel}</span>;
        }

        return (
          <span
            aria-hidden="true"
            className={`ai-participation-dot${active ? " active" : ""}`}
            key={dotLabel}
          />
        );
      })}
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
          <span>{article.date} · {formatWordCount(article.content)} · {article.readTime}</span>
          <AiParticipationIndicator value={article.aiParticipation} variant="label" />
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
