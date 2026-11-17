import type { DataSource } from './schemas.js';

export const SOURCES: DataSource[] = [
  {
    id: 'ztm-local-alerts',
    name: 'Zarząd Transportu Metropolitalnego — komunikaty',
    url: 'https://rj.transportgzm.pl/v2/news/?lang=pl',
    license: 'Publiczne fakty operacyjne; warunki ponownego wykorzystania niezweryfikowane',
    access: 'html',
    enabled: true,
    notes: 'Ograniczony odczyt strony komunikatów. Import wyłącznie komunikatów jawnie wymieniających Kazimierz Górniczy lub nazwę przystanku z lokalnego GTFS. Sam numer linii nie potwierdza lokalnego wpływu. robots.txt nie blokuje lang=pl; brak udokumentowanego API, RSS/ICS i jawnej licencji. Publikowane są krótkie fakty, bez kopiowania treści artykułów; wymagany przegląd warunków ponownego wykorzystania.',
  },
  {
    id: 'water-local-alerts',
    name: 'Sosnowieckie Wodociągi — awarie i przerwy',
    url: 'https://rpwik.sosnowiec.pl/strefa-klienta/awarie-i-przerwy-w-dostawie-wody',
    license: 'Publiczne fakty operacyjne; warunki ponownego wykorzystania niezweryfikowane',
    access: 'html',
    enabled: true,
    notes: 'Odczyt jednej publicznej tabeli HTML; wyłącznie komunikaty wymieniające nazwę ulicy z lokalnego rejestru. robots.txt dopuszcza publiczną ścieżkę. Strona nie udostępnia potwierdzonego API/feedu ani jawnej licencji; publikowane są krótkie fakty i link do źródła, bez reprodukcji opisu.',
  },
  {
    id: 'sosnowiec-local-alerts',
    name: 'Urząd Miasta Sosnowiec — komunikaty o utrudnieniach',
    url: 'https://www.sosnowiec.pl/category/komunikacja/',
    license: 'Publiczne fakty operacyjne; warunki ponownego wykorzystania do weryfikacji',
    access: 'api',
    enabled: true,
    notes: 'WordPress REST API kategorii Komunikacja. Publikuje wyłącznie komunikaty o utrudnieniach, które jawnie wskazują Kazimierz Górniczy lub lokalny przystanek GTFS; sama nazwa Sosnowiec nie wystarcza. Komunikaty o trasach łączących dzielnicę z sąsiednim miastem są oznaczane jako regionalne bez fikcyjnej geometrii.',
  },
  {
    id: 'imgw-city-warnings',
    name: 'IMGW-PIB — ostrzeżenia meteorologiczne',
    url: 'https://danepubliczne.imgw.pl/api/data/warningsmeteo',
    license: 'Warunki IMGW-PIB; wymagane wskazanie i oznaczenie przetworzenia danych',
    access: 'api',
    enabled: true,
    notes: 'Oficjalny feed ostrzeżeń. Filtr po kodzie TERYT 2475 obejmuje całe miasto Sosnowiec, bez sugerowania dokładności dzielnicowej. Aplikacja wyświetla wymagane przypisanie IMGW-PIB i informację o przetworzeniu.',
  },
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
      'Scrapes event title, date, venue, description, category, price, source-hosted image URL, and published ticket or registration links from the public Kazimierz events page. Image bytes are not copied; source terms should be reviewed before expanding beyond linked public metadata.',
  },
  {
    id: 'pok-system',
    name: 'System POK Sosnowiec',
    url: 'https://system.pok.sosnowiec.pl/',
    license: 'Factual event metadata; reuse terms unverified',
    access: 'html',
    enabled: true,
    notes:
      'One bounded daily request to the public server-rendered offer page. Imports only dated one-off events explicitly listed for POK Kazimierz; recurring activities and other branches are skipped. Extracts descriptions, price, and the published registration URL; image bytes are not copied. Reuse terms remain unverified.',
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
