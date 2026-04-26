import { twCountyDistrictFromNominatimAddress } from "@/lib/geo/tw-address-from-nominatim";

type NominatimReverse = {
  address?: Record<string, string>;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const latRaw = url.searchParams.get("lat");
  const lonRaw = url.searchParams.get("lon");
  const lat = latRaw ? Number(latRaw) : NaN;
  const lon = lonRaw ? Number(lonRaw) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json({ error: "invalid_lat_lon" }, { status: 400 });
  }

  const nominatimUrl = new URL("https://nominatim.openstreetmap.org/reverse");
  nominatimUrl.searchParams.set("format", "jsonv2");
  nominatimUrl.searchParams.set("lat", String(lat));
  nominatimUrl.searchParams.set("lon", String(lon));
  nominatimUrl.searchParams.set("accept-language", "zh-TW");

  const res = await fetch(nominatimUrl.toString(), {
    headers: {
      "User-Agent": "MJ-Mahjong/1.0 (https://mjwar.zeabur.app)",
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    return Response.json(
      { error: "nominatim_failed", status: res.status },
      { status: 502 },
    );
  }

  const body = (await res.json()) as NominatimReverse;
  const { county, district } = twCountyDistrictFromNominatimAddress(
    body.address,
  );

  return Response.json({ county, district });
}
