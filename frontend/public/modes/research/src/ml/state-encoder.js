// ==============================================================
// FILE: research/src/ml/encoding/state-encoder.js
// ==============================================================

import { NPC } from "../npc/config-npc-behavior.js";
import { CLIENT_WORLD_CONFIG } from "../../../../src/core/game-state.js";

export class StateEncoder {
  constructor() {
    // UPDATED: Split visual field into 2 channels for clarity
    this.stateSize = 161;

    this.encoding = {
      position: { start: 0, size: 3 }, // NPC position in world
      orientation: { start: 3, size: 2 }, // Yaw and pitch
      velocity: { start: 5, size: 3 }, // FIXED: Actual movement velocity
      onGround: { start: 8, size: 1 }, // Is NPC on ground?
      boundaryProximity: { start: 9, size: 4 }, // IMPROVED: Distance to walls
      visualFieldDistance: { start: 13, size: 64 }, // NEW: Ray distances only
      visualFieldType: { start: 77, size: 64 }, // NEW: What each ray hit
      gameInfo: { start: 141, size: 4 }, // Time, hiders found, etc.
      targetMemory: { start: 145, size: 4 }, // Last seen target info
      roleSpecific: { start: 149, size: 6 }, // Seeker/hider specific
      blockInfo: { start: 155, size: 3 }, // Block placement/removal
      movementState: { start: 158, size: 3 }, // NEW: Movement blocked info
    };

    this.RAY_MAX_DIST = NPC.VISION?.visionRange || 32;
  }

  encode(npc, gameState, perceptionData, worldSize) {
    const state = new Array(this.stateSize).fill(0);

    this.encodePosition(state, npc.position, worldSize);
    this.encodeOrientation(state, npc.yaw, npc.pitch);
    this.encodeVelocity(state, npc); // FIXED
    state[this.encoding.onGround.start] = npc.isOnGround ? 1 : 0;
    this.encodeBoundaryProximity(state, npc, worldSize);
    this.encodeVisualField(state, perceptionData);
    this.encodeGameInfo(state, gameState);
    this.encodeTargetMemory(state, npc);
    this.encodeBlockInfo(state, npc, perceptionData);
    this.encodeMovementState(state, npc); // NEW

    if (npc.role === "seeker") {
      this.encodeSeekerInfo(state, npc, perceptionData);
    } else {
      this.encodeHiderInfo(state, npc, perceptionData);
    }

    // Validation - but log warnings so we can fix the source
    for (let i = 0; i < state.length; i++) {
      if (!isFinite(state[i])) {
        console.warn(`⚠️ NaN detected at index ${i}`);
        state[i] = 0;
      }
      // Most values should be in [-1, 1] range
      if (Math.abs(state[i]) > 2) {
        console.warn(`⚠️ Large value ${state[i].toFixed(2)} at index ${i}`);
        state[i] = Math.sign(state[i]) * 1.0;
      }
    }

    return state;
  }

  encodePosition(state, position, worldSize) {
    const { start } = this.encoding.position;
    state[start] = position.x / worldSize;
    state[start + 1] = position.y / 100;
    state[start + 2] = position.z / worldSize;
  }

  encodeOrientation(state, yaw, pitch) {
    const { start } = this.encoding.orientation;

    // Normalize yaw to [-π, π]
    let normalizedYaw = yaw % (Math.PI * 2);
    if (normalizedYaw > Math.PI) normalizedYaw -= Math.PI * 2;
    if (normalizedYaw < -Math.PI) normalizedYaw += Math.PI * 2;

    state[start] = normalizedYaw / Math.PI;
    state[start + 1] = (pitch || 0) / (Math.PI / 2);
  }

