/** Normalize common TW variants for matching user-entered 縣市/區名 */
export function normalizeTwAdminLabel(s: string): string {
  return s.trim().replaceAll("臺", "台");
}

type NominatimAddr = Record<string, string | undefined>;

/**
 * Best-effort map Nominatim `address` object to TW 縣市 + 行政區 labels.
 * Structure varies by area; we try several keys used for Taiwan.
 */
export function twCountyDistrictFromNominatimAddress(
  address: NominatimAddr | null | undefined,
): { county: string | null; district: string | null } {
  if (!address || typeof address !== "object") {
    return { county: null, district: null };
  }

  const countyCandidates = [
    address.city,
    address.county,
    address.state,
    address.municipality,
    address.region,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);

  let county: string | null = null;
  for (const raw of countyCandidates) {
    const n = normalizeTwAdminLabel(raw);
    if (/(市|縣)$/.test(n)) {
      county = n;
      break;
    }
  }
  if (!county) {
    const fallback = countyCandidates[0];
    county = fallback ? normalizeTwAdminLabel(fallback) : null;
  }

  const districtCandidates = [
    address.suburb,
    address.city_district,
    address.town,
    address.village,
    address.quarter,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);

  let district: string | null = null;
  for (const raw of districtCandidates) {
    const n = normalizeTwAdminLabel(raw);
    if (county && n === county) continue;
    if (/(區|鄉|鎮)$/.test(n) || /市$/.test(n)) {
      district = n;
      break;
    }
  }

  return { county, district };
}
