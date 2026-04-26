"use client";

import { useEffect } from "react";

const STORAGE_KEY = "mj-games-geo-session";

/**
 * 若 URL 尚未帶縣市，嘗試用瀏覽器定位 + `/api/geo/reverse` 預填縣市/行政區（仍須先選縣市才能選區；預設會兩個都帶上）。
 * 同一分頁工作階段只嘗試一次，避免重複跳轉或反覆要權限。
 */
export function GamesLocationPrefill({ hasCounty }: { hasCounty: boolean }) {
  useEffect(() => {
    if (hasCounty) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(STORAGE_KEY)) return;

    if (!("geolocation" in navigator)) {
      sessionStorage.setItem(STORAGE_KEY, "1");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const r = await fetch(
            `/api/geo/reverse?lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}`,
          );
          if (!r.ok) {
            sessionStorage.setItem(STORAGE_KEY, "1");
            return;
          }
          const data = (await r.json()) as {
            county?: string | null;
            district?: string | null;
          };
          const county = typeof data.county === "string" ? data.county.trim() : "";
          if (!county) {
            sessionStorage.setItem(STORAGE_KEY, "1");
            return;
          }
          const params = new URLSearchParams(window.location.search);
          if (params.get("county")) {
            sessionStorage.setItem(STORAGE_KEY, "1");
            return;
          }
          params.set("county", county);
          const d =
            typeof data.district === "string" ? data.district.trim() : "";
          if (d) params.set("district", d);
          sessionStorage.setItem(STORAGE_KEY, "1");
          window.location.replace(`${window.location.pathname}?${params.toString()}`);
        } catch {
          sessionStorage.setItem(STORAGE_KEY, "1");
        }
      },
      () => {
        sessionStorage.setItem(STORAGE_KEY, "1");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, [hasCounty]);

  return null;
}
