import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import { z } from 'zod';

const stamp = z.string().datetime({ offset: true });
const plainText = (max: number) => z.string().transform((value) => value.replace(/\s+/gu, ' ').trim()).pipe(z.string().max(max).regex(/^[^<>\p{Cc}]*$/u));

export const placeNewsSources = [
  { id: 'sp32-edupage', name: 'Szkoła Podstawowa nr 32', placeId: 'osm-way-751272295', url: 'https://sp32sosnowiec.edupage.org/', feedUrl: 'https://sp32sosnowiec.edupage.org/rss/news' },
  { id: 'sp2-edupage', name: 'Szkoła Podstawowa nr 2', placeId: 'osm-way-150619640', url: 'https://sp2dg.edupage.org/', feedUrl: 'https://sp2dg.edupage.org/rss/news' },
  { id: 'pm7', name: 'Przedszkole Miejskie nr 7', placeId: 'osm-node-7191472401', url: 'https://przedszkole7.sosnowiec.pl/', feedUrl: 'https://przedszkole7.sosnowiec.pl/feed/' },
  { id: 'pm31', name: 'Przedszkole Miejskie nr 31', placeId: 'osm-way-770408324', url: 'https://pm31sosnowiec.edupage.org/', feedUrl: 'https://pm31sosnowiec.edupage.org/rss/news' },
  { id: 'pm33', name: 'Przedszkole Miejskie nr 33', placeId: 'osm-way-770408325', url: 'https://przedszkole33.edupage.org/', feedUrl: 'https://przedszkole33.edupage.org/rss/news' },
  { id: 'pok-kazimierz', name: 'Przystanek Otwartej Kultury Kazimierz', placeId: 'osm-way-184660278', url: 'https://www.pok.sosnowiec.pl/', feedUrl: 'https://www.pok.sosnowiec.pl/feed/' },
  { id: 'sp33', name: 'Szkoła Podstawowa nr 33', placeId: 'osm-way-169010422', url: 'https://sp33sosnowiec.edu.pl/', feedUrl: 'https://sp33sosnowiec.edu.pl/feed/', filterKeywords: ['jubileusz', 'budżet', 'świętowanie', 'szkoła', 'uczni', 'nauczyciel', 'akademia', 'konkurs'] },
  { id: 'sp35', name: 'Szkoła Podstawowa nr 35', placeId: 'osm-way-747951760', url: 'https://sp35sosnowiec.edupage.org/', feedUrl: 'https://sp35sosnowiec.edupage.org/rss/news' },
  { id: 'parafia-ostrowy', name: 'Parafia pw. NMP Nieustającej Pomocy', placeId: 'osm-way-216687126', url: 'https://www.parafiaostrowy.pl/', feedUrl: 'https://www.parafiaostrowy.pl/index.php?format=feed&type=rss' },
  { id: 'library10', name: 'Biblioteka — Filia nr 10, Kazimierz Górniczy', placeId: 'orsip-library-0000000000591', url: 'https://www.biblioteka.sosnowiec.pl/', feedUrl: 'https://www.biblioteka.sosnowiec.pl/kanaly-rss/aktualnosci/pl', filterKeywords: ['Filia nr 10', 'Kazimierz Górniczy'] },
  { id: 'library11', name: 'Biblioteka — Filia nr 11, Ostrowy Górnicze', placeId: 'osm-node-7471985915', url: 'https://www.biblioteka.sosnowiec.pl/', feedUrl: 'https://www.biblioteka.sosnowiec.pl/kanaly-rss/aktualnosci/pl', filterKeywords: ['Filia nr 11', 'Ostrowy Górnicze'] },
  { id: 'policja-sosnowiec', name: 'Komenda Miejska Policji w Sosnowcu', placeId: 'osm-way-183990583', url: 'https://sosnowiec.policja.gov.pl/k24/', feedUrl: 'https://sosnowiec.policja.gov.pl/dokumenty/rss/59-rss-o-322.rss', filterKeywords: ['Sosnowiec'] },
  { id: 'przychodnia-bracka-kazimierz', name: 'Przychodnia Bracka Kazimierz-Juliusz', placeId: 'osm-way-184629233', url: 'https://uniabracka.pl/', feedUrl: 'https://uniabracka.pl/feed/', filterKeywords: ['Kazimierz-Juliusz', 'Przychodniach Brackich'] },
  { id: 'psp-sosnowiec', name: 'Jednostka Ratowniczo-Gaśnicza PSP nr 2 w Sosnowcu', placeId: 'osm-way-171129225', url: 'https://www.gov.pl/web/kmpsp-sosnowiec/', feedUrl: 'https://www.gov.pl/web/kmpsp-sosnowiec/aktualnosci', format: 'gov-pl-html' },
  { id: 'zew-kazimierz', name: 'Klub Sportowy ZEW Sosnowiec', placeId: 'osm-way-789938929', url: 'https://zew-sosnowiec.pl/', feedUrl: 'https://zew-sosnowiec.pl/feed/' },
  { id: 'park-kuronia', name: 'Park im. Jacka Kuronia', placeId: 'osm-relation-17366491', url: 'https://www.sosnowiec.pl/', feedUrl: 'https://www.sosnowiec.pl/feed/', filterKeywords: ['Park im. Jacka Kuronia', 'Park Kuronia'] },
  { id: 'mini-zoo-kuronia', name: 'Mini Zoo w Parku im. Jacka Kuronia', placeId: 'osm-way-184686598', url: 'https://www.sosnowiec.pl/', feedUrl: 'https://www.sosnowiec.pl/feed/', filterKeywords: ['Mini Zoo'] },
  { id: 'pok-kazimierz-miasto', name: 'Przystanek Otwartej Kultury Kazimierz', placeId: 'osm-way-184660278', url: 'https://www.sosnowiec.pl/', feedUrl: 'https://www.sosnowiec.pl/feed/', filterKeywords: ['Przystanek Otwartej Kultury Kazimierz', 'POK Kazimierz'] },
  { id: 'amfiteatr-muszelka', name: 'Amfiteatr Muszelka', placeId: 'osm-way-184685753', url: 'https://www.sosnowiec.pl/', feedUrl: 'https://www.sosnowiec.pl/feed/', filterKeywords: ['Amfiteatr Muszelka'] },
  { id: 'teznia-kuronia', name: 'Tężnia solankowa w Parku Kuronia', placeId: 'osm-way-925966719', url: 'https://www.sosnowiec.pl/', feedUrl: 'https://www.sosnowiec.pl/feed/', filterKeywords: ['tężnia solankowa', 'tężni solankowej'] },
  { id: 'dino-park-kazimierz', name: 'Dino Park', placeId: 'osm-way-1263820012', url: 'https://www.sosnowiec.pl/', feedUrl: 'https://www.sosnowiec.pl/feed/', filterKeywords: ['Dino Park'] },
  { id: 'strefa-aktywnosci-kazimierz', name: 'Strefa Aktywności Mieszkańca', placeId: 'osm-way-481076938', url: 'https://www.sosnowiec.pl/', feedUrl: 'https://www.sosnowiec.pl/feed/', filterKeywords: ['Strefa Aktywności Mieszkańca'] },
  { id: 'skatepark-kazimierz', name: 'Skatepark w Kazimierzu', placeId: 'osm-way-184685994', url: 'https://www.sosnowiec.pl/', feedUrl: 'https://www.sosnowiec.pl/feed/', filterKeywords: ['Skatepark w Kazimierzu', 'skatepark Kazimierz'] },
  { id: 'park-linowy-kuronia', name: 'Park linowy w Parku Kuronia', placeId: 'osm-way-1264073453', url: 'https://www.sosnowiec.pl/', feedUrl: 'https://www.sosnowiec.pl/feed/', filterKeywords: ['park linowy w Kazimierzu', 'park linowy w Parku Kuronia'] },
  { id: 'parafia-porabka', name: 'Parafia pw. Matki Boskiej Częstochowskiej w Porąbce', placeId: 'osm-way-266193629', url: 'https://www.parafiaporabka.sosnowiec.pl/', feedUrl: 'https://www.parafiaporabka.sosnowiec.pl/', format: 'parafia-spa-announcements' },
  { id: 'parafia-kazimierz-diecezja', name: 'Parafia Najświętszego Ciała i Krwi Chrystusa', placeId: 'osm-way-337045191', url: 'https://diecezja.sosnowiec.pl/parafie/sosnowiec-kazimierz-parafia-pw-najswietszego-ciala-i-krwi-chrystusa/', feedUrl: 'https://diecezja.sosnowiec.pl/aktualnosci/wszystkie/feed/', filterKeywords: ['Sosnowiec-Kazimierz', 'Najświętszego Ciała i Krwi Chrystusa'] },
] as const;

const sourceSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  placeId: z.string(),
  url: z.string().url(),
  status: z.enum(['available', 'unavailable', 'unknown']),
  lastSuccessfulSyncAt: stamp.nullable(),
});

const updateSchema = z.object({
  id: z.string(),
  placeId: z.string(),
  type: z.enum(['news', 'notice', 'event']),
  title: plainText(180).pipe(z.string().min(1)),
  summary: plainText(350).nullable(),
  article: z.string().max(30_000).nullable(),
  imageUrls: z.array(z.string().url()).max(8),
  publishedAt: stamp.nullable(),
  sourceId: z.string(),
  sourceUrl: z.string().url(),
  canonicalUrl: z.string().url(),
  fetchedAt: stamp,
  status: z.literal('published'),
});

export const placeNewsPublicationSchema = z.object({
  updates: z.array(updateSchema).max(500),
  sources: z.array(sourceSchema).max(200),
}).superRefine(({ updates, sources }, context) => {
  if (new Set(sources.map((source) => source.id)).size !== sources.length)
    context.addIssue({ code: 'custom', message: 'Duplicate place news source IDs' });
  if (new Set(updates.map((update) => update.id)).size !== updates.length)
    context.addIssue({ code: 'custom', message: 'Duplicate place news update IDs' });
  for (const update of updates) {
    const source = sources.find((item) => item.id === update.sourceId);
    if (!source || source.placeId !== update.placeId || !source.lastSuccessfulSyncAt) {
      context.addIssue({ code: 'custom', message: `Orphan place news update: ${update.id}` });
      continue;
    }
    const expected = new URL(source.url);
    for (const value of [update.sourceUrl, update.canonicalUrl]) {
      const actual = new URL(value);
      if (actual.protocol !== 'https:' || actual.hostname.replace(/^www\./, '') !== expected.hostname.replace(/^www\./, ''))
        context.addIssue({ code: 'custom', message: `Untrusted source URL: ${value}` });
    }
  }
});

