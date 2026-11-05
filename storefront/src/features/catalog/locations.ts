import type { Location } from "./prefs-context";

export interface LocationPreset {
  id: string;
  name: string;
  shortName: string;
  zone: "Central" | "East" | "South" | "North & West";
  landmark: string;
  lat: number;
  lng: number;
  tags: string[];
}

export interface KitchenCoveragePin {
  id: string;
  name: string;
  cuisine: string;
  tierLabel: string;
  lat: number;
  lng: number;
  deliveryRadiusMeters: number;
}

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export const BENGALURU_MAP_BOUNDS: MapBounds = {
  minLat: 12.925,
  maxLat: 13.015,
  minLng: 77.555,
  maxLng: 77.645,
};

export const BENGALURU_PRESETS: LocationPreset[] = [
  {
    id: "mg-road",
    name: "MG Road & Cubbon Park",
    shortName: "MG Road",
    zone: "Central",
    landmark: "Brigade Rd · Church Street · 560001",
    lat: 12.9716,
    lng: 77.5946,
    tags: ["central", "mg road", "cubbon park", "brigade", "church street", "560001", "bengaluru"],
  },
  {
    id: "richmond-town",
    name: "Richmond & Shanti Nagar",
    shortName: "Richmond Town",
    zone: "Central",
    landmark: "Richmond Circle · Langford Rd · 560025",
    lat: 12.9635,
    lng: 77.5985,
    tags: ["central", "richmond", "shanti nagar", "langford", "560025", "lavelle"],
  },
  {
    id: "indiranagar",
    name: "Indiranagar & Ulsoor",
    shortName: "Indiranagar",
    zone: "East",
    landmark: "100 Feet Rd · Ulsoor Lake · 560038",
    lat: 12.9784,
    lng: 77.618,
    tags: ["east", "indiranagar", "ulsoor", "100ft", "halasuru", "domlur", "560038"],
  },
  {
    id: "malleshwaram",
    name: "Malleshwaram & Rajajinagar",
    shortName: "Malleshwaram",
    zone: "North & West",
    landmark: "8th Cross · Sampige Rd · 560003",
    lat: 12.9915,
    lng: 77.5712,
    tags: ["north", "west", "malleshwaram", "rajajinagar", "sampige", "majestic", "560003"],
  },
  {
    id: "jayanagar-lalbagh",
    name: "Lalbagh & Jayanagar",
    shortName: "Jayanagar",
    zone: "South",
    landmark: "Lalbagh West Gate · 4th Block · 560011",
    lat: 12.948,
    lng: 77.5838,
    tags: ["south", "jayanagar", "lalbagh", "basavanagudi", "jp nagar", "560011", "560004"],
  },
  {
    id: "koramangala",
    name: "Koramangala 5th Block",
    shortName: "Koramangala",
    zone: "South",
    landmark: "80 Feet Rd · Sony World · 560095",
    lat: 12.9352,
    lng: 77.6245,
    tags: ["south", "koramangala", "hsr", "ejipura", "forum", "560095", "560034"],
  },
  {
    id: "sadashivanagar",
    name: "Sadashivanagar & Sankey",
    shortName: "Sadashivanagar",
    zone: "North & West",
    landmark: "Sankey Tank · Palace Orchards · 560080",
    lat: 13.0068,
    lng: 77.5813,
    tags: ["north", "sadashivanagar", "sankey", "hebbal", "mekhri", "560080"],
  },
  {
    id: "whitefield",
    name: "Whitefield ITPL",
    shortName: "Whitefield",
    zone: "East",
    landmark: "ITPL Main Rd · Hoodi · 560066",
    lat: 12.9698,
    lng: 77.7499,
    tags: ["east", "whitefield", "itpl", "marathahalli", "hoodi", "560066"],
  },
];

export const PARTNER_KITCHEN_PINS: KitchenCoveragePin[] = [
  {
    id: "rest-saffron-1",
    name: "Saffron Pure Veg Bhavan",
    cuisine: "South Indian",
    tierLabel: "Tier 1 · Pure Veg",
    lat: 12.975,
    lng: 77.605,
    deliveryRadiusMeters: 6000,
  },
  {
    id: "rest-green-2",
    name: "Green Leaf Vegan Kitchen",
    cuisine: "Vegan",
    tierLabel: "Tier 1 · Pure Veg",
    lat: 12.96,
    lng: 77.59,
    deliveryRadiusMeters: 5000,
  },
  {
    id: "rest-jain-3",
    name: "Jain Rasoi",
    cuisine: "Gujarati / Jain",
    tierLabel: "Tier 1 · Pure Veg",
    lat: 12.985,
    lng: 77.58,
    deliveryRadiusMeters: 5000,
  },
  {
    id: "rest-spice-4",
    name: "Spice Route Kitchen",
    cuisine: "North Indian",
    tierLabel: "Tier 2 · Segregated",
    lat: 12.97,
    lng: 77.6,
    deliveryRadiusMeters: 4000,
  },
];

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "—";
  if (km < 0.15) return "Here";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function countDeliverableKitchens(
  lat: number,
  lng: number,
  kitchens: KitchenCoveragePin[] = PARTNER_KITCHEN_PINS,
): { count: number; total: number; matchingKitchens: KitchenCoveragePin[] } {
  const matchingKitchens = kitchens.filter((k) => {
    const meters = distanceKm(lat, lng, k.lat, k.lng) * 1000;
    return meters <= k.deliveryRadiusMeters;
  });
  return {
    count: matchingKitchens.length,
    total: kitchens.length,
    matchingKitchens,
  };
}

