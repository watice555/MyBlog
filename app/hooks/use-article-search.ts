"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ArticleMetadata } from "../components/home-views";
import { normalizeSearchText } from "../../lib/content-utils.mjs";

type SearchIndex = Map<string, string>;
let cachedIndex: Promise<SearchIndex> | null = null;

function loadSearchIndex() {
  if (!cachedIndex) {
    cachedIndex = fetch("./search-index.json").then(async (response) => {
      if (!response.ok) throw new Error("搜索索引加载失败");
      const entries: unknown = await response.json();
      if (!Array.isArray(entries) || entries.some((entry) => !entry || typeof entry.id !== "string" || typeof entry.text !== "string")) {
        throw new Error("搜索索引格式无效");
      }
      return new Map(entries.map(({ id, text }) => [id, text]));
    }).catch((error) => {
      cachedIndex = null;
      throw error;
    });
  }
  return cachedIndex;
}

export function useArticleSearch(articles: readonly ArticleMetadata[]) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const keyword = normalizeSearchText(searchQuery).trim();
  const categories = useMemo(() => Array.from(new Set(articles.map((article) => article.category))).filter(Boolean), [articles]);

  useEffect(() => {
    if (!keyword || index) return;
    let cancelled = false;
    void loadSearchIndex().then((loaded) => {
      if (articles.some((article) => !loaded.has(article.id))) throw new Error("搜索索引不完整");
      if (!cancelled) { setIndex(loaded); setFailed(false); }
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [keyword, index, articles, attempt]);

  const retrySearch = useCallback(() => {
    cachedIndex = null;
    setFailed(false);
    setAttempt((value) => value + 1);
  }, []);
  const searchStatus = !keyword ? "idle" : index ? "ready" : failed ? "error" : "loading";
  const filteredArticles = useMemo(() => articles.filter((article) =>
    (!selectedCategory || article.category === selectedCategory) &&
    (!keyword || Boolean(index?.get(article.id)?.includes(keyword))),
  ), [articles, selectedCategory, keyword, index]);

  return { searchQuery, setSearchQuery, selectedCategory, setSelectedCategory, categories, filteredArticles, searchStatus, retrySearch };
}
