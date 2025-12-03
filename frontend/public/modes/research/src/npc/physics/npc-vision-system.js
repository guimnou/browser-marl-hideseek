// ==============================================================
// FILE: research/src/npc/physics/npc-vision-system.js
// ==============================================================

import { NPC } from "../../npc/config-npc-behavior.js";

export class NPCVisionSystem {
  constructor(config = {}) {
    // ============================================================
    // VISION PARAMETERS WITH VALIDATION
    // ============================================================

    // Vision range with fallback and validation
    this.visionRange = config.visionRange || NPC.VISION?.visionRange || 32;
    if (!this.visionRange || this.visionRange <= 0) {
      console.warn(
        "⚠️ NPCVisionSystem: Invalid vision range, defaulting to 32"
      );
      this.visionRange = 32;
    }

    // Horizontal FOV (field of view)
    this.visionAngle =
      config.visionAngle || NPC.VISION?.visionAngle || Math.PI * 0.6; // 108° default

    // Ray count for observations
    this.rayCount = config.rayCount || NPC.VISION?.rayCount || 64;

    // Ray angle tolerance - FIXED: More forgiving for 64-ray grid
    this.rayAngleTolerance =
      config.rayAngleTolerance || NPC.VISION?.rayAngleTolerance || 0.985; // cos(10°) instead of cos(5°)

    // Vertical FOV - FIXED: Capped to prevent seeing through terrain
    const defaultVerticalFOV = Math.min(
      this.visionAngle * 0.6, // 60% of horizontal
      Math.PI * 0.4 // Max 72° vertical
    );
    this.verticalFOV = config.verticalFOV || defaultVerticalFOV;

    // Debug mode
    this.debug = config.debug ?? NPC.VISION?.debug ?? false;

    // Chunk manager (set externally)
    this.chunkManager = null;

    // Debug visualization
    this.debugLines = new Map();
    this.warningShown = { noChunkManager: false };

    // Log configuration
    if (this.debug) {
      console.log("👁️ NPCVisionSystem initialized:", {
        visionRange: this.visionRange,
        visionAngle: `${((this.visionAngle * 180) / Math.PI).toFixed(1)}°`,
        verticalFOV: `${((this.verticalFOV * 180) / Math.PI).toFixed(1)}°`,
        rayCount: this.rayCount,
        rayTolerance: `${Math.acos(this.rayAngleTolerance).toFixed(2)} rad`,
      });
    }
  }

  setChunkManager(chunkManager) {
    this.chunkManager = chunkManager;
  }

  // ============================================================
  // MAIN VISION API
  // ============================================================

  /**
   * Get complete vision data for an observer NPC
   * Returns visible NPCs and raycast data for observations
   */
  getVisionData(observer, allNPCs) {
    const visibleNPCs = [];

    allNPCs.forEach((target) => {
      // Skip self and same-role NPCs
      if (target === observer || target.role === observer.role) return;

      // Skip already-caught or invisible NPCs
      if (target.hideSeekState === NPC.GAME_STATES.FOUND || !target.visible)
        return;

      const distance = observer.position.distanceTo(target.position);

      // Check distance → FOV → line of sight (optimized order)
      if (distance < this.visionRange) {
        if (this.isInFieldOfView(observer, target)) {
          if (this.hasLineOfSight(observer, target)) {
            const direction = this.getDirectionVector(observer, target);

            visibleNPCs.push({
              id: target.userData.id,
              role: target.role,
              distance: distance,
              direction: direction,
              position: target.position.clone(),
              state: target.hideSeekState,
            });
          }
        }
      }
    });

    // Sort by distance (closest first)
    visibleNPCs.sort((a, b) => a.distance - b.distance);

    return {
      visibleNPCs,
      raycastData: {
        rays: this.generateRaycast(observer, allNPCs, visibleNPCs),
      },
      sounds: [],
    };
  }

  /**
   * ADDED: Efficiently check if target is visible to ANY observer
   * Used for hider rewards (am I seen by any seeker?)
   */
  isVisibleToAny(target, observers) {
    for (const observer of observers) {
      if (observer === target || observer.role === target.role) continue;
      if (observer.hideSeekState === NPC.GAME_STATES.FOUND || !observer.visible)
        continue;

      const distance = observer.position.distanceTo(target.position);

      if (distance < this.visionRange) {
        if (this.isInFieldOfView(observer, target)) {
          if (this.hasLineOfSight(observer, target)) {
            return true; // Target is visible to this observer
          }
        }
      }
    }

    return false; // Target not visible to any observer
  }

  // ============================================================
  // FIELD OF VIEW CHECKS
  // ============================================================

