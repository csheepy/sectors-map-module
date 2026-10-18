import { buildPlanetDisplayData } from './importer.js';

export function getHexCenterFromCoords(x, y) {
    return canvas.grid.getCenterPoint({ i: y, j: x });
}

export function getHexCenterFromSystem(system, options = {}) {
  return getHexCenterFromCoords(system?.x, system?.y, options);
}

function getNoteAnchorFromHexCenter(center) {
  return {
    x: Math.round(center?.x ?? 0),
    y: Math.round(center?.y ?? 0),
  };
}

function resolveGridType(gridType) {
  if (Number.isInteger(gridType)) return gridType;

  const normalized = String(gridType ?? '').trim().toLowerCase().replace(/\s+/g, '');
  const gridTypeMap = {
    hex: 'HEXODDQ',
    'odd-r': 'HEXODDQ',
    oddr: 'HEXODDQ',
    odd: 'HEXODDQ',
    'hexagonalcolumns-odd': 'HEXODDQ',
    'hexagonal-columns-odd': 'HEXODDQ',
    'odd-q': 'HEXODDQ',
    oddq: 'HEXODDQ',
    evenr: 'HEXEVENR',
    'even-r': 'HEXEVENR',
    square: 'SQUARE',
  };

  if (typeof CONST !== 'undefined' && CONST.GRID_TYPES) {
    const mappedKey = gridTypeMap[normalized] ?? 'HEXODDQ';
    return CONST.GRID_TYPES[mappedKey] ?? CONST.GRID_TYPES.HEXODDQ ?? CONST.GRID_TYPES.SQUARE ?? 0;
  }

  return ['hex', 'odd-r', 'oddr', 'odd', 'odd-q', 'oddq', 'hexagonalcolumns-odd', 'hexagonal-columns-odd'].includes(normalized) ? 4 : 0;
}

export function buildSceneMapData(mapData, options = {}) {
  const grid = {
    columns: mapData?.sector?.columns ?? options.columns ?? 8,
    rows: mapData?.sector?.rows ?? options.rows ?? 10,
    hexWidth: options.hexWidth ?? 128,
    hexHeight: options.hexHeight ?? 112,
    type: resolveGridType(options.gridType ?? 'odd-r'),
  };

  const hexes = (mapData?.systems ?? []).map((system) => {
    const center = getHexCenterFromSystem(system, grid);
    const planetNames = (system.planets ?? []).map((planet) => planet.name);

    return {
      id: system.id,
      name: system.name,
      x: system.x ?? center.q,
      y: system.y ?? center.r,
      center,
      planets: system.planets ?? [],
      planetNames,
      system,
    };
  });

  return {
    name: mapData?.sector?.name ?? 'Sector Map',
    grid,
    hexes,
    totalSystems: hexes.length,
    totalPlanets: (mapData?.planets ?? []).length,
  };
}

function formatHexLabel(x, y) {
  const q = String(Math.max(0, Number(x) || 0)).padStart(2, '0');
  const r = String(Math.max(0, Number(y) || 0)).padStart(2, '0');
  return `${q}${r}`;
}

