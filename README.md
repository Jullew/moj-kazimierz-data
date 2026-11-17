# Mój Kazimierz public data catalog

This repository contains the public, versioned JSON catalog consumed by the Mój Kazimierz mobile app and the small import engine that refreshes it.

## Catalog

The app reads the current manifest and the files it references from:

`https://jullew.github.io/moj-kazimierz-data/manifest.json`

The publisher runs daily at 04:00 Europe/Warsaw. It imports OpenStreetMap place metadata and event metadata from the POK Kazimierz page and the POK ticketing system. Matching events from the two POK sources are merged and keep both source references. Only one-off events explicitly listed for POK Kazimierz are imported from the ticketing system; recurring activities and other branches are skipped.

Local alerts are refreshed hourly by a separate workflow. It reads ZTM GZM, Sosnowieckie Wodociągi, the municipal WordPress API and IMGW meteorological warnings, then publishes `alerts.json` through the same versioned manifest without replacing places or events. ZTM alerts require a named Kazimierz stop or explicit district mention; line numbers alone do not establish local impact. City notices require an explicit district or local stop reference, so region-wide road works are included only when the city describes their connection to Kazimierz Górniczy. Water notices must match a verified local street. IMGW warnings are filtered by TERYT 2475 and labeled as covering all Sosnowiec. The map shows alert cards without invented coordinates when a source supplies no verified geometry. Push delivery is not enabled; it needs a separate sending service and a configured development or production build.

The OSM import uses the `OVERPASS_API_KEY` GitHub Actions secret for Overpass.ch, then falls back to public Overpass instances. The 2.3 km search area is centered on the OSM Kazimierz neighbourhood point because OSM does not provide a neighbourhood boundary polygon.

Event source reuse terms have not been stated explicitly by the source operators. The catalog contains factual event metadata and source links only. OpenStreetMap data is attributed under ODbL.

## Run manually

```sh
pnpm install
pnpm data:import -- --source=all
pnpm data:import:alerts
pnpm prepare:pages
```

For a local OSM import, set `OVERPASS_API_KEY` in the process environment. Never commit the key.
