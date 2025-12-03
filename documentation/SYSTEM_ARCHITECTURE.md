# System Architecture

## Overview

This document describes the complete architecture of the Multi-Agent PPO Training System, covering the frontend (JavaScript/Three.js), backend (Python/Ray RLlib), and communication layer (WebSocket).

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BROWSER (Frontend)                          │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Three.js Renderer                         │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │  │
│  │  │  3D Scene      │  │  Camera        │  │  WebGL        │  │  │
│  │  │  Rendering     │  │  Management    │  │  Rendering    │  │  │
│  │  └────────────────┘  └────────────────┘  └───────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                │                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Game Environment                           │  │
│  │                                                               │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │  │
│  │  │  Terrain       │  │  NPC System    │  │  Physics      │  │  │
│  │  │  Generator     │  │  Management    │  │  Engine       │  │  │
│  │  └────────────────┘  └────────────────┘  └───────────────┘  │  │
│  │                                                               │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │  │
│  │  │  Vision        │  │  Hide-Seek     │  │  Observation  │  │  │
│  │  │  System        │  │  Manager       │  │  Encoder      │  │  │
│  │  └────────────────┘  └────────────────┘  └───────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                │                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  Training Bridge (WebSocket)                  │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │  │
│  │  │  State         │  │  Reward        │  │  WebSocket    │  │  │
│  │  │  Management    │  │  Calculation   │  │  Client       │  │  │
│  │  └────────────────┘  └────────────────┘  └───────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                │
                    WebSocket (ws://localhost:8765)
                                │
┌─────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Python)                              │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  WebSocket Server                            │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │  │
│  │  │  Message       │  │  Episode       │  │  Action       │  │  │
│  │  │  Handler       │  │  Coordinator   │  │  Dispatcher   │  │  │
│  │  └────────────────┘  └────────────────┘  └───────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                │                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  Custom Gym Environment                      │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │  │
│  │  │  MultiAgent    │  │  Observation   │  │  Reward       │  │  │
│  │  │  Env Wrapper   │  │  Space         │  │  Aggregation  │  │  │
│  │  └────────────────┘  └────────────────┘  └───────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                │                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Ray RLlib PPO Trainer                     │  │
│  │                                                               │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │  │
│  │  │  Seeker        │  │  Hider         │  │  Shared       │  │  │
│  │  │  Policy        │  │  Policy        │  │  Value Fn     │  │  │
│  │  │  (256-256)     │  │  (256-256)     │  │               │  │  │
│  │  └────────────────┘  └────────────────┘  └───────────────┘  │  │
│  │                                                               │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │              PyTorch Neural Networks                    │  │  │
│  │  │  - 161-dim input → 256 → 256 → 7-dim output           │  │  │
│  │  │  - GPU-accelerated training                           │  │  │
│  │  │  - Separate optimizers per policy                     │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                │                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │               Metrics & Checkpointing                        │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │  │
│  │  │  Metrics       │  │  Checkpoint    │  │  Plot         │  │  │
│  │  │  Tracker       │  │  Manager       │  │  Generator    │  │  │
│  │  └────────────────┘  └────────────────┘  └───────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Frontend Architecture (JavaScript/Three.js)

### Core Components

#### 1. Rendering Layer (`Three.js`)

**Location**: `frontend/public/src/`

```javascript
// Main renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);

// Manages:
- 3D scene rendering at 60 FPS
- Camera management (player view or free cam)
- Mesh creation and updates
- Lighting and fog effects
```

**Key Files**:
- `main.js` - Entry point, renderer setup
- `camera.js` - Camera controls and movement
- `scene-setup.js` - Scene initialization

#### 2. World Generation

**Location**: `frontend/public/modes/research/src/world/`

**Components**:

**Terrain Generator** (`terrain-generator.js`):
```javascript
export async function regenerateTerrain(chunkManager) {
  // Generates voxel terrain using SimplexNoise
  // - 32×32 world = 4 chunks (2×2 grid, 16×16 per chunk)
  // - Procedural generation with consistent seed
  // - Async chunk generation in Web Worker

  const seed = TRAINING_WORLD_CONFIG.SEED; // Deterministic
  chunkManager.chunkWorker.postMessage({
    type: "regenerate",
    seed: seed,
  });

  await waitForChunks(chunkManager); // Wait for 40% of chunks
}
```