function humanizeEntityType(entityType) {
  return String(entityType ?? 'Entity')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildJournalPageText(content) {
  const htmlFormat = typeof CONST !== 'undefined' && CONST.JOURNAL_ENTRY_PAGE_FORMATS
    ? CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML ?? 1
    : 1;

  return {
    content: String(content ?? ''),
    format: htmlFormat,
  };
}

function renderTagList(tags, isGm) {
  if (!isGm) return '<p>GM-only tags are hidden from players.</p>';

  const normalizedTags = Array.isArray(tags) ? tags : [];
  if (!normalizedTags.length) return '<p>No tags recorded.</p>';

  return `<ul>${normalizedTags.map((tag) => {
    const name = tag?.name ?? tag;
    const description = tag?.description ? `<div>${tag.description}</div>` : '';
    return `<li><strong>${name}</strong>${description}</li>`;
  }).join('')}</ul>`;
}

function renderEntitySummary(entity, isGm = false) {
  const attributes = entity?.attributes ?? {};
  const entityName = entity?.name || humanizeEntityType(entity?.entityType || 'Entity');
  const occupation = attributes.occupation ?? 'Unknown';
  const situation = attributes.situation ?? 'Unknown';
  const tags = Array.isArray(attributes.tags) ? attributes.tags : [];

  return `
    <h3>${entityName}</h3>
    <p><strong>Type:</strong> ${humanizeEntityType(entity?.entityType || 'Entity')}</p>
    <p><strong>Occupation:</strong> ${occupation}</p>
    <p><strong>Situation:</strong> ${situation}</p>
    ${renderTagList(tags, isGm)}
  `;
}

function getSystemEntities(system, mapData) {
  const attached = [];
  const rawEntries = mapData?.raw ?? {};

  for (const [entityType, entries] of Object.entries(rawEntries)) {
    if (!entries || typeof entries !== 'object' || ['sector', 'system', 'planet'].includes(entityType)) continue;

    for (const entry of Object.values(entries)) {
      if (!entry || typeof entry !== 'object') continue;
      if (String(entry.parent ?? '') === String(system?.id ?? '')) {
        attached.push({ ...entry, entityType });
      }
    }
  }

  return attached;
}

function getPlanetEntities(planet, mapData) {
  const attached = [];
  const rawEntries = mapData?.raw ?? {};

  for (const [entityType, entries] of Object.entries(rawEntries)) {
    if (!entries || typeof entries !== 'object' || ['sector', 'system', 'planet'].includes(entityType)) continue;

    for (const entry of Object.values(entries)) {
      if (!entry || typeof entry !== 'object') continue;
      if (String(entry.parent ?? '') === String(planet?.id ?? '')) {
        attached.push({ ...entry, entityType });
      }
    }
  }

  return attached;
}

function getSystemTags(system, mapData) {
  const tags = [];
  const rawEntries = mapData?.raw ?? {};
  const seenTagNames = new Set();
  const seenEntityIds = new Set();
  const queue = [];

  function addTagList(list) {
    if (!Array.isArray(list)) return;
    for (const tag of list) {
      const key = tag?.name ?? String(tag ?? '');
      if (!key || seenTagNames.has(key)) continue;
      seenTagNames.add(key);
      tags.push(tag);
    }
  }

  function enqueueEntityId(id) {
    if (id == null || id === '') return;
    const key = String(id);
    if (seenEntityIds.has(key)) return;
    seenEntityIds.add(key);
    queue.push(key);
  }

  addTagList(system?.attributes?.tags ?? []);
  for (const planet of system?.planets ?? []) {
    addTagList(planet?.attributes?.tags ?? []);
    enqueueEntityId(planet?.id ?? null);
  }
  enqueueEntityId(system?.id ?? null);

  while (queue.length) {
    const parentId = queue.shift();

    for (const entries of Object.values(rawEntries)) {
      if (!entries || typeof entries !== 'object') continue;

      for (const entry of Object.values(entries)) {
        if (!entry || typeof entry !== 'object') continue;
        if (String(entry.parent ?? '') !== String(parentId ?? '')) continue;

        addTagList(entry?.attributes?.tags ?? []);
        enqueueEntityId(entry?.id ?? null);
      }
    }
  }

  return tags;
}

export function createMarkerJournalEntries(mapData, isGm = false) {
  return (mapData?.markers ?? []).map((marker) => {
    const markerName = marker.name ?? humanizeEntityType(marker.entityType ?? 'Marker');
    const markerSummary = `
      <h2>${markerName}</h2>
      <p><strong>Type:</strong> ${humanizeEntityType(marker.entityType ?? 'Marker')}</p>
      <p><strong>Location:</strong> ${marker.x ?? 0}, ${marker.y ?? 0}</p>
      <p><strong>Parent:</strong> ${marker.parent ?? 'Sector'}</p>
      <p><strong>Parent Entity:</strong> ${humanizeEntityType(marker.parentEntity ?? 'sector')}</p>
      ${renderTagList(Array.isArray(marker.attributes?.tags) ? marker.attributes.tags : [], isGm)}
    `;

    return {
      name: markerName,
      pages: [{
        name: `${markerName} Overview`,
        type: 'text',
        text: buildJournalPageText(markerSummary),
        flags: { 'sectors-map-module': { entityId: marker.id, entityType: marker.entityType, type: 'marker-journal-page' } },
      }],
      flags: { 'sectors-map-module': { entityId: marker.id, entityType: marker.entityType, type: 'marker-journal' } },
    };
  });
}

export function createMarkerNotes(mapData, isGm = false) {
  return (mapData?.markers ?? []).map((marker) => {
    const markerName = marker.name ?? humanizeEntityType(marker.entityType ?? 'Marker');
    const center = getHexCenterFromCoords(marker?.x, marker?.y, {
      columns: mapData?.sector?.columns ?? 8,
      rows: mapData?.sector?.rows ?? 10,
      hexWidth: 128,
      hexHeight: 112,
    });
    const anchor = getNoteAnchorFromHexCenter(center);

    return {
      text: markerName,
      x: anchor.x,
      y: anchor.y,
      icon: 'icons/svg/cowled.svg',
      fontSize: 18,
      entryId: null,
      flags: { 'sectors-map-module': { entityId: marker.id, entityType: marker.entityType, type: 'marker-note' } },
    };
  });
}

export function createSystemJournalEntries(mapData, isGm = false) {
  return (mapData?.systems ?? []).map((system) => {
    const systemName = system.name ?? 'System';
    const systemTags = getSystemTags(system, mapData);
    const systemPages = [{
      name: `${systemName} Overview`,
      type: 'text',
      text: buildJournalPageText(`
        <h2>${systemName}</h2>
        <p><strong>Coordinates:</strong> ${system.x ?? 0}, ${system.y ?? 0}</p>
        <p><strong>Planets:</strong> ${system.planets?.length ?? 0}</p>
        <ul>
          ${(system.planets ?? []).map((planet) => `<li>${planet.name}</li>`).join('') || '<li>No planets known.</li>'}
        </ul>
        <h3>System Tags</h3>
        ${renderTagList(systemTags, isGm)}
      `),
      flags: { 'sectors-map-module': { systemId: system.id, type: 'system-journal-page' } },
    }];

    const systemEntityPages = (getSystemEntities(system, mapData) ?? []).map((entity) => ({
      name: `${systemName} - ${entity.name || humanizeEntityType(entity.entityType)}`,
      type: 'text',
      text: buildJournalPageText(renderEntitySummary(entity, isGm)),
      flags: { 'sectors-map-module': { systemId: system.id, entityType: entity.entityType, type: 'system-entity-journal-page' } },
    }));

    const planetPages = (system.planets ?? []).flatMap((planet) => {
      const summary = buildPlanetDisplayData(planet, isGm);
      const planetText = `
        <h2>${planet.name}</h2>
        <p><strong>Population:</strong> ${summary.summary.population}</p>
        <p><strong>Biosphere:</strong> ${summary.summary.biosphere}</p>
        <p><strong>Atmosphere:</strong> ${summary.summary.atmosphere}</p>
        <p><strong>Temperature:</strong> ${summary.summary.temperature}</p>
        <p><strong>Tech Level:</strong> ${summary.summary.techLevel}</p>
        ${renderTagList(summary.tags, isGm)}
      `;

      const planetEntityPages = (getPlanetEntities(planet, mapData) ?? []).map((entity) => ({
        name: `${systemName} - ${planet.name} - ${entity.name || humanizeEntityType(entity.entityType)}`,
        type: 'text',
        text: buildJournalPageText(renderEntitySummary(entity, isGm)),
        flags: { 'sectors-map-module': { systemId: system.id, planetId: planet.id, entityType: entity.entityType, type: 'planet-entity-journal-page' } },
      }));

      return [{
        name: `${systemName} - ${planet.name}`,
        type: 'text',
        text: buildJournalPageText(planetText),
        flags: { 'sectors-map-module': { systemId: system.id, planetId: planet.id, type: 'planet-journal-page' } },
      }, ...planetEntityPages];
    });

    return {
      name: systemName,
      pages: [...systemPages, ...systemEntityPages, ...planetPages],
      flags: { 'sectors-map-module': { systemId: system.id, type: 'system-journal' } },
    };
  });
}

export function createSystemNotes(mapData, isGm = false) {
  return (mapData?.systems ?? []).map((system) => {
    const center = getHexCenterFromSystem(system, {
      columns: mapData?.sector?.columns ?? 8,
      rows: mapData?.sector?.rows ?? 10,
      hexWidth: 128,
      hexHeight: 112,
    });
    const anchor = getNoteAnchorFromHexCenter(center);

    const systemName = system.name ?? 'System';

    return {
      text: systemName,
      x: anchor.x,
      y: anchor.y,
      icon: 'icons/svg/book.svg',
      fontSize: 18,
      entryId: null,
      flags: { 'sectors-map-module': { systemId: system.id, type: 'system-note' } },
    };
  });
}

export function createSceneConfig(sceneName, mapData, options = {}) {
  const sceneMapData = buildSceneMapData(mapData, options);
  const gridSize = options.gridSize ?? 100;

  return {
    name: sceneName || sceneMapData.name,
    width: (sceneMapData.grid.columns + 2) * sceneMapData.grid.hexWidth,
    height: (sceneMapData.grid.rows + 2) * sceneMapData.grid.hexHeight,
    backgroundColor: '#969df3',
    grid: {
      type: resolveGridType(sceneMapData.grid.type),
      size: gridSize,
      distance: 1,
      units: 'ft',
      color: '#3d5678',
      alpha: 0.75,
    },
    tokenVision: true,
    navigation: true,
    fog: {
      explored: '#000000',
      unexplored: '#000000',
      mode: 0,
    },
    sceneMapData,
  };
}

export function createTokenPlacement(system, { tokenName = 'Explorer', img = '' } = {}) {
  const position = getHexCenterFromSystem(system, { columns: 8, rows: 10 });

  return {
    name: tokenName,
    img,
    x: position.x,
    y: position.y,
    width: 60,
    height: 60,
    actorId: null,
    systemId: system.id,
    hex: { q: position.q, r: position.r },
  };
}
