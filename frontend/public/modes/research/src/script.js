// ==============================================================
// FILE: frontend/public/modes/research/src/script.js
// ==============================================================

//--------------------------------------------------------------//
//                  Console Optimization (FIRST!)
//--------------------------------------------------------------//
// 🔴 IMPORTANT: Import FIRST to override console before other modules load
// This prevents console log accumulation during long training sessions
import './console-optimizer.js';

//--------------------------------------------------------------//
//                              Imports
//--------------------------------------------------------------//
import {
  createPlayer,
  addPlayerControls,
} from "../../../src/player/players.js";
import { createMiniMap } from "../../../src/player/map.js";
import { TRAINING_WORLD_CONFIG } from "./config-training-world.js";
import { ChunkManager } from "../../../src/world/chunk_manager.js";
import { Texture, BlockType } from "../../../src/world/textures.js";
import { initializeBlockInteractions } from "../../../src/world/block_interactions.js";
import * as GameState from "../../../src/core/game-state.js";
import BoundaryIntegration from "../../../src/core/game-state-boundary-integration.js";
import ResearchBoundaryIntegration from "../src/world/boundary-integration.js";
import NPCSystem from "../src/npc/npc-system.js";
import HideSeekUI from "../src/ui/hide-seek-ui.js";

//--------------------------------------------------------------//
//                       Configuration
//--------------------------------------------------------------//
const CLIENT_WORLD_CONFIG = GameState.CLIENT_WORLD_CONFIG;
const DEFAULT_PLAYER_DATA = GameState.DEFAULT_PLAYER_DATA;
const MAX_INSTANCES = CLIENT_WORLD_CONFIG.CHUNK_SIZE ** 3;

//--------------------------------------------------------------//
//                      Global Variables
//--------------------------------------------------------------//
const textureManager = new Texture(
  MAX_INSTANCES,
  CLIENT_WORLD_CONFIG.CHUNK_SIZE
);

// System references
let boundarySystem = null;
let researchBoundarySystem = null;
let npcSystem = null;
let hideSeekUI = null;

//--------------------------------------------------------------//
//                              Textures
//--------------------------------------------------------------//
function createChunkMesh(chunk, chunkX, chunkY, chunkZ) {
  return textureManager.createChunkMesh(
    chunk,
    chunkX,
    chunkY,
    chunkZ,
    GameState.scene
  );
}

//--------------------------------------------------------------//
//                       Chunk Management
//--------------------------------------------------------------//
function generateInitialChunk() {
  if (!GameState.chunkManager || !GameState.player) return;

  const playerChunkX = Math.floor(
    GameState.player.position.x / CLIENT_WORLD_CONFIG.CHUNK_SIZE
  );
  const playerChunkZ = Math.floor(
    GameState.player.position.z / CLIENT_WORLD_CONFIG.CHUNK_SIZE
  );
  GameState.chunkManager.lastPlayerChunkPos = {
    x: playerChunkX,
    z: playerChunkZ,
  };

  GameState.chunkManager.generateInitialChunk();
}

function initChunkManager() {
  const config = GameState.worldConfig || TRAINING_WORLD_CONFIG;

  const chunkManager = new ChunkManager(GameState.scene, config, {
    ...CLIENT_WORLD_CONFIG,
    MAX_PROCESSING_TIME: 30,
  });
  chunkManager.setMeshCreationFunction(createChunkMesh);
  GameState.setChunkManager(chunkManager);
}

function updateChunk() {
  if (!GameState.chunkManager || !GameState.player) return;
  GameState.chunkManager.updateChunk(GameState.player.position);
}

function initWebWorker() {
  const chunkWorker = new Worker("../../../src/web-worker/chunk-worker.js");
  chunkWorker.onmessage = function (e) {
    switch (e.data.type) {
      case "chunkGenerated":
      case "chunkUpdated":
        const { chunk, chunkX, chunkY, chunkZ } = e.data;
        if (GameState.chunkManager) {
          GameState.chunkManager.handleChunkData(chunk, chunkX, chunkY, chunkZ);
          GameState.publish(GameState.EVENTS.CHUNK_LOADED, {
            chunk,
            chunkX,
            chunkY,
            chunkZ,
          });
        }
        break;
      case "regenerated":
        console.log(`✅ [Worker] Terrain regenerated with seed ${e.data.seed}`);
        break;
      case "error":
        console.error("Chunk generation error:", e.data.error);
        break;
    }
  };

  const workerConfig = {
    type: "init",
    server_config: GameState.worldConfig,
    client_config: CLIENT_WORLD_CONFIG,
    seed: GameState.worldConfig?.SEED || Date.now(),
    block_type: BlockType,
  };

  chunkWorker.postMessage(workerConfig);

  if (GameState.chunkManager) {
    GameState.chunkManager.setChunkWorker(chunkWorker);
  }
  GameState.setChunkWorker(chunkWorker);
}

