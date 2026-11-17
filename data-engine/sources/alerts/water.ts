import { load } from 'cheerio';
import type { EngineAlert } from '../../schemas.js';
import { fetchText, normalize, parsePolishDate, stableId, statusFor, WATER_URL, streets } from './shared.js';

export async function fetchWaterAlerts(options: { fetcher?: typeof fetch; now?: Date; fetchedAt?: string } = {}): Promise<EngineAlert[]> {
  const fetcher = options.fetcher ?? fetch;
  const fetchedAt = options.fetchedAt ?? new Date().toISOString();
  const now = options.now ?? new Date(fetchedAt);
  const html = await fetchText(WATER_URL, fetcher);
  const $ = load(html);
  const table = $('table').filter((_, element) => $(element).text().includes('Rodzaj zgłoszenia')).first();
  if (!table.length) throw new Error('Water source layout changed: expected outage table');
  const results: EngineAlert[] = [];
  table.find('tr').each((_, row) => {
    const cells = $(row).find('th,td');
    if (cells.length < 2) return;
    const body = $(cells[0]).text().replace(/\s+/g, ' ').trim();
    if (!body || /rodzaj zgłoszenia/i.test(body) || !/Sosnowiec/i.test(body)) return;
    const normalizedBody = normalize(body);
    const matched = new Map<string, { id: string; name: string }>();
    for (const street of streets) {
      const key = normalize(street.name);
      if (containsStreet(normalizedBody, key)) matched.set(key, street);
    }
    // Keep only notices whose exact named road matches the verified local road list.
    if (!matched.size) return;
    const startText = $(cells[1]).text().replace(/\s+/g, ' ').trim();
    const endText = cells.length > 2 ? $(cells[2]).text().replace(/\s+/g, ' ').trim() : '';
    const startsAt = parsePolishDate(startText) ?? parsePolishDate(body);
    const endsAt = parsePolishDate(endText) ?? extractEndFromRange(body);
    const localStreets = [...matched.values()];
    const roads = localStreets.map((street) => street.name);
    const title = /awari/i.test(body) ? 'Awaria sieci wodociągowej' : /przer/i.test(body) ? 'Przerwa w dostawie wody' : 'Prace na sieci wodociągowej';
    const id = stableId('water', `${[...matched.keys()].sort().join('|')}|${startsAt ?? normalize(body)}`, title);
    results.push({
      id,
      category: 'water',
      title: `${title} — ${roads.join(', ')}`,
      summary: `Sosnowieckie Wodociągi informują o utrudnieniu przy ul. ${roads.join(', ')}. Szczegóły i ewentualne zmiany terminu są w komunikacie źródłowym.`,
      status: statusFor(startsAt, endsAt, body, now),
      severity: /awari/i.test(body) ? 'warning' : 'info',
      publishedAt: null,
      updatedAt: fetchedAt,
      startsAt,
      endsAt,
      source: { provider: 'Sosnowieckie Wodociągi', externalId: id, url: WATER_URL, fetchedAt },
      location: { areaIds: ['kazimierz-gorniczy'], streetIds: localStreets.map((street) => street.id), stopIds: [], routeIds: [], geometry: null, scope: 'street' },
      relevance: { confirmed: true, reason: `Komunikat wymienia lokalną ulicę: ${roads.join(', ')}.` },
      lastVerifiedAt: fetchedAt,
    });
  });
  return dedupe(results);
}

function containsStreet(text: string, name: string) {
  const forms = [name, name.replace(/owa$/, 'owej'), name.replace(/na$/, 'nej'), name.replace(/ska$/, 'skiej'), name.replace(/ka$/, 'kiej')];
  return forms.some((form) => {
    const escaped = form.split(' ').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    return new RegExp(`(?:ul(?:ica|icy)?\\.?\\s*|\u0020)${escaped}(?=\\s|\\d|,|$)`, 'i').test(text);
  });
}
function extractEndFromRange(body: string) {
  const range = /(?:do|zakończen\w*\s*(?:w|na)?)\s*(\d{1,2}[.]\s*\d{1,2}[.]\s*\d{4}(?:\s*r\.?)?(?:\s*\d{1,2}:\d{2})?)/i.exec(body);
  return range ? parsePolishDate(range[1]) : null;
}
function dedupe(alerts: EngineAlert[]) { return [...new Map(alerts.map((alert) => [alert.id, alert])).values()]; }
