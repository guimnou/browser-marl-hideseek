// ==============================================================
// FILE: research/src/npc/npc-system.js
// ==============================================================

import { createPlayer } from "../../../../src/player/players.js";
import * as GameState from "../../../../src/core/game-state.js";
import { TRAINING_WORLD_CONFIG } from "../config-training-world.js";
import * as NPCPhysics from "../npc/physics/npc-physics.js";
import { NPC } from "./config-npc-behavior.js";
import HideSeekManager from "./hide-seek-manager.js";
import NPCMovementController from "./physics/npc-movement-controller.js";
import NPCSpawnSystem from "./npc-spawn-system.js";
import { NPCSystemLogger } from "../ml/log/npc-system-logger.js";
import sessionManager from "../ml/log/session-manager.js";
import NPCVisionSystem from "./physics/npc-vision-system.js";

window.NPCPhysics = NPCPhysics;

class NPCSystem {
  constructor(scene, chunkManager) {
    this.scene = scene;
    this.chunkManager = chunkManager;
    this.npcs = [];
    this.npcCount = 0;
    this.active = false;
    this.gameMode = "hide_and_seek";

    this.hideSeekManager = new HideSeekManager(scene);
    this.spawnSystem = new NPCSpawnSystem();
    this.lastUpdate = Date.now();
    this.movementController = new NPCMovementController(scene, chunkManager);
    this.seekerCount = 0;
    this.hiderCount = 0;

    // Static vision NPC (for debugging)
    this.staticVisionNPC = null;
    this.visionSystem = new NPCVisionSystem({
      debug: true,
      visionRange: 32,
      rayCount: 64,
    });
    this.visionSystem.setChunkManager(chunkManager);

    this.logger = new NPCSystemLogger("http://localhost:3001", {
      enabled: true,
      logLevel: "INFO",
      sessionDir: sessionManager.getSessionDir(),
    });

    this.settings = {
      maxNPCs: 10,
      spawnDistance: {
        min: 8,
        max: 20,
      },
    };

    this.skins = {
      seeker: "../../../assets/images/skins/fox.png",
      hider: "../../../assets/images/skins/chicken.png",
      default: "../../../assets/images/skins/1.png",
      visionDebug: "../../../assets/images/skins/fox.png", // Use fox for vision debug
    };
  }

  initialize() {
    return this;
  }

  //--------------------------------------------------------------//
  //                 STATIC VISION NPC METHODS
  //--------------------------------------------------------------//

  /**
   * Spawn a static NPC that only visualizes vision rays
   */
  spawnStaticVisionNPC() {
    // Remove existing vision NPC if any
    if (this.staticVisionNPC) {
      this.removeStaticVisionNPC();
    }

    // Find spawn position near player
    const spawnPos = this.findVisionNPCSpawnPosition();
    if (!spawnPos) {
      console.error("❌ Failed to find spawn position for Vision NPC");
      return false;
    }

    // Create the NPC
    const visionNPC = createPlayer(
      this.scene,
      {
        id: "vision-debug-npc",
        position: spawnPos,
        rotation: 0,
        isFlying: false,
        collisionsEnabled: false,
        isNPC: true,
      },
      this.skins.visionDebug,
      false
    );

    // Force exact position
    visionNPC.position.set(spawnPos.x, spawnPos.y, spawnPos.z);

    // Initialize as static vision NPC
    visionNPC.isNPC = true;
    visionNPC.isStaticVision = true; // Special flag
    visionNPC.velocity = { x: 0, y: 0, z: 0 };
    visionNPC.isOnGround = true;
    visionNPC.isMoving = false;
    visionNPC.role = "vision-debug";
    visionNPC.yaw = 0; // Facing north initially

    this.staticVisionNPC = visionNPC;

    console.log(
      `✅ Static Vision NPC spawned at (${spawnPos.x.toFixed(
        2
      )}, ${spawnPos.y.toFixed(2)}, ${spawnPos.z.toFixed(2)})`
    );

    return true;
  }