export function latLngToMapPercent(
  lat: number,
  lng: number,
  bounds: MapBounds = BENGALURU_MAP_BOUNDS,
): { xPercent: number; yPercent: number; inBounds: boolean } {
  const rawX = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
  // Higher latitude is further North (top of map -> smaller yPercent)
  const rawY = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 100;
  const inBounds = rawX >= 0 && rawX <= 100 && rawY >= 0 && rawY <= 100;
  const clamp = (v: number) => Math.max(4, Math.min(96, Math.round(v * 10) / 10));
  return {
    xPercent: clamp(rawX),
    yPercent: clamp(rawY),
    inBounds,
  };
}

export function mapPercentToLatLng(
  xPercent: number,
  yPercent: number,
  bounds: MapBounds = BENGALURU_MAP_BOUNDS,
): { lat: number; lng: number } {
  const clampedX = Math.max(0, Math.min(100, xPercent));
  const clampedY = Math.max(0, Math.min(100, yPercent));
  const lng = bounds.minLng + (clampedX / 100) * (bounds.maxLng - bounds.minLng);
  const lat = bounds.maxLat - (clampedY / 100) * (bounds.maxLat - bounds.minLat);
  return {
    lat: Math.round(lat * 10000) / 10000,
    lng: Math.round(lng * 10000) / 10000,
  };
}

export function resolveNearestPreset(
  lat: number,
  lng: number,
  presets: LocationPreset[] = BENGALURU_PRESETS,
): { preset: LocationPreset; distanceKm: number; suggestedLabel: string } {
  let best = presets[0];
  let bestDist = Infinity;
  for (const p of presets) {
    const d = distanceKm(lat, lng, p.lat, p.lng);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  let suggestedLabel: string;
  if (bestDist <= 0.6) {
    suggestedLabel = best.shortName;
  } else if (bestDist <= 3.5) {
    suggestedLabel = `Near ${best.shortName}`;
  } else {
    suggestedLabel = `Pinned (${lat.toFixed(3)}, ${lng.toFixed(3)})`;
  }
  return { preset: best, distanceKm: bestDist, suggestedLabel };
}

export function parseCoordinateInput(raw: string): { lat: number; lng: number } | null {
  const trimmed = raw.trim();
  const match = /^([+-]?\d+(?:\.\d+)?)\s*[,;\s]\s*([+-]?\d+(?:\.\d+)?)$/.exec(trimmed);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    lat: Math.round(lat * 10000) / 10000,
    lng: Math.round(lng * 10000) / 10000,
  };
}

export function validateCoordinates(
  latInput: string | number,
  lngInput: string | number,
): { ok: true; lat: number; lng: number } | { ok: false; error: string } {
  const latStr = String(latInput).trim();
  const lngStr = String(lngInput).trim();
  if (!latStr || !lngStr) {
    return { ok: false, error: "Enter both latitude and longitude." };
  }
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: "Coordinates must be valid decimal numbers." };
  }
  if (Math.abs(lat) > 90) {
    return { ok: false, error: "Latitude must be between -90 and 90." };
  }
  if (Math.abs(lng) > 180) {
    return { ok: false, error: "Longitude must be between -180 and 180." };
  }
  return {
    ok: true,
    lat: Math.round(lat * 10000) / 10000,
    lng: Math.round(lng * 10000) / 10000,
  };
}

export function filterLocationPresets(
  query: string,
  presets: LocationPreset[] = BENGALURU_PRESETS,
): LocationPreset[] {
  const q = query.trim().toLowerCase();
  if (!q) return presets;
  const tokens = q.split(/\s+/).filter(Boolean);
  return presets.filter((p) => {
    const haystack = [p.name, p.shortName, p.zone, p.landmark, ...p.tags].join(" ").toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}

export function pushRecentLocation(
  recent: Location[],
  next: Location,
  maxItems = 4,
): Location[] {
  const isSame = (a: Location, b: Location) =>
    (Math.abs(a.lat - b.lat) < 0.0005 && Math.abs(a.lng - b.lng) < 0.0005) ||
    a.label.trim().toLowerCase() === b.label.trim().toLowerCase();

  const filtered = recent.filter((item) => !isSame(item, next));
  return [next, ...filtered].slice(0, maxItems);
}
