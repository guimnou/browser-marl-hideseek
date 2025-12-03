// ==============================================================
// FILE: research/src/ml/ppo-training-bridge.js
// ==============================================================

import { PPOWebSocketClient } from "./websocket-client.js";
import { StateEncoder } from "./state-encoder.js";
import { RewardSystem } from "./reward-system.js";
import { NPCVisionSystem } from "../npc/physics/npc-vision-system.js";
import { NPC } from "../npc/config-npc-behavior.js";
import { regenerateTerrain } from "../world/terrain-generator.js";
import { TRAINING_WORLD_CONFIG } from "../config-training-world.js";
import NPCPhysics from "../npc/physics/npc-physics.js";

import sessionManager from "./log/session-manager.js";
import { PPOTrainingLogger } from "./log/ppo-training-bridge-logger.js";

export class PPOTrainingBridge {
  constructor(npcSystem, hideSeekManager, chunkManager) {
    this.npcSystem = npcSystem;
    this.hideSeekManager = hideSeekManager;
    this.movementController = npcSystem.movementController;
    this.chunkManager = chunkManager;
    this.wsClient = new PPOWebSocketClient();
    this.encoder = new StateEncoder();
    this.encoder.chunkManager = chunkManager;
    this.logger = new PPOTrainingLogger("http://localhost:3001", {
      logInterval: 100,
      enabled: true,
      sessionDir: sessionManager.getSessionDir(),
    });
    this.visionSystem = new NPCVisionSystem({
      visionRange: NPC.VISION.visionRange,
      visionAngle: NPC.VISION.visionAngle,
      rayCount: NPC.VISION.rayCount,
      rayAngleTolerance: NPC.VISION.rayAngleTolerance,
      debug: false,
    });

    if (chunkManager) {
      this.visionSystem.setChunkManager(chunkManager);
    }

    // Initialize the new RewardSystem
    this.rewardSystem = new RewardSystem(
      npcSystem,
      this.visionSystem,
      chunkManager
    );

    this.scene = npcSystem.scene;

    this.connected = false;
    this.training = false;
    this.currentEpisode = 0;
    this.currentStep = 0;
    this.currentActions = new Map();

    // Vision caching for performance
    this.currentVisionCache = null;

    // 🔴 FIX: Terrain regeneration flag for curriculum learning
    this.terrainNeedsRegeneration = false;

    // Debug mode
    this.DEBUG_MODE = false;
    this.episodeStartTime = 0;
    this.simulatedTime = 0;
  }

  async connect() {
    try {
      await this.wsClient.connect();
      this.connected = true;
      return true;
    } catch (error) {
      alert(
        "Failed to connect to Python backend. Make sure 'python main.py' is running!"
      );
      return false;
    }
  }

  async startTraining() {
    if (!this.connected) return;

    this.training = true;

    const originalHandler = this.wsClient.handleMessage.bind(this.wsClient);

    this.wsClient.handleMessage = async (data) => {
      try {
        const message = JSON.parse(data);

        if (message.type === "reset") {
          const observations = await this.resetEpisode(message.episode);
          this.wsClient.send({
            type: "observation",
            agents: observations,
          });
        } else if (message.type === "step") {
          const stepResult = await this.executeStep(message.actions);
          this.wsClient.send({
            type: "observation",
            agents: stepResult.agents,
            episode_done: stepResult.episode_done,
          });
        } else {
          originalHandler(data);
        }
      } catch (error) {
        this.wsClient.sendError("Message handling failed", error.toString());
        originalHandler(data);
      }
    };

    while (this.training) {
      await this.sleep(1000);
    }
  }

