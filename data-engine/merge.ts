import type { EngineEvent, EnginePlace } from './schemas.js';

const normalize = (value: string) =>
  value
    .toLocaleLowerCase('pl-PL')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
function meters(a: EnginePlace['coordinates'], b: EnginePlace['coordinates']) {
  const rad = Math.PI / 180;
  const deltaLat = (b.latitude - a.latitude) * rad;
  const deltaLon = (b.longitude - a.longitude) * rad;
  const square =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(deltaLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(square), Math.sqrt(1 - square));
}

/** Union-only merge: absence from a partial source result never deletes an existing record. */
export function mergePlaces(rows: EnginePlace[]): EnginePlace[] {
  const result: EnginePlace[] = [];
  for (const row of rows) {
    const sourceMatch = result.findIndex((existing) =>
      existing.sourceIds.some((id) => row.sourceIds.includes(id)),
    );
    if (sourceMatch >= 0) {
      result[sourceMatch] = row;
      continue;
    }
    const duplicate = result.findIndex(
      (existing) =>
        normalize(existing.name) === normalize(row.name) &&
        meters(existing.coordinates, row.coordinates) < 80,
    );
    if (duplicate >= 0) {
      const previous = result[duplicate];
      result[duplicate] = {
        ...(row.confidence > previous.confidence ? row : previous),
        sourceIds: [...new Set([...previous.sourceIds, ...row.sourceIds])],
        confidence: Math.max(previous.confidence, row.confidence),
      };
      continue;
    }
    result.push(row);
  }
  return result;
}

export function mergeEvents(rows: EngineEvent[]): EngineEvent[] {
  const result = new Map<string, EngineEvent>();
  for (const row of rows) {
    const key = row.sourceIds[0] ?? row.id;
    const prior = result.get(key);
    result.set(key, prior ? { ...prior, ...row } : row);
  }
  const unique: EngineEvent[] = [];
  for (const row of result.values()) {
    const normalizedTitle = normalize(row.title);
    const duplicate = unique.findIndex((existing) => {
      if (Date.parse(existing.startsAt) !== Date.parse(row.startsAt)) return false;
      const existingTitle = normalize(existing.title);
      return (
        existingTitle === normalizedTitle ||
        existingTitle.includes(normalizedTitle) ||
        normalizedTitle.includes(existingTitle)
      );
    });
    if (duplicate < 0) {
      unique.push(row);
      continue;
    }
    const previous = unique[duplicate];
    const preferred = row.title.length > previous.title.length ? row : previous;
    unique[duplicate] = {
      ...previous,
      ...preferred,
      sourceIds: [...new Set([...previous.sourceIds, ...row.sourceIds])],
      sourceUrls: [
        ...new Set(
          [
            ...(previous.sourceUrls ?? [previous.sourceUrl]),
            ...(row.sourceUrls ?? [row.sourceUrl]),
          ].filter((url): url is string => Boolean(url)),
        ),
      ],
      confidence: Math.max(previous.confidence, row.confidence),
    };
  }
  return unique;
}

export function isPublishableEvent(event: EngineEvent) {
  return event.locationVerified && event.confidence >= 0.72;
}

function comparable(record: Record<string, unknown>) {
  const copy = structuredClone(record);
  delete copy.updatedAt;
  delete copy.lastVerified;
  const source = copy.source as Record<string, unknown> | undefined;
  if (source) delete source.retrievedAt;
  return copy;
}

export function diffRecords<T extends { id: string }>(previous: T[], current: T[]) {
  const oldById = new Map(previous.map((row) => [row.id, row as T & Record<string, unknown>]));
  const changes: { id: string; change: 'added' | 'updated'; fields: string[] }[] = [];
  for (const row of current) {
    const before = oldById.get(row.id);
    const after = comparable(row as T & Record<string, unknown>);
    if (!before) {
      changes.push({ id: row.id, change: 'added', fields: Object.keys(after) });
      continue;
    }
    const prior = comparable(before);
    const fields = [...new Set([...Object.keys(prior), ...Object.keys(after)])].filter(
      (key) => JSON.stringify(prior[key]) !== JSON.stringify(after[key]),
    );
    if (fields.length) changes.push({ id: row.id, change: 'updated', fields });
  }
  return changes;
}
