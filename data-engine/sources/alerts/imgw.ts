import type { EngineAlert } from '../../schemas.js';
import { fetchJson, stableId } from './shared.js';
import { warsawLocalIso } from '../../time.js';

export const IMGW_URL = 'https://danepubliczne.imgw.pl/api/data/warningsmeteo';
export const IMGW_ATTRIBUTION = 'Źródłem pochodzenia danych jest Instytut Meteorologii i Gospodarki Wodnej – Państwowy Instytut Badawczy. Dane Instytutu Meteorologii i Gospodarki Wodnej – Państwowego Instytutu Badawczego zostały przetworzone.';
type Warning = { id: number | string; nazwa_zdarzenia: string; stopien: number | string; prawdopodobienstwo?: number | string | null; obowiazuje_od: string; obowiazuje_do: string; opublikowano?: string; tresc?: string; teryt: string[] | string };

export async function fetchImgwAlerts(options: { fetcher?: typeof fetch; now?: Date; fetchedAt?: string } = {}): Promise<EngineAlert[]> {
  const fetcher = options.fetcher ?? fetch;
  const fetchedAt = options.fetchedAt ?? new Date().toISOString();
  const data = await fetchJson(IMGW_URL, fetcher) as Warning[];
  if (!Array.isArray(data)) throw new Error('IMGW warnings API returned an invalid list');
  return data.filter((warning) => {
    const codes = Array.isArray(warning.teryt) ? warning.teryt : String(warning.teryt ?? '').split(/[;,\s]+/);
    return codes.includes('2475');
  }).map((warning) => {
    const startsAt = parseImgwDate(warning.obowiazuje_od);
    const endsAt = parseImgwDate(warning.obowiazuje_do);
    const level = Number(warning.stopien);
    const name = String(warning.nazwa_zdarzenia ?? 'Ostrzeżenie meteorologiczne').trim();
    const probability = warning.prawdopodobienstwo == null ? null : Number(warning.prawdopodobienstwo);
    const publishedAt = parseImgwDate(warning.opublikowano) ?? null;
    const now = (options.now ?? new Date(fetchedAt)).getTime();
    return {
      id: stableId('imgw', String(warning.id), name),
      category: 'weather' as const,
      title: `Ostrzeżenie IMGW: ${name}`,
      summary: `Stopień ${level || 1}${probability !== null && Number.isFinite(probability) ? `, prawdopodobieństwo ${probability}%` : ''}. Ostrzeżenie obejmuje miasto Sosnowiec. Szczegóły w komunikacie IMGW.`,
      status: startsAt && Date.parse(startsAt) > now ? 'planned' as const : endsAt && Date.parse(endsAt) < now ? 'resolved' as const : startsAt ? 'ongoing' as const : 'unknown' as const,
      severity: level >= 2 ? 'critical' as const : 'warning' as const,
      publishedAt,
      updatedAt: fetchedAt,
      startsAt,
      endsAt,
      source: { provider: 'IMGW-PIB', externalId: String(warning.id), url: IMGW_URL, fetchedAt, attribution: IMGW_ATTRIBUTION },
      location: { areaIds: ['sosnowiec'], streetIds: [], stopIds: [], routeIds: [], geometry: null, scope: 'city' as const },
      relevance: { confirmed: true, reason: 'Kod TERYT ostrzeżenia IMGW wskazuje miasto Sosnowiec (2475); ostrzeżenie nie jest zawężane do dzielnicy.' },
      lastVerifiedAt: fetchedAt,
    };
  });
}

function parseImgwDate(value?: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const iso = warsawLocalIso(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return iso;
}