  /**
   * Strict FOV check - both horizontal and vertical
   */
  isInFieldOfView(observer, target) {
    const dx = target.position.x - observer.position.x;
    const dz = target.position.z - observer.position.z;
    const dy = target.position.y + 0.85 - (observer.position.y + 1.6);

    // Horizontal FOV check
    const angleToTarget = Math.atan2(dx, -dz);
    const angleDiff = angleToTarget - observer.yaw;

    // Normalize to [-π, π]
    const normalizedAngleDiff = Math.atan2(
      Math.sin(angleDiff),
      Math.cos(angleDiff)
    );

    const horizontalInFOV =
      Math.abs(normalizedAngleDiff) <= this.visionAngle / 2;

    // Vertical FOV check (prevent seeing through floors/ceilings)
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
    const verticalAngle = Math.atan2(dy, horizontalDistance);
    const verticalInFOV = Math.abs(verticalAngle) <= this.verticalFOV / 2;

    return horizontalInFOV && verticalInFOV;
  }

  // ============================================================
  // LINE OF SIGHT CHECKS
  // ============================================================

  /**
   * Check if observer has clear line of sight to target
   */
  hasLineOfSight(observer, target) {
    if (!this.chunkManager) {
      if (!this.warningShown.noChunkManager) {
        console.warn(
          "⚠️ NPCVisionSystem: ChunkManager not set - vision disabled"
        );
        this.warningShown.noChunkManager = true;
      }
      return false;
    }

    const startPos = {
      x: observer.position.x,
      y: observer.position.y + 1.6, // Eye level
      z: observer.position.z,
    };

    const endPos = {
      x: target.position.x,
      y: target.position.y + 0.85, // Chest level
      z: target.position.z,
    };

    const dx = endPos.x - startPos.x;
    const dy = endPos.y - startPos.y;
    const dz = endPos.z - startPos.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const direction = {
      x: dx / distance,
      y: dy / distance,
      z: dz / distance,
    };

    return this.raycastToTarget(startPos, direction, distance);
  }

  /**
   * DDA raycast to check if path to target is clear
   */
  raycastToTarget(startPos, direction, maxDistance) {
    let gridX = Math.floor(startPos.x);
    let gridY = Math.floor(startPos.y);
    let gridZ = Math.floor(startPos.z);

    const stepX = direction.x >= 0 ? 1 : -1;
    const stepY = direction.y >= 0 ? 1 : -1;
    const stepZ = direction.z >= 0 ? 1 : -1;

    const tDeltaX = Math.abs(1 / direction.x) || Infinity;
    const tDeltaY = Math.abs(1 / direction.y) || Infinity;
    const tDeltaZ = Math.abs(1 / direction.z) || Infinity;

    const xOffset =
      direction.x >= 0
        ? 1 - (startPos.x - Math.floor(startPos.x))
        : startPos.x - Math.floor(startPos.x);
    const yOffset =
      direction.y >= 0
        ? 1 - (startPos.y - Math.floor(startPos.y))
        : startPos.y - Math.floor(startPos.y);
    const zOffset =
      direction.z >= 0
        ? 1 - (startPos.z - Math.floor(startPos.z))
        : startPos.z - Math.floor(startPos.z);

    let tMaxX = direction.x !== 0 ? tDeltaX * xOffset : Infinity;
    let tMaxY = direction.y !== 0 ? tDeltaY * yOffset : Infinity;
    let tMaxZ = direction.z !== 0 ? tDeltaZ * zOffset : Infinity;

    let distance = 0;

    while (distance <= maxDistance) {
      const block = this.getBlockAt(gridX, gridY, gridZ);

      if (block && this.isBlockSolid(block.blockType)) {
        return false; // Line of sight blocked
      }

      // Step to next grid cell
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        distance = tMaxX;
        tMaxX += tDeltaX;
        gridX += stepX;
      } else if (tMaxY < tMaxZ) {
        distance = tMaxY;
        tMaxY += tDeltaY;
        gridY += stepY;
      } else {
        distance = tMaxZ;
        tMaxZ += tDeltaZ;
        gridZ += stepZ;
      }

      if (distance > maxDistance) break;
    }

