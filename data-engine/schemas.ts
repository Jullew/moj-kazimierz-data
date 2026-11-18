import { z } from 'zod';

export const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number(), z.number()]),
});
export const sourceSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().optional(),
  license: z.string().optional(),
  attribution: z.string().optional(),
  retrievedAt: z.string().datetime(),
});
export const placePhotoSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  creator: z.string().min(1),
  license: z.string().min(1),
  sourceUrl: z.string().url(),
});
export const placeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(['groceries', 'food', 'services', 'health', 'culture', 'other']),
  address: z.string(),
  coordinates: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  description: z.string().optional(),
  highlights: z.array(z.string().min(1)).optional(),
  photo: placePhotoSchema.optional(),
  detailsSources: sourceSchema.array().optional(),
  openingHours: z.record(z.string(), z.unknown()).optional(),
  openingHoursNote: z.string().optional(),
  lastVerified: z.string().date().optional(),
  source: sourceSchema,
  sourceIds: z.array(z.string()).min(1),
  updatedAt: z.string().datetime(),
  confidence: z.number().min(0).max(1),
  geometry: pointSchema,
});
export const eventSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }).optional(),
    venue: z.string().optional(),
    description: z.string().optional(),
    imageUrl: z.string().url().optional(),
    category: z.enum(['culture', 'sport', 'family', 'community', 'other']).optional(),
    price: z.string().optional(),
    registrationUrl: z.string().url().optional(),
    ticketUrl: z.string().url().optional(),
    status: z.enum(['scheduled', 'cancelled', 'postponed']),
    organizer: z.string().optional(),
    sourceUrl: z.string().url(),
    sourceUrls: z.array(z.string().url()).optional(),
    sourceIds: z.array(z.string()).min(1),
    source: sourceSchema,
    updatedAt: z.string().datetime(),
    confidence: z.number().min(0).max(1),
    locationVerified: z.boolean(),
    locationBasis: z.enum(['explicit', 'host-page']).optional(),
  })
  .refine(
    (value) => !value.endsAt || Date.parse(value.endsAt) >= Date.parse(value.startsAt),
    'Event end precedes start',
  );
export const dataSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  license: z.string(),
  access: z.enum(['api', 'html', 'manual']),
  enabled: z.boolean(),
  notes: z.string(),
});
export const versionSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.string(),
  generatedAt: z.string().datetime(),
  places: z.string(),
  events: z.string(),
  diff: z.string().optional(),
  counts: z.object({
    places: z.number().int().nonnegative(),
    events: z.number().int().nonnegative(),
  }).extend({ alerts: z.number().int().nonnegative().optional(), placeUpdates: z.number().int().nonnegative().optional() }),
  alerts: z.string().optional(),
  placeUpdates: z.string().optional(),
  placeNewsSources: z.string().optional(),
});

export const localAlertSchema = z.object({
  id: z.string().min(1),
  category: z.enum(['transport', 'roads', 'water', 'electricity', 'heating', 'weather', 'municipal', 'other']),
  title: z.string().min(1),
  summary: z.string().min(1),
  status: z.enum(['planned', 'ongoing', 'resolved', 'cancelled', 'unknown']),
  severity: z.enum(['info', 'warning', 'critical']),
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  updatedAt: z.string().datetime({ offset: true }),
  startsAt: z.string().datetime({ offset: true }).nullable(),
  endsAt: z.string().datetime({ offset: true }).nullable(),
  source: z.object({ provider: z.string().min(1), externalId: z.string().nullable(), url: z.string().url(), fetchedAt: z.string().datetime({ offset: true }), attribution: z.string().optional() }),
  location: z.object({ areaIds: z.array(z.string()), streetIds: z.array(z.string()), stopIds: z.array(z.string()), routeIds: z.array(z.string()), geometry: z.unknown().nullable(), scope: z.enum(['street', 'district', 'city', 'region', 'unknown']) }),
  relevance: z.object({ confirmed: z.boolean(), reason: z.string().min(1) }),
  lastVerifiedAt: z.string().datetime({ offset: true }),
});
export const importRunSchema = z.object({
  id: z.string(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  sources: z.array(z.string()),
  fetched: z.number().int().nonnegative(),
  deduplicated: z.number().int().nonnegative().default(0),
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  reviewed: z.number().int().nonnegative(),
  errors: z.array(z.string()),
  status: z.enum(['running', 'succeeded', 'failed']),
});

export type EnginePlace = z.infer<typeof placeSchema>;
export type EngineEvent = z.infer<typeof eventSchema>;
export type EngineAlert = z.infer<typeof localAlertSchema>;
export type DataSource = z.infer<typeof dataSourceSchema>;
export type DataVersion = z.infer<typeof versionSchema>;
export type ImportRun = z.infer<typeof importRunSchema>;