  async startDemo() {
    if (!this.connected) return;

    this.training = false;
    this.DEBUG_MODE = true;

    const originalHandler = this.wsClient.handleMessage.bind(this.wsClient);

    this.wsClient.handleMessage = async (data) => {
      try {
        const message = JSON.parse(data);

        if (message.type === "reset") {
          const observations = await this.resetEpisode(message.episode);
          this.wsClient.send({
            type: "observation",
            agents: observations,
          });
        } else if (message.type === "step") {
          const stepResult = await this.executeStep(message.actions);
          this.wsClient.send({
            type: "observation",
            agents: stepResult.agents,
            episode_done: stepResult.episode_done,
          });
        } else {
          originalHandler(data);
        }
      } catch (error) {
        this.wsClient.sendError(
          "Demo message handling failed",
          error.toString()
        );
        originalHandler(data);
      }
    };

    // Keep connection alive
    while (this.connected) {
      await this.sleep(1000);
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  stopTraining() {
    this.training = false;
    if (this.logger) {
      this.logger.close();
    }
  }

  async resetEpisode(episodeNum) {
    this.currentEpisode = episodeNum;
    this.currentStep = 0;

    this.logger.startEpisode(episodeNum);

    if (window.hideSeekUI) {
      window.hideSeekUI.updateTrainingEpisode(episodeNum);
    }

    if (this.hideSeekManager.gameRunning) {
      this.hideSeekManager.endGame("episode_reset");
    }

    // 🔴 FIX: Only regenerate terrain on first episode or when curriculum changes
    // Since USE_SAME_SEED = true, terrain is identical every episode - no need to regenerate!
    // TODO: When implementing curriculum learning (terrain height changes), check for config changes
    if (episodeNum === 0 || episodeNum === 1 || this.terrainNeedsRegeneration) {
      await regenerateTerrain(this.chunkManager);
      this.terrainNeedsRegeneration = false;
    }

    this.npcSystem.removeAllNPCs();
    this.npcSystem.generateNPCs();

    // Initialize simulated time
    this.episodeStartTime = Date.now();
    this.simulatedTime = this.episodeStartTime;

    // Initialize game
    const success = this.hideSeekManager.initializeGame(this.npcSystem.npcs);

    if (!success) {
      return [];
    }

    // Override with simulated time
    const startTime = this.simulatedTime;
    this.hideSeekManager.countdownStartTime = startTime;
    this.hideSeekManager.gameStartTime =
      startTime + this.hideSeekManager.countdownTime;

    this.currentActions.clear();
    this.currentVisionCache = null;

    const observations = this.collectObservations();

    return observations;
  }

  async executeStep(actions) {
    this.currentStep++;

    for (const [agentId, action] of Object.entries(actions)) {
      this.currentActions.set(agentId, {
        movement_forward: action.movement_forward || 0,
        movement_strafe: action.movement_strafe || 0,
        rotation: action.rotation || 0,
        look: action.look || 0,
        jump: action.jump || false,
        place_block: action.place_block || false,
        remove_block: action.remove_block || false,
      });
    }

    const FRAMES_PER_STEP = 5;
    const deltaTime = 1.0 / 60.0;
    const frameDelay = this.DEBUG_MODE ? 16 : 0;

    const originalDateNow = Date.now;

    try {
      // Use simulated time
      Date.now = () => this.simulatedTime;

      // Physics simulation
      for (let frame = 0; frame < FRAMES_PER_STEP; frame++) {
        this.npcSystem.npcs.forEach((npc) => {
          if (npc.hideSeekState === NPC.GAME_STATES.FOUND) return;

          const action = this.currentActions.get(npc.userData.id);
          if (action) {
            // Execute movement actions
            this.movementController.executeActionGroups(npc, action, deltaTime);
          }

          NPCPhysics.updateNPCPhysics(npc, this.scene, deltaTime);
        });

        this.hideSeekManager.update(deltaTime);
        this.simulatedTime += deltaTime * 1000;

        if (frameDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, frameDelay));
        }
      }
    } finally {
      Date.now = originalDateNow;
    }

    // Force game end if conditions met
    const gameState = this.hideSeekManager.getGameStatus();
    const elapsedTime = this.simulatedTime - this.episodeStartTime;
    const totalGameTime =
      NPC.HIDE_AND_SEEK.gameTimeLimit + NPC.HIDE_AND_SEEK.countdownTime;

    if (
      elapsedTime > totalGameTime &&
      gameState.state !== NPC.GAME_STATES.GAME_OVER
    ) {
      this.hideSeekManager.endGame("time_limit");
    }

    if (
      gameState.hidersFound >= gameState.totalHiders &&
      gameState.state !== NPC.GAME_STATES.GAME_OVER
    ) {
      this.hideSeekManager.endGame("all_found");
    }

    // Calculate vision once per step
    const visionCache = new Map();
    this.npcSystem.npcs.forEach((npc) => {
      if (npc.hideSeekState !== NPC.GAME_STATES.FOUND) {
        const visionData = this.visionSystem.getVisionData(
          npc,
          this.npcSystem.npcs
        );
        visionCache.set(npc.userData.id, visionData);
      }
    });
    this.currentVisionCache = visionCache;

    // Calculate rewards using cached vision
    const rewards = {};

    this.npcSystem.npcs.forEach((npc) => {
      if (npc.hideSeekState === NPC.GAME_STATES.FOUND) {
        rewards[npc.userData.id] = 0;
      } else {
        const visionData = visionCache.get(npc.userData.id);
        rewards[npc.userData.id] = this.calculateReward(
          npc,
          visionData,
          gameState
        );
        npc.episodeSteps++;
      }
    });

    // Log step data
    this.logger.logStep(this.currentStep, {
      rewards,
      gameState,
      elapsedTime,
    });

    const done = this.isEpisodeDone();

    if (done) {
      this.applyEndOfEpisodeRewards(rewards);
      this.logger.endEpisode(rewards, gameState);
    }

    // Collect observations using cached vision
    const observations = this.collectObservations();

    const stepResult = {
      agents: observations.map((obs) => ({
        id: obs.id,
        role: obs.role,
        observation: obs.observation,
        reward: rewards[obs.id] || 0,
        done:
          this.npcSystem.npcs.find((n) => n.userData.id === obs.id)
            ?.hideSeekState === NPC.GAME_STATES.FOUND || false,
      })),
      episode_done: done,
    };

    // Update last positions
    this.npcSystem.npcs.forEach((npc) => {
      npc.lastPosition.copy(npc.position);
    });

    // Debug log - only every 100 steps to avoid spam
    if (this.currentStep % 100 === 0) {
      console.log("📤 Sending to Python:", {
        step: this.currentStep,
        rewards: stepResult.agents
          .map((a) => `${a.id}:${a.reward.toFixed(2)}`)
          .join(", "),
      });
    }

    return stepResult;
  }

