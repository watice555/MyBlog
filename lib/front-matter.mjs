import matter from "gray-matter";
import yaml from "js-yaml";

/** Parse only YAML with scalar dates preserved for real calendar validation.
 * @param {string} markdown @param {string} filename
 * @returns {{data: Record<string, unknown>, content: string}} */
export function parseFrontMatter(markdown, filename) {
  if (!/^---\r?\n/.test(markdown)) throw new Error(`${filename}: Markdown 必须以 “---” Front Matter 开头`);
  try {
    const parsed = matter(markdown, {
      engines: { yaml: (source) => {
        const data = yaml.load(source, { schema: yaml.JSON_SCHEMA });
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Front Matter 必须是字段映射");
        return data;
      } },
    });
    if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) throw new Error("Front Matter 必须是字段映射");
    return { data: parsed.data, content: parsed.content };
  } catch (error) {
    throw new Error(`${filename}: Front Matter 解析失败：${error instanceof Error ? error.message : error}`);
  }
}
