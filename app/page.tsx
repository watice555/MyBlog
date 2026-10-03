"use client";

import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { generatedPosts } from "./generated-posts";
import { localEditorAvailable, routeFromHash, subscribeToEditorEnvironment, type View } from "../lib/navigation";
import { articlePath, siteTitle } from "../lib/site";
import { HomeView, ArchiveView, AboutView } from "./components/home-views";
import { SiteHeader, SiteFooter } from "./components/site-chrome";
import { useArticleSearch } from "./hooks/use-article-search";

const LocalWorkspace = lazy(() => import("./components/local-workspace"));

export default function Home() {
  const [view, setView] = useState<View>({ name: "home" });
  const [workspaceOpened, setWorkspaceOpened] = useState(false);
  const editorEnabled = useSyncExternalStore(subscribeToEditorEnvironment, localEditorAvailable, () => false);
  const search = useArticleSearch(generatedPosts);

  useEffect(() => {
    const syncRoute = () => {
      const route = routeFromHash();
      if (route.name === "article") {
        window.location.replace(articlePath(route.id));
        return;
      }
      setView(route);
      if (route.name === "editor" || route.name === "drafts") setWorkspaceOpened(true);
      const title = { home: siteTitle, archive: "文章归档｜凝泠", about: "关于凝泠｜凝泠", editor: "编辑器｜凝泠", drafts: "草稿箱｜凝泠" }[route.name];
      document.title = title;
    };
    syncRoute();
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  return <div className={`site-shell${view.name === "home" ? " home-layout" : ""}`}>
    <SiteHeader active={view.name} editorEnabled={editorEnabled} />
    <main>
      {view.name === "home" && <HomeView articles={generatedPosts} />}
      {view.name === "archive" && <ArchiveView articles={generatedPosts} {...search} />}
      {view.name === "about" && <AboutView />}
      {editorEnabled && workspaceOpened && <Suspense fallback={<p className="inner-page" role="status">正在打开本地编辑器…</p>}>
        <LocalWorkspace />
      </Suspense>}
    </main>
    <SiteFooter editorEnabled={editorEnabled} />
  </div>;
}