function handleWorldInfo(data) {
  GameState.clearChunkMap();
  if (GameState.chunkManager) {
    GameState.chunkManager.chunks.clear();
  }
  if (GameState.chunkWorker) {
    GameState.chunkWorker.terminate();
  }

  GameState.setWorldConfig(data.config);
  GameState.setClientWorldConfig(data.client_config || CLIENT_WORLD_CONFIG);

  initializeResearchBoundarySystem(data.config);
  initializeBoundarySystem(data.config);

  initChunkManager();
  initWebWorker();

  if (data.modifications && data.modifications.length > 0) {
    const chunkModifications = data.modifications.map((mod) => ({
      chunkX: Math.floor(mod.position.x / CLIENT_WORLD_CONFIG.CHUNK_SIZE),
      chunkY: Math.floor(mod.position.y / CLIENT_WORLD_CONFIG.CHUNK_SIZE),
      chunkZ: Math.floor(mod.position.z / CLIENT_WORLD_CONFIG.CHUNK_SIZE),
      localX:
        ((mod.position.x % CLIENT_WORLD_CONFIG.CHUNK_SIZE) +
          CLIENT_WORLD_CONFIG.CHUNK_SIZE) %
        CLIENT_WORLD_CONFIG.CHUNK_SIZE,
      localY:
        ((mod.position.y % CLIENT_WORLD_CONFIG.CHUNK_SIZE) +
          CLIENT_WORLD_CONFIG.CHUNK_SIZE) %
        CLIENT_WORLD_CONFIG.CHUNK_SIZE,
      localZ:
        ((mod.position.z % CLIENT_WORLD_CONFIG.CHUNK_SIZE) +
          CLIENT_WORLD_CONFIG.CHUNK_SIZE) %
        CLIENT_WORLD_CONFIG.CHUNK_SIZE,
      blockType: mod.blockType,
    }));

    GameState.chunkWorker.postMessage({
      type: "applyModifications",
      modifications: chunkModifications,
    });
  }

  if (GameState.player) {
    generateInitialChunk();
  }
}

//--------------------------------------------------------------//
//               Boundary System Integration
//--------------------------------------------------------------//
function initializeResearchBoundarySystem(worldConfig) {
  try {
    researchBoundarySystem =
      ResearchBoundaryIntegration.initializeResearchBoundaries(
        GameState.scene,
        worldConfig
      );
    ResearchBoundaryIntegration.enableResearchBoundaryIntegration();
  } catch (error) {
    console.error("Failed to initialize research boundary system:", error);
  }
}

function initializeBoundarySystem(worldConfig) {
  try {
    boundarySystem = BoundaryIntegration.initializeBoundarySystem(
      GameState.scene,
      worldConfig
    );
  } catch (error) {
    console.error("Failed to initialize backup boundary system:", error);
  }
}

function checkAllEntitiesBoundaries() {
  if (GameState.player && boundarySystem) {
    BoundaryIntegration.checkEntityBoundaries(GameState.player);
  }

  if (npcSystem && npcSystem.npcs && researchBoundarySystem) {
    for (const npc of npcSystem.npcs) {
      if (npc && npc.position) {
        ResearchBoundaryIntegration.enforceNPCContainment(npc);
      }
    }
  }
}

//--------------------------------------------------------------//
//                 ML Training and Loading Logic
//--------------------------------------------------------------//
async function startNewTraining() {
  if (!npcSystem || !npcSystem.hideSeekManager) {
    console.error("Cannot start training: NPCSystem not ready.");
    return;
  }
  console.log("🚀 Starting PPO training with Python backend...");

  try {
    const { PPOTrainingBridge } = await import("./ml/ppo-training-bridge.js");
    const ppoBridge = new PPOTrainingBridge(
      npcSystem,
      npcSystem.hideSeekManager,
      GameState.chunkManager
    );

    const connected = await ppoBridge.connect();
    if (!connected) {
      alert(
        "❌ Failed to connect to Python backend. Make sure 'python main.py' is running!"
      );
      if (window.hideSeekUI) window.hideSeekUI.setTrainingMode(false);
      return;
    }

    window.activePPOBridge = ppoBridge;
    npcSystem.setGameMode("hide_and_seek");
    await ppoBridge.startTraining();
    if (window.hideSeekUI) window.hideSeekUI.setTrainingMode(false);
  } catch (error) {
    console.error("❌ Training error:", error);
    alert(`Training failed: ${error.message}`);
    if (window.hideSeekUI) window.hideSeekUI.setTrainingMode(false);
  }
}

