"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { normalizeSlug, countWords } from "../../lib/content-utils.mjs";
import { localEditorAvailable, subscribeToEditorEnvironment, routeFromHash, type View } from "../../lib/navigation";

export type AiParticipationLevel = 1 | 2 | 3 | 4 | 5;

export type Article = {
  id: string;
  title: string;
  excerpt: string;
  category: string;
  aiParticipation: AiParticipationLevel;
  date: string;
  readTime: string;
  content: string;
  dateISO?: string;
  wordCount?: number;
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

export function formatRecoveryTime(savedAt: string) {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return savedAt;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function formatDate(date: Date) {
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).replaceAll("/", ".");
}

export function formatWordCount(text: string) {
  return `${countWords(text).toLocaleString("zh-CN")} 字`;
}

function draftFromArticle(article: Article): Draft {
  return {
    articleId: article.id,
    originalDate: article.dateISO || article.date,
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


export function useLocalEditor() {
  const [view, setView] = useState<View>({ name: "home" });
  const [projectArticles, setProjectArticles] = useState<Article[]>([]);
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
    if (!editorEnabled) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (draftSignature(draftRef.current) === autosaveBaselineRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [editorEnabled]);

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


  return { view, draftArticles, draft, setDraft, toast, summarizing, proofreading, proofreadingSuggestions, setProofreadingSuggestions, savingMarkdown, savingDraft, uploadingImage, recovery, recoveryGateStatus, recoveryError, recoveryAction, autosaveNotice, autosaveFailed, markdownTextareaRef, imageInputRef, localAiEnabled, slugDiffersFromTitle, editorEnabled, checkRecoveryFile, editSavedDraft, startNewDraft, summarizeDraft, proofreadDraft, uploadImage, saveToDraftBox, saveMarkdownToProject, saveRecoveryAsDraft, saveRecoveryAsPost, discardRecovery };
}
