// ==============================================================
// FILE: research/src/world/terrain-utils.js
// ==============================================================

import { TRAINING_WORLD_CONFIG } from "../config-training-world.js";
import { NPC } from "../npc/config-npc-behavior.js";

export function calculateTerrainHeight(x, z, seed) {
  const noise = new window.SimplexNoise(seed);

  let noiseValue = 0;
  let amplitude = TRAINING_WORLD_CONFIG.TERRAIN.AMPLITUDE;
  let frequency = TRAINING_WORLD_CONFIG.TERRAIN.FREQUENCY;
  const scale = TRAINING_WORLD_CONFIG.TERRAIN.SCALE;
  const octaves = TRAINING_WORLD_CONFIG.TERRAIN.OCTAVES;

  for (let i = 0; i < octaves; i++) {
    noiseValue +=
      noise.noise2D(x * scale * frequency, z * scale * frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  const normalizedNoise = (noiseValue + 1) / 2;
  const surfaceHeight = Math.floor(
    TRAINING_WORLD_CONFIG.BASE_GROUND_LEVEL +
      normalizedNoise * TRAINING_WORLD_CONFIG.TERRAIN_HEIGHT_RANGE
  );

  return Math.min(surfaceHeight, TRAINING_WORLD_CONFIG.MAX_HEIGHT);
}

export function findSafeSpawnHeight(x, z, seed) {
  const ACTUAL_WIDTH = NPC.PHYSICS.PLAYER_WIDTH * 1.5;
  const ACTUAL_HEIGHT = NPC.PHYSICS.PLAYER_HEIGHT * 1.5;
  const halfWidth = ACTUAL_WIDTH / 2;
  const halfHeight = ACTUAL_HEIGHT / 2;

  const samplePoints = [
    { x: x, z: z },
    { x: x - halfWidth, z: z - halfWidth },
    { x: x + halfWidth, z: z - halfWidth },
    { x: x - halfWidth, z: z + halfWidth },
    { x: x + halfWidth, z: z + halfWidth },
  ];

  let maxTerrainHeight = -Infinity;

  for (const point of samplePoints) {
    const height = calculateTerrainHeight(point.x, point.z, seed);
    if (height > maxTerrainHeight) {
      maxTerrainHeight = height;
    }
  }

  const surfaceY = maxTerrainHeight + 2;
  const spawnY = surfaceY + halfHeight;

  return spawnY;
}

export function isPositionSafe(x, z, worldSize, minBuffer = 10) {
  return (
    x >= minBuffer &&
    x <= worldSize - minBuffer &&
    z >= minBuffer &&
    z <= worldSize - minBuffer
  );
}