  // FIXED: Calculate velocity from position change
  encodeVelocity(state, npc) {
    const { start } = this.encoding.velocity;

    // If no lastPosition, velocity is zero
    if (!npc.lastPosition) {
      state[start] = 0;
      state[start + 1] = 0;
      state[start + 2] = 0;
      return;
    }

    // Calculate actual movement from last frame
    const dt = 1.0 / 60.0; // Fixed timestep
    const dx = (npc.position.x - npc.lastPosition.x) / dt;
    const dy = (npc.position.y - npc.lastPosition.y) / dt;
    const dz = (npc.position.z - npc.lastPosition.z) / dt;

    const maxSpeed =
      npc.role === "seeker" ? NPC.PHYSICS.SPRINT_SPEED : NPC.PHYSICS.WALK_SPEED;

    // Normalize to [-1, 1] range
    state[start] = Math.max(-1, Math.min(1, dx / maxSpeed));
    state[start + 1] = Math.max(-1, Math.min(1, dy / maxSpeed));
    state[start + 2] = Math.max(-1, Math.min(1, dz / maxSpeed));
  }

  // IMPROVED: Stronger signals near boundaries
  encodeBoundaryProximity(state, npc, worldSize) {
    const { start } = this.encoding.boundaryProximity;
    const pos = npc.position;
    const BUFFER = 1.0;

    const distWest = pos.x - BUFFER;
    const distEast = (worldSize - BUFFER) - pos.x;
    const distNorth = pos.z - BUFFER;
    const distSouth = (worldSize - BUFFER) - pos.z;


    // Piecewise encoding: strong signal when close to wall
    const dangerZone = 8; // Within 8 blocks = danger
    const warningZone = 20; // Within 20 blocks = warning

    const encode = (dist) => {
      if (dist < dangerZone) {
        // Very close: linear from 1.0 (at wall) to 0.0 (at dangerZone)
        return 1.0 - dist / dangerZone;
      } else if (dist < warningZone) {
        // Medium distance: gentle decay from 0.0 to -0.3
        return -0.3 * ((dist - dangerZone) / (warningZone - dangerZone));
      }
      // Far away: safe
      return -0.3;
    };

    state[start] = encode(distWest); // High = close to west wall
    state[start + 1] = encode(distEast); // High = close to east wall
    state[start + 2] = encode(distNorth); // High = close to north wall
    state[start + 3] = encode(distSouth); // High = close to south wall
  }

  // IMPROVED: Split into distance and type channels
  encodeVisualField(state, perceptionData) {
    const distStart = this.encoding.visualFieldDistance.start;
    const typeStart = this.encoding.visualFieldType.start;
    const size = this.encoding.visualFieldDistance.size;

    // Initialize all rays to "nothing hit"
    for (let i = 0; i < size; i++) {
      state[distStart + i] = 1.0; // 1.0 = max distance (nothing hit)
      state[typeStart + i] = 0.0; // 0.0 = air/empty
    }

    if (!perceptionData?.raycastData?.rays) return;

    const rays = perceptionData.raycastData.rays;

    for (let i = 0; i < Math.min(size, rays.length); i++) {
      const ray = rays[i];

      if (ray.hit) {
        // Channel 1: Distance (normalized to [0, 1])
        // 0 = very close, 1 = max distance
        state[distStart + i] = Math.min(1.0, ray.distance / this.RAY_MAX_DIST);

        // Channel 2: Type
        if (ray.isPlayer) {
          // Player detected = 1.0 (very important signal!)
          state[typeStart + i] = 1.0;
        } else {
          // Block detected = block type encoding in [0.1, 0.9] range
          // This keeps it distinct from air (0.0) and players (1.0)
          const blockEncoding = this.encodeBlockType(ray.blockType);
          state[typeStart + i] = 0.1 + blockEncoding * 0.8;
        }
      }
    }
  }

  encodeBlockType(blockType) {
    if (!blockType || blockType === 0) {
      return 0;
    }

    // Simple normalized block type encoding
    // Maps different blocks to different values in [0, 1]
    const blockMap = {
      1: 0.9, // Grass - common
      2: 0.2, // Stone
      3: 0.5, // Dirt
      4: 0.3, // Sand
      5: 0.25, // Snow
      6: 0.2, // Log
      7: 0.1, // Leaves
      8: 0.5, // Generic blocks
      9: 0.5,
      10: 0.5,
      11: 0.5,
      12: 0.5,
      13: 0.5,
      14: 0.5,
      15: 0.3,
      16: 0.3,
      17: 0.25,
      18: 0.4,
      19: 0.35,
      20: 0.2,
      21: 0.2,
      22: 0.2,
      23: 0.15,
      24: 0.15,
      25: 0.7,
      26: 0.6,
      27: 0.5,
    };

    return blockMap[blockType] || 0.5;
  }

