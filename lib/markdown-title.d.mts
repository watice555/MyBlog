export function parseMarkdownTitle(source: string): {
  title: string;
  body: string;
  start: number | null;
  end: number | null;
};
export function setMarkdownTitle(source: string, title: string): string;