  /**
   * Remove the static vision NPC
   */
  removeStaticVisionNPC() {
    if (!this.staticVisionNPC) return;

    // Remove from scene
    if (this.staticVisionNPC.parent) {
      this.scene.remove(this.staticVisionNPC);
    }

    // Dispose THREE.js resources
    if (this.staticVisionNPC.geometry) {
      this.staticVisionNPC.geometry.dispose();
    }

    if (this.staticVisionNPC.material) {
      const materials = Array.isArray(this.staticVisionNPC.material)
        ? this.staticVisionNPC.material
        : [this.staticVisionNPC.material];

      materials.forEach((material) => {
        if (material.map) material.map.dispose();
        if (material.lightMap) material.lightMap.dispose();
        if (material.bumpMap) material.bumpMap.dispose();
        if (material.normalMap) material.normalMap.dispose();
        if (material.specularMap) material.specularMap.dispose();
        if (material.envMap) material.envMap.dispose();
        material.dispose();
      });
    }

    // Clear debug lines
    if (this.visionSystem.debugLines) {
      const debugLines = this.visionSystem.debugLines.get("vision-debug-npc");
      if (debugLines) {
        debugLines.forEach((line) => {
          this.scene.remove(line);
          if (line.geometry) line.geometry.dispose();
          if (line.material) line.material.dispose();
        });
        this.visionSystem.debugLines.delete("vision-debug-npc");
      }
    }

    this.staticVisionNPC = null;
    console.log("✅ Static Vision NPC removed");
  }

  /**
   * Find a spawn position near the player for the vision NPC
   */
  findVisionNPCSpawnPosition() {
    if (!GameState.player) {
      console.error("❌ No player found for Vision NPC spawn");
      return null;
    }

    const playerPos = GameState.player.position;

    // Try to spawn 10 blocks in front of player
    const distance = 10;
    const angle = GameState.player.yaw || 0;

    const x = playerPos.x - Math.sin(angle) * distance;
    const z = playerPos.z - Math.cos(angle) * distance;

    // Use existing spawn system to find safe height
    const spawnPos = this.spawnSystem.findValidSpawnPosition(
      [],
      this.chunkManager
    );

    if (spawnPos) {
      // Adjust to be near player
      spawnPos.x = Math.floor(x) + 0.5;
      spawnPos.z = Math.floor(z) + 0.5;
      // Keep the safe Y from spawn system
    }

    return spawnPos;
  }

  /**
   * Update the static vision NPC (render vision rays)
   */
  updateStaticVisionNPC() {
    if (!this.staticVisionNPC || !this.staticVisionNPC.visible) return;

    // No automatic rotation - NPC stays at its current yaw

    // Update NPC rotation visualization to match yaw
    if (this.staticVisionNPC.rotation) {
      this.staticVisionNPC.rotation.y = this.staticVisionNPC.yaw;
    }

    // Temporarily adjust Y position for ray origin (lower the rays)
    // Vision system adds +1.6 internally, so we subtract 0.2 to effectively get +1.4 offset
    const originalY = this.staticVisionNPC.position.y;
    this.staticVisionNPC.position.y -= 0.2; // Lower the ray origin

    // Get vision data (using all NPCs as potential targets)
    const visionData = this.visionSystem.getVisionData(
      this.staticVisionNPC,
      this.npcs
    );

    // Restore original Y position
    this.staticVisionNPC.position.y = originalY;

    // Draw debug rays
    this.visionSystem.drawDebugRays(
      this.staticVisionNPC,
      visionData,
      this.scene
    );
  }

  //--------------------------------------------------------------//
  //                 REGULAR NPC METHODS
  //--------------------------------------------------------------//

