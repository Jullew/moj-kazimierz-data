import { readFile } from 'node:fs/promises';
import { eventSchema, placeSchema, type EngineEvent, type EnginePlace } from '../schemas.js';

export async function importManualJson(
  filePath: string,
): Promise<{ places: EnginePlace[]; events: EngineEvent[] }> {
  const payload: unknown = JSON.parse(await readFile(filePath, 'utf8'));
  if (!payload || typeof payload !== 'object')
    throw new Error('Manual import must be a JSON object with places and events arrays.');
  const value = payload as Record<string, unknown>;
  return {
    places: placeSchema.array().parse(value.places ?? []),
    events: eventSchema.array().parse(value.events ?? []),
  };
}
