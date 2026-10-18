const ENTITY_TYPES = new Set(['sector', 'system', 'planet', 'moon', 'asteroidBelt', 'asteroidBase', 'blackHole', 'deepSpaceStation', 'gasGiantMine', 'spaceStation', 'researchBase']);

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function normalizeEntityRecord(entry, entityType) {
  const raw = entry ?? {};
  const normalized = {
    id: raw.id ?? null,
    name: raw.name ?? '(Unnamed)',
    entityType,
    parent: raw.parent ?? null,
    parentEntity: raw.parentEntity ?? null,
    isHidden: Boolean(raw.isHidden),
    x: Number.isFinite(raw.x) ? raw.x : null,
    y: Number.isFinite(raw.y) ? raw.y : null,
    attributes: raw.attributes ?? {},
    created: raw.created ?? null,
    updated: raw.updated ?? null,
    creator: raw.creator ?? null,
  };

  return normalized;
}

export function normalizeSectorsImport(rawData) {
  if (!rawData || typeof rawData !== 'object') {
    throw new TypeError('Sectors import data must be an object');
  }

  const sectorEntries = rawData.sector ?? {};
  const sectorId = Object.keys(sectorEntries)[0] ?? null;
  const sectorRecord = sectorEntries[sectorId] ?? {};

  const systemEntries = rawData.system ?? {};
  const planetEntries = rawData.planet ?? {};

  const markerEntries = [];
  for (const [entityType, entries] of Object.entries(rawData)) {
    if (!ENTITY_TYPES.has(entityType) || entityType === 'sector' || entityType === 'system' || entityType === 'planet') continue;
    for (const [id, entry] of Object.entries(entries ?? {})) {
      const normalized = normalizeEntityRecord({ ...entry, id }, entityType);
      if (Number.isFinite(normalized.x) && Number.isFinite(normalized.y)) {
        markerEntries.push(normalized);
      }
    }
  }

  const systems = Object.entries(systemEntries).map(([id, entry]) => normalizeEntityRecord({ ...entry, id }, 'system'));
  const planets = Object.entries(planetEntries).map(([id, entry]) => normalizeEntityRecord({ ...entry, id }, 'planet'));

  const systemsById = new Map(systems.map((system) => [system.id, system]));
  const planetsById = new Map(planets.map((planet) => [planet.id, planet]));

  const sectorSummary = {
    id: sectorId,
    name: sectorRecord.name ?? 'Unnamed Sector',
    rows: Number(sectorRecord.rows) || 0,
    columns: Number(sectorRecord.columns) || 0,
    image: sectorRecord.image ?? '',
    layers: sectorRecord.layers ?? {},
    systems: [],
    attributes: sectorRecord.attributes ?? {},
  };

  for (const system of systems) {
    const parentSectorId = system.parent ?? null;
    if (parentSectorId && parentSectorId === sectorId) {
      sectorSummary.systems.push(system);
    }

    const systemPlanets = planets.filter((planet) => planet.parent === system.id);
    system.planets = systemPlanets;
    system.tags = toArray(system.attributes?.tags ?? []);
  }

  const indexedSystems = Object.fromEntries(systems.map((system) => [system.id, system]));
  const indexedPlanets = Object.fromEntries(planets.map((planet) => [planet.id, planet]));

  for (const planet of planets) {
    const parentSystem = systemsById.get(planet.parent);
    planet.system = parentSystem ?? null;
    planet.tags = toArray(planet.attributes?.tags ?? []);
    planet.summary = {
      name: planet.name,
      population: planet.attributes?.population ?? 'Unknown',
      biosphere: planet.attributes?.biosphere ?? 'Unknown',
      atmosphere: planet.attributes?.atmosphere ?? 'Unknown',
      temperature: planet.attributes?.temperature ?? 'Unknown',
      techLevel: planet.attributes?.techLevel ?? 'Unknown',
      tags: planet.tags,
    };
  }

  const map = {
    raw: rawData,
    sector: sectorSummary,
    systems,
    planets,
    markers: markerEntries,
    systemIndex: indexedSystems,
    planetIndex: indexedPlanets,
    entities: {
      sector: sectorEntries,
      system: systemEntries,
      planet: planetEntries,
      marker: markerEntries,
    },
    stats: {
      totalSystems: systems.length,
      totalPlanets: planets.length,
      totalMarkers: markerEntries.length,
      entityTypes: Array.from(ENTITY_TYPES),
    },
  };

  return map;
}

export function buildPlanetDisplayData(planet, isGm = false) {
  if (!planet || typeof planet !== 'object') {
    throw new TypeError('Planet data must be an object');
  }

  const summary = {
    name: planet.name ?? '(Unknown planet)',
    population: planet.attributes?.population ?? 'Unknown',
    biosphere: planet.attributes?.biosphere ?? 'Unknown',
    atmosphere: planet.attributes?.atmosphere ?? 'Unknown',
    temperature: planet.attributes?.temperature ?? 'Unknown',
    techLevel: planet.attributes?.techLevel ?? 'Unknown',
  };

  const tags = isGm ? toArray(planet.attributes?.tags ?? []) : [];

  return {
    summary,
    gmOnly: !isGm,
    tags,
    details: {
      occupation: planet.attributes?.occupation ?? null,
      situation: planet.attributes?.situation ?? null,
      isHidden: Boolean(planet.isHidden),
      parent: planet.parent ?? null,
      parentEntity: planet.parentEntity ?? null,
    },
  };
}

export function buildSystemSummary(system, isGm = false) {
  const planets = (system?.planets ?? []).map((planet) => buildPlanetDisplayData(planet, isGm));

  return {
    id: system?.id ?? null,
    name: system?.name ?? '(Unknown system)',
    x: system?.x ?? null,
    y: system?.y ?? null,
    planets,
    planetCount: planets.length,
  };
}