**Terrain Utils** (`terrain-utils.js`):
```javascript
export function calculateTerrainHeight(x, z, seed) {
  // Calculates terrain height using SimplexNoise
  // - Multi-octave noise (3 octaves)
  // - MUST match chunk worker calculations

  const noise = new window.SimplexNoise(seed);
  let noiseValue = 0;
  let amplitude = 0.7;
  let frequency = 0.8;

  for (let i = 0; i < 3; i++) {
    noiseValue += noise.noise2D(x * scale * frequency, z * scale * frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return Math.floor(BASE_GROUND_LEVEL + normalizedNoise * TERRAIN_HEIGHT_RANGE);
}

export function findSafeSpawnHeight(x, z, seed) {
  // Spawns NPCs 3 blocks above calculated terrain
  const terrainHeight = calculateTerrainHeight(x, z, seed);
  return terrainHeight + 3; // Safety margin!
}
```

**Chunk Worker** (`chunk-worker.js`):
- Background thread for terrain generation
- Generates 16×16×256 voxel chunks
- Sends mesh data back to main thread
- Prevents UI blocking during generation

#### 3. NPC System

**Location**: `frontend/public/modes/research/src/npc/`

**Components**:

**NPC System** (`npc-system.js`):
```javascript
class NPCSystem {
  constructor(scene, chunkManager) {
    this.npcs = [];
    this.seekers = [];
    this.hiders = [];
  }

  generateNPCs() {
    // Spawns 1 seeker + 2 hiders
    this.removeAllNPCs(); // Clear old NPCs

    // Spawn seekers
    for (let i = 0; i < SEEKER_COUNT; i++) {
      const npc = this.createNPC('seeker', i);
      this.seekers.push(npc);
    }

    // Spawn hiders
    for (let i = 0; i < HIDER_COUNT; i++) {
      const npc = this.createNPC('hider', i);
      this.hiders.push(npc);
    }
  }

  removeAllNPCs() {
    // 🔴 CRITICAL: Dispose THREE.js resources to prevent GPU memory leaks
    for (const npc of this.npcs) {
      if (npc.geometry) npc.geometry.dispose();
      if (npc.material) {
        // Dispose all textures
        if (npc.material.map) npc.material.map.dispose();
        npc.material.dispose();
      }
      this.scene.remove(npc);
    }
    this.npcs = [];
  }
}
```

**Hide-Seek Manager** (`hide-seek-manager.js`):
```javascript
class HideSeekManager {
  initializeGame(npcs) {
    this.gameRunning = true;
    this.gamePhase = 'countdown'; // or 'seeking'
    this.startTime = Date.now();
    this.setupVisualIndicators(); // Vision cones
  }

  updateGame(deltaTime) {
    // State machine:
    if (this.gamePhase === 'countdown') {
      // Seekers frozen, hiders hide (3 seconds)
      if (elapsed > COUNTDOWN_TIME) {
        this.gamePhase = 'seeking';
      }
    } else if (this.gamePhase === 'seeking') {
      // Check catching logic (17 seconds)
      this.checkCatching();

      if (elapsed > GAME_TIME_LIMIT) {
        this.endGame('time_up');
      }
    }
  }

  checkCatching() {
    // Seeker catches hider if:
    // 1. Hider is visible (raycasting)
    // 2. Within 2 blocks distance
    // 3. Maintained for 0.5 seconds
  }
}
```

#### 4. Physics System

**Location**: `frontend/public/modes/research/src/npc/physics/`

**NPC Physics** (`npc-physics.js`):
```javascript
export function updateNPCPhysics(npc, scene, deltaTime) {
  // Anti-stuck mechanism
  checkAndFixStuckNPC(npc, scene);

  // Apply gravity
  npc.velocity.y -= GRAVITY * deltaTime;
  npc.velocity.y = Math.max(npc.velocity.y, TERMINAL_VELOCITY);

  // Update position
  npc.position.y += npc.velocity.y * deltaTime;

  // Ground collision
  const collision = checkNPCCollision(npc.position, scene);
  if (collision.collides) {
    npc.position.y = collision.correctedY;
    npc.velocity.y = 0;
    npc.isOnGround = true;
  }
}

export function checkAndFixStuckNPC(npc, scene) {
  // Detects if NPC is inside a block
  // Tries to move up 1-5 blocks
  // Falls back to horizontal movement
  // Logs warnings for debugging
}

export function moveNPC(npc, forward, strafe, scene) {
  // Calculates movement vector
  // Checks collision before moving
  // Handles sliding along walls
}
```

