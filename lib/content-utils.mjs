/** @param {unknown} value */
export function normalizeSlug(value) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("en-US")
    .replace(/[\s_]+/g, "-").replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
}

/** Count non-whitespace characters, matching the historical reading estimate.
 * @param {string} content */
export function countWords(content) {
  return content.replace(/\s/g, "").length;
}

/** @param {string} content */
export function calculateReadTime(content) {
  return `${Math.max(1, Math.ceil(countWords(content) / 400))} 分钟`;
}

/** @param {unknown} value @param {string} filename */
export function normalizeDate(value, filename) {
  const date = value instanceof Date && !Number.isNaN(value.valueOf())
    ? value.toISOString().slice(0, 10) : String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${filename}: date 必须使用 YYYY-MM-DD 格式`);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) throw new Error(`${filename}: date 不是有效日期`);
  return date;
}

/** @param {unknown} value @param {string} filename */
export function normalizeAiParticipation(value, filename) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) throw new Error(`${filename}: aiParticipation 必须是 1 到 5 之间的整数`);
  return value;
}

/** @param {string} value */
export function normalizeSearchText(value) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}
