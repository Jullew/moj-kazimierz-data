import { load } from 'cheerio';
import { z } from 'zod';
import { REQUEST_TIMEOUT_MS, USER_AGENT } from '../config.js';
import { eventSchema, type EngineEvent } from '../schemas.js';
import { warsawLocalIso } from '../time.js';

const month: Record<string, number> = {
  stycznia: 0,
  lutego: 1,
  marca: 2,
  kwietnia: 3,
  maja: 4,
  czerwca: 5,
  lipca: 6,
  sierpnia: 7,
  września: 8,
  października: 9,
  listopada: 10,
  grudnia: 11,
};
const dayPattern =
  /(\d{1,2})\.?\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)(?:\s+(20\d{2}))?/i;
const timePattern = /(?:godz\.?\s*)?(\d{1,2})[.:](\d{2})(?:\s*[–—-]\s*(\d{1,2})[.:](\d{2}))?/i;
const anchorSchema = z.object({
  href: z.string().url(),
  title: z.string().min(1),
  text: z.string(),
});
const pageResponseSchema = z
  .array(z.object({ link: z.string().url(), content: z.object({ rendered: z.string() }) }))
  .min(1);

export function parsePokEvents(
  html: string,
  retrievedAt = new Date().toISOString(),
): EngineEvent[] {
  const $ = load(html);
  const cards: { href: string; title: string; text: string }[] = [];
  $('.uagb-modal-wrapper').each((_, el) => {
    const card = $(el);
    const title = card.find('h2').first().text().trim();
    const text = card.text().replace(/\s+/g, ' ').trim();
    if (title && dayPattern.test(text) && timePattern.test(text)) {
      cards.push({ href: 'https://www.pok.sosnowiec.pl/kazimierz/', title, text });
    }
  });
  const events: EngineEvent[] = [];
  for (const anchor of cards) {
    const parsed = anchorSchema.safeParse(anchor);
    if (!parsed.success) continue;
    const date = anchor.text.match(dayPattern);
    const time = anchor.text.match(timePattern);
    if (!date || !time) continue;
    const now = new Date(retrievedAt);
    const pageYear = anchor.text.match(/\b(20\d{2})\b/)?.[1];
    let year = Number(date[3] ?? pageYear ?? now.getUTCFullYear());
    const localDate = new Date(
      Date.UTC(year, month[date[2].toLocaleLowerCase('pl-PL')], Number(date[1])),
    );
    if (
      !date[3] &&
      !pageYear &&
      localDate.getTime() < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    )
      year += 1;
    const start = warsawLocalIso(
      year,
      month[date[2].toLocaleLowerCase('pl-PL')],
      Number(date[1]),
      Number(time[1]),
      Number(time[2]),
    );
    const end = time[3]
      ? warsawLocalIso(
          year,
          month[date[2].toLocaleLowerCase('pl-PL')],
          Number(date[1]),
          Number(time[3]),
          Number(time[4]),
        )
      : undefined;
    if (end && Date.parse(end) < Date.parse(start)) continue;
    const venueMatch = anchor.text.match(/(?:sala\s+[^\d.·,]+|(?:ul\.|ulica)\s+[^\d.·,]+)/i);
    const venue = venueMatch?.[0].trim() ?? 'Przystanek Otwartej Kultury Kazimierz';
    const status = /odwołan\w*|anulowan\w*/i.test(anchor.text)
      ? 'cancelled'
      : /przełożon\w*|zmiana terminu/i.test(anchor.text)
        ? 'postponed'
        : 'scheduled';
    const event: EngineEvent = {
      id: `pok-${slug(anchor.title)}`,
      title: anchor.title,
      startsAt: start,
      ...(end ? { endsAt: end } : {}),
      venue,
      status,
      organizer: 'Przystanek Otwartej Kultury Kazimierz',
      sourceUrl: anchor.href,
      sourceIds: [`pok:${slug(anchor.title)}`],
      source: {
        name: 'Przystanek Otwartej Kultury Kazimierz',
        url: 'https://www.pok.sosnowiec.pl/kazimierz/',
        retrievedAt,
      },
      updatedAt: retrievedAt,
      confidence: venueMatch ? 0.86 : 0.78,
      locationVerified: true,
      locationBasis: venueMatch ? 'explicit' : 'host-page',
    };
    const valid = eventSchema.safeParse(event);
    if (valid.success) events.push(valid.data);
  }
  return events;
}

function slug(value: string) {
  return (
    value
      .split('/')
      .filter(Boolean)
      .at(-1)
      ?.toLowerCase()
      .replace(/[^a-z0-9-]/g, '-') ?? 'unknown'
  );
}

export async function fetchPokEvents(
  fetcher: typeof fetch = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<EngineEvent[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(
      'https://www.pok.sosnowiec.pl/wp-json/wp/v2/pages?slug=kazimierz&per_page=1',
      {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error(`POK HTTP ${response.status}`);
    const payload = await response.json();
    const [page] = pageResponseSchema.parse(payload);
    if (page.content.rendered.length > 2_000_000) throw new Error('POK page exceeded size limit');
    return parsePokEvents(page.content.rendered);
  } finally {
    clearTimeout(timer);
  }
}