  // ============================================================
  // REWARD CALCULATION - Delegates to RewardSystem
  // ============================================================

  calculateReward(npc, visionData, gameState) {
    let reward = 0;

    // Early return if not in seeking phase
    if (gameState.state !== NPC.GAME_STATES.SEEKING) {
      return 0;
    }

    // Delegate to RewardSystem based on role
    if (npc.role === "seeker") {
      reward = this.rewardSystem.calculateSeekerReward(npc, visionData);
    } else if (npc.role === "hider") {
      reward = this.rewardSystem.calculateHiderReward(npc, visionData);
    }

    // Global time penalty
    reward += this.rewardSystem.REWARD_CONFIG.TIME_PENALTY;

    return reward;
  }

  applyEndOfEpisodeRewards(rewards) {
    this.rewardSystem.applyEndOfEpisodeRewards(rewards, this.hideSeekManager);
  }

  // ============================================================
  // OBSERVATION COLLECTION
  // ============================================================
  collectObservations() {
    const observations = [];

    for (const npc of this.npcSystem.npcs) {
      if (npc.hideSeekState === NPC.GAME_STATES.FOUND) continue;

      const gameState = this.hideSeekManager.getGameStatus();

      // Use cached vision data if available
      const perceptionData =
        this.currentVisionCache?.get(npc.userData.id) ||
        this.visionSystem.getVisionData(npc, this.npcSystem.npcs);

      const state = this.encoder.encode(
        npc,
        gameState,
        perceptionData,
        TRAINING_WORLD_CONFIG.SIZE
      );

      observations.push({
        id: npc.userData.id,
        role: npc.role,
        observation: Array.from(state),
      });
    }

    return observations;
  }

  isEpisodeDone() {
    const gameStatus = this.hideSeekManager.getGameStatus();
    return gameStatus.state === NPC.GAME_STATES.GAME_OVER;
  }

  disconnect() {
    if (this.wsClient) {
      this.wsClient.close();
      this.connected = false;
    }
  }
}

export default PPOTrainingBridge;