  generateNPCs(count = null) {
    if (this.gameMode === "hide_and_seek") {
      const totalNPCs =
        NPC.HIDE_AND_SEEK.seekerCount + NPC.HIDE_AND_SEEK.hiderCount;

      if (this.npcs.length > 0) {
        return this.npcs;
      }
      this.seekerCount = 0;
      this.hiderCount = 0;

      count = totalNPCs;
    } else if (count === null) {
      count = 3;
    }

    const spawnCount = Math.min(
      count,
      this.settings.maxNPCs - this.npcs.length
    );

    if (!GameState.player) {
      return this.npcs;
    }

    let successfulSpawns = 0;
    let failedSpawns = 0;

    for (let i = 0; i < spawnCount; i++) {
      const npc = this.spawnNPC(i);
      if (npc) {
        successfulSpawns++;
      } else {
        failedSpawns++;
        console.error(`Failed to spawn NPC ${i + 1}/${spawnCount}`);
      }
    }

    if (failedSpawns > 0) {
      console.warn(
        `⚠️ Spawn summary: ${successfulSpawns} succeeded, ${failedSpawns} failed`
      );
    }

    if (!this.active && this.npcs.length > 0) {
      this.startNPCSystem();
    }

    const requiredNPCs =
      NPC.HIDE_AND_SEEK.seekerCount + NPC.HIDE_AND_SEEK.hiderCount;
    if (this.gameMode === "hide_and_seek" && this.npcs.length >= requiredNPCs) {
      this.startHideAndSeekGame();
    } else if (
      this.gameMode === "hide_and_seek" &&
      this.npcs.length < requiredNPCs
    ) {
      console.error(
        `❌ Hide and seek requires ${requiredNPCs} NPCs, but only ${this.npcs.length} were spawned`
      );
    }

    return this.npcs;
  }

  spawnNPC(index = 0, position = null) {
    const spawnPos =
      position ||
      this.spawnSystem.findValidSpawnPosition(this.npcs, this.chunkManager);

    if (!spawnPos) {
      this.logger.logSpawnFailure("No valid position found", {
        attempts: this.spawnSystem.settings.maxSpawnAttempts,
        index,
      });
      return null;
    }

    let id;
    let skin;
    let role;

    if (this.gameMode === "hide_and_seek") {
      const seekerCount = NPC.HIDE_AND_SEEK.seekerCount;

      if (index < seekerCount) {
        this.seekerCount++;
        id = `seeker-${this.seekerCount}`;
        skin = this.skins.seeker;
        role = "seeker";
      } else {
        this.hiderCount++;
        id = `hider-${this.hiderCount}`;
        skin = this.skins.hider;
        role = "hider";
      }
    } else {
      id = `npc-${++this.npcCount}`;
      skin = this.skins.default;
      role = "default";
    }

    this.logger.logSpawnAttempt(index, spawnPos, role);

    // ✅ CRITICAL: Pass exact spawn position with a flag to bypass GameState.spawn
    const npc = createPlayer(
      this.scene,
      {
        id,
        position: spawnPos,
        rotation: Math.random() * Math.PI * 2,
        isFlying: false,
        collisionsEnabled: true,
        isNPC: true, // ✅ ADD THIS FLAG
      },
      skin,
      false
    );

    // ✅ CRITICAL: Force correct position AFTER creation
    npc.position.set(spawnPos.x, spawnPos.y, spawnPos.z);

    this.initializeNPC(npc);
    this.npcs.push(npc);

    this.logger.logSpawnSuccess(id, spawnPos, role);

    console.log(
      `✅ NPC ${id} final position: (${npc.position.x.toFixed(
        2
      )}, ${npc.position.y.toFixed(2)}, ${npc.position.z.toFixed(2)})`
    );

    return npc;
  }

  initializeNPC(npc) {
    npc.isNPC = true;
    npc.velocity = { x: 0, y: 0, z: 0 };
    npc.isOnGround = true;
    npc.isMoving = false;
    npc.jumpCooldown = 0;
    npc.moveDirection = new THREE.Vector3(0, 0, 0);

    npc.role = null;
    npc.hideSeekState = null;
    npc.mlControlled = false;

    this.movementController.initializeNPC(npc);
  }