**Vision System** (`npc-vision-system.js`):
```javascript
export function updateNPCVision(observer, otherNPCs, scene) {
  // 64-ray raycasting in vision cone
  const visionData = {
    rays: [],           // 64 rays with distance + type
    visibleNPCs: [],    // NPCs in vision cone
    closestHider: null,
    closestSeeker: null
  };

  // Cast 64 rays in cone (108° field of view, 32 block range)
  for (let i = 0; i < 64; i++) {
    const angle = startAngle + (i / 63) * coneAngle;
    const ray = new THREE.Raycaster(observer.position, direction);

    const intersects = ray.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
      const hit = intersects[0];
      if (hit.distance < VISION_RANGE) {
        visionData.rays.push({
          distance: hit.distance / VISION_RANGE, // Normalize
          type: identifyRayHit(hit.object)       // terrain, hider, seeker
        });
      }
    }
  }

  return visionData;
}
```

#### 5. ML Training Bridge

**Location**: `frontend/public/modes/research/src/ml/`

**PPO Training Bridge** (`ppo-training-bridge.js`):
```javascript
class PPOTrainingBridge {
  constructor() {
    this.websocket = null;
    this.currentEpisode = 0;
    this.currentStep = 0;
    this.terrainNeedsRegeneration = false; // Curriculum learning flag
  }

  async connect() {
    this.websocket = new WebSocket('ws://localhost:8765');

    this.websocket.onmessage = async (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'reset') {
        await this.resetEpisode(message.episode);
      } else if (message.type === 'step') {
        await this.executeStep(message.actions);
      }
    };
  }

  async resetEpisode(episodeNum) {
    // 1. End current game
    this.hideSeekManager.endGame('episode_reset');

    // 2. Regenerate terrain (only first episode or when needed)
    if (episodeNum === 0 || episodeNum === 1 || this.terrainNeedsRegeneration) {
      await regenerateTerrain(this.chunkManager);
      this.terrainNeedsRegeneration = false;
    }

    // 3. Respawn NPCs
    this.npcSystem.removeAllNPCs();
    this.npcSystem.generateNPCs();

    // 4. Start game
    this.hideSeekManager.initializeGame(this.npcSystem.npcs);

    // 5. Send initial observations
    const observations = this.getObservations();
    this.sendMessage({ type: 'observation', data: observations });
  }

  async executeStep(actions) {
    // Apply actions to NPCs
    this.applyActions(actions);

    // Run physics for 5 frames (83.33ms @ 60 FPS)
    for (let i = 0; i < 5; i++) {
      this.updatePhysics(16.67); // milliseconds
    }

    // Update game state
    this.hideSeekManager.updateGame();

    // Calculate rewards
    const rewards = this.rewardSystem.calculateRewards();

    // Encode observations
    const observations = this.getObservations();

    // Check termination
    const done = this.checkTermination();

    // Send to Python
    this.sendMessage({
      type: 'step_result',
      observations: observations,
      rewards: rewards,
      done: done
    });
  }
}
```

