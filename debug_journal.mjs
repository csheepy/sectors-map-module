import fs from 'node:fs';
import { normalizeSectorsImport } from './scripts/sectors/importer.js';
import { createSystemJournalEntries } from './scripts/sectors/scene.js';

const sample = JSON.parse(fs.readFileSync('./example/Mondril Omicron - October 18, 2026.json', 'utf8'));
const map = normalizeSectorsImport(sample);
console.log('System count', map.systems.length);
for (const system of map.systems.slice(0, 3)) {
  console.log('SYSTEM', system.name, 'planetCount', system.planets.length);
  for (const planet of system.planets.slice(0, 3)) {
    console.log('  PLANET', planet.name, 'tags', (planet.attributes?.tags ?? []).map((tag) => tag.name).slice(0, 5));
  }
  const journal = createSystemJournalEntries(map, true).find((entry) => entry.flags['sectors-map-module'].systemId === system.id);
  console.log('  JOURNAL PAGES', journal.pages.length);
  for (const page of journal.pages.slice(0, 5)) {
    console.log('   PAGE', page.name);
    const text = String(page.text).slice(0, 250).replace(/\n/g, ' ');
    console.log('   TEXT', text);
  }
}
