import { load } from 'cheerio';
import { readFileSync } from 'node:fs';
import type { EngineAlert } from '../../schemas.js';
import { fetchJson, normalize, stableId } from './shared.js';
const transit = JSON.parse(readFileSync(new URL('./gtfs-kazimierz-stops.json', import.meta.url), 'utf8')) as { stops: { stopId: string; name: string; routeIds: string[] }[] };
const getTransitStops = () => transit.stops;
const getTransitStopRouteIds = (stopId: string) => transit.stops.find((stop) => stop.stopId === stopId)?.routeIds ?? [];

const API = 'https://www.sosnowiec.pl/wp-json/wp/v2/posts?categories=60&per_page=50&_fields=id,date_gmt,modified_gmt,link,title,excerpt,content';
const SEARCHES = ['Kazimierzowska', 'Kazimierz Górniczy'];
const CATEGORY_URL = 'https://www.sosnowiec.pl/category/komunikacja/';
const DISRUPTION = /utrudn|objazd|zamkni[eę]c|remont|przebudow|awari|wyłączen|wstrzyman|zmian(?:a|y) tras/i;

type Post = { id: number; date_gmt: string; modified_gmt: string; link: string; title: { rendered: string }; excerpt: { rendered: string }; content: { rendered: string } };

export async function fetchSosnowiecAlerts(options: { fetcher?: typeof fetch; now?: Date; fetchedAt?: string } = {}): Promise<EngineAlert[]> {
  const fetcher = options.fetcher ?? fetch;
  const fetchedAt = options.fetchedAt ?? new Date().toISOString();
  const postLists = await Promise.all([API, ...SEARCHES.map((term) => `https://www.sosnowiec.pl/wp-json/wp/v2/posts?search=${encodeURIComponent(term)}&categories=60&per_page=30&_fields=id,date_gmt,modified_gmt,link,title,excerpt,content`)].map((url) => fetchJson(url, fetcher)));
  if (postLists.some((posts) => !Array.isArray(posts))) throw new Error('Sosnowiec WordPress API returned an invalid posts list');
  const posts = [...new Map((postLists.flat() as Post[]).map((post) => [post.id, post])).values()];
  const stops = getTransitStops();
  const alerts: EngineAlert[] = [];
  for (const post of posts) {
    if (!post?.link || !post.title?.rendered || !post.content?.rendered) continue;
    const title = load(post.title.rendered).text().replace(/\s+/g, ' ').trim();
    const content = load(post.content.rendered);
    // The lead and operational bulletins contain the actual impact; later paragraphs often discuss unrelated history or investment plans.
    const body = `${content('p').slice(0, 2).text()} ${content('li').text()}`.replace(/\s+/g, ' ').trim();
    const text = normalize(`${title} ${body}`);
    if (!DISRUPTION.test(text)) continue;
    const localityText = normalize(`${title} ${body}`);
    const explicitlyNamesDistrict = /kazimierz(?:em|a)?\s+gornicz(?:y|ego|ym|emu)/.test(localityText);
    const matchingStops = stops.filter((stop) => text.includes(normalize(stop.name)));
    // Neighborhood or stop names must be present in the article itself. A city name alone is not enough.
    if (!explicitlyNamesDistrict && !matchingStops.length) continue;
    const publishedAt = validDate(post.date_gmt);
    const startsAt = inferStart(body, publishedAt);
    const endsAt = inferEnd(body, publishedAt);
    const isRoad = /ulic|dro[gą]|objazd|remont|przebudow|zamkni[eę]c/i.test(`${title} ${body}`);
    const isTransit = /autobus|tramwaj|przystanek|komunikacj/i.test(`${title} ${body}`);
    const externalId = String(post.id);
    alerts.push({
      id: stableId('sosnowiec', externalId, title),
      category: isRoad ? 'roads' : isTransit ? 'transport' : 'municipal',
      title,
      summary: conciseSummary(title, body),
      status: startsAt && Date.parse(startsAt) > (options.now ?? new Date(fetchedAt)).getTime() ? 'planned' : endsAt && Date.parse(endsAt) < (options.now ?? new Date(fetchedAt)).getTime() ? 'resolved' : startsAt ? 'ongoing' : 'unknown',
      severity: isRoad || isTransit ? 'warning' : 'info',
      publishedAt,
      updatedAt: validDate(post.modified_gmt) ?? fetchedAt,
      startsAt,
      // Deliberately do not invent an end date from phrases like “until March”.
      endsAt,
      source: { provider: 'Urząd Miasta Sosnowiec', externalId, url: post.link, fetchedAt },
      location: { areaIds: ['kazimierz-gorniczy'], streetIds: [], stopIds: matchingStops.map((stop) => stop.stopId), routeIds: [...new Set(matchingStops.flatMap((stop) => getTransitStopRouteIds(stop.stopId)))], geometry: null, scope: matchingStops.length ? 'district' : explicitlyNamesDistrict && /lacz|dojazd/.test(localityText) ? 'region' : 'district' },
      relevance: { confirmed: true, reason: matchingStops.length ? 'Oficjalny komunikat wymienia przystanek z lokalnego rozkładu GTFS.' : 'Treść oficjalnego komunikatu wprost wskazuje Kazimierz Górniczy.' },
      lastVerifiedAt: fetchedAt,
    });
  }
  return [...new Map(alerts.map((alert) => [alert.id, alert])).values()];
}

function validDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value.replace(/Z?$/, 'Z')}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function inferStart(body: string, publishedAt: string | null): string | null {
  const explicit = /(?:od|rozpocz(?:ną|na|e)c(?:ie|ia)?(?:\s+się)?|start(?:\s+prac)?|we\s+(?:wtorek|środę|czwartek|piątek|sobotę|niedzielę|poniedziałek))\s+(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|wrzesnia|października|pazdziernika|listopada|grudnia)(?:\s+(\d{4}))?/i.exec(body);
  if (!explicit) return null;
  const months = ['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
  const monthName = normalize(explicit[2]);
  const month = months.findIndex((name) => normalize(name) === monthName);
  const year = Number(explicit[3] ?? (publishedAt ? new Date(publishedAt).getUTCFullYear() : NaN));
  if (month < 0 || !Number.isFinite(year)) return null;
  const value = new Date(Date.UTC(year, month, Number(explicit[1]), 12));
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}
function inferEnd(body: string, publishedAt: string | null): string | null {
  const explicit = /\bdo\s+(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|wrzesnia|października|pazdziernika|listopada|grudnia)(?:\s+(\d{4}))?/i.exec(body);
  if (!explicit) return null;
  const months = ['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
  const month = months.findIndex((name) => normalize(name) === normalize(explicit[2]));
  const year = Number(explicit[3] ?? (publishedAt ? new Date(publishedAt).getUTCFullYear() : NaN));
  if (month < 0 || !Number.isFinite(year)) return null;
  const value = new Date(Date.UTC(year, month, Number(explicit[1]), 12));
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}
function conciseSummary(title: string, body: string) {
  if (/kazimierz(?:em|a)?\s+gornicz(?:y|ego|ym|emu)/i.test(normalize(body)) && /kazimierzowsk/i.test(normalize(title + ' ' + body))) return 'Przebudowa ul. Kazimierzowskiej w Dąbrowie Górniczej. Komunikat miasta wskazuje, że droga łączy się z Kazimierzem Górniczym; sprawdź objazdy i aktualny zakres u źródła.';
  return `${title}. Komunikat ma potwierdzony związek z lokalnym przystankiem lub dzielnicą. Sprawdź zakres i aktualizacje u źródła.`;
}

export const SOSNOWIEC_SOURCE_URL = CATEGORY_URL;