**Observation Encoder** (`observation-encoder.js`):
```javascript
export function encodeObservation(npc, allNPCs, visionData, gameState) {
  const observation = [];

  // 1. Agent state (7 dims)
  observation.push(
    npc.position.x / WORLD_SIZE,
    npc.position.y / MAX_HEIGHT,
    npc.position.z / WORLD_SIZE,
    npc.rotation.y / (2 * Math.PI),
    npc.velocity.length() / MAX_SPEED,
    npc.isOnGround ? 1.0 : 0.0,
    npc.userData.role === 'seeker' ? 1.0 : 0.0
  );

  // 2. Vision rays (128 dims = 64 rays × 2)
  for (const ray of visionData.rays) {
    observation.push(
      ray.distance,  // 0-1 normalized
      ray.type       // 0=nothing, 1=terrain, 2=hider, 3=seeker
    );
  }

  // 3. Other agents (18 dims = 3 agents × 6)
  for (const other of allNPCs) {
    if (other === npc) continue; // Skip self

    const relativePos = other.position.clone().sub(npc.position);
    const distance = relativePos.length();
    const isVisible = visionData.visibleNPCs.includes(other);

    observation.push(
      relativePos.x / WORLD_SIZE,
      relativePos.y / MAX_HEIGHT,
      relativePos.z / WORLD_SIZE,
      distance / VISION_RANGE,
      isVisible ? 1.0 : 0.0,
      other.userData.role === 'seeker' ? 1.0 : 0.0
    );
  }

  // 4. Game state (8 dims)
  observation.push(
    gameState.phase === 'seeking' ? 1.0 : 0.0,
    gameState.remainingTime / GAME_TIME_LIMIT,
    gameState.hidersRemaining,
    gameState.hidersCaught,
    gameState.totalHiders,
    npc.userData.caught ? 1.0 : 0.0,
    gameState.timeSinceStart / GAME_TIME_LIMIT,
    gameState.episodeProgress
  );

  return observation; // 161 dimensions
}
```

**Reward System** (`reward-system.js`):
```javascript
class RewardSystem {
  constructor() {
    this.REWARD_CONFIG = {
      // Per-step rewards
      TIME_PENALTY: -0.001,
      SEEKER_SEES_HIDER: 0.01,      // Vision bootstrap
      HIDER_HIDDEN: 0.2,             // Hidden bonus
      HIDER_BEING_SEEN: -0.2,        // Seen penalty

      // Terminal rewards
      SEEKER_CAUGHT_HIDER: 50.0,     // Catching is PRIMARY goal!
      SEEKER_CAUGHT_ALL: 100.0,      // Big bonus
      SEEKER_CAUGHT_NONE: -10.0,     // Failure penalty
      HIDER_SURVIVED: 50.0,          // Survival is PRIMARY goal!
      HIDER_CAUGHT: -50.0            // Strong penalty
    };
  }

  calculateRewards(npcs, visionData, gameState) {
    const rewards = {};

    for (const npc of npcs) {
      let reward = 0;

      // Time penalty (all agents)
      reward += this.REWARD_CONFIG.TIME_PENALTY;

      if (npc.userData.role === 'seeker') {
        // Vision reward
        const hidersInVision = visionData[npc.userData.id].visibleNPCs
          .filter(other => other.userData.role === 'hider');
        reward += hidersInVision.length * this.REWARD_CONFIG.SEEKER_SEES_HIDER;

        // Proximity reward (encourage getting closer)
        if (visionData[npc.userData.id].closestHider) {
          const dist = visionData[npc.userData.id].closestHider.dist;
          reward += 0.005 * Math.max(0, (VISION_RANGE - dist) / VISION_RANGE);
        }

        // Terminal rewards
        if (gameState.done) {
          if (gameState.hidersCaught === gameState.totalHiders) {
            reward += this.REWARD_CONFIG.SEEKER_CAUGHT_ALL;
          } else if (gameState.hidersCaught === 0) {
            reward += this.REWARD_CONFIG.SEEKER_CAUGHT_NONE;
          } else {
            reward += gameState.hidersCaught * this.REWARD_CONFIG.SEEKER_CAUGHT_HIDER;
          }
        }
      } else { // hider
        // Hidden/seen rewards
        const isVisible = visionData.seekerVision.visibleNPCs.includes(npc);
        if (isVisible) {
          reward += this.REWARD_CONFIG.HIDER_BEING_SEEN;
        } else {
          reward += this.REWARD_CONFIG.HIDER_HIDDEN;
        }

        // Distance reward (encourage staying far from seekers)
        if (visionData[npc.userData.id].closestSeeker) {
          const dist = visionData[npc.userData.id].closestSeeker.dist;
          reward += 0.01 * Math.max(0, (dist - 2) / 30);
        }

        // Terminal rewards
        if (gameState.done) {
          if (npc.userData.caught) {
            reward += this.REWARD_CONFIG.HIDER_CAUGHT;
          } else {
            reward += this.REWARD_CONFIG.HIDER_SURVIVED;
          }
        }
      }

      rewards[npc.userData.id] = reward;
    }

    return rewards;
  }
}
```

## Backend Architecture (Python/Ray RLlib)

### Core Components

#### 1. WebSocket Server

**Location**: `backend/python-rl/websocket_server.py`

