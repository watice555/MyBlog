import { memo } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { PluggableList } from "unified";
import { resolvePostUrl } from "../../lib/site";

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins: PluggableList = [[rehypeKatex, { trust: false }]];
const components: Components = {
  table: ({ children, ...props }) => <div className="table-scroll"><table {...props}>{children}</table></div>,
};

export function normalizeMathDelimiters(source: string) {
  return source.replace(/(^|[^\\])\$(?=\d|[A-Z][A-Z0-9]{1,}\b)/gm, (_match, prefix: string) => `${prefix}\\$`)
    .replace(/^([ \t]*)\\\[\s*$/gm, (_match, indentation: string) => `${indentation}$$`)
    .replace(/^([ \t]*)\\\]\s*$/gm, (_match, indentation: string) => `${indentation}$$`)
    .replace(/\\\((.+?)\\\)/g, (_match, expression: string) => `$${expression}$`);
}

/** No raw HTML; URL sanitation runs before resolving portable post asset paths. */
export const Markdown = memo(function Markdown({ source, root = "./" }: { source: string; root?: string }) {
  return <div className="prose"><ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}
    components={components} urlTransform={(url) => {
      const safe = defaultUrlTransform(url);
      return safe ? resolvePostUrl(safe, root) : "";
    }}>{normalizeMathDelimiters(source)}</ReactMarkdown></div>;
});
