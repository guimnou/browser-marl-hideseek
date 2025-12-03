# Minecraft Hide-and-Seek Multi-Agent PPO Training System

## Project Overview

This project implements a **multi-agent reinforcement learning system** using **Proximal Policy Optimization (PPO)** to train AI agents to play hide-and-seek in a Minecraft-style 3D voxel environment. The project combines browser-based 3D rendering (Three.js) with Python-based reinforcement learning (Ray RLlib) to create a competitive multi-agent training environment.

## What is This?

This is an educational and research project that explores:
- **Multi-agent reinforcement learning** in competitive environments
- **Emergent behavior** from competitive gameplay
- **Real-time 3D environment** integration with RL training
- **Reward shaping** and **curriculum learning** principles

### Core Concept

Two types of agents compete in a hide-and-seek game:
- **Seekers**: Try to find and catch hiders within a time limit
- **Hiders**: Try to avoid being seen and caught by seekers

Both agents learn simultaneously through **self-play**, creating a dynamic environment where each agent's improvement makes the task harder for the other agent.

## Key Features

### 1. Multi-Agent PPO Training
- **Separate policies** for seekers and hiders
- **Independent learning rates** and entropy coefficients
- **Per-agent reward signals** tuned for different goals
- **Self-play** driven learning with non-stationary environments

### 2. 3D Voxel Environment
- **32×32 block world** with procedural terrain generation
- **SimplexNoise-based** terrain for reproducibility
- **Browser-based rendering** using Three.js/WebGL
- **Real-time physics** with gravity, collision, and movement

### 3. Vision System
- **64-ray raycasting** vision cone per agent
- **32-block vision range** with 108° field of view
- **Occlusion detection** (blocks block line of sight)
- **Real-time visibility** checks for catching mechanics

### 4. Optimized Training Pipeline
- **240 timesteps** per episode (20 seconds)
- **~240 episodes** per iteration (batched training)
- **GPU-accelerated** neural network training
- **Automatic checkpointing** every 10 iterations

## System Components

### Frontend (JavaScript/Three.js)
```
frontend/public/modes/research/
├── src/
│   ├── ml/
│   │   ├── ppo-training-bridge.js    # WebSocket bridge to Python
│   │   ├── reward-system.js          # Reward calculation
│   │   └── observation-encoder.js    # State encoding (161-dim vector)
│   ├── npc/
│   │   ├── npc-system.js             # NPC lifecycle management
│   │   ├── hide-seek-manager.js      # Game state machine
│   │   └── physics/
│   │       ├── npc-physics.js        # Physics & anti-stuck
│   │       └── npc-vision-system.js  # Raycasting vision
│   ├── world/
│   │   ├── terrain-generator.js      # Procedural terrain
│   │   └── terrain-utils.js          # Height calculations
│   └── config-training-world.js      # World parameters
```

### Backend (Python/Ray RLlib)
```
backend/python-rl/
├── main.py                # Entry point
├── ppo_trainer.py         # Ray RLlib PPO setup
├── environment.py         # Custom Gym environment
├── websocket_server.py    # WebSocket communication
├── metrics_tracker.py     # Training metrics & plots
├── checkpoint_manager.py  # Model checkpointing
└── config.yaml            # Hyperparameters
```

## How It Works

### Training Loop

```
┌─────────────────────────────────────────────────────────────┐
│                     TRAINING ITERATION                      │
└─────────────────────────────────────────────────────────────┘
         │
         ├─► Python PPO Trainer
         │   └─► For each of ~240 episodes:
         │
         ├─► 1. Episode Reset (via WebSocket)
         │      ├─► Regenerate terrain (first episode only)
         │      ├─► Spawn NPCs (1 seeker, 2 hiders)
         │      └─► Initialize game state
         │
         ├─► 2. Episode Rollout (240 steps)
         │      ├─► For each step:
         │      │   ├─► Encode observations (161-dim)
         │      │   ├─► Send to Python → Get actions
         │      │   ├─► Execute actions in environment
         │      │   ├─► Calculate rewards
         │      │   ├─► Check termination (time limit, all caught)
         │      │   └─► Send (state, action, reward) to Python
         │      │
         │      └─► Episode ends → Terminal rewards
         │
         ├─► 3. Batch Training
         │      ├─► Collect 57,600 timesteps (240 episodes × 240 steps)
         │      ├─► Train seeker policy (learning rate: 0.0003)
         │      ├─► Train hider policy (learning rate: 0.0003)
         │      └─► Update value functions
         │
         ├─► 4. Checkpointing & Metrics
         │      ├─► Save model every 10 iterations
         │      ├─► Log metrics (rewards, entropy, loss)
         │      └─► Generate training plots
         │
         └─► Repeat for 50,000 episodes
```

