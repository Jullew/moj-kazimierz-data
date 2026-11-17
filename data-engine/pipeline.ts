import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './config.js';
import { fetchOsmSource } from './sources/osm.js';
import { enrichOsmPlaces } from './sources/places-enrichment.js';
import { fetchPokEvents } from './sources/pok.js';
import { fetchPokSystemEvents } from './sources/pok-system.js';
import {
  eventSchema,
  localAlertSchema,
  placeSchema,
  versionSchema,
  type EngineAlert,
  type EngineEvent,
  type EnginePlace,
} from './schemas.js';
import { diffRecords, isPublishableEvent, mergeEvents, mergePlaces } from './merge.js';
import { fetchZtmAlerts } from './sources/alerts/ztm.js';
import { fetchWaterAlerts } from './sources/alerts/water.js';
import { fetchSosnowiecAlerts } from './sources/alerts/sosnowiec.js';
import { fetchImgwAlerts } from './sources/alerts/imgw.js';
import { mergeAlerts } from './pipeline/alerts/lifecycle.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'data-engine', 'output');
const args = process.argv.slice(2);
const selected = args.find((arg) => arg.startsWith('--source='))?.split('=')[1] ?? 'all';

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
async function readPrevious(file: string) {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

async function run() {
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const errors: string[] = [];
  let fetched = 0;
  let places: EnginePlace[] = [];
  let events: EngineEvent[] = [];
  let alerts: EngineAlert[] = [];
  const refreshedAlertProviders: string[] = [];
  const wantPlaces = selected === 'all' || selected === 'osm';
  const wantPok = selected === 'all' || selected === 'pok';
  const wantPokSystem = selected === 'all' || selected === 'pok-system';
  const wantAlerts = selected === 'all' || selected === 'alerts';
  if (!wantPlaces && !wantPok && !wantPokSystem && !wantAlerts && selected !== 'manual')
    throw new Error(`Unknown source: ${selected}`);
  try {
    if (wantPlaces) {
      try {
        const result = await fetchOsmSource();
        places = await enrichOsmPlaces(result.places);
        fetched += result.fetched;
        if (!places.length) throw new Error('OSM returned no candidate places');
      } catch (error) {
        if (selected !== 'all') throw error;
        errors.push(`OSM: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (wantPok) {
      try {
        const fromPok = await fetchPokEvents();
        events.push(...fromPok);
        fetched += fromPok.length;
        if (!fromPok.length) throw new Error('no parseable events');
      } catch (error) {
        if (selected !== 'all') throw error;
        errors.push(`POK Kazimierz: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (wantPokSystem) {
      try {
        const fromSystem = await fetchPokSystemEvents();
        events.push(...fromSystem);
        fetched += fromSystem.length;
        if (!fromSystem.length) throw new Error('no parseable events');
      } catch (error) {
        if (selected !== 'all') throw error;
        errors.push(`System POK: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (wantAlerts) {
      for (const [name, provider, host, importer] of [['ZTM', 'Zarząd Transportu Metropolitalnego', 'rj.transportgzm.pl', fetchZtmAlerts], ['Wodociągi', 'Sosnowieckie Wodociągi', 'rpwik.sosnowiec.pl', fetchWaterAlerts], ['Urząd Miasta Sosnowiec', 'Urząd Miasta Sosnowiec', 'sosnowiec.pl', fetchSosnowiecAlerts], ['IMGW', 'IMGW-PIB', 'danepubliczne.imgw.pl', fetchImgwAlerts]] as const) {
        try {
          const records = await importer();
          alerts.push(...records);
          refreshedAlertProviders.push(provider);
          refreshedAlertProviders.push(host);
          fetched += records.length;
        } catch (error) {
          if (selected !== 'all') throw error;
          errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    if (!places.length && !events.length && !alerts.length && selected !== 'alerts') {
      throw new Error(
        'No source returned publishable records; refusing to publish an empty catalog.',
      );
    }
    if (selected === 'manual') {
      const filePath = args.find((arg) => arg.startsWith('--file='))?.slice('--file='.length);
      if (!filePath) throw new Error('Manual source requires --file=path/to/import.json');
      const manual = await import('./sources/manual.js').then((module) =>
        module.importManualJson(filePath),
      );
      places = manual.places;
      events = manual.events;
      fetched = places.length + events.length;
      if (!fetched) throw new Error('Manual import contains no records');
    }
    const counts = await publish({ runId, startedAt, selected, places, events, alerts, refreshedAlertProviders, fetched, errors });
    const report = {
      id: runId,
      startedAt,
      completedAt: new Date().toISOString(),
      sources: [selected],
      fetched,
      accepted: counts.accepted,
      deduplicated: counts.deduplicated,
      rejected: counts.rejected,
      reviewed: counts.reviewed,
      errors,
      status: 'succeeded',
    };
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    const report = {
      id: runId,
      startedAt,
      completedAt: new Date().toISOString(),
      sources: [selected],
      fetched,
      accepted: 0,
      deduplicated: 0,
      rejected: fetched,
      reviewed: 0,
      errors,
      status: 'failed',
    };
    await mkdir(path.join(outputDir, 'reports'), { recursive: true });
    await writeFile(
      path.join(outputDir, 'reports', `${runId}.json`),
      JSON.stringify(report, null, 2),
    );
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  }
}

async function publish(input: {
  runId: string;
  startedAt: string;
  selected: string;
  places: EnginePlace[];
  events: EngineEvent[];
  alerts: EngineAlert[];
  refreshedAlertProviders: string[];
  fetched: number;
  errors: string[];
}): Promise<{ accepted: number; rejected: number; reviewed: number; deduplicated: number }> {
  await mkdir(outputDir, { recursive: true });
  let previousPlacesRaw = await readPrevious(path.join(outputDir, 'latest-places.json'));
  let previousEventsRaw = await readPrevious(path.join(outputDir, 'latest-events.json'));
  let previousAlertsRaw = await readPrevious(path.join(outputDir, 'latest-alerts.json')) ?? [];
  if (process.env.DATA_PUBLIC_URL) {
    const base = process.env.DATA_PUBLIC_URL.replace(/\/$/, '');
    const manifestResponse = await fetch(`${base}/manifest.json`);
    if (manifestResponse.ok) {
      const remote = versionSchema.parse(await manifestResponse.json());
      const [remotePlaces, remoteEvents, remoteAlerts] = await Promise.all([
        fetch(new URL(remote.places, `${base}/`)).then((response) =>
          response.ok ? response.json() : Promise.reject(new Error('remote places unavailable')),
        ),
        fetch(new URL(remote.events, `${base}/`)).then((response) =>
          response.ok ? response.json() : Promise.reject(new Error('remote events unavailable')),
        ),
        remote.alerts ? fetch(new URL(remote.alerts, `${base}/`)).then((response) => response.ok ? response.json() : Promise.reject(new Error('remote alerts unavailable'))) : Promise.resolve([]),
      ]);
      previousPlacesRaw = remotePlaces;
      previousEventsRaw = remoteEvents;
      previousAlertsRaw = remoteAlerts;
      const previousVersionDir = path.join(outputDir, 'versions', remote.version);
      await mkdir(previousVersionDir, { recursive: true });
      await writeFile(path.join(previousVersionDir, 'places.json'), JSON.stringify(remotePlaces));
      await writeFile(path.join(previousVersionDir, 'events.json'), JSON.stringify(remoteEvents));
      await writeFile(path.join(previousVersionDir, 'alerts.json'), JSON.stringify(remoteAlerts));
    } else if (input.selected !== 'all' && manifestResponse.status !== 404) {
      throw new Error(
        'Could not load the last published catalog; partial import aborted to protect the other source.',
      );
    } else if (input.selected !== 'all') {
      console.warn('No Pages catalog exists yet; bootstrapping from the checked-in local catalog.');
    }
  }
  const previousPlaces = placeSchema.array().safeParse(previousPlacesRaw ?? []);
  const previousEvents = eventSchema.array().safeParse(previousEventsRaw ?? []);
  const previousAlerts = localAlertSchema.array().safeParse(previousAlertsRaw ?? []);
  if (input.selected !== 'all' && (!previousPlaces.success || !previousEvents.success || !previousAlerts.success)) {
    throw new Error('Previous catalog is missing or invalid; partial import aborted.');
  }
  if (
    input.selected !== 'all' &&
    (!Array.isArray(previousPlacesRaw) || !Array.isArray(previousEventsRaw))
  ) {
    throw new Error(
      'Previous catalog is missing; partial import aborted. Run a full import first.',
    );
  }
  const importedPlaces = mergePlaces(input.places);
  const mergedPlaces = mergePlaces([
    ...(previousPlaces.success ? previousPlaces.data : []),
    ...input.places,
  ]);
  const publishableEvents = input.events.filter(isPublishableEvent);
  const uniquePublishableEvents = mergeEvents(publishableEvents);
  const candidateDuplicates = publishableEvents.length - uniquePublishableEvents.length;
  const previousEventCount = previousEvents.success ? previousEvents.data.length : 0;
  const mergedEvents = mergeEvents([
    ...(previousEvents.success ? previousEvents.data : []),
    ...uniquePublishableEvents,
  ]);
  const retainedAlerts = (previousAlerts.success ? previousAlerts.data : []).filter((alert) => !input.refreshedAlertProviders.some((token) => alert.source.provider === token || new URL(alert.source.url).hostname === token || new URL(alert.source.url).hostname.endsWith(`.${token}`)));
  const mergedAlerts = mergeAlerts([...retainedAlerts, ...input.alerts], new Date(input.startedAt));
  const eventDeduplicated = Math.max(
    candidateDuplicates,
    publishableEvents.length - Math.max(0, mergedEvents.length - previousEventCount),
  );
  const placeDeduplicated = input.places.length - importedPlaces.length;
  const deduplicated = eventDeduplicated + placeDeduplicated;
  const rejected = input.fetched - input.places.length - publishableEvents.length - input.alerts.length;
  const reviewed =
    mergedPlaces.filter((place) => place.confidence < 0.72).length +
    input.events.filter(
      (event) => event.status !== 'scheduled' || !event.locationVerified || event.confidence < 0.72,
    ).length;
  const review = [
    ...mergedPlaces
      .filter((place) => place.confidence < 0.72)
      .map((record) => ({
        type: 'place',
        reason: 'low-confidence or approximate locality data',
        record,
      })),
    ...input.events
      .filter(
        (event) =>
          event.status !== 'scheduled' || !event.locationVerified || event.confidence < 0.72,
      )
      .map((record) => ({
        type: 'event',
        reason:
          record.status !== 'scheduled'
            ? `event is ${record.status}`
            : 'event location or date needs review',
        record,
      })),
  ];
  const diff = {
    places: diffRecords(previousPlaces.success ? previousPlaces.data : [], input.places),
    events: diffRecords(previousEvents.success ? previousEvents.data : [], input.events),
    alerts: diffRecords(previousAlerts.success ? previousAlerts.data : [], mergedAlerts),
  };
  // Publication receives only schema-valid records; every file is fully staged before the manifest pointer changes.
  const validPlaces = placeSchema.array().parse(mergedPlaces);
  const validEvents = eventSchema.array().parse(mergedEvents);
  const validAlerts = localAlertSchema.array().parse(mergedAlerts);
  const stamp = new Date().toISOString();
  const version = `${stamp.slice(0, 10).replaceAll('-', '')}-${hash({ places: validPlaces, events: validEvents, alerts: validAlerts, sources: SOURCES }).slice(0, 12)}`;
  const versionDir = path.join(outputDir, 'versions', version);
  const stageDir = path.join(outputDir, '.stage', input.runId);
  await mkdir(stageDir, { recursive: true });
  await writeFile(path.join(stageDir, 'places.json'), JSON.stringify(validPlaces));
  await writeFile(path.join(stageDir, 'events.json'), JSON.stringify(validEvents));
  await writeFile(path.join(stageDir, 'alerts.json'), JSON.stringify(validAlerts));
  await writeFile(path.join(stageDir, 'review.json'), JSON.stringify(review, null, 2));
  await writeFile(path.join(stageDir, 'diff.json'), JSON.stringify(diff, null, 2));
  await writeFile(path.join(stageDir, 'sources.json'), JSON.stringify(SOURCES, null, 2));
  const manifest = versionSchema.parse({
    schemaVersion: 1,
    version,
    generatedAt: stamp,
    places: `versions/${version}/places.json`,
    events: `versions/${version}/events.json`,
    diff: `versions/${version}/diff.json`,
    counts: { places: validPlaces.length, events: validEvents.length, alerts: validAlerts.length },
    alerts: `versions/${version}/alerts.json`,
  });
  const counts = {
    accepted: importedPlaces.length + uniquePublishableEvents.length + input.alerts.length,
    rejected,
    reviewed,
    deduplicated,
  };
  const runReport = {
    id: input.runId,
    startedAt: input.startedAt,
    completedAt: stamp,
    sources: [input.selected],
    fetched: input.fetched,
    ...counts,
    errors: input.errors,
    status: 'succeeded',
  };
  await writeFile(path.join(stageDir, 'run.json'), JSON.stringify(runReport, null, 2));
  await mkdir(path.join(outputDir, 'reports'), { recursive: true });
  await writeFile(
    path.join(outputDir, 'reports', `${input.runId}.json`),
    JSON.stringify(runReport, null, 2),
  );
  await mkdir(path.dirname(versionDir), { recursive: true });
  try {
    await access(versionDir);
    await rm(stageDir, { recursive: true, force: true });
  } catch {
    await rename(stageDir, versionDir);
  }
  const manifestPath = path.join(outputDir, 'manifest.json');
  const manifestTemp = `${manifestPath}.${input.runId}.tmp`;
  await writeFile(manifestTemp, JSON.stringify(manifest, null, 2));
  const sourcesTemp = path.join(outputDir, 'sources.json.tmp');
  await writeFile(sourcesTemp, JSON.stringify(SOURCES, null, 2));
  await rename(sourcesTemp, path.join(outputDir, 'sources.json'));
  // Legacy latest copies let subsequent scheduled runs merge without reading the manifest.
  await writeFile(path.join(outputDir, 'latest-places.json.tmp'), JSON.stringify(validPlaces));
  await writeFile(path.join(outputDir, 'latest-events.json.tmp'), JSON.stringify(validEvents));
  await writeFile(path.join(outputDir, 'latest-alerts.json.tmp'), JSON.stringify(validAlerts));
  await rename(
    path.join(outputDir, 'latest-places.json.tmp'),
    path.join(outputDir, 'latest-places.json'),
  );
  await rename(path.join(outputDir, 'latest-alerts.json.tmp'), path.join(outputDir, 'latest-alerts.json'));
  await rename(
    path.join(outputDir, 'latest-events.json.tmp'),
    path.join(outputDir, 'latest-events.json'),
  );
  await rename(manifestTemp, manifestPath);
  return counts;
}

void run();
