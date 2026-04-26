/** DB enum public.mahjong_variant — 與 migration 同步 */
export const MAHJONG_VARIANT_VALUES = [
  "zheng_hua_zheng_zi",
  "jian_hua_jian_zi",
  "american",
  "riichi",
  "hong_kong",
] as const;

export type MahjongVariant = (typeof MAHJONG_VARIANT_VALUES)[number];

export function parseMahjongVariant(raw: string): MahjongVariant | null {
  const t = raw.trim();
  return (MAHJONG_VARIANT_VALUES as readonly string[]).includes(t)
    ? (t as MahjongVariant)
    : null;
}

export function mahjongVariantLabel(v: string | null | undefined): string {
  if (!v) return "";
  switch (v) {
    case "zheng_hua_zheng_zi":
      return "正花正字";
    case "jian_hua_jian_zi":
      return "見花見字";
    case "american":
      return "美麻";
    case "riichi":
      return "日麻";
    case "hong_kong":
      return "港麻";
    default:
      return v;
  }
}
