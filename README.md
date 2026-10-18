# Sectors Map Module

This Foundry VTT module imports Sectors Without Number JSON data, resolves the sector/system/planet hierarchy, and creates a star-map scene workflow.

## Features

- Imports the raw Sectors JSON export
- Normalizes sector, system, and planet relationships
- Builds a scene-ready map model from the imported data
- Supports a token placement workflow on the generated hex map
- Shows a planet summary to all players
- Keeps planet tag metadata and rich GM notes hidden unless the current user is the GM

## Project structure

- `module.json` — Foundry module manifest
- `scripts/module.js` — module bootstrap, scene creation, and UI control hooks
- `scripts/sectors/importer.js` — normalization and visibility logic
- `scripts/sectors/scene.js` — scene configuration and hex helpers
- `example/` — sample Sectors JSON export

## Install in Foundry

1. Copy this folder into your Foundry `Data/modules` directory.
2. Reload the world or use the module manager to enable the module.
3. Open the scene controls and select the module action labeled "Import Sectors JSON".
4. Pick the sample JSON file in `example/` or any exported Sectors JSON.
5. Create the generated sector scene using the "Create Sector Scene" action.
6. Place a token on the hex map and move it with the normal Foundry token movement controls.

## Player vs GM visibility

The imported planet data is intentionally summarized for players. Any `attributes.tags` and detailed GM-only metadata remain hidden unless the current user is the GM.

## Validation

The importer and visibility logic are validated with Node tests:

```bash
node --test test/sectors-importer.test.mjs
```
