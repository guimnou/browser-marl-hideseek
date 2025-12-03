// ==============================================================
// FILE: research/src/npc/npc-spawn-system.js
// ==============================================================

import { TRAINING_WORLD_CONFIG } from "../config-training-world.js";
import { getCurrentTerrainSeed } from "../world/terrain-generator.js";
import { findSafeSpawnHeight, isPositionSafe } from "../world/terrain-utils.js";

class NPCSpawnSystem {
  constructor() {
    this.settings = {
      minNPCDistance: 5,
      worldBuffer: 10,
      maxSpawnAttempts: 50,
      minSeekerHiderDistance: 15,
    };
  }

  findValidSpawnPosition(existingNPCs = []) {
    const worldSize = TRAINING_WORLD_CONFIG.SIZE;
    const buffer = this.settings.worldBuffer;
    const seed = getCurrentTerrainSeed();

    for (let attempt = 0; attempt < this.settings.maxSpawnAttempts; attempt++) {
      const x = buffer + Math.random() * (worldSize - buffer * 2);
      const z = buffer + Math.random() * (worldSize - buffer * 2);

      const blockX = Math.floor(x) + 0.5;
      const blockZ = Math.floor(z) + 0.5;

      if (!isPositionSafe(blockX, blockZ, worldSize, buffer)) {
        continue;
      }

      const y = findSafeSpawnHeight(blockX, blockZ, seed);

      const spawnPos = new THREE.Vector3(blockX, y, blockZ);
      const tooClose = existingNPCs.some((npc) => {
        return npc.position.distanceTo(spawnPos) < this.settings.minNPCDistance;
      });

      if (!tooClose) {
        console.log(
          `✅ NPC spawn: (${blockX.toFixed(1)}, ${y.toFixed(
            1
          )}, ${blockZ.toFixed(1)})`
        );
        return { x: blockX, y, z: blockZ };
      }
    }

    // No fallback - return null if no valid position found
    console.error(
      `❌ Failed to find valid spawn position after ${this.settings.maxSpawnAttempts} attempts`
    );
    return null;
  }

  verifySpawnDistances(seekers, hiders, logger) {
    const worldSize = TRAINING_WORLD_CONFIG.SIZE;
    const seed = getCurrentTerrainSeed();

    seekers.forEach((seeker) => {
      hiders.forEach((hider) => {
        const originalDistance = seeker.position.distanceTo(hider.position);

        if (originalDistance < this.settings.minSeekerHiderDistance) {
          const dx = hider.position.x - seeker.position.x;
          const dz = hider.position.z - seeker.position.z;
          const angle = Math.atan2(dz, dx);

          for (
            let distMultiplier = 1.5;
            distMultiplier <= 3.0;
            distMultiplier += 0.5
          ) {
            const moveDistance =
              this.settings.minSeekerHiderDistance * distMultiplier;

            const newX = hider.position.x - Math.cos(angle) * moveDistance;
            const newZ = hider.position.z - Math.sin(angle) * moveDistance;

            if (
              isPositionSafe(newX, newZ, worldSize, this.settings.worldBuffer)
            ) {
              const newY = findSafeSpawnHeight(newX, newZ, seed);

              seeker.position.x = Math.floor(newX) + 0.5;
              seeker.position.y = newY;
              seeker.position.z = Math.floor(newZ) + 0.5;

              const newDistance = seeker.position.distanceTo(hider.position);

              console.log(
                `🔄 Adjusted seeker spawn: (${seeker.position.x.toFixed(
                  1
                )}, ${seeker.position.y.toFixed(
                  1
                )}, ${seeker.position.z.toFixed(
                  1
                )}) - Distance: ${newDistance.toFixed(1)}`
              );

              if (logger) {
                logger.logSpawnDistanceAdjustment(
                  seeker.userData.id,
                  hider.userData.id,
                  originalDistance,
                  newDistance
                );
              }

              break;
            }
          }
        }
      });
    });
  }
}

export default NPCSpawnSystem;
