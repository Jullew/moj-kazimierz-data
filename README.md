# Mój Kazimierz public data catalog

This repository contains the public, versioned JSON catalog consumed by the Mój Kazimierz mobile app and the small import engine that refreshes it.

## Catalog

The app reads the current manifest and the files it references from:

`https://jullew.github.io/moj-kazimierz-data/manifest.json`

The publisher runs daily at 04:00 Europe/Warsaw. It imports OpenStreetMap place metadata and event metadata from the POK Kazimierz page and the POK ticketing system. Matching events from the two POK sources are merged and keep both source references. Only one-off events explicitly listed for POK Kazimierz are imported from the ticketing system; recurring activities and other branches are skipped.

Event source reuse terms have not been stated explicitly by the source operators. The catalog contains factual event metadata and source links only. OpenStreetMap data is attributed under ODbL.

## Run manually

```sh
pnpm install
pnpm data:import -- --source=all
pnpm prepare:pages
```
