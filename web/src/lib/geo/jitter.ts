function metersToLatDegrees(meters: number) {
  return meters / 111_320;
}

function metersToLngDegrees(meters: number, latDeg: number) {
  const latRad = (latDeg * Math.PI) / 180;
  const metersPerDeg = 111_320 * Math.cos(latRad);
  if (metersPerDeg <= 0) return 0;
  return meters / metersPerDeg;
}

function randBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/** 對座標做隨機偏移（約 100～200 公尺），用於公開地圖 pin。 */
export function jitterLatLng(params: {
  lat: number;
  lng: number;
  minMeters?: number;
  maxMeters?: number;
}) {
  const minMeters = params.minMeters ?? 100;
  const maxMeters = params.maxMeters ?? 200;
  const r = randBetween(minMeters, maxMeters);
  const theta = randBetween(0, Math.PI * 2);

  const dNorth = r * Math.cos(theta);
  const dEast = r * Math.sin(theta);

  const dLat = metersToLatDegrees(dNorth);
  const dLng = metersToLngDegrees(dEast, params.lat);

  return {
    lat: params.lat + dLat,
    lng: params.lng + dLng,
  };
}