```python
class WebSocketServer:
    def __init__(self, config):
        self.websocket = None
        self.observation_event = asyncio.Event()
        self.current_observations = None
        self.current_rewards = None
        self.current_done = False

    async def start_server(self, host='0.0.0.0', port=8765):
        async with websockets.serve(self.handle_connection, host, port):
            print(f"✅ WebSocket server running on ws://{host}:{port}")
            await asyncio.Future()  # Run forever

    async def handle_connection(self, websocket):
        self.websocket = websocket
        async for message in websocket:
            data = json.loads(message)

            if data['type'] == 'observation':
                self.current_observations = data['data']
                self.observation_event.set()

            elif data['type'] == 'step_result':
                self.current_observations = data['observations']
                self.current_rewards = data['rewards']
                self.current_done = data['done']
                self.observation_event.set()

    async def send_reset(self, episode_num):
        # Send reset command to JavaScript
        await self.websocket.send(json.dumps({
            'type': 'reset',
            'episode': episode_num
        }))

        # Wait for observations (with 10s timeout)
        self.observation_event.clear()
        await asyncio.wait_for(
            self.observation_event.wait(),
            timeout=10.0
        )

        return self.current_observations

    async def send_step(self, actions):
        # Send actions to JavaScript
        await self.websocket.send(json.dumps({
            'type': 'step',
            'actions': actions
        }))

        # Wait for step result
        self.observation_event.clear()
        await asyncio.wait_for(
            self.observation_event.wait(),
            timeout=10.0
        )

        return self.current_observations, self.current_rewards, self.current_done
```

#### 2. Custom Gym Environment

**Location**: `backend/python-rl/environment.py`

```python
import gymnasium as gym
from ray.rllib.env.multi_agent_env import MultiAgentEnv

class MinecraftHideSeekEnv(MultiAgentEnv):
    def __init__(self, config):
        super().__init__()
        self.websocket_server = config['websocket_server']
        self.episode_num = 0
        self.step_count = 0
        self.max_steps = config['max_steps']  # 240

        # Define spaces
        self.observation_space = gym.spaces.Box(
            low=-1.0,
            high=1.0,
            shape=(161,),  # 161-dimensional observation
            dtype=np.float32
        )

        self.action_space = gym.spaces.Box(
            low=np.array([-1.0, -1.0, -1.0, -1.0, 0.0, 0.0, 0.0]),
            high=np.array([1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0]),
            dtype=np.float32
        )

        # Agent IDs
        self._agent_ids = {'seeker-0', 'hider-0', 'hider-1'}

    def reset(self, *, seed=None, options=None):
        # Send reset to JavaScript via WebSocket
        loop = asyncio.get_event_loop()
        observations = loop.run_until_complete(
            self.websocket_server.send_reset(self.episode_num)
        )

        self.episode_num += 1
        self.step_count = 0

        # Convert to multi-agent format
        obs_dict = {}
        for agent_id, obs in observations.items():
            obs_dict[agent_id] = np.array(obs, dtype=np.float32)

        return obs_dict, {}

    def step(self, action_dict):
        # Send actions to JavaScript
        loop = asyncio.get_event_loop()
        observations, rewards, done = loop.run_until_complete(
            self.websocket_server.send_step(action_dict)
        )

        self.step_count += 1

        # Convert to RLlib multi-agent format
        obs_dict = {agent_id: np.array(obs, dtype=np.float32)
                    for agent_id, obs in observations.items()}
        reward_dict = {agent_id: float(reward)
                       for agent_id, reward in rewards.items()}

        # Termination conditions
        done_dict = {}
        truncated_dict = {}

        if done or self.step_count >= self.max_steps:
            # Episode over for all agents
            done_dict = {agent_id: True for agent_id in self._agent_ids}
            done_dict['__all__'] = True
        else:
            done_dict = {agent_id: False for agent_id in self._agent_ids}
            done_dict['__all__'] = False

        truncated_dict = {agent_id: False for agent_id in self._agent_ids}
        truncated_dict['__all__'] = False

        return obs_dict, reward_dict, done_dict, truncated_dict, {}
```

#### 3. PPO Trainer

**Location**: `backend/python-rl/ppo_trainer.py`

