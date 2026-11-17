import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { EngineAlert } from '../../schemas.js';

export const WATER_URL = 'https://rpwik.sosnowiec.pl/strefa-klienta/awarie-i-przerwy-w-dostawie-wody';
export const ZTM_URL = 'https://rj.transportgzm.pl/v2/news/?lang=pl';
export const AREA_ID = 'kazimierz-gorniczy';
export const streets = JSON.parse(readFileSync(new URL('./local-streets.json', import.meta.url), 'utf8')) as { id: string; name: string }[];

export function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pl-PL').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, ' ').trim();
}
export function stableId(provider: string, sourceId: string, title: string) {
  return `${provider}-${createHash('sha256').update(sourceId || normalize(title)).digest('hex').slice(0, 20)}`;
}
export async function fetchText(url: string, fetcher: typeof fetch, timeoutMs = 12_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Source timeout after ${timeoutMs}ms`)), timeoutMs);
  let response: Response;
  let text: string;
  try {
    response = await fetcher(url, { signal: controller.signal, headers: { 'user-agent': 'MojKazimierzDataEngine/0.1 (local alerts; source attribution included)' } });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
    const type = response.headers.get('content-type') ?? '';
    if (!type.toLocaleLowerCase().includes('text/html')) throw new Error(`Unexpected content type: ${type || 'unknown'}`);
    const declaredSize = Number(response.headers.get('content-length') ?? 0);
    if (declaredSize > 3_000_000) throw new Error('Source response exceeds 3 MB limit');
    text = await response.text();
    if (new TextEncoder().encode(text).byteLength > 3_000_000) throw new Error('Source response exceeds 3 MB limit');
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally { clearTimeout(timer); }
  return text;
}
export async function fetchJson(url: string, fetcher: typeof fetch, timeoutMs = 12_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Source timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetcher(url, { signal: controller.signal, headers: { 'user-agent': 'MojKazimierzDataEngine/0.1 (local alerts; source attribution included)', accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
    if (!(response.headers.get('content-type') ?? '').toLocaleLowerCase().includes('application/json')) throw new Error('Unexpected source response: expected JSON');
    if (Number(response.headers.get('content-length') ?? 0) > 3_000_000) throw new Error('Source response exceeds 3 MB limit');
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > 3_000_000) throw new Error('Source response exceeds 3 MB limit');
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally { clearTimeout(timer); }
}
export function parsePolishDate(value: string): string | null {
  const match = /(\d{1,2})[.]\s*(\d{1,2})[.]\s*(\d{4})(?:\s*(?:r\.)?)?(?:\s*(\d{1,2}):(\d{2}))?/i.exec(value);
  if (!match) return null;
  const [, d, m, y, h = '00', min = '00'] = match;
  const month = Number(m), day = Number(d), year = Number(y);
  const offset = isWarsawSummerTime(year, month, day) ? '+02:00' : '+01:00';
  const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${min}:00${offset}`;
  const epoch = Date.parse(date);
  return Number.isNaN(epoch) ? null : new Date(epoch).toISOString();
}
function isWarsawSummerTime(year: number, month: number, day: number) {
  const lastSunday = (monthNumber: number) => {
    const lastDay = new Date(Date.UTC(year, monthNumber, 0));
    return lastDay.getUTCDate() - lastDay.getUTCDay();
  };
  const marchSunday = lastSunday(3), octoberSunday = lastSunday(10);
  return month > 3 && month < 10 || month === 3 && day >= marchSunday || month === 10 && day < octoberSunday;
}
export function statusFor(startsAt: string | null, endsAt: string | null, text: string, now: Date): EngineAlert['status'] {
  if (/odwo[lł]/i.test(text)) return 'cancelled';
  if (startsAt && Date.parse(startsAt) > now.getTime()) return 'planned';
  if (endsAt && Date.parse(endsAt) < now.getTime()) return 'resolved';
  if (startsAt && Date.parse(startsAt) <= now.getTime() && (!endsAt || Date.parse(endsAt) >= now.getTime())) return 'ongoing';
  return 'unknown';
}