  removeAllNPCs() {
    if (this.hideSeekManager.gameRunning) {
      this.hideSeekManager.endGame("manual_stop");
    }

    const count = this.npcs.length;

    // 🔴 FIX: Properly dispose THREE.js resources to prevent GPU memory leak!
    for (const npc of this.npcs) {
      if (npc.parent) {
        this.scene.remove(npc);
      }

      // Dispose geometry to free GPU memory
      if (npc.geometry) {
        npc.geometry.dispose();
      }

      // Dispose materials to free GPU memory
      if (npc.material) {
        // Handle both single material and material array
        const materials = Array.isArray(npc.material)
          ? npc.material
          : [npc.material];

        materials.forEach((material) => {
          // Dispose textures if present
          if (material.map) material.map.dispose();
          if (material.lightMap) material.lightMap.dispose();
          if (material.bumpMap) material.bumpMap.dispose();
          if (material.normalMap) material.normalMap.dispose();
          if (material.specularMap) material.specularMap.dispose();
          if (material.envMap) material.envMap.dispose();

          // Dispose material itself
          material.dispose();
        });
      }

      // Clear any custom userData references
      if (npc.userData) {
        npc.userData = {};
      }
    }

    this.npcs = [];
    this.npcCount = 0;
    this.seekerCount = 0;
    this.hiderCount = 0;

    this.logger.logAllNPCsRemoved(count);
  }

  startNPCSystem() {
    if (this.active) return;
    this.active = true;
    this.logger.logSystemStart();
  }

  update(deltaTime) {
    if (!this.active) return;

    this.hideSeekManager.update(deltaTime);

    // Update regular NPCs
    for (const npc of this.npcs) {
      if (!npc.visible || !npc.parent) continue;

      if (npc.hideSeekState === NPC.GAME_STATES.FOUND) {
        npc.isMoving = false;
        npc.velocity = { x: 0, y: 0, z: 0 };
        continue;
      }

      if (npc.role === "seeker" && npc.inPreparationPhase) {
        npc.velocity = { x: 0, y: 0, z: 0 };
        npc.isMoving = false;
        continue;
      }

      NPCPhysics.updateNPCPhysics(npc, this.scene, deltaTime);
      this.publishNPCMovement(npc);
    }

    // Update static vision NPC (if exists)
    this.updateStaticVisionNPC();
  }

  respawnNPC(npc) {
    if (npc.hideSeekState === NPC.GAME_STATES.FOUND) return;

    const oldPos = { ...npc.position };
    const newPos = this.spawnSystem.findValidSpawnPosition(
      this.npcs,
      this.chunkManager
    );

    if (newPos) {
      npc.position.set(newPos.x, newPos.y, newPos.z);
      NPCPhysics.resetNPCPhysics(npc);
      this.logger.logRespawn(npc.userData?.id, oldPos, newPos);
    } else {
      console.error(
        `❌ Failed to respawn NPC ${npc.userData?.id} - no valid position found`
      );
    }
  }

  publishNPCMovement(npc) {
    GameState.publish(GameState.EVENTS.PLAYER_MOVED, {
      id: npc.userData?.id,
      position: npc.position,
      rotation: npc.yaw,
      isFlying: false,
      isMoving: npc.isMoving,
    });
  }

  startHideAndSeekGame() {
    const requiredNPCs =
      NPC.HIDE_AND_SEEK.seekerCount + NPC.HIDE_AND_SEEK.hiderCount;

    if (this.npcs.length < requiredNPCs) {
      this.logger.logInsufficientNPCs(requiredNPCs, this.npcs.length);
      return false;
    }

    this.logger.logHideSeekStart(
      NPC.HIDE_AND_SEEK.seekerCount,
      NPC.HIDE_AND_SEEK.hiderCount
    );

    return this.hideSeekManager.initializeGame(
      this.npcs,
      this.spawnSystem,
      this.chunkManager
    );
  }

  restartHideSeekGame() {
    this.logger.logHideSeekRestart();
    this.hideSeekManager.restartGame();
  }

  getHideSeekStatus() {
    return this.hideSeekManager.getGameStatus();
  }

  setGameMode(mode) {
    const oldMode = this.gameMode;
    this.gameMode = mode;
    this.logger.logGameModeChange(oldMode, mode);
    this.removeAllNPCs();
  }

  getNPCsByRole(role) {
    return this.npcs.filter((npc) => npc.role === role);
  }

  cleanup() {
    this.removeStaticVisionNPC(); // Clean up vision NPC
    this.logger.logStats();
    this.logger.close();
  }
}

export default NPCSystem;
