import type { DataSource } from './schemas.js';

export const SOURCES: DataSource[] = [
  {
    id: 'osm-sosnowiec',
    name: 'OpenStreetMap',
    url: 'https://www.openstreetmap.org/copyright',
    license: 'ODbL-1.0',
    access: 'api',
    enabled: true,
    notes:
      'Daily named-place query through Overpass.ch (OVERPASS_API_KEY Actions secret), with public endpoint failover. Covers shops, amenities, leisure, tourism and healthcare in an approximate 2.3 km Kazimierz catchment; OSM reuse requires attribution and ODbL compliance.',
  },
  {
    id: 'pok-kazimierz',
    name: 'Przystanek Otwartej Kultury Kazimierz',
    url: 'https://www.pok.sosnowiec.pl/kazimierz/',
    license: 'Factual event metadata; source terms not explicit',
    access: 'api',
    enabled: true,
    notes:
      'Public event-card metadata only; no photos or full descriptions are copied. Terms are not explicit.',
  },
  {
    id: 'pok-system',
    name: 'System POK Sosnowiec',
    url: 'https://system.pok.sosnowiec.pl/',
    license: 'Factual event metadata; reuse terms unverified',
    access: 'html',
    enabled: true,
    notes:
      'One bounded daily request to the public server-rendered offer page. Imports only dated one-off events explicitly listed for POK Kazimierz; recurring activities and other branches are skipped. No photos or descriptions are copied. robots.txt URL serves the normal page, not crawler directives; reuse terms remain unverified.',
  },
  {
    id: 'mosir-events',
    name: 'MOSiR Sosnowiec calendar',
    url: 'https://www.mosir.sosnowiec.pl/eventy.html',
    license: 'Unverified',
    access: 'manual',
    enabled: false,
    notes:
      'Calendar returned “Brak danych w podanym okresie” during source audit; no event API/feed verified.',
  },
  {
    id: 'manual-json',
    name: 'Manual reviewed JSON',
    url: 'https://github.com/',
    license: 'Supplied by data maintainer',
    access: 'manual',
    enabled: true,
    notes: 'Schema-validated JSON import; use for sources without verified automation permission.',
  },
];

export const USER_AGENT = 'MojKazimierzDataEngine/0.1 (automated neighborhood catalog import)';
export const REQUEST_TIMEOUT_MS = 15_000;
export const MAX_RESPONSE_BYTES = 8_000_000;