  encodeGameInfo(state, gameState) {
    const { start } = this.encoding.gameInfo;

    const now = Date.now();
    const started = !!gameState.gameStartTime && gameState.gameStartTime <= now;
    const timeElapsed = started ? now - gameState.gameStartTime : 0;
    const totalGameTime = NPC.HIDE_AND_SEEK.gameTimeLimit;
    const timeRemaining = Math.max(0, totalGameTime - timeElapsed);

    // [0] Time remaining (1.0 = full time, 0.0 = time's up)
    state[start] = timeRemaining / totalGameTime;

    // [1] Hiders found ratio
    const totalHiders = gameState.totalHiders || 2;
    state[start + 1] = (gameState.hidersFound || 0) / totalHiders;

    // [2] Is game in seeking phase? (1 = yes, 0 = preparation/over)
    state[start + 2] = gameState.state === NPC.GAME_STATES.SEEKING ? 1 : 0;

    // [3] Urgency flag (1 = less than 20 seconds remaining)
    state[start + 3] = timeRemaining < 20000 ? 1 : 0;
  }

  encodeTargetMemory(state, npc) {
    const { start } = this.encoding.targetMemory;

    if (!npc.lastSeenTarget) {
      state[start] = 0;
      state[start + 1] = 0;
      state[start + 2] = 0;
      state[start + 3] = 0;
      return;
    }

    // [0-1] Last seen position (normalized)
    state[start] = npc.lastSeenTarget.x / 64;
    state[start + 1] = npc.lastSeenTarget.z / 64;

    // [2] How recent is this memory? (1.0 = just now, decays over time)
    const timeSince = Date.now() - npc.lastSeenTarget.time;
    state[start + 2] = Math.max(0.01, Math.exp(-timeSince / 10000));

    // [3] Is target currently visible? (1 = yes, 0 = no)
    state[start + 3] = npc.lastSeenTarget.currentlyVisible ? 1 : 0;
  }

  encodeSeekerInfo(state, npc, perceptionData) {
    const { start } = this.encoding.roleSpecific;

    const visibleHiders = perceptionData.visibleNPCs.filter(
      (n) => n.role === "hider"
    );

    if (visibleHiders.length > 0) {
      const nearest = visibleHiders[0];

      // [0] Hider visible flag
      state[start] = 1.0;

      // [1-2] Direction to nearest hider (normalized vector)
      state[start + 1] = nearest.direction.x;
      state[start + 2] = nearest.direction.z;

      // [3] Distance to nearest hider (normalized)
      state[start + 3] = Math.min(1, nearest.distance / 12);

      // [4] Number of visible hiders (normalized)
      state[start + 4] = Math.min(1, visibleHiders.length / 2);

      // [5] Within catching distance? (1 = can catch now)
      state[start + 5] = nearest.distance < 2 ? 1 : 0;

      // Update memory
      npc.lastSeenTarget = {
        x: nearest.position.x,
        z: nearest.position.z,
        time: Date.now(),
        currentlyVisible: true,
      };
    } else {
      // No hiders visible
      state[start] = 0;
      state[start + 1] = 0;
      state[start + 2] = 0;
      state[start + 3] = 0;
      state[start + 4] = 0;
      state[start + 5] = 0;

      if (npc.lastSeenTarget) {
        npc.lastSeenTarget.currentlyVisible = false;
      }
    }
  }