window.stopPPOTraining = function () {
  if (window.activePPOBridge) {
    window.activePPOBridge.stopTraining();
    console.log("⚠️ Training stopped by user");
    if (window.hideSeekUI) window.hideSeekUI.setTrainingMode(false);
  }
};

async function startDemoMode() {
  if (!npcSystem || !npcSystem.hideSeekManager) {
    console.error("Cannot start demo: NPCSystem not ready.");
    return;
  }
  console.log("🎮 Starting demo mode with trained model...");

  try {
    const { PPOTrainingBridge } = await import("./ml/ppo-training-bridge.js");
    const ppoBridge = new PPOTrainingBridge(
      npcSystem,
      npcSystem.hideSeekManager,
      GameState.chunkManager
    );
    ppoBridge.DEBUG_MODE = true;

    const connected = await ppoBridge.connect();
    if (!connected) {
      alert(
        "❌ Failed to connect. Make sure 'python demo_model.py' is running!"
      );
      if (window.hideSeekUI) window.hideSeekUI.setTrainingMode(false);
      return;
    }

    window.activePPOBridge = ppoBridge;
    if (window.hideSeekUI) window.hideSeekUI.setTrainingMode(true);
    npcSystem.setGameMode("hide_and_seek");
    await ppoBridge.startDemo();
  } catch (error) {
    console.error("❌ Demo error:", error);
    alert(`Demo failed: ${error.message}`);
    if (window.hideSeekUI) window.hideSeekUI.setTrainingMode(false);
  }
}
window.startDemoMode = startDemoMode;

function startGameIfReady() {
  if (GameState.isGameReady()) {
    try {
      if (!GameState.chunkManager) initChunkManager();
      generateInitialChunk();
      const blockManager = initializeBlockInteractions(GameState.player);
      GameState.setBlockManager(blockManager);
      GameState.publish(GameState.EVENTS.GAME_READY, true);
      animate();
    } catch (error) {
      console.error("Error starting game:", error);
    }
  }
}

//--------------------------------------------------------------//
//                       Initialization
//--------------------------------------------------------------//
async function init() {
  try {
    GameState.createLoadingScreen();
    GameState.updateLoadingMessage("Setting up the scene...");
    GameState.setupScene(TRAINING_WORLD_CONFIG.SIZE);
    GameState.updateLoadingMessage("Configuring lighting...");
    GameState.setupLighting();
    GameState.updateLoadingMessage("Setting up event listeners...");
    setupEventListeners();

    const style = document.createElement("style");
    style.innerHTML = `* { user-select: none; -webkit-user-select: none; }`;
    document.head.appendChild(style);

    GameState.updateLoadingMessage("Loading textures...");
    await textureManager.loadTextureAtlas(
      "../../../assets/images/texture-pack/texture-atlas.png"
    );
    GameState.setTexturesLoaded(true);

    GameState.updateLoadingMessage("Starting in research mode...");
    startOfflineMode();

    GameState.updateLoadingMessage("Initializing world generator...");
    initWebWorker();
    GameState.setSchematicsLoaded(true);

    GameState.updateLoadingMessage("Setting up Hide and Seek system...");
    initializeHideSeekSystem();

    GameState.updateLoadingMessage("Preparing the research world...");
    GameState.removeLoadingScreen();

    startGameIfReady();
  } catch (error) {
    console.error("Initialization failed:", error);
    GameState.updateLoadingMessage("Failed to initialize game");
  }
}

function startOfflineMode() {
  handleWorldInfo({
    config: TRAINING_WORLD_CONFIG,
    client_config: CLIENT_WORLD_CONFIG,
  });
  handlePlayerInfo(DEFAULT_PLAYER_DATA);
  GameState.updateServerStatus(false);
}

//--------------------------------------------------------------//
//                   Hide and Seek System Integration
//--------------------------------------------------------------//
function initializeHideSeekSystem() {
  if (npcSystem && hideSeekUI) return;

  npcSystem = new NPCSystem(
    GameState.scene,
    GameState.chunkManager
  ).initialize();
  window.npcSystem = npcSystem;

  const mlCallbacks = { onStartTraining: startNewTraining };
  hideSeekUI = new HideSeekUI(npcSystem, mlCallbacks);
}

