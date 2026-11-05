import {
  BENGALURU_PRESETS,
  countDeliverableKitchens,
  distanceKm,
  resolveNearestPreset,
} from "./locations";

export interface AddressSuggestion {
  id: string;
  title: string;
  subtitle: string;
  formattedAddress: string;
  pincode: string | null;
  locality: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  source: "photon" | "local";
  deliverableKitchens: number;
  distanceKm?: number;
}

interface CuratedStreetEntry {
  id: string;
  title: string;
  locality: string;
  pincode: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  keywords: string[];
}

export const CURATED_INDIA_ADDRESS_INDEX: CuratedStreetEntry[] = [
  {
    id: "addr-mg-brigade",
    title: "Brigade Road & Church Street",
    locality: "MG Road",
    pincode: "560001",
    city: "Bengaluru",
    state: "Karnataka",
    lat: 12.9716,
    lng: 77.5946,
    keywords: ["mg road", "brigade road", "church street", "cubbon park", "560001", "central"],
  },
  {
    id: "addr-indiranagar-100ft",
    title: "100 Feet Road, HAL 2nd Stage",
    locality: "Indiranagar",
    pincode: "560038",
    city: "Bengaluru",
    state: "Karnataka",
    lat: 12.9784,
    lng: 77.618,
    keywords: ["indiranagar", "100 feet", "hal 2nd stage", "cmh road", "ulsoor", "560038"],
  },
  {
    id: "addr-koramangala-4th",
    title: "80 Feet Road, Koramangala 4th Block",
    locality: "Koramangala",
    pincode: "560034",
    city: "Bengaluru",
    state: "Karnataka",
    lat: 12.9352,
    lng: 77.6245,
    keywords: ["koramangala", "80 feet", "4th block", "5th block", "sony world", "560034", "560095"],
  },
  {
    id: "addr-jayanagar-4th",
    title: "11th Main Road, Jayanagar 4th Block",
    locality: "Jayanagar",
    pincode: "560011",
    city: "Bengaluru",
    state: "Karnataka",
    lat: 12.948,
    lng: 77.5838,
    keywords: ["jayanagar", "4th block", "lalbagh", "basavanagudi", "560011", "560004"],
  },
  {
    id: "addr-malleshwaram-8th",
    title: "Sampige Road, 8th Cross",
    locality: "Malleshwaram",
    pincode: "560003",
    city: "Bengaluru",
    state: "Karnataka",
    lat: 12.9915,
    lng: 77.5712,
    keywords: ["malleshwaram", "sampige", "8th cross", "margosa", "mantri square", "560003"],
  },
  {
    id: "addr-richmond-circle",
    title: "Langford Gardens & Lavelle Road",
    locality: "Richmond Town",
    pincode: "560025",
    city: "Bengaluru",
    state: "Karnataka",
    lat: 12.9635,
    lng: 77.5985,
    keywords: ["richmond", "langford", "lavelle", "ub city", "shanti nagar", "560025"],
  },
  {
    id: "addr-sadashivanagar-sankey",
    title: "Sankey Tank Main Road, Palace Orchards",
    locality: "Sadashivanagar",
    pincode: "560080",
    city: "Bengaluru",
    state: "Karnataka",
    lat: 13.0068,
    lng: 77.5813,
    keywords: ["sadashivanagar", "sankey", "palace orchards", "mekhri", "560080"],
  },
  {
    id: "addr-hsr-sector2",
    title: "27th Main Road, HSR Layout Sector 2",
    locality: "HSR Layout",
    pincode: "560102",
    city: "Bengaluru",
    state: "Karnataka",
    lat: 12.9121,
    lng: 77.6446,
    keywords: ["hsr", "hsr layout", "sector 2", "27th main", "agara", "560102"],
  },
  {
    id: "addr-whitefield-prestige",
    title: "Prestige Shantiniketan, ITPL Main Road",
    locality: "Whitefield",
    pincode: "560048",
    city: "Bengaluru",
    state: "Karnataka",
    lat: 12.9698,
    lng: 77.7499,
    keywords: ["whitefield", "prestige shantiniketan", "itpl", "hoodi", "560048", "560066"],
  },
  {
    id: "addr-jpnagar-phase2",
    title: "15th Cross, JP Nagar 2nd Phase",
    locality: "JP Nagar",
    pincode: "560078",
    city: "Bengaluru",
    state: "Karnataka",
    lat: 12.9141,
    lng: 77.5856,
    keywords: ["jp nagar", "2nd phase", "15th cross", "ragigudda", "560078"],
  },
  {
    id: "addr-frazer-town",
    title: "Mosque Road & Coles Park",
    locality: "Frazer Town",
    pincode: "560005",
    city: "Bengaluru",
    state: "Karnataka",
    lat: 12.9968,
    lng: 77.613,
    keywords: ["frazer town", "pulikeshi nagar", "coles park", "cox town", "560005"],
  },
  {
    id: "addr-basavanagudi-bull",
    title: "Bull Temple Road & Gandhi Bazaar",
    locality: "Basavanagudi",
    pincode: "560004",
    city: "Bengaluru",
    state: "Karnataka",
    lat: 12.9422,
    lng: 77.5737,
    keywords: ["basavanagudi", "gandhi bazaar", "bull temple", "dvg road", "560004"],
  },
];

