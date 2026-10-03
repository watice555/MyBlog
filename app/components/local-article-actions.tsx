"use client";

import { useSyncExternalStore } from "react";
import { localEditorAvailable, subscribeToEditorEnvironment } from "../../lib/navigation";

export function LocalArticleActions({ id }: { id: string }) {
  const enabled = useSyncExternalStore(subscribeToEditorEnvironment, localEditorAvailable, () => false);
  return enabled ? <a href={`../../#editor/${encodeURIComponent(id)}`}>编辑文章</a> : null;
}
