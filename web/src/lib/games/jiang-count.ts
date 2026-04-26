/** 與 DB check constraint games_jiang_count_check 一致 */
export const JIANG_COUNT_MIN = 1;
export const JIANG_COUNT_MAX = 20;

export function parseJiangCountForm(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Math.trunc(Number(t));
  if (!Number.isFinite(n) || n < JIANG_COUNT_MIN || n > JIANG_COUNT_MAX) {
    return null;
  }
  return n;
}

export const JIANG_COUNT_OPTIONS = Array.from(
  { length: JIANG_COUNT_MAX - JIANG_COUNT_MIN + 1 },
  (_, i) => JIANG_COUNT_MIN + i,
);