```python
import ray
from ray.rllib.algorithms.ppo import PPOConfig
from ray.rllib.policy.policy import PolicySpec

def create_ppo_trainer(config, websocket_server):
    # Initialize Ray
    ray.init(
        num_gpus=1,
        object_store_memory=9*1024*1024*1024,  # 9GB (fits Docker /dev/shm)
        _system_config={
            "automatic_object_spilling_enabled": True,
            "object_spilling_config": json.dumps({
                "type": "filesystem",
                "params": {"directory_path": "/tmp/ray_spill"}
            })
        }
    )

    # Create PPO config
    ppo_config = (
        PPOConfig()
        .environment(
            env=MinecraftHideSeekEnv,
            env_config={
                'websocket_server': websocket_server,
                'max_steps': config['environment']['max_steps']
            }
        )
        .framework("torch")
        .training(
            gamma=config['ppo']['gamma'],
            lambda_=config['ppo']['lambda'],
            clip_param=config['ppo']['clip_param'],
            vf_loss_coeff=config['ppo']['vf_loss_coeff'],
            train_batch_size=config['ppo']['train_batch_size'],
            sgd_minibatch_size=config['ppo']['minibatch_size'],
            num_sgd_iter=config['ppo']['num_epochs'],
            grad_clip=config['ppo']['grad_clip'],
            model={
                "fcnet_hiddens": config['ppo']['model']['fcnet_hiddens'],
                "fcnet_activation": config['ppo']['model']['fcnet_activation']
            }
        )
        .multi_agent(
            policies={
                "seeker_policy": PolicySpec(
                    observation_space=None,
                    action_space=None,
                    config={
                        "lr": config['ppo']['lr_seeker'],
                        "entropy_coeff": config['ppo']['entropy_coeff_seeker']
                    }
                ),
                "hider_policy": PolicySpec(
                    observation_space=None,
                    action_space=None,
                    config={
                        "lr": config['ppo']['lr_hider'],
                        "entropy_coeff": config['ppo']['entropy_coeff_hider']
                    }
                )
            },
            policy_mapping_fn=lambda agent_id, episode, worker, **kwargs:
                "seeker_policy" if agent_id.startswith("seeker") else "hider_policy"
        )
        .resources(
            num_gpus=config['ppo']['num_gpus']
        )
        .rollouts(
            num_rollout_workers=config['ppo']['num_workers'],
            num_envs_per_worker=config['ppo']['num_envs_per_worker']
        )
    )

    # Build trainer
    trainer = ppo_config.build()

    return trainer
```

#### 4. Training Loop

**Location**: `backend/python-rl/main.py`

```python
import gc  # Garbage collection

def main():
    # Load config
    config = load_config('config.yaml')

    # Start WebSocket server
    websocket_server = WebSocketServer(config)
    asyncio.create_task(websocket_server.start_server())

    # Wait for frontend connection
    await wait_for_connection(websocket_server)

    # Create PPO trainer
    trainer = create_ppo_trainer(config, websocket_server)

    # Initialize tracking
    metrics_tracker = MetricsTracker()
    checkpoint_manager = CheckpointManager(config['ppo']['checkpoint_dir'])

    # Training loop
    for iteration in range(1, config['training']['total_episodes'] // 240):
        print(f"\n🎯 Iteration {iteration}")

        # Train for one iteration (~240 episodes)
        start_time = time.time()
        result = trainer.train()
        elapsed = time.time() - start_time

        # Log metrics
        metrics_tracker.log(iteration, result)

        print(f"⏱️  Time: {elapsed:.1f}s")
        print(f"📊 Seeker Reward: {result['policy_reward_mean']['seeker_policy']:.2f}")
        print(f"📊 Hider Reward: {result['policy_reward_mean']['hider_policy']:.2f}")
        print(f"📊 Seeker Entropy: {result['entropy']['seeker_policy']:.2f}")
        print(f"📊 Hider Entropy: {result['entropy']['hider_policy']:.2f}")

        # Checkpoint every 10 iterations
        if iteration % config['ppo']['checkpoint_freq'] == 0:
            checkpoint_path = checkpoint_manager.save_checkpoint(trainer, iteration)
            print(f"💾 Checkpoint saved: {checkpoint_path}")

            # Generate plots
            metrics_tracker.generate_plots(iteration)

            # 🔴 CRITICAL: Force garbage collection to prevent memory leaks
            gc.collect()

    print("✅ Training complete!")
    trainer.stop()
    ray.shutdown()
```