    return true; // Clear line of sight
  }

  // ============================================================
  // RAYCAST GENERATION (FOR OBSERVATIONS)
  // ============================================================

  /**
   * Generate 64 rays for observation encoding
   * Returns array of ray results covering the FOV
   */
  generateRaycast(observer, allNPCs, visibleNPCs) {
    const rays = [];

    const raysPerRow = Math.floor(Math.sqrt(this.rayCount));
    const numRows = Math.ceil(this.rayCount / raysPerRow);

    for (let row = 0; row < numRows; row++) {
      // Vertical angle for this row
      const pitchAngle = (row / (numRows - 1) - 0.5) * this.verticalFOV;

      for (let col = 0; col < raysPerRow; col++) {
        if (rays.length >= this.rayCount) break;

        // Horizontal angle for this column
        const yawOffset = (col / (raysPerRow - 1) - 0.5) * this.visionAngle;
        const rayAngle = yawOffset + observer.yaw;

        // Calculate ray direction in 3D
        const direction = {
          x: -Math.sin(rayAngle) * Math.cos(pitchAngle),
          y: Math.sin(pitchAngle),
          z: -Math.cos(rayAngle) * Math.cos(pitchAngle),
        };

        const rayResult = this.castSingleRay(observer, direction, allNPCs);
        rays.push(rayResult);
      }
    }

    return rays;
  }

  /**
   * Cast a single ray and check for NPCs and blocks
   */
  castSingleRay(observer, direction, allNPCs) {
    const startPos = {
      x: observer.position.x,
      y: observer.position.y + 1.6, // Eye level
      z: observer.position.z,
    };

    let closestHit = {
      hit: false,
      distance: this.visionRange,
      isPlayer: false,
      blockType: 0,
      direction: direction,
      hitNPC: null,
    };

    // Check for NPC hits first (priority)
    for (const target of allNPCs) {
      if (target === observer || target.role === observer.role) continue;
      if (target.hideSeekState === NPC.GAME_STATES.FOUND || !target.visible)
        continue;

      const toTarget = {
        x: target.position.x - startPos.x,
        y: target.position.y + 0.85 - startPos.y, // Target center
        z: target.position.z - startPos.z,
      };

      const distanceToTarget = Math.sqrt(
        toTarget.x * toTarget.x +
          toTarget.y * toTarget.y +
          toTarget.z * toTarget.z
      );

      if (distanceToTarget > this.visionRange) continue;

      const normToTarget = {
        x: toTarget.x / distanceToTarget,
        y: toTarget.y / distanceToTarget,
        z: toTarget.z / distanceToTarget,
      };

      // Check if ray points at target (with tolerance)
      const dotProduct =
        direction.x * normToTarget.x +
        direction.y * normToTarget.y +
        direction.z * normToTarget.z;

      if (dotProduct > this.rayAngleTolerance) {
        // Ray points at target - check line of sight
        if (this.raycastToTarget(startPos, normToTarget, distanceToTarget)) {
          if (distanceToTarget < closestHit.distance) {
            closestHit = {
              hit: true,
              distance: distanceToTarget,
              isPlayer: true,
              blockType: 0,
              direction: direction,
              hitNPC: { id: target.userData.id, role: target.role },
            };
          }
        }
      }
    }

    // Check for block hits (if no closer NPC hit)
    const blockHit = this.raycastForBlock(
      startPos,
      direction,
      closestHit.distance
    );

    if (blockHit && blockHit.distance < closestHit.distance) {
      return {
        hit: true,
        distance: blockHit.distance,
        isPlayer: false,
        blockType: blockHit.blockType,
        direction: direction,
        hitNPC: null,
      };
    }

    return closestHit;
  }

  /**
   * Raycast to find first solid block
   */
  raycastForBlock(startPos, direction, maxDistance) {
    if (!this.chunkManager) return null;

    let gridX = Math.floor(startPos.x);
    let gridY = Math.floor(startPos.y);
    let gridZ = Math.floor(startPos.z);

    const stepX = direction.x >= 0 ? 1 : -1;
    const stepY = direction.y >= 0 ? 1 : -1;
    const stepZ = direction.z >= 0 ? 1 : -1;

    const tDeltaX = Math.abs(1 / direction.x) || Infinity;
    const tDeltaY = Math.abs(1 / direction.y) || Infinity;
    const tDeltaZ = Math.abs(1 / direction.z) || Infinity;

    const xOffset =
      direction.x >= 0
        ? 1 - (startPos.x - Math.floor(startPos.x))
        : startPos.x - Math.floor(startPos.x);
    const yOffset =
      direction.y >= 0
        ? 1 - (startPos.y - Math.floor(startPos.y))
        : startPos.y - Math.floor(startPos.y);
    const zOffset =
      direction.z >= 0
        ? 1 - (startPos.z - Math.floor(startPos.z))
        : startPos.z - Math.floor(startPos.z);

    let tMaxX = direction.x !== 0 ? tDeltaX * xOffset : Infinity;
    let tMaxY = direction.y !== 0 ? tDeltaY * yOffset : Infinity;
    let tMaxZ = direction.z !== 0 ? tDeltaZ * zOffset : Infinity;

    let distance = 0;

    while (distance <= maxDistance) {
      const block = this.getBlockAt(gridX, gridY, gridZ);

      if (block && block.blockType !== 0) {
        return {
          distance: distance,
          blockType: block.blockType,
          position: { x: gridX, y: gridY, z: gridZ },
        };
      }

      // Step to next grid cell
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        distance = tMaxX;
        tMaxX += tDeltaX;
        gridX += stepX;
      } else if (tMaxY < tMaxZ) {
        distance = tMaxY;
        tMaxY += tDeltaY;
        gridY += stepY;
      } else {
        distance = tMaxZ;
        tMaxZ += tDeltaZ;
        gridZ += stepZ;
      }
    }

    return null; // No block hit
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  getBlockAt(x, y, z) {
    if (!this.chunkManager) return null;

    const CHUNK_SIZE = 16;
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkY = Math.floor(y / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localY = ((y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    const blockType = this.chunkManager.getBlockType(
      chunkX,
      chunkY,
      chunkZ,
      localX,
      localY,
      localZ
    );

    return {
      blockType: blockType,
      chunkCoords: { x: chunkX, y: chunkY, z: chunkZ },
      localCoords: { x: localX, y: localY, z: localZ },
    };
  }

  isBlockSolid(blockType) {
    if (blockType === 0) return false; // Air

    // Transparent/partial blocks that don't block vision
    const transparentBlocks = [
      7, // Leaves
      23, // Water/liquid
      24, // Seagrass
      26, // Ice
    ];

    // Boundary blocks (998) ARE solid - correctly block vision
    return !transparentBlocks.includes(blockType);
  }

  getDirectionVector(observer, target) {
    const dx = target.position.x - observer.position.x;
    const dz = target.position.z - observer.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    return {
      x: dx / Math.max(distance, 0.001),
      z: dz / Math.max(distance, 0.001),
    };
  }

  // ============================================================
  // DEBUG HELPERS
  // ============================================================

  getDirectionName(yaw) {
    const directions = [
      "North",
      "NE",
      "East",
      "SE",
      "South",
      "SW",
      "West",
      "NW",
    ];
    const index = Math.floor(((yaw + Math.PI) / (2 * Math.PI)) * 8) % 8;
    return directions[index];
  }

  logVisionState(observer, visionData) {
    if (!this.debug) return;

    const dirName = this.getDirectionName(observer.yaw);
    const pos = observer.position;

    console.log(
      `\n👁️ ${observer.userData.id} (${observer.role}) at (${pos.x.toFixed(
        1
      )}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}) facing ${dirName}`
    );

    if (visionData.visibleNPCs.length > 0) {
      console.log(
        `   ✅ SEES: ${visionData.visibleNPCs
          .map((n) => `${n.id}(${n.distance.toFixed(1)}u)`)
          .join(", ")}`
      );
    } else {
      console.log(`   ❌ No NPCs visible`);
    }
  }

  drawDebugRays(observer, visionData, scene) {
    const npcId = observer.userData.id;

    // 🔴 FIX: Properly dispose old debug lines to prevent GPU memory leak
    if (this.debugLines.has(npcId)) {
      this.debugLines.get(npcId).forEach((line) => {
        scene.remove(line);

        // Dispose geometry and material
        if (line.geometry) {
          line.geometry.dispose();
        }
        if (line.material) {
          line.material.dispose();
        }
      });
      this.debugLines.set(npcId, []);
    }

    const newLines = [];
    const startPos = new THREE.Vector3(
      observer.position.x,
      observer.position.y + 1.6,
      observer.position.z
    );

    visionData.raycastData.rays.forEach((ray) => {
      const endPos = new THREE.Vector3(
        startPos.x + ray.direction.x * ray.distance,
        startPos.y + ray.direction.y * ray.distance,
        startPos.z + ray.direction.z * ray.distance
      );

      // Color: Green = NPC hit, Red = block hit, Gray = no hit
      const color = ray.isPlayer ? 0x00ff00 : ray.hit ? 0xff0000 : 0x444444;
      const geometry = new THREE.BufferGeometry().setFromPoints([
        startPos,
        endPos,
      ]);
      const material = new THREE.LineBasicMaterial({ color });
      const line = new THREE.Line(geometry, material);

      scene.add(line);
      newLines.push(line);
    });

    this.debugLines.set(npcId, newLines);
  }
}

export default NPCVisionSystem;