type PlaceNewsPublication = z.infer<typeof placeNewsPublicationSchema>;
type PlaceUpdate = z.infer<typeof updateSchema>;
const maxFeedBytes = 1_000_000;
const maxRecordsPerSource = 100;
type RawFeedUpdate = {
  id: string;
  placeId: string;
  type: 'news' | 'notice' | 'event';
  title: string;
  summary: string | null;
  article: string | null;
  imageUrls: string[];
  publishedAt: string | null;
  sourceId: string;
  sourceUrl: string;
  canonicalUrl: string;
  fetchedAt: string;
  status: 'published';
};

function canonicalize(value: string) {
  const url = new URL(value);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_.+|fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href;
}

function identity(update: PlaceUpdate) { return `${update.placeId}:${update.canonicalUrl}`; }

function isPlaceholderTitle(title: string) {
  return /(hello world!?|wpis testowy|przykładowy wpis)/iu.test(title);
}

function htmlText(value: string) {
  return cheerio.load(value).text().replace(/\s+/gu, ' ').replace(/[\p{Cc}<>]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

async function fetchSource(source: (typeof placeNewsSources)[number], now: string) {
  const response = await fetch(source.feedUrl, {
    headers: { 'user-agent': 'MojKazimierzDataEngine/0.1 (source and original links retained)' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const xml = await response.text();
  if (xml.length > maxFeedBytes) throw new Error('RSS response exceeds size limit');
  if ('format' in source && source.format === 'gov-pl-html') {
    const $ = cheerio.load(xml);
    const expectedHost = new URL(source.url).hostname.replace(/^www[.]/, '');
    return $('.title a[href^="/web/kmpsp-sosnowiec/"]').toArray().slice(0, maxRecordsPerSource).flatMap((item) => {
      const node = $(item);
      const title = htmlText(node.text());
      let sourceUrl: string;
      try {
        const linked = new URL(node.attr('href') ?? '', source.feedUrl);
        if (linked.protocol !== 'https:' || linked.hostname.replace(/^www[.]/, '') !== expectedHost) return [];
        sourceUrl = canonicalize(linked.href);
      } catch { return []; }
      if (!title || isPlaceholderTitle(title)) return [];
      const dateText = node.closest('li').find('.date').first().text().trim();
      const dateMatch = /^([0-9]{2})[.]([0-9]{2})[.]([0-9]{4})$/u.exec(dateText);
      const publishedAt = dateMatch
        ? new Date(Date.UTC(Number(dateMatch[3]), Number(dateMatch[2]) - 1, Number(dateMatch[1]))).toISOString()
        : null;
      const type = /komunikat|ogłoszen|informacja/iu.test(title) ? 'notice' : /wydarzen|festyn|spotkan|konkurs|zawod|turniej/iu.test(title) ? 'event' : 'news';
      return [{
        id: createHash('sha256').update(identity({ placeId: source.placeId, canonicalUrl: sourceUrl })).digest('hex'),
        placeId: source.placeId,
        type,
        title,
        summary: null,
        article: null,
        imageUrls: [],
        publishedAt,
        sourceId: source.id,
        sourceUrl,
        canonicalUrl: sourceUrl,
        fetchedAt: now,
        status: 'published' as const,
      } satisfies RawFeedUpdate];
    });
  }
  if ('format' in source && source.format === 'parafia-spa-announcements') {
    const page = cheerio.load(xml);
    const assetPath = page('script[type="module"][src]').attr('src');
    if (!assetPath) throw new Error('Parish announcements asset not found');
    const assetUrl = new URL(assetPath, source.feedUrl);
    const expectedHost = new URL(source.url).hostname.replace(/^www[.]/, '');
    if (assetUrl.protocol !== 'https:' || assetUrl.hostname.replace(/^www[.]/, '') !== expectedHost || !assetUrl.pathname.startsWith('/assets/'))
      throw new Error('Untrusted parish announcements asset');
    const assetResponse = await fetch(assetUrl, {
      headers: { 'user-agent': 'MojKazimierzDataEngine/0.1 (source and original links retained)' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!assetResponse.ok) throw new Error(`Parish announcements asset returned HTTP ${assetResponse.status}`);
    const script = await assetResponse.text();
    if (script.length > maxFeedBytes) throw new Error('Parish announcements asset exceeds size limit');
    const pattern = /\{id:"(ogloszenia-[^"]+)",date:"([0-9]{4}-[0-9]{2}-[0-9]{2})",title:"((?:\\.|[^"\\])*)",content:`/gu;
    const rows: RawFeedUpdate[] = [];
    for (const match of script.matchAll(pattern)) {
      if (rows.length >= maxRecordsPerSource) break;
      const contentStart = match.index + match[0].length;
      const closing = script.indexOf('`,is_published:!0', contentStart);
      const nextRecord = script.indexOf('{id:"ogloszenia-', contentStart);
      if (closing < 0 || (nextRecord >= 0 && nextRecord < closing)) continue;
      let title: string;
      try { title = JSON.parse(`"${match[3]}"`) as string; } catch { continue; }
      if (!title || isPlaceholderTitle(title)) continue;
      const sourceUrl = canonicalize(`${source.url}ogloszenia?id=${encodeURIComponent(match[1])}`);
      rows.push({
        id: createHash('sha256').update(identity({ placeId: source.placeId, canonicalUrl: sourceUrl })).digest('hex'),
        placeId: source.placeId,
        type: 'notice',
        title: htmlText(title),
        summary: null,
        article: null,
        imageUrls: [],
        publishedAt: new Date(`${match[2]}T00:00:00.000Z`).toISOString(),
        sourceId: source.id,
        sourceUrl,
        canonicalUrl: sourceUrl,
        fetchedAt: now,
        status: 'published',
      });
    }
    return rows;
  }
  const $ = cheerio.load(xml, { xmlMode: true });
  const expectedHost = new URL(source.url).hostname.replace(/^www\./, '');
  const rows = $('item').toArray().slice(0, maxRecordsPerSource).flatMap((item) => {
    const node = $(item);
    const title = htmlText(node.children('title').first().text());
    if (!title || isPlaceholderTitle(title)) return [];
    const href = node.children('link').first().text().trim() || node.children('guid').first().text().trim();
    let sourceUrl: string;
    try {
      const linked = new URL(href);
      const expected = new URL(source.url);
      if (linked.protocol === 'http:' && linked.hostname.replace(/^www\./, '') === expected.hostname.replace(/^www\./, '')) linked.protocol = 'https:';
      sourceUrl = canonicalize(linked.href);
      const parsed = new URL(sourceUrl);
      if (parsed.protocol !== 'https:' || parsed.hostname.replace(/^www\./, '') !== expectedHost) return [];
    } catch { return []; }
    const rawDate = node.children('pubDate').first().text().trim() || node.children('published').first().text().trim() || node.children('updated').first().text().trim();
    const publishedAt = rawDate && !Number.isNaN(Date.parse(rawDate)) ? new Date(rawDate).toISOString() : null;
    const description = node.children('description').first().text();
    const encoded = node.find('content\\:encoded').first().text() || node.children('content').first().text();
    const keywords = 'filterKeywords' in source ? source.filterKeywords : [];
    const searchable = `${title} ${htmlText(description)} ${htmlText(encoded)}`.toLocaleLowerCase('pl-PL');
    if (keywords.length && !keywords.some((keyword) => searchable.includes(keyword.toLocaleLowerCase('pl-PL')))) return [];
    const summary = htmlText(description || encoded).slice(0, 350) || null;
    const type = /komunikat|ogłoszen|informacja/iu.test(title) ? 'notice' : /wydarzen|festyn|spotkan|konkurs|zawod|turniej/iu.test(title) ? 'event' : 'news';
    return [{
      id: createHash('sha256').update(identity({ placeId: source.placeId, canonicalUrl: sourceUrl })).digest('hex'),
      placeId: source.placeId,
      type,
      title,
      summary,
      article: null,
      imageUrls: [],
      publishedAt,
      sourceId: source.id,
      sourceUrl,
      canonicalUrl: sourceUrl,
      fetchedAt: now,
      status: 'published' as const,
    } satisfies RawFeedUpdate];
  });
  return rows.map((update) => ({ ...update, article: null, imageUrls: [] }));
}

export async function collectPlaceNews(previous: PlaceNewsPublication, placeIds: Set<string>, now: string) {
  const updates: PlaceUpdate[] = [];
  const sourceStates: PlaceNewsPublication['sources'] = [];
  const report = [];
  for (const source of placeNewsSources) {
    const prior = previous.sources.find((item) => item.id === source.id);
    const retained = previous.updates.filter((item) => item.sourceId === source.id && !isPlaceholderTitle(item.title));
    if (!placeIds.has(source.placeId)) {
      sourceStates.push({ id: source.id, name: source.name, placeId: source.placeId, url: source.url, status: 'unknown', lastSuccessfulSyncAt: null });
      updates.push(...retained);
      report.push({ id: source.id, status: 'unknown', count: retained.length, error: null });
      continue;
    }
    try {
      const fresh = await fetchSource(source, now);
      const merged = new Map<string, PlaceUpdate>();
      for (const update of [...fresh, ...retained]) if (!merged.has(update.id)) merged.set(update.id, update);
      updates.push(...[...merged.values()].sort((a, b) => Date.parse(b.publishedAt ?? b.fetchedAt) - Date.parse(a.publishedAt ?? a.fetchedAt)).slice(0, maxRecordsPerSource));
      sourceStates.push({ id: source.id, name: source.name, placeId: source.placeId, url: source.url, status: 'available', lastSuccessfulSyncAt: now });
      report.push({ id: source.id, status: 'available', count: fresh.length, error: null });
    } catch (error) {
      updates.push(...retained);
      sourceStates.push({ id: source.id, name: source.name, placeId: source.placeId, url: source.url, status: 'unavailable', lastSuccessfulSyncAt: prior?.lastSuccessfulSyncAt ?? null });
      report.push({ id: source.id, status: 'unavailable', count: retained.length, error: error instanceof Error ? error.message : 'Feed fetch failed' });
    }
  }
  const unique = new Map<string, PlaceUpdate>();
  for (const update of updates.sort((a, b) => Date.parse(b.publishedAt ?? b.fetchedAt) - Date.parse(a.publishedAt ?? a.fetchedAt))) {
    if (!unique.has(identity(update))) unique.set(identity(update), update);
  }
  const attributedUpdates = [...unique.values()].map((update) => ({ ...update, article: null, imageUrls: [] }));
  return { publication: placeNewsPublicationSchema.parse({ updates: attributedUpdates, sources: sourceStates }), report };
}

export type { PlaceNewsPublication };
