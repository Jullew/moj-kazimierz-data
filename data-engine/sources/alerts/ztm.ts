import { load } from 'cheerio';
import { readFileSync } from 'node:fs';
import type { EngineAlert } from '../../schemas.js';
import { fetchText, normalize, parsePolishDate, stableId, statusFor, ZTM_URL } from './shared.js';

const transit = JSON.parse(readFileSync(new URL('./gtfs-kazimierz-stops.json', import.meta.url), 'utf8')) as {
  source: string;
  generatedAt: string;
  stops: { stopId: string; name: string; routeIds: string[] }[];
};

export async function fetchZtmAlerts(options: { fetcher?: typeof fetch; now?: Date; fetchedAt?: string } = {}): Promise<EngineAlert[]> {
  const fetcher = options.fetcher ?? fetch;
  const fetchedAt = options.fetchedAt ?? new Date().toISOString();
  const now = options.now ?? new Date(fetchedAt);
  const html = await fetchText(ZTM_URL, fetcher);
  const $ = load(html);
  const entries = $('a[href*="/v2/news/i/"]').toArray().map((anchor) => ({
    title: $(anchor).text().replace(/\s+/g, ' ').trim(),
    url: new URL($(anchor).attr('href') ?? '', ZTM_URL).toString(),
  })).filter((entry) => entry.title && /sosnowiec|kazimierz/i.test(entry.title));
  if (!$('a[href*="/v2/news/i/"]').length) throw new Error('ZTM source layout changed: no notice links found');
  const results: EngineAlert[] = [];
  for (const entry of entries.slice(0, 12)) {
    try {
      const detail = load(await fetchText(entry.url, fetcher));
      const body = detail('main').text() || detail('body').text();
      const normalized = normalize(`${entry.title} ${body}`);
      const stops = transit.stops.filter((stop) => normalized.includes(normalize(stop.name)));
      const districtNamed = /kazimierz\s+gorniczy/i.test(normalized);
      // A line number alone is insufficient. Require a named Kazimierz stop or explicit district mention.
      if (!districtNamed && !stops.length) continue;
      const startText = /data obowiazywania od\s*:?\s*(\d{1,2}[.]\d{1,2}[.]\d{4})/i.exec(body)?.[1];
      const endText = /data obowiazywania od\s*:?\s*\d{1,2}[.]\d{1,2}[.]\d{4}\s*do\s*:?\s*(\d{1,2}[.]\d{1,2}[.]\d{4})/i.exec(body)?.[1];
      const startsAt = startText ? parsePolishDate(startText) : null;
      const endsAt = endText ? parsePolishDate(endText) : null;
      const isRoad = /remont|zamkni[eę]c|objazd|ul\./i.test(entry.title);
      const externalId = /\/i\/(\d+)/.exec(entry.url)?.[1] ?? null;
      results.push({
        id: stableId('ztm', externalId ?? entry.url, entry.title),
        category: isRoad ? 'roads' : 'transport',
        title: entry.title,
        summary: `Komunikat ZTM dotyczy ${stops.length ? `przystanku/przystanków ${stops.map((stop) => stop.name).join(', ')}` : 'Kazimierza Górniczego'}. Sprawdź szczegóły u źródła.`,
        status: statusFor(startsAt, endsAt, body, now),
        severity: 'warning',
        publishedAt: null,
        updatedAt: fetchedAt,
        startsAt,
        endsAt,
        source: { provider: 'Zarząd Transportu Metropolitalnego', externalId, url: entry.url, fetchedAt },
        location: { areaIds: districtNamed ? ['kazimierz-gorniczy'] : [], streetIds: [], stopIds: stops.map((stop) => stop.stopId), routeIds: [...new Set(stops.flatMap((stop) => stop.routeIds))], geometry: null, scope: 'district' },
        relevance: { confirmed: true, reason: stops.length ? 'Treść komunikatu wymienia przystanek z lokalnego GTFS.' : 'Treść komunikatu jawnie wymienia Kazimierz Górniczy.' },
        lastVerifiedAt: fetchedAt,
      });
    } catch (error) {
      if (error instanceof Error && /HTTP 404/.test(error.message)) continue;
      throw error;
    }
  }
  return [...new Map(results.map((alert) => [alert.id, alert])).values()];
}

export function getZtmSourceContext() {
  return { schedule: { source: transit.source, generatedAt: transit.generatedAt }, stops: transit.stops.map(({ stopId, name }) => ({ stopId, name })) };
}
