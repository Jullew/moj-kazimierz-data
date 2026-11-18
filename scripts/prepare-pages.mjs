import { copyFile, cp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const outputDir = path.resolve('data-engine/output');
const deployDir = path.resolve('dist');
const manifest = JSON.parse(await readFile(path.join(outputDir, 'manifest.json'), 'utf8'));
const versionDir = path.join(outputDir, 'versions', manifest.version);
const deployVersionDir = path.join(deployDir, 'versions', manifest.version);

await rm(deployDir, { recursive: true, force: true });
await mkdir(deployVersionDir, { recursive: true });
await copyFile(path.join(outputDir, 'manifest.json'), path.join(deployDir, 'manifest.json'));
await copyFile(path.join(outputDir, 'sources.json'), path.join(deployDir, 'sources.json'));
for (const name of ['places.json', 'events.json', 'diff.json', 'place-updates.json', 'place-news-sources.json']) {
  await copyFile(path.join(versionDir, name), path.join(deployVersionDir, name));
}
if (manifest.alerts) {
  await copyFile(path.join(versionDir, 'alerts.json'), path.join(deployVersionDir, 'alerts.json'));
}
try {
  await cp(path.join(versionDir, 'media'), path.join(deployVersionDir, 'media'), { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
