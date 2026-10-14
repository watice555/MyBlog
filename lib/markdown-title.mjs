import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toString } from "mdast-util-to-string";

const parser = unified().use(remarkParse).use(remarkGfm);

/** Read the first top-level ATX H1; code, quotes, lists and Setext headings
 * cannot accidentally become the article title.
 * @param {string} source */
export function parseMarkdownTitle(source) {
  const heading = parser.parse(source).children.find((node) => {
    if (node.type !== "heading" || node.depth !== 1) return false;
    const start = node.position?.start.offset;
    return start !== undefined && /^ {0,3}#(?:[\t ]|\r?$)/.test(source.slice(start).split("\n", 1)[0]);
  });
  const start = heading?.position?.start.offset;
  const end = heading?.position?.end.offset;
  if (!heading || start === undefined || end === undefined) {
    return { title: "", body: source, start: null, end: null };
  }
  return {
    title: toString(heading, { includeHtml: false }).trim(),
    body: source.slice(0, start) + source.slice(end),
    start,
    end,
  };
}

/** The editor title field writes into Markdown rather than separate metadata.
 * @param {string} source @param {string} title */
export function setMarkdownTitle(source, title) {
  const { start, end } = parseMarkdownTitle(source);
  const text = title.replace(/[\r\n]+/g, " ");
  const escaped = text.replace(/[\\`*_{}[\]<>~#]/g, "\\$&");
  const heading = text.trim() ? `# ${escaped}` : "";
  if (start !== null && end !== null) return source.slice(0, start) + heading + source.slice(end);
  return heading ? heading + (source ? `\n\n${source}` : "") : source;
}
