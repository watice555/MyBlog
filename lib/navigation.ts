export type View =
  | { name: "home" | "archive" | "about" | "drafts" }
  | { name: "editor"; id?: string; draftId?: string }
  | { name: "article"; id: string };

export function localEditorAvailable() {
  return typeof window !== "undefined" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(window.location.hostname);
}

export function subscribeToEditorEnvironment() {
  return () => {};
}

export function routeFromHash(): View {
  if (typeof window === "undefined") return { name: "home" };
  let value: string;
  try {
    value = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  } catch {
    return { name: "home" };
  }
  if (value.startsWith("article/")) return { name: "article", id: value.slice(8) };
  if (localEditorAvailable()) {
    if (value.startsWith("editor/draft/")) return { name: "editor", draftId: value.slice(13) };
    if (value.startsWith("editor/")) return { name: "editor", id: value.slice(7) };
    if (value === "editor" || value === "drafts") return { name: value };
  }
  return value === "archive" || value === "about" ? { name: value } : { name: "home" };
}