### Episode Timeline

```
Episode Duration: 240 timesteps × 83.33ms = 20 seconds

┌──────────────────────────────────────────────────────────────┐
│                      EPISODE TIMELINE                         │
└──────────────────────────────────────────────────────────────┘

0ms ────────────────────────────────────────────────────► 20,000ms
│                       │                                  │
│  COUNTDOWN (3s)       │      SEEKING (17s)              │
│  36 timesteps         │      204 timesteps              │
│                       │                                  │
│  Hiders:              │  Seekers:                        │
│  - Find hiding spots  │  - Search for hiders             │
│  - Move around        │  - Chase visible hiders          │
│  - Avoid seekers      │  - Catch hiders (0.5s contact)   │
│                       │                                  │
│  Seekers:             │  Hiders:                         │
│  - Wait               │  - Stay hidden                   │
│  - Cannot move        │  - Flee if spotted               │
│                       │  - Maximize distance             │
└───────────────────────┴──────────────────────────────────┘
```

## Training Performance

### Episode Metrics
- **Episode Duration**: 20 seconds (240 timesteps)
- **Episodes per Iteration**: ~240 episodes
- **Iteration Time**: ~3-5 minutes (fast!)
- **Training Throughput**: ~3,000 timesteps/second
- **GPU Utilization**: ~40-60% (NVIDIA GPU)

### Learning Progress (Example)
```
Iteration  Seeker Reward  Hider Reward  Seeker Entropy  Hider Entropy
─────────────────────────────────────────────────────────────────────
1          +5.2          +12.3         15.4            13.2
10         +12.8         +8.7          12.1            11.5
20         +18.3         +5.2          10.3            10.8
40         +24.5         +2.1          9.4             10.6
70         +31.2         -3.5          8.7             10.2
```

**Trend**: Seekers learning to catch hiders, hiders learning to hide better, entropy decreasing (policies becoming more deterministic).

## Observation Space (161 dimensions)

Each agent receives a **161-dimensional observation vector**:

### Agent State (7 dimensions)
```javascript
[
  position.x,          // Agent X position
  position.y,          // Agent Y position (height)
  position.z,          // Agent Z position
  rotation,            // Agent rotation (radians)
  velocityMagnitude,   // Speed
  isOnGround,          // 1 if on ground, 0 if airborne
  role                 // 1 for seeker, 0 for hider
]
```

### Vision System (64 rays × 2 = 128 dimensions)
```javascript
// For each of 64 rays in vision cone:
[
  rayDistance,         // 0-1 normalized (0=far, 1=close)
  rayType              // 0=nothing, 1=terrain, 2=hider, 3=seeker
]
```

### Other Agents (3 agents × 6 dimensions = 18 dimensions)
```javascript
// For each other agent (up to 3):
[
  relativeX,           // Normalized X offset
  relativeY,           // Normalized Y offset
  relativeZ,           // Normalized Z offset
  distance,            // Normalized distance (0-1)
  isVisible,           // 1 if in vision cone, 0 otherwise
  role                 // 1 for seeker, 0 for hider
]
```

### Game State (8 dimensions)
```javascript
[
  gamePhase,           // 0=countdown, 1=seeking
  remainingTime,       // Normalized (0-1)
  hidersRemaining,     // Count
  hidersCaught,        // Count
  totalHiders,         // Count
  isCaught,            // 1 if this hider is caught
  timeSinceGameStart,  // Normalized
  episodeProgress      // Normalized (0-1)
]
```

**Total**: 7 + 128 + 18 + 8 = **161 dimensions**

## Action Space (7 continuous actions)

Each agent outputs **7 continuous values** (range: -1 to 1):

```javascript
{
  movement_forward: [-1, 1],   // Forward/backward
  movement_strafe: [-1, 1],    // Left/right
  rotation: [-1, 1],           // Turn left/right
  look: [-1, 1],               // Look up/down
  jump: [0, 1],                // Jump (0=no, 1=yes)
  place_block: [0, 1],         // Place block (disabled)
  remove_block: [0, 1]         // Remove block (disabled)
}
```

**Note**: Block placement/removal is currently disabled (`maxBlocksPlaced: 0, maxBlocksRemoved: 0`) but can be enabled for future curriculum learning.

## Reward Structure

### Seeker Rewards
```yaml
Per-step rewards:
  - Vision reward: +0.01 per hider in vision cone
  - Time penalty: -0.001 per step

Terminal rewards:
  - Caught one hider: +50.0
  - Caught all hiders: +100.0 (bonus)
  - Caught no hiders: -10.0
```

### Hider Rewards
```yaml
Per-step rewards:
  - Hidden reward: +0.2 per step when NOT in vision
  - Seen penalty: -0.2 per step when IN vision
  - Distance reward: +0.01 × (distance - 2) / 30 from closest seeker

Terminal rewards:
  - Survived: +50.0
  - Caught: -50.0
```

