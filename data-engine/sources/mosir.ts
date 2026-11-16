import { load } from 'cheerio';

// The audited calendar currently contains no event entries and exposes no machine-readable feed.
// This parser is intentionally conservative for future server-rendered entries; it does not infer dates.
export function parseMosirCalendar(html: string): { title: string; sourceUrl: string }[] {
  const $ = load(html);
  const entries: { title: string; sourceUrl: string }[] = [];
  $('.events article, .events .event, .events .calendar-item').each((_, element) => {
    const node = $(element);
    const title = node.find('h2,h3,a').first().text().trim();
    const href = node.find('a[href]').first().attr('href');
    if (title && href)
      entries.push({
        title,
        sourceUrl: new URL(href, 'https://www.mosir.sosnowiec.pl').toString(),
      });
  });
  return entries;
}
