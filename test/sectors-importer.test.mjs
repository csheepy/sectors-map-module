import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeSectorsImport, buildPlanetDisplayData } from '../scripts/sectors/importer.js';
import { createSceneConfig, createSystemNotes, createSystemJournalEntries, createMarkerNotes, createMarkerJournalEntries } from '../scripts/sectors/scene.js';

const sample = JSON.parse(readFileSync(new URL('../example/Mondril Omicron - October 18, 2026.json', import.meta.url), 'utf8'));

test('normalizeSectorsImport resolves the sector and system hierarchy', () => {
  const map = normalizeSectorsImport(sample);

  assert.equal(map.sector.name, 'Mondril Omicron');
  assert.ok(map.systems.length > 0, 'Expected systems to be loaded');
  assert.ok(map.planets.length > 0, 'Expected planets to be loaded');
  assert.ok(Object.keys(map.systemIndex).length > 0, 'Expected a system index');
  assert.ok(map.sector.systems.length > 0, 'Expected sector-level systems attached');
});

test('buildPlanetDisplayData hides tags from players and reveals them to the GM', () => {
  const map = normalizeSectorsImport(sample);
  const planet = map.planets.find((entry) => entry.name === 'Deiones');

  assert.ok(planet, 'Expected Deiones to exist in the imported data');

  const playerView = buildPlanetDisplayData(planet, false);
  assert.equal(playerView.summary.name, 'Deiones');
  assert.equal(playerView.gmOnly, true);
  assert.ok(!playerView.tags || playerView.tags.length === 0, 'Players should not see tags by default');

  const gmView = buildPlanetDisplayData(planet, true);
  assert.ok(Array.isArray(gmView.tags), 'GM view should include tags');
  assert.ok(gmView.tags.length > 0, 'GM view should reveal tag data');
  assert.ok(gmView.tags[0].name, 'Tag entries should still be named');
});

test('createSceneConfig uses the Foundry SceneData shape and includes a tokenized system map', () => {
  const map = normalizeSectorsImport(sample);
  const config = createSceneConfig('Mondril Omicron', map, { columns: map.sector.columns, rows: map.sector.rows, gridType: 'odd-r' });

  assert.equal(config.name, 'Mondril Omicron');
  assert.equal(typeof config.grid.type, 'number');
  assert.equal(config.backgroundColor, '#969df3');
  assert.equal(config.grid.type, 4, 'Odd-column hex layout should be selected for the sector map');
  assert.ok(config.sceneMapData, 'Scene config should contain the scene map data object');
  assert.ok(config.sceneMapData.hexes.length > 0, 'Scene config should include generated hex entries');
});

test('normalizeSectorsImport keeps sector markers like black holes in the map data', () => {
  const map = normalizeSectorsImport(sample);
  const blackHoles = map.markers.filter((marker) => marker.entityType === 'blackHole');

  assert.ok(blackHoles.length >= 2, 'Expected two sector black hole markers to be imported');
  assert.ok(blackHoles.every((marker) => Number.isFinite(marker.x) && Number.isFinite(marker.y)), 'Black hole markers should retain x/y positions');
});

test('createSystemJournalEntries creates multiple pages per system and includes GM-only entity tags', () => {
  const map = normalizeSectorsImport(sample);
  const system = map.systems[0];
  const planetWithTags = map.planets.find((planet) => Array.isArray(planet.attributes?.tags) && planet.attributes.tags.length > 0);
  const journals = createSystemJournalEntries(map, true);
  const journal = journals.find((entry) => entry.flags['sectors-map-module'].systemId === system.id);

  assert.ok(journal, 'Expected a journal for the first imported system');
  assert.ok(journal.pages.length > 1, 'Each system journal should include multiple pages for the system and its entities');
  assert.ok(journal.pages.some((page) => page.name.includes(system.name)), 'System page should include the system name');
  assert.ok(journal.pages.some((page) => page.name.includes(system.planets[0].name)), 'At least one page should represent a planet in the system');
  assert.ok(planetWithTags, 'Expected at least one planet to include tags in the imported sample');
  const tagName = planetWithTags.attributes.tags[0].name;
  assert.ok(journal.pages.some((page) => page.text && typeof page.text === 'object' && String(page.text.content).includes(tagName)), 'GM-visible tag names should be included in page text');
});

