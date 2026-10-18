import { normalizeSectorsImport, buildPlanetDisplayData, buildSystemSummary } from './sectors/importer.js';
import { createSceneConfig, buildSceneMapData, createTokenPlacement, createSystemNotes, createSystemJournalEntries, createMarkerNotes, createMarkerJournalEntries } from './sectors/scene.js';

const MODULE_ID = 'sectors-map-module';

function getSettings() {
  return game?.settings ?? null;
}

async function importSectorsJsonFromFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const map = normalizeSectorsImport(parsed);

  game.sectorsMap = {
    importer: { normalizeSectorsImport },
    cache: map,
    scene: buildSceneMapData(map),
    systemSummary: map.systems.map((system) => buildSystemSummary(system, game.user.isGM)),
  };

  if (getSettings()) {
    game.settings.set(MODULE_ID, 'lastImportData', JSON.stringify(parsed));
    game.settings.set(MODULE_ID, 'lastImportName', map.sector.name);
  }

  ui.notifications?.info(`Imported ${map.sector.name} (${map.stats.totalSystems} systems / ${map.stats.totalPlanets} planets)`);
  return map;
}

async function createMapSceneFromImport(map, sceneName = null) {
  const config = createSceneConfig(sceneName ?? map.sector.name, map, { columns: map.sector.columns || 8, rows: map.sector.rows || 10 });

  const existing = game.scenes?.find((scene) => scene.name === config.name);
  if (existing) {
    await existing.activate();
    return existing;
  }

  if (!canvas) {
    console.warn('Sectors Map Module | Canvas is not ready; scene config generated but not rendered.');
    return null;
  }

  const scene = await Scene.create(config);
  if (!scene) {
    console.warn('Sectors Map Module | Scene creation returned no document.');
    return null;
  }

  const systemNotes = createSystemNotes(map, game.user.isGM);
  const systemJournals = createSystemJournalEntries(map, game.user.isGM);
  const markerNotes = createMarkerNotes(map, game.user.isGM);
  const markerJournals = createMarkerJournalEntries(map, game.user.isGM);

  const allJournals = [...systemJournals, ...markerJournals];
  const createdJournals = allJournals.length ? await JournalEntry.createDocuments(allJournals) : [];
  const journalBySystemId = new Map((createdJournals ?? []).map((journal) => {
    const systemId = journal?.flags?.['sectors-map-module']?.systemId ?? null;
    return [systemId, journal];
  }));
  const journalByEntityId = new Map((createdJournals ?? []).map((journal) => {
    const entityId = journal?.flags?.['sectors-map-module']?.entityId ?? null;
    return [entityId, journal];
  }));

  const notesWithJournals = [...systemNotes, ...markerNotes].map((note) => {
    const metadata = note?.flags?.['sectors-map-module'] ?? {};
    const systemId = metadata.systemId ?? null;
    const entityId = metadata.entityId ?? null;
    const journal = systemId ? journalBySystemId.get(systemId) : entityId ? journalByEntityId.get(entityId) : null;

    return {
      ...note,
      entryId: journal?.id ?? null,
    };
  });

  if (notesWithJournals.length) {
    await scene.createEmbeddedDocuments('Note', notesWithJournals);
  }

  await scene.activate();
  return scene;
}

function getPlanetInfoForSystem(systemId) {
  const system = game.sectorsMap?.cache?.systemIndex?.[systemId] ?? null;
  if (!system) return [];

  return (system.planets ?? []).map((planet) => ({
    ...buildPlanetDisplayData(planet, game.user.isGM),
    planet,
  }));
}

async function placeTokenOnSystem(systemId, tokenName = 'Explorer') {
  const system = game.sectorsMap?.cache?.systemIndex?.[systemId];
  if (!system || !canvas) return null;

  const placement = createTokenPlacement(system, { tokenName, img: '' });
  const token = await canvas.scene.createEmbeddedDocuments('Token', [{
    name: tokenName,
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
    img: placement.img || 'icons/svg/mystery-man.svg',
  }]);

  return token[0];
}

Hooks.once('init', () => {
  console.log('Sectors Map Module | Initializing');

  if (getSettings()) {
    getSettings().register(MODULE_ID, 'lastImportData', {
      name: 'Last imported Sectors JSON',
      scope: 'world',
      config: false,
      type: String,
      default: '',
    });

    getSettings().register(MODULE_ID, 'lastImportName', {
      name: 'Last imported sector name',
      scope: 'world',
      config: false,
      type: String,
      default: '',
    });
  }

  game.sectorsMap = {
    importer: { normalizeSectorsImport, buildPlanetDisplayData, buildSystemSummary },
    cache: {},
    scene: {},
    systemSummary: [],
    importFromFile: importSectorsJsonFromFile,
    createSceneFromImport: createMapSceneFromImport,
    getPlanetInfoForSystem,
    placeTokenOnSystem,
  };
});

Hooks.on('ready', () => {
  const settings = getSettings();
  if (!settings) return;

  const rawImport = settings.get(MODULE_ID, 'lastImportData');
  if (!rawImport) return;

  try {
    const parsed = JSON.parse(rawImport);
    const map = normalizeSectorsImport(parsed);
    game.sectorsMap.cache = map;
    game.sectorsMap.scene = buildSceneMapData(map);
  } catch (error) {
    console.error('Sectors Map Module | Failed to restore imported data', error);
  }
});

Hooks.on('getSceneControlButtons', (controls) => {
  const tokens = controls.tokens;
  if (!tokens || !tokens.tools) return;

  if (!tokens.tools.sectorsMapImport) {
    tokens.tools.sectorsMapImport = {
      name: 'sectorsMapImport',
      Wtitle: 'Import Sectors JSON',
      icon: 'fas fa-file-import',
      button: true,
      visible: game.user.isGM,
      onChange: async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.addEventListener('change', async (event) => {
          const [file] = event.target.files ?? [];
          if (!file) return;

          try {
            const imported = await importSectorsJsonFromFile(file);
            createMapSceneFromImport(imported, imported.sector.name);
          } catch (error) {
            console.error('Sectors Map Module | Import failed', error);
            ui.notifications?.error('Unable to import Sectors JSON.');
          }
        });
        input.click();
      },
    };
  }

  if (!tokens.tools.sectorsMapCreateScene) {
    tokens.tools.sectorsMapCreateScene = {
      name: 'sectorsMapCreateScene',
      title: 'Create Sector Scene',
      icon: 'fas fa-map-marked-alt',
      button: true,
      visible: game.user.isGM,
      onChange: () => {
        if (!game.sectorsMap?.cache?.sector) {
          ui.notifications?.warn('Import a Sectors JSON file first.');
          return;
        }
        createMapSceneFromImport(game.sectorsMap.cache, game.sectorsMap.cache.sector.name);
      },
    };
  }
});