function enrichSuggestion(
  base: Omit<AddressSuggestion, "deliverableKitchens" | "distanceKm">,
  originLat?: number,
  originLng?: number,
): AddressSuggestion {
  const coverage = countDeliverableKitchens(base.lat, base.lng);
  const dist =
    originLat !== undefined && originLng !== undefined
      ? distanceKm(originLat, originLng, base.lat, base.lng)
      : undefined;
  return {
    ...base,
    deliverableKitchens: coverage.count,
    ...(dist !== undefined ? { distanceKm: dist } : {}),
  };
}

/**
 * Parses a Komoot Photon GeoJSON FeatureCollection into structured Indian address suggestions.
 */
export function parsePhotonGeoJson(
  payload: unknown,
  originLat?: number,
  originLng?: number,
): AddressSuggestion[] {
  if (!payload || typeof payload !== "object") return [];
  const features = (payload as { features?: unknown[] }).features;
  if (!Array.isArray(features)) return [];

  const results: AddressSuggestion[] = [];
  for (let i = 0; i < features.length; i++) {
    const f = features[i] as {
      geometry?: { coordinates?: [number, number] };
      properties?: Record<string, unknown>;
    };
    const coords = f?.geometry?.coordinates;
    const props = f?.properties;
    if (!Array.isArray(coords) || coords.length < 2 || !props) continue;

    const lng = Math.round(Number(coords[0]) * 10000) / 10000;
    const lat = Math.round(Number(coords[1]) * 10000) / 10000;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const name = typeof props.name === "string" ? props.name.trim() : "";
    const street = typeof props.street === "string" ? props.street.trim() : "";
    const housenumber = typeof props.housenumber === "string" ? props.housenumber.trim() : "";
    const district =
      (typeof props.district === "string" && props.district.trim()) ||
      (typeof props.suburb === "string" && props.suburb.trim()) ||
      (typeof props.locality === "string" && props.locality.trim()) ||
      "";
    const city =
      (typeof props.city === "string" && props.city.trim()) ||
      (typeof props.county === "string" && props.county.trim()) ||
      "Bengaluru";
    const state = (typeof props.state === "string" && props.state.trim()) || "Karnataka";
    const postcode = typeof props.postcode === "string" ? props.postcode.trim() : null;

    const primaryTitle =
      name ||
      (housenumber && street ? `${housenumber} ${street}` : street) ||
      district ||
      city;
    if (!primaryTitle) continue;

    const locality = district || primaryTitle;
    const subtitleParts = [district && district !== primaryTitle ? district : null, city, postcode]
      .filter(Boolean)
      .join(" · ");
    const subtitle = subtitleParts || `${city}, ${state}`;
    const formattedAddress = [primaryTitle, district && district !== primaryTitle ? district : null, city, postcode]
      .filter(Boolean)
      .join(", ");

    results.push(
      enrichSuggestion(
        {
          id: `photon-${props.osm_id ?? i}-${lat}-${lng}`,
          title: primaryTitle,
          subtitle,
          formattedAddress,
          pincode: postcode,
          locality,
          city,
          state,
          lat,
          lng,
          source: "photon",
        },
        originLat,
        originLng,
      ),
    );
  }
  return results;
}

/**
 * Searches our curated street, society, landmark, and PIN code index.
 */