test('createSystemJournalEntries includes system overview tags for planets and attached entities', () => {
  const map = normalizeSectorsImport(sample);
  const system = map.systems.find((candidate) => {
    const planetTags = (candidate.planets ?? []).some((planet) => Array.isArray(planet.attributes?.tags) && planet.attributes.tags.length > 0);
    if (planetTags) return true;

    const attachedEntries = Object.entries(map.raw).flatMap(([entityType, entries]) => {
      if (!entries || typeof entries !== 'object' || ['sector', 'system', 'planet'].includes(entityType)) return [];
      return Object.values(entries).filter((entry) => String(entry.parent ?? '') === String(candidate.id ?? ''));
    });

    return attachedEntries.some((entry) => Array.isArray(entry.attributes?.tags) && entry.attributes.tags.length > 0);
  });

  assert.ok(system, 'Expected a system with tags attached to its planets or subordinate entities');

  const journal = createSystemJournalEntries(map, true).find((entry) => entry.flags['sectors-map-module'].systemId === system.id);
  const overview = journal.pages.find((page) => page.name === `${system.name} Overview`);
  const tagSource = (system.planets ?? []).find((planet) => Array.isArray(planet.attributes?.tags) && planet.attributes.tags.length > 0)
    ?? Object.entries(map.raw).flatMap(([entityType, entries]) => {
      if (!entries || typeof entries !== 'object' || ['sector', 'system', 'planet'].includes(entityType)) return [];
      return Object.values(entries).filter((entry) => String(entry.parent ?? '') === String(system.id ?? ''));
    }).find((entry) => Array.isArray(entry.attributes?.tags) && entry.attributes.tags.length > 0);

  assert.ok(overview, 'Expected an overview page for the selected system');
  assert.ok(tagSource, 'Expected a system child entity with tags to exist');
  assert.ok(overview.text && typeof overview.text === 'object' && String(overview.text.content).includes(tagSource.attributes.tags[0].name), 'System overview should include the tag names from planets and attached entities');
});

test('type text pages store HTML content in the Foundry journal text object format', () => {
  const map = normalizeSectorsImport(sample);
  const journals = createSystemJournalEntries(map, true);
  const overview = journals[0]?.pages?.find((page) => page.name === `${journals[0].name} Overview`);

  assert.ok(overview, 'Expected an overview page for the first generated system journal');
  assert.equal(typeof overview.text, 'object', 'Foundry text pages should store a text object instead of a raw string');
  assert.ok(typeof overview.text.content === 'string' && overview.text.content.length > 0, 'Foundry text page content should include the generated HTML body');
  assert.ok(Number.isInteger(overview.text.format), 'Foundry text pages should include a format integer');
  assert.ok(String(overview.text.content).includes('<h2>'), 'Overview content should include actual HTML markup, not an empty format object');
});

test('createSystemNotes builds scene-linked note entries for each system', () => {
  const map = normalizeSectorsImport(sample);
  const notes = createSystemNotes(map, true);
  const journals = createSystemJournalEntries(map, true);

  assert.ok(notes.length > 0, 'Expected system scene notes to be generated');
  assert.ok(journals.length > 0, 'Expected system journals to be generated');
  assert.ok(notes.every((note) => typeof note.text === 'string' && note.text.length > 0), 'Each note should use the system name as visible text');
  assert.ok(notes.every((note) => note.text === map.systemIndex[note.flags['sectors-map-module'].systemId]?.name), 'Each note text should match the system name');
  assert.ok(journals.every((journal) => Array.isArray(journal.pages) && journal.pages.length > 0), 'Each journal should contain embedded text pages');
  assert.ok(journals.every((journal) => journal.pages[0].text && typeof journal.pages[0].text === 'object' && typeof journal.pages[0].text.content === 'string' && journal.pages[0].text.content.length > 0), 'Each journal page should contain the detailed system data in the Foundry text object format');
  assert.ok(journals.every((journal) => journal.name === map.systemIndex[journal.flags['sectors-map-module'].systemId]?.name), 'Each journal should use the system name as its heading');
  assert.ok(notes.every((note) => Number.isFinite(note.x) && Number.isFinite(note.y)), 'Each note should carry scene coordinates');
  assert.ok(notes[0].flags?.['sectors-map-module']?.systemId, 'Each note should flag its source system');
});

test('note-to-journal linkage matches by systemId instead of array position', () => {
  const map = normalizeSectorsImport(sample);
  const systemNotes = createSystemNotes(map, true);
  const systemJournals = createSystemJournalEntries(map, true);
  const journalBySystemId = new Map(systemJournals.map((journal) => [journal.flags['sectors-map-module'].systemId, journal]));

  const linkedNotes = systemNotes.map((note) => ({
    note,
    expectedJournal: journalBySystemId.get(note.flags['sectors-map-module'].systemId),
  }));

  assert.ok(linkedNotes.every(({ note, expectedJournal }) => note.flags['sectors-map-module'].systemId === expectedJournal?.flags['sectors-map-module'].systemId), 'Each note should link to the journal matching its own system ID');
});

test('sector markers like black holes create notes and journals', () => {
  const map = normalizeSectorsImport(sample);
  const blackHoleMarkers = map.markers.filter((marker) => marker.entityType === 'blackHole');

  assert.ok(blackHoleMarkers.length > 0, 'Expected at least one black hole marker in the sample data');

  const notes = createMarkerNotes(map, true);
  const journals = createMarkerJournalEntries(map, true);
  const blackHoleNotes = notes.filter((note) => note.flags['sectors-map-module'].entityType === 'blackHole');
  const blackHoleJournals = journals.filter((journal) => journal.flags['sectors-map-module'].entityType === 'blackHole');

  assert.ok(blackHoleNotes.length >= blackHoleMarkers.length, 'Expected a note for each black hole marker');
  assert.ok(blackHoleJournals.length >= blackHoleMarkers.length, 'Expected a journal for each black hole marker');
  assert.ok(blackHoleNotes.every((note) => Number.isFinite(note.x) && Number.isFinite(note.y)), 'Black hole notes should keep their sector coordinates');
  assert.ok(blackHoleJournals.every((journal) => journal.pages.length > 0), 'Black hole journals should include content pages');
});