  encodeHiderInfo(state, npc, perceptionData) {
    const { start } = this.encoding.roleSpecific;

    const visibleSeekers = perceptionData.visibleNPCs.filter(
      (n) => n.role === "seeker"
    );

    if (visibleSeekers.length > 0) {
      const nearest = visibleSeekers[0];
      const threatLevel = Math.max(0, 1 - nearest.distance / 12);

      // [0] Seeker visible flag
      state[start] = 1.0;

      // [1-2] Direction to nearest seeker (normalized vector)
      state[start + 1] = nearest.direction.x;
      state[start + 2] = nearest.direction.z;

      // [3] Distance to nearest seeker (normalized)
      state[start + 3] = Math.min(1, nearest.distance / 12);

      // [4] Threat level (high when seeker is close)
      state[start + 4] = threatLevel;

      // [5] In immediate danger? (1 = seeker very close)
      state[start + 5] = nearest.distance < 3 ? 1 : 0;

      // Update memory
      npc.lastSeenTarget = {
        x: nearest.position.x,
        z: nearest.position.z,
        time: Date.now(),
        currentlyVisible: true,
      };
    } else {
      // No seekers visible - safe
      state[start] = 0;
      state[start + 1] = 0;
      state[start + 2] = 0;
      state[start + 3] = 0;
      state[start + 4] = 0;
      state[start + 5] = 1; // Safe flag

      if (npc.lastSeenTarget) {
        npc.lastSeenTarget.currentlyVisible = false;
      }
    }
  }

  encodeBlockInfo(state, npc, perceptionData) {
    const { start } = this.encoding.blockInfo;

    // ⭐ FIXED: Use ?? instead of || to preserve 0 values
    const maxPlaced = NPC.BLOCK_PLACEMENT?.maxBlocksPlaced ?? 0;
    const maxRemoved = NPC.BLOCK_REMOVAL?.maxBlocksRemoved ?? 0;

    // [0] Can place block? (1 = yes, 0 = limit reached or disabled)
    const blocksPlaced = npc.blocksPlaced || 0;
    if (maxPlaced === 0) {
      // Blocks disabled - agent cannot place
      state[start] = 0.0;
    } else {
      // Blocks enabled - check if limit reached
      state[start] = blocksPlaced < maxPlaced ? 1.0 : 0.0;
    }

    // [1] Can remove block? (1 = yes, 0 = limit reached or disabled)
    const blocksRemoved = npc.blocksRemoved || 0;
    if (maxRemoved === 0) {
      // Blocks disabled - agent cannot remove
      state[start + 1] = 0.0;
    } else {
      // Blocks enabled - check if limit reached
      state[start + 1] = blocksRemoved < maxRemoved ? 1.0 : 0.0;
    }

    // [2] Nearby blocks available for interaction (normalized count)
    let nearbyBlockCount = 0;
    const interactionRange = 3;

    if (perceptionData?.raycastData?.rays) {
      const rays = perceptionData.raycastData.rays;
      for (const ray of rays) {
        if (ray.hit && !ray.isPlayer && ray.distance < interactionRange) {
          nearbyBlockCount++;
        }
      }
    }

    state[start + 2] = Math.min(1.0, nearbyBlockCount / 10);
  }

  // NEW: Encode movement state
  encodeMovementState(state, npc) {
    const { start } = this.encoding.movementState;

    // [0] X-axis blocked? (1 = can't move in X direction)
    state[start] = npc.lastMoveBlocked?.xBlocked ? 1.0 : 0.0;

    // [1] Z-axis blocked? (1 = can't move in Z direction)
    state[start + 1] = npc.lastMoveBlocked?.zBlocked ? 1.0 : 0.0;

    // [2] Currently moving? (1 = yes, 0 = stationary)
    state[start + 2] = npc.isMoving ? 1.0 : 0.0;
  }

  // Helper for debugging
  decodeAction(action) {
    const parts = [];

    if (action.movement_forward !== undefined) {
      if (Math.abs(action.movement_forward) > 0.1) {
        parts.push(`fwd:${action.movement_forward.toFixed(2)}`);
      }
      if (Math.abs(action.movement_strafe) > 0.1) {
        parts.push(`strafe:${action.movement_strafe.toFixed(2)}`);
      }
      if (Math.abs(action.rotation) > 0.1) {
        parts.push(`rot:${action.rotation.toFixed(2)}`);
      }
      if (Math.abs(action.look) > 0.1) {
        parts.push(`look:${action.look.toFixed(2)}`);
      }
      if (action.jump) {
        parts.push("jump");
      }
      if (action.place_block) {
        parts.push("place");
      }
      if (action.remove_block) {
        parts.push("remove");
      }
    }

    return parts.length > 0 ? parts.join("+") : "idle";
  }
}

export default StateEncoder;