//--------------------------------------------------------------//
//                       Player Management
//--------------------------------------------------------------//
function handlePlayerInfo(playerData) {
  const spawnPos = GameState.spawn(
    playerData.position?.x,
    playerData.position?.z
  );
  const position = new THREE.Vector3(spawnPos.x, spawnPos.y, spawnPos.z);
  const player = createPlayer(
    GameState.scene,
    { ...playerData, position },
    "../../../assets/images/skins/1.png",
    true
  );

  GameState.setPlayer(player);
  GameState.setPlayerLoaded(true);
  GameState.updateCamera(position);

  startGameIfReady();
}

//--------------------------------------------------------------//
//                       Game Loop
//--------------------------------------------------------------//
function animate() {
  if (!GameState.playerControls) {
    const controls = addPlayerControls(
      GameState.player,
      GameState.camera,
      GameState.scene,
      GameState.renderer.domElement
    );
    GameState.setPlayerControls(controls);
  }

  const updateMiniMap = createMiniMap(GameState.scene, GameState.player);
  let sceneChanged = true;
  let updateCounter = 0;
  const clock = new THREE.Clock();

  GameState.renderer.setAnimationLoop(() => {
    const deltaTime = clock.getDelta();

    if (GameState.playerControls) {
      GameState.playerControls(deltaTime);
      sceneChanged = true;
    }
    if (GameState.blockManager) {
      GameState.blockManager.update();
      sceneChanged = true;
    }
    if (npcSystem?.active) {
      npcSystem.update(deltaTime);
      sceneChanged = true;
    }

    if (updateCounter % 5 === 0) {
      updateMiniMap();
      updateChunk();
      checkAllEntitiesBoundaries();
      sceneChanged = true;
    }
    updateCounter++;

    const playerLight = GameState.scene.getObjectByProperty(
      "type",
      "PointLight"
    );
    if (playerLight && GameState.player) {
      playerLight.position
        .copy(GameState.player.position)
        .add(new THREE.Vector3(0, 10, 0));
      sceneChanged = true;
    }

    const directionalLight = GameState.scene.getObjectByProperty(
      "type",
      "DirectionalLight"
    );
    if (directionalLight && GameState.player) {
      directionalLight.position.set(
        GameState.player.position.x + 50,
        GameState.player.position.y + 100,
        GameState.player.position.z + 50
      );
      directionalLight.target.position.copy(GameState.player.position);
      directionalLight.target.updateMatrixWorld();
      sceneChanged = true;
    }

    if (sceneChanged) {
      GameState.renderer.render(GameState.scene, GameState.camera);
      sceneChanged = false;
    }
  });
}

//--------------------------------------------------------------//
//                       Event Listeners
//--------------------------------------------------------------//
function setupEventListeners() {
  window.addEventListener("resize", GameState.handleWindowResize);

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    const key = e.key.toLowerCase();
    if (e.ctrlKey || e.altKey) return;

    if (key === "h" && npcSystem) npcSystem.startHideAndSeekGame();
    if (key === "j" && npcSystem) npcSystem.restartHideSeekGame();
    if (key === "k" && npcSystem) npcSystem.removeAllNPCs();

    if (key === "b" && boundarySystem) {
      const existingDebug =
        GameState.scene.getObjectByName("worldBoundaryDebug");
      if (existingDebug) boundarySystem.removeDebugVisualization();
      else boundarySystem.createDebugVisualization();
    }

    if (key === "]" && researchBoundarySystem) {
      ResearchBoundaryIntegration.toggleResearchBoundaryDebug();
    }
  });
}

//--------------------------------------------------------------//
//                       Window Load
//--------------------------------------------------------------//
window.addEventListener("load", () => {
  init();

  const canvas = document.querySelector("canvas");
  if (!canvas) return;

  function requestFullscreen() {
    if (canvas.requestFullscreen) canvas.requestFullscreen();
    else if (canvas.mozRequestFullScreen) canvas.mozRequestFullScreen();
    else if (canvas.webkitRequestFullscreen) canvas.webkitRequestFullscreen();
    else if (canvas.msRequestFullscreen) canvas.msRequestFullscreen();
  }

  requestFullscreen();

  // Prevent zoom and double-click gestures
  document.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );
  document.addEventListener("dblclick", (e) => e.preventDefault(), {
    passive: false,
  });

  // Hide address bar on mobile
  window.scrollTo(0, 1);
  window.addEventListener("resize", () => {
    setTimeout(() => window.scrollTo(0, 1), 0);
  });
});

//--------------------------------------------------------------//
//                         Exports
//--------------------------------------------------------------//
const getNPCSystem = () => npcSystem;
const getHideSeekUI = () => hideSeekUI;

export {
  CLIENT_WORLD_CONFIG,
  TRAINING_WORLD_CONFIG,
  getNPCSystem,
  getHideSeekUI,
};
