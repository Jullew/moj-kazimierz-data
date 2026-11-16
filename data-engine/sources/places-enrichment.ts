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
  openingHours: z.record(z.string(), z.unknown()).optional(),
  openingHoursNote: z.string().optional(),
  photo: placePhotoSchema.optional(),
  detailsSources: sourceSchema.array().optional(),
});

const file = new URL('./places-enrichment.json', import.meta.url);

export async function enrichOsmPlaces(places: EnginePlace[]): Promise<EnginePlace[]> {
  const enrichments = enrichmentSchema.array().parse(JSON.parse(await readFile(file, 'utf8')));
  return places.map((place) => {
    const matching = enrichments.filter((row) => place.sourceIds.includes(row.osmSourceId));
    if (!matching.length) return place;
    const enrichment = matching.reduce((combined, row) => ({
      ...combined,
      ...row,
      detailsSources: [...(combined.detailsSources ?? []), ...(row.detailsSources ?? [])]
        .filter((source, index, sources) => sources.findIndex((candidate) => candidate.url === source.url) === index),
    }));
    return {
      ...place,
      ...(enrichment.address ? { address: enrichment.address } : {}),
      ...(enrichment.phone ? { phone: enrichment.phone } : {}),
      ...(enrichment.email ? { email: enrichment.email } : {}),
      ...(enrichment.website ? { website: enrichment.website } : {}),
      ...(enrichment.description ? { description: enrichment.description } : {}),
      ...(enrichment.highlights ? { highlights: enrichment.highlights } : {}),
      ...(enrichment.openingHours ? { openingHours: enrichment.openingHours } : {}),
      ...(enrichment.openingHoursNote ? { openingHoursNote: enrichment.openingHoursNote } : {}),
      ...(enrichment.photo ? { photo: enrichment.photo } : {}),
      ...(enrichment.detailsSources ? { detailsSources: enrichment.detailsSources } : {}),
      sourceIds: [...new Set([...place.sourceIds, ...matching.map((row) => row.curatedId)])],
    };
  });
}
