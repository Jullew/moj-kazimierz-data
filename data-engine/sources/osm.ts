import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { point, polygon } from '@turf/helpers';
import { z } from 'zod';
import { MAX_RESPONSE_BYTES, USER_AGENT } from '../config.js';
import { placeSchema, type EnginePlace } from '../schemas.js';

// Approximate Kazimierz catchment centered on its OSM neighbourhood node.
// OSM has no polygon boundary for this neighbourhood, so this filter remains a documented approximation.
export const KAZIMIERZ_GEOFENCE = polygon([
  [
    [19.216, 50.273],
    [19.272, 50.273],
    [19.272, 50.32],
    [19.216, 50.32],
    [19.216, 50.273],
  ],
]);
const responseSchema = z.object({
  elements: z.array(
    z.object({
      type: z.enum(['node', 'way', 'relation']),
      id: z.number().int(),
      lat: z.number().optional(),
      lon: z.number().optional(),
      center: z.object({ lat: z.number(), lon: z.number() }).optional(),
      tags: z.record(z.string(), z.string()).default({}),
    }),
  ),
});

export function isInsideKazimierz(latitude: number, longitude: number): boolean {
  return booleanPointInPolygon(point([longitude, latitude]), KAZIMIERZ_GEOFENCE);
}

export function normalizeOsmElements(
  input: unknown,
  retrievedAt = new Date().toISOString(),
): EnginePlace[] {
  const data = responseSchema.parse(input);
  return normalizeParsedOsm(data, retrievedAt);
}

function normalizeParsedOsm(
  data: z.infer<typeof responseSchema>,
  retrievedAt: string,
): EnginePlace[] {
  const rows: EnginePlace[] = [];
  for (const element of data.elements) {
    const tags = element.tags;
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (
      latitude === undefined ||
      longitude === undefined ||
      !isInsideKazimierz(latitude, longitude)
    )
      continue;
    const name = tags.name?.trim();
    if (
      !name ||
      tags.disused === 'yes' ||
      tags.abandoned === 'yes' ||
      tags.office ||
      tags.amenity === 'bench'
    )
      continue;
    const category = categoryFor(tags);
    if (!category) continue;
    const street = tags['addr:street'];
    const houseNumber = tags['addr:housenumber'];
    const address = [street, houseNumber].filter(Boolean).join(' ');
    const sourceIds = [`osm:${element.type}/${element.id}`];
    const place: EnginePlace = {
      id: `osm-${element.type}-${element.id}`,
      name,
      category,
      address,
      coordinates: { latitude, longitude },
      ...(tags.phone ? { phone: tags.phone } : {}),
      ...(safeUrl(tags.website) ? { website: safeUrl(tags.website) } : {}),
      ...(tags.opening_hours ? parseOpeningHours(tags.opening_hours) : {}),
      lastVerified: retrievedAt.slice(0, 10),
      source: {
        name: 'OpenStreetMap',
        url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        license: 'ODbL-1.0 (https://www.openstreetmap.org/copyright)',
        attribution: '© OpenStreetMap contributors',
        retrievedAt,
      },
      sourceIds,
      updatedAt: retrievedAt,
      confidence: address ? 0.8 : 0.68,
      geometry: { type: 'Point', coordinates: [longitude, latitude] },
    };
    const parsed = placeSchema.safeParse(place);
    if (parsed.success) rows.push(parsed.data);
  }
  return rows;
}

function parseOpeningHours(value: string) {
  const days = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  const names = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const result: Record<string, { open: string; close: string }[] | null> = {};
  for (const rule of value.split(';')) {
    const match = rule
      .trim()
      .match(
        /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?(?:,(Mo|Tu|We|Th|Fr|Sa|Su))*\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/,
      );
    if (!match || match[5] === '24:00') continue;
    const selector = match[0].split(/\s+/)[0];
    const time =
      selector === undefined ? undefined : rule.trim().match(/(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (!time) continue;
    const dayToken = rule.trim().split(/\s+/)[0];
    const dayNames: string[] = [];
    for (const range of dayToken.split(',')) {
      const [from, to = from] = range.split('-');
      const start = days.indexOf(from);
      const end = days.indexOf(to);
      if (start < 0 || end < 0) continue;
      for (let index = start; ; index = (index + 1) % 7) {
        dayNames.push(names[index]);
        if (index === end) break;
      }
    }
    for (const day of dayNames) (result[day] ??= []).push({ open: time[1], close: time[2] });
  }
  return Object.keys(result).length ? { openingHours: result } : {};
}

function categoryFor(tags: Record<string, string>) {
  const text = `${tags.shop ?? ''} ${tags.amenity ?? ''} ${tags.leisure ?? ''} ${tags.tourism ?? ''} ${tags.healthcare ?? ''}`;
  if (tags.shop && /supermarket|convenience|greengrocer|bakery|butcher|chemist/.test(tags.shop))
    return tags.shop === 'chemist' ? 'health' : 'groceries';
  if (/restaurant|cafe|fast_food|bar|food_court|ice_cream/.test(text)) return 'food';
  if (/doctors|dentist|pharmacy|clinic|hospital|healthcare/.test(text)) return 'health';
  if (/theatre|arts_centre|community_centre|library|museum|cinema|place_of_worship/.test(text))
    return 'culture';
  if (/attraction|artwork|theme_park|zoo|information/.test(tags.tourism ?? '')) return 'culture';
  if (
    /fitness_centre|sports_centre|park|playground|pitch|swimming_pool|garden|nature_reserve|stadium|track/.test(
      text,
    )
  )
    return 'other';
  if (tags.shop || tags.amenity || tags.leisure || tags.tourism || tags.healthcare) return 'services';
  return undefined;
}

function safeUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchOsmSource(
  fetcher: typeof fetch = fetch,
  timeoutMs = 60_000,
): Promise<{ places: EnginePlace[]; fetched: number }> {
  const query =
    '[out:json][timeout:50];(nwr(around:2300,50.29636,19.24433)[name][shop];nwr(around:2300,50.29636,19.24433)[name][amenity];nwr(around:2300,50.29636,19.24433)[name][leisure];nwr(around:2300,50.29636,19.24433)[name][tourism];nwr(around:2300,50.29636,19.24433)[name][healthcare];);out center tags;';
  const apiKey = process.env.OVERPASS_API_KEY;
  const endpoints = [
    ...(apiKey ? [{ url: 'https://api.overpass.ch/v1/interpreter', apiKey }] : []),
    { url: 'https://overpass-api.de/api/interpreter' },
    { url: 'https://overpass.private.coffee/api/interpreter' },
  ];
  let lastError: unknown;
  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': USER_AGENT,
          ...(endpoint.apiKey ? { 'X-API-Key': endpoint.apiKey } : {}),
        },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`OSM HTTP ${response.status}`);
      const raw = await response.text();
      if (raw.length > MAX_RESPONSE_BYTES) throw new Error('OSM response exceeded size limit');
      const data = responseSchema.parse(JSON.parse(raw));
      return {
        places: normalizeParsedOsm(data, new Date().toISOString()),
        fetched: data.elements.length,
      };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All Overpass endpoints failed');
}

export async function fetchOsmPlaces(
  fetcher: typeof fetch = fetch,
  timeoutMs = 60_000,
): Promise<EnginePlace[]> {
  return (await fetchOsmSource(fetcher, timeoutMs)).places;
}
