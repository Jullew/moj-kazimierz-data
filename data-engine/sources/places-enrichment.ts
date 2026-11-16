import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { placePhotoSchema, sourceSchema, type EnginePlace } from '../schemas.js';

const enrichmentSchema = z.object({
  curatedId: z.string().min(1),
  osmSourceId: z.string().regex(/^osm:(node|way|relation)\/\d+$/),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  description: z.string().optional(),
  highlights: z.array(z.string().min(1)).optional(),
  photo: placePhotoSchema.optional(),
  detailsSources: sourceSchema.array().optional(),
});

const file = new URL('./places-enrichment.json', import.meta.url);

export async function enrichOsmPlaces(places: EnginePlace[]): Promise<EnginePlace[]> {
  const enrichments = enrichmentSchema.array().parse(JSON.parse(await readFile(file, 'utf8')));
  const bySourceId = new Map(enrichments.map((row) => [row.osmSourceId, row]));
  return places.map((place) => {
    const enrichment = place.sourceIds
      .map((sourceId) => bySourceId.get(sourceId))
      .find((row) => row !== undefined);
    if (!enrichment) return place;
    return {
      ...place,
      ...(enrichment.address ? { address: enrichment.address } : {}),
      ...(enrichment.phone ? { phone: enrichment.phone } : {}),
      ...(enrichment.email ? { email: enrichment.email } : {}),
      ...(enrichment.website ? { website: enrichment.website } : {}),
      ...(enrichment.description ? { description: enrichment.description } : {}),
      ...(enrichment.highlights ? { highlights: enrichment.highlights } : {}),
      ...(enrichment.photo ? { photo: enrichment.photo } : {}),
      ...(enrichment.detailsSources ? { detailsSources: enrichment.detailsSources } : {}),
      sourceIds: [...new Set([...place.sourceIds, enrichment.curatedId])],
    };
  });
}