#### 5. Metrics Tracking

**Location**: `backend/python-rl/metrics_tracker.py`

```python
import matplotlib.pyplot as plt

class MetricsTracker:
    def __init__(self):
        self.metrics_history = []

    def log(self, iteration, result):
        self.metrics_history.append({
            'iteration': iteration,
            'seeker_reward': result['policy_reward_mean']['seeker_policy'],
            'hider_reward': result['policy_reward_mean']['hider_policy'],
            'seeker_entropy': result['entropy']['seeker_policy'],
            'hider_entropy': result['entropy']['hider_policy'],
            'seeker_loss': result['policy_loss']['seeker_policy'],
            'hider_loss': result['policy_loss']['hider_policy']
        })

    def generate_plots(self, iteration):
        # Plot only last 200 iterations to avoid slowdown
        max_points_to_plot = 200
        if len(self.metrics_history) > max_points_to_plot:
            plot_data = self.metrics_history[-max_points_to_plot:]
        else:
            plot_data = self.metrics_history

        # Create subplots
        fig, axes = plt.subplots(2, 2, figsize=(15, 10))

        # Plot rewards
        axes[0, 0].plot([m['iteration'] for m in plot_data],
                        [m['seeker_reward'] for m in plot_data],
                        label='Seeker')
        axes[0, 0].plot([m['iteration'] for m in plot_data],
                        [m['hider_reward'] for m in plot_data],
                        label='Hider')
        axes[0, 0].set_title('Rewards Over Time')
        axes[0, 0].legend()

        # Plot entropy
        axes[0, 1].plot([m['iteration'] for m in plot_data],
                        [m['seeker_entropy'] for m in plot_data],
                        label='Seeker')
        axes[0, 1].plot([m['iteration'] for m in plot_data],
                        [m['hider_entropy'] for m in plot_data],
                        label='Hider')
        axes[0, 1].set_title('Entropy Over Time')
        axes[0, 1].legend()

        # Plot losses
        axes[1, 0].plot([m['iteration'] for m in plot_data],
                        [m['seeker_loss'] for m in plot_data],
                        label='Seeker')
        axes[1, 0].plot([m['iteration'] for m in plot_data],
                        [m['hider_loss'] for m in plot_data],
                        label='Hider')
        axes[1, 0].set_title('Policy Loss Over Time')
        axes[1, 0].legend()

        plt.tight_layout()
        plt.savefig(f'checkpoints/metrics/iteration_{iteration}.png')

        # 🔴 CRITICAL: Cleanup to prevent matplotlib memory leaks
        plt.close('all')
        fig.clear()
        del fig, axes
```

## Communication Protocol

### WebSocket Message Format

#### Reset Message (Python → JavaScript)
```json
{
  "type": "reset",
  "episode": 42
}
```

#### Observation Response (JavaScript → Python)
```json
{
  "type": "observation",
  "data": {
    "seeker-0": [/* 161-dim array */],
    "hider-0": [/* 161-dim array */],
    "hider-1": [/* 161-dim array */]
  }
}
```

#### Step Message (Python → JavaScript)
```json
{
  "type": "step",
  "actions": {
    "seeker-0": [0.5, -0.3, 0.8, 0.1, 0.0, 0.0, 0.0],
    "hider-0": [-0.2, 0.7, -0.4, 0.0, 1.0, 0.0, 0.0],
    "hider-1": [0.3, 0.1, 0.5, -0.2, 0.0, 0.0, 0.0]
  }
}
```

#### Step Result (JavaScript → Python)
```json
{
  "type": "step_result",
  "observations": {/* agent observations */},
  "rewards": {
    "seeker-0": 0.05,
    "hider-0": 0.18,
    "hider-1": 0.21
  },
  "done": false
}
```

## Data Flow

