import { load } from 'cheerio';
import { z } from 'zod';
import { REQUEST_TIMEOUT_MS, USER_AGENT } from '../config.js';
import { eventSchema, type EngineEvent } from '../schemas.js';
import { warsawLocalIso } from '../time.js';

const datePattern = /^(20\d{2})-(\d{2})-(\d{2})$/;
const timePattern = /^(\d{2}):(\d{2})$/;
const candidateSchema = z.object({
  offerId: z.string().min(1),
  title: z.string().min(1),
  branch: z.literal('POK Kazimierz'),
  date: z.string(),
  time: z.string(),
  durationMinutes: z.number().int().positive().optional(),
  href: z.string().url(),
  text: z.string(),
});

function slug(value: string) {
  return value
    .toLocaleLowerCase('pl-PL')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parsePokSystemEvents(
  html: string,
  retrievedAt = new Date().toISOString(),
): EngineEvent[] {
  const $ = load(html);
  const events: EngineEvent[] = [];

  $('div.bordered-card')
    .filter((_, element) => !$(element).hasClass('schedule') && $(element).find('h2').length > 0)
    .each((_, element) => {
      const card = $(element);
      const branch = card.children().first().text().trim();
      if (branch !== 'POK Kazimierz') return;

      const title = card.find('h2').first().text().replace(/\s+/g, ' ').trim();
      const text = card.text().replace(/\s+/g, ' ').trim();
      const hrefValue = card.find('a[href*="/rezerwacje/terms?offer="]').first().attr('href');
      const href = hrefValue
        ? new URL(hrefValue, 'https://system.pok.sosnowiec.pl').toString()
        : undefined;
      const offerId = href ? new URL(href).searchParams.get('offer') : undefined;
      const duration = text.match(/Czas trwania:\s*(\d+)\s*min/i)?.[1];
      const dayRows = card.find('.schedule .one-day').toArray();

      for (const dayRow of dayRows) {
        const date = $(dayRow).find('.day').first().text().trim();
        const time = $(dayRow).find('.hour').first().text().trim();
        // Recurring weekly activities have weekday names here; only import dated occurrences.
        if (!datePattern.test(date) || !timePattern.test(time) || !href || !title) continue;
        const candidate = candidateSchema.safeParse({
          offerId: offerId ?? `${slug(title)}-${date}`,
          title,
          branch,
          date,
          time,
          ...(duration ? { durationMinutes: Number(duration) } : {}),
          href,
          text,
        });
        if (!candidate.success) continue;

        const [, year, month, day] = date.match(datePattern)!;
        const [, hour, minute] = time.match(timePattern)!;
        const startsAt = warsawLocalIso(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
        );
        const endsAt = candidate.data.durationMinutes
          ? new Date(Date.parse(startsAt) + candidate.data.durationMinutes * 60_000).toISOString()
          : undefined;
        const status = /odwołan\w*|anulowan\w*/i.test(text)
          ? 'cancelled'
          : /przełożon\w*|zmiana terminu/i.test(text)
            ? 'postponed'
            : 'scheduled';
        const event: EngineEvent = {
          id: `pok-system-${candidate.data.offerId}-${date}`,
          title,
          startsAt,
          ...(endsAt ? { endsAt } : {}),
          venue: 'Przystanek Otwartej Kultury Kazimierz',
          status,
          organizer: 'Przystanek Otwartej Kultury Kazimierz',
          sourceUrl: candidate.data.href,
          sourceIds: [`pok-system:offer/${candidate.data.offerId}:${date}`],
          sourceUrls: [candidate.data.href],
          source: {
            name: 'System rezerwacji POK Sosnowiec',
            url: 'https://system.pok.sosnowiec.pl/',
            retrievedAt,
          },
          updatedAt: retrievedAt,
          confidence: 0.94,
          locationVerified: true,
          locationBasis: 'explicit',
        };
        const valid = eventSchema.safeParse(event);
        if (valid.success) events.push(valid.data);
      }
    });

  return events;
}

export async function fetchPokSystemEvents(
  fetcher: typeof fetch = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<EngineEvent[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher('https://system.pok.sosnowiec.pl/', {
      headers: { accept: 'text/html', 'user-agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`POK system HTTP ${response.status}`);
    const html = await response.text();
    if (html.length > 8_000_000) throw new Error('POK system page exceeded size limit');
    return parsePokSystemEvents(html);
  } finally {
    clearTimeout(timer);
  }
}
