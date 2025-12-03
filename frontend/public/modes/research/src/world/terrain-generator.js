// ==============================================================
// FILE: research/src/world/terrain-generator.js
// ==============================================================

import { TRAINING_WORLD_CONFIG } from "../config-training-world.js";
import * as GameState from "../../../../src/core/game-state.js";

let currentTerrainSeed = TRAINING_WORLD_CONFIG.SEED;

export function getCurrentTerrainSeed() {
  return currentTerrainSeed;
}

export async function regenerateTerrain(chunkManager) {

  // 🔴 FIX: Use consistent seed from config
  const USE_SAME_SEED = true;
  const seed = USE_SAME_SEED ? TRAINING_WORLD_CONFIG.SEED : Math.floor(Math.random() * 1000000);

  currentTerrainSeed = seed;

  if (GameState.worldConfig) {
    GameState.worldConfig.SEED = seed;
  }

  chunkManager.chunkWorker.postMessage({
    type: "regenerate",
    seed: seed,
  });

  chunkManager.clearAllChunks();

  const chunkPromises = [];

  const worldSize = TRAINING_WORLD_CONFIG.SIZE;
  const chunkSize = chunkManager.CHUNK_SIZE;

  const worldSizeInChunks = Math.floor(worldSize / chunkSize);

  for (let chunkX = 0; chunkX < worldSizeInChunks; chunkX++) {
    for (let chunkZ = 0; chunkZ < worldSizeInChunks; chunkZ++) {
      if (chunkManager.isChunkInBounds(chunkX, chunkZ)) {
        const promise = chunkManager.generateChunk(chunkX, chunkZ);
        chunkPromises.push(promise);
      }
    }
  }
  await Promise.all(chunkPromises);

  if (window.hideSeekUI) {
    window.hideSeekUI.updateTerrainSeed(seed);
  }
}