### Episode Reset Flow
```
Python Trainer
    │
    ├─► trainer.reset()
    │
    ├─► WebSocket: {"type": "reset", "episode": N}
    │
    └─► Wait for observations...

JavaScript Environment
    │
    ├─► Receive reset message
    │
    ├─► regenerateTerrain() [only if needed]
    │   └─► ~500ms for 40% of chunks
    │
    ├─► npcSystem.removeAllNPCs()
    │   └─► Dispose THREE.js resources
    │
    ├─► npcSystem.generateNPCs()
    │   └─► Spawn 1 seeker + 2 hiders
    │
    ├─► hideSeekManager.initializeGame()
    │
    ├─► observationEncoder.encodeObservations()
    │   └─► 3 agents × 161 dims
    │
    └─► WebSocket: {"type": "observation", "data": {...}}

Python Trainer
    │
    └─► Receive observations → Continue training
```

### Training Step Flow
```
Python Trainer
    │
    ├─► Get actions from policies
    │   ├─► seeker_policy.compute_actions(obs['seeker-0'])
    │   ├─► hider_policy.compute_actions(obs['hider-0'])
    │   └─► hider_policy.compute_actions(obs['hider-1'])
    │
    ├─► WebSocket: {"type": "step", "actions": {...}}
    │
    └─► Wait for step result...

JavaScript Environment
    │
    ├─► Receive actions
    │
    ├─► Apply actions to NPCs
    │   ├─► npc.moveForward(action[0])
    │   ├─► npc.moveStrafe(action[1])
    │   ├─► npc.rotate(action[2])
    │   └─► if (action[4] > 0.5) npc.jump()
    │
    ├─► Run physics simulation (5 frames @ 60 FPS)
    │   └─► 83.33ms simulation time
    │
    ├─► updateNPCVision() for all NPCs
    │   └─► 64-ray raycasting per NPC
    │
    ├─► hideSeekManager.updateGame()
    │   └─► Check catching logic
    │
    ├─► rewardSystem.calculateRewards()
    │   ├─► Per-step rewards
    │   └─► Terminal rewards if done
    │
    ├─► observationEncoder.encodeObservations()
    │
    └─► WebSocket: {"type": "step_result", "observations": {...}, "rewards": {...}, "done": false}

Python Trainer
    │
    ├─► Store transition in replay buffer
    │   └─► (state, action, reward, next_state, done)
    │
    └─► Continue episode (or train if batch full)
```

## Performance Optimization

### Frontend Optimizations

1. **Terrain Regeneration**
   - Only regenerate on first episode or when needed
   - Saves 384,000 chunk generations over 100 iterations
   - **File**: `ppo-training-bridge.js:195`

2. **GPU Memory Management**
   - Dispose THREE.js geometries/materials/textures
   - Prevents memory leaks in NPC system
   - **Files**: `npc-system.js:68`, `hide-seek-manager.js:142`, `npc-vision-system.js:252`

3. **Anti-Stuck Mechanism**
   - Real-time detection and correction of stuck NPCs
   - Prevents training episodes from failing
   - **File**: `npc-physics.js:486`

### Backend Optimizations

1. **Ray Object Store**
   - Reduced from 20GB to 9GB to fit Docker /dev/shm
   - Enabled automatic disk spilling
   - **File**: `ppo_trainer.py:64`

2. **Garbage Collection**
   - Force gc.collect() after checkpointing
   - Prevents Python memory leaks
   - **File**: `main.py:78`

3. **Matplotlib Cleanup**
   - Explicit cleanup: plt.close('all'), fig.clear()
   - Only plot last 200 iterations
   - **File**: `metrics_tracker.py:45`

## Configuration Files

### Frontend Config
**File**: `frontend/public/modes/research/src/config-training-world.js`

```javascript
export const TRAINING_WORLD_CONFIG = {
  SEED: 3,
  SIZE: 32,                    // 32×32 world
  BASE_GROUND_LEVEL: 50,
  TERRAIN_HEIGHT_RANGE: 1,     // Flat terrain for learning
  TERRAIN: {
    AMPLITUDE: 0.7,
    FREQUENCY: 0.8,
    OCTAVES: 3,
    SCALE: 0.018
  }
};
```

### Backend Config
**File**: `backend/python-rl/config.yaml`

```yaml
environment:
  observation_size: 161
  max_steps: 240

ppo:
  lr_seeker: 0.0003
  lr_hider: 0.0003
  entropy_coeff_seeker: 0.001
  entropy_coeff_hider: 0.01
  train_batch_size: 57600      # 240 episodes
  model:
    fcnet_hiddens: [256, 256]
```

---

**Version**: 1.0
**Last Updated**: November 2024