**Key Principle**: Terminal rewards (catching/surviving) are **42× more valuable** than per-step rewards (vision), ensuring agents prioritize the main objective over short-term signals.

## Technical Highlights

### Optimization Achievements
1. **Eliminated terrain regeneration waste** - Saved 384,000 chunk generations
2. **Fixed GPU memory leaks** - Proper THREE.js resource disposal
3. **Balanced reward shaping** - Catching 42× more valuable than watching
4. **Per-agent entropy coefficients** - Hiders explore 10× more than seekers
5. **Docker /dev/shm optimization** - Reduced Ray object store to fit limits
6. **Python memory management** - Garbage collection + matplotlib cleanup

### Performance Improvements
- **Episode reset time**: 650ms (from 10,000ms) - **15.4× faster**
- **Stuck NPC rate**: <1% (from 10%) - **10× better**
- **Training stability**: No slowdown over time (constant 3-5 min/iteration)
- **GPU memory**: Stable saw-tooth pattern (no linear growth)

## Use Cases

### Research
- Multi-agent reinforcement learning
- Emergent behavior in competitive games
- Reward shaping and curriculum learning
- Self-play training dynamics

### Education
- Visualizing RL training in real-time
- Understanding PPO algorithm
- Learning about multi-agent systems
- Exploring competitive vs cooperative AI

### Game AI Development
- Training NPCs for hide-and-seek games
- Developing adversarial agents
- Testing game balance and difficulty
- Creating intelligent opponents

## Future Enhancements

### Planned Features
1. **Curriculum Learning**
   - Start with flat terrain, gradually add complexity
   - Enable block manipulation (building hiding spots)
   - Increase world size over time

2. **Advanced Behaviors**
   - Team coordination (multiple seekers)
   - Communication between agents
   - Tool use (blocks for hiding)

3. **Evaluation Modes**
   - Demo mode for showcasing learned behaviors
   - Tournament mode (trained agents compete)
   - Human vs AI mode

4. **Training Improvements**
   - Population-based training (multiple policies)
   - Curiosity-driven exploration
   - Hierarchical policies (high-level + low-level)

## Getting Started

### Prerequisites
```bash
# Python 3.8+
python --version

# Node.js 14+
node --version

# NVIDIA GPU (recommended)
nvidia-smi
```

### Quick Start
```bash
# 1. Clone repository
git clone <repository-url>
cd minecraft-classic

# 2. Install Python dependencies
cd backend/python-rl
pip install -r requirements.txt

# 3. Start frontend server
cd ../../frontend
npm install
npm start

# 4. Start training
cd ../backend/python-rl
python main.py

# 5. Open browser
# Navigate to: http://localhost:8080/modes/research.html
```

### Training from Checkpoint
```bash
# Resume from iteration 70
python main.py ./checkpoints/checkpoint_000070
```

### Monitoring Training
```bash
# Watch metrics in real-time
tail -f logs/training.log

# View plots (generated every 10 iterations)
open checkpoints/metrics/rewards.png
```

## Project Statistics

- **Total Lines of Code**: ~15,000
- **Frontend (JavaScript)**: ~8,000 lines
- **Backend (Python)**: ~3,500 lines
- **Configuration**: ~500 lines
- **Documentation**: ~3,000 lines

### File Breakdown
- **Core ML System**: 12 files (~3,000 lines)
- **NPC System**: 8 files (~2,500 lines)
- **World Generation**: 6 files (~2,000 lines)
- **Physics & Vision**: 4 files (~1,500 lines)
- **Backend Training**: 7 files (~3,500 lines)

## Key Technologies

### Frontend
- **Three.js** - 3D rendering and scene management
- **SimplexNoise** - Procedural terrain generation
- **WebSocket** - Real-time communication with Python
- **Web Workers** - Chunk generation in background threads

### Backend
- **Ray RLlib** - Distributed reinforcement learning framework
- **PyTorch** - Deep learning neural networks
- **Gymnasium** - OpenAI Gym environment interface
- **asyncio** - Asynchronous WebSocket server
- **Matplotlib** - Training metrics visualization

## License

MIT License - See LICENSE file for details

## Acknowledgments

This project is inspired by:
- **OpenAI's Hide-and-Seek** research (multi-agent emergent behavior)
- **Minecraft** (voxel world and game mechanics)
- **Ray RLlib** (scalable RL framework)
- **Three.js** community (3D web rendering)

## Contact & Support

For questions, issues, or contributions, please refer to:
- **Documentation**: `/documentation/` folder
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions

---

**Version**: 1.0
**Last Updated**: November 2024
**Status**: Active Development