export function searchLocalAddressIndex(
  query: string,
  originLat?: number,
  originLng?: number,
): AddressSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return CURATED_INDIA_ADDRESS_INDEX.slice(0, 6).map((entry) =>
      enrichSuggestion(
        {
          id: entry.id,
          title: entry.title,
          subtitle: `${entry.locality} · ${entry.city} · ${entry.pincode}`,
          formattedAddress: `${entry.title}, ${entry.locality}, ${entry.city} ${entry.pincode}`,
          pincode: entry.pincode,
          locality: entry.locality,
          city: entry.city,
          state: entry.state,
          lat: entry.lat,
          lng: entry.lng,
          source: "local",
        },
        originLat,
        originLng,
      ),
    );
  }

  const tokens = q.split(/[\s,]+/).filter(Boolean);
  const matches = CURATED_INDIA_ADDRESS_INDEX.filter((entry) => {
    const haystack = [
      entry.title,
      entry.locality,
      entry.pincode,
      entry.city,
      entry.state,
      ...entry.keywords,
    ]
      .join(" ")
      .toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });

  return matches.map((entry) =>
    enrichSuggestion(
      {
        id: entry.id,
        title: entry.title,
        subtitle: `${entry.locality} · ${entry.city} · ${entry.pincode}`,
        formattedAddress: `${entry.title}, ${entry.locality}, ${entry.city} ${entry.pincode}`,
        pincode: entry.pincode,
        locality: entry.locality,
        city: entry.city,
        state: entry.state,
        lat: entry.lat,
        lng: entry.lng,
        source: "local",
      },
      originLat,
      originLng,
    ),
  );
}

/**
 * Merges and deduplicates Photon OSM suggestions with curated local suggestions.
 */
export function mergeAddressSuggestions(
  photonResults: AddressSuggestion[],
  localResults: AddressSuggestion[],
  limit = 6,
): AddressSuggestion[] {
  const combined: AddressSuggestion[] = [];
  const seen = new Set<string>();

  for (const item of [...localResults, ...photonResults]) {
    const key = `${item.title.toLowerCase()}|${item.lat.toFixed(2)}|${item.lng.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(item);
    if (combined.length >= limit) break;
  }

  return combined;
}

/**
 * Resolves GPS / map pin coordinates into a structured address with PIN code.
 */
export function reverseGeocodeCoordinates(
  lat: number,
  lng: number,
  nominatimPayload?: unknown,
): AddressSuggestion {
  const roundedLat = Math.round(lat * 10000) / 10000;
  const roundedLng = Math.round(lng * 10000) / 10000;

  if (nominatimPayload && typeof nominatimPayload === "object") {
    const p = nominatimPayload as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const addr = p.address;
    if (addr) {
      const road = addr.road || addr.pedestrian || addr.neighbourhood || "";
      const suburb = addr.suburb || addr.city_district || addr.residential || "Bengaluru";
      const city = addr.city || addr.town || "Bengaluru";
      const state = addr.state || "Karnataka";
      const postcode = addr.postcode || null;
      const title = road ? `${road}, ${suburb}` : suburb;
      return enrichSuggestion({
        id: `rev-osm-${roundedLat}-${roundedLng}`,
        title,
        subtitle: [suburb, city, postcode].filter(Boolean).join(" · "),
        formattedAddress: [title, city, postcode].filter(Boolean).join(", "),
        pincode: postcode,
        locality: suburb,
        city,
        state,
        lat: roundedLat,
        lng: roundedLng,
        source: "photon",
      });
    }
  }

  // Fallback to closest curated entry or Bengaluru preset
  let closestEntry = CURATED_INDIA_ADDRESS_INDEX[0];
  let minDistance = Infinity;
  for (const entry of CURATED_INDIA_ADDRESS_INDEX) {
    const d = distanceKm(roundedLat, roundedLng, entry.lat, entry.lng);
    if (d < minDistance) {
      minDistance = d;
      closestEntry = entry;
    }
  }

  const nearestPreset = resolveNearestPreset(roundedLat, roundedLng, BENGALURU_PRESETS);
  const locality = minDistance <= 1.5 ? closestEntry.locality : nearestPreset.preset.shortName;
  const pincode = minDistance <= 2.5 ? closestEntry.pincode : null;
  const title =
    minDistance <= 0.6
      ? closestEntry.title
      : `${nearestPreset.suggestedLabel} (${roundedLat.toFixed(3)}°N, ${roundedLng.toFixed(3)}°E)`;

  return enrichSuggestion({
    id: `rev-local-${roundedLat}-${roundedLng}`,
    title,
    subtitle: [locality, "Bengaluru", pincode].filter(Boolean).join(" · "),
    formattedAddress: [title, locality, "Bengaluru", pincode].filter(Boolean).join(", "),
    pincode,
    locality,
    city: "Bengaluru",
    state: "Karnataka",
    lat: roundedLat,
    lng: roundedLng,
    source: "local",
  });
}
