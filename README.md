# Multi-Agent Reinforcement Learning for Hide-and-Seek in Browser-Based Voxel Environments

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10](https://img.shields.io/badge/python-3.10-blue.svg)](https://www.python.org/downloads/release/python-3100/)
[![Ray RLlib](https://img.shields.io/badge/Ray%20RLlib-2.50.0-orange.svg)](https://docs.ray.io/en/latest/rllib/index.html)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.0.1-red.svg)](https://pytorch.org/)
[![THREE.js](https://img.shields.io/badge/THREE.js-r150-green.svg)](https://threejs.org/)

## Overview

This repository contains the implementation of a Proximal Policy Optimization (PPO) framework for training Non-Player Characters (NPCs) in a web-based 3D voxel hide-and-seek game. The system demonstrates that browser-based 3D environments can serve as effective training platforms for multi-agent reinforcement learning, achieving stable convergence through 143,961 training episodes over 600 iterations.

The framework combines Ray RLlib's PPO implementation with a JavaScript-based THREE.js game environment via WebSocket communication, enabling sophisticated multi-agent RL training without requiring custom native simulation infrastructure.

## Abstract

We present a reinforcement learning framework for training NPCs in a browser-based 3D voxel hide-and-seek game using Proximal Policy Optimization. The system uses a Python training backend communicating with a JavaScript browser environment via WebSockets, allowing NPCs to interact with a real-time 3D world rendered in THREE.js. Our observation space includes position, orientation, velocity, and a 64-ray vision system that detects terrain and other agents within a 32-block radius. Through 143,961 training episodes over 600 iterations, the system achieved stable convergence with NPCs demonstrating adaptive hiding and seeking behaviors. Tournament evaluation across 100 games shows hider agents achieving a 68% win rate, validating emergent strategies including terrain exploitation, systematic coverage, and dynamic evasion tactics.

## Key Features

- **PPO-based Multi-Agent Training**: Separate policies for seeker and hider roles with asymmetric learning rates and entropy coefficients
- **WebSocket Architecture**: Python training backend integrated with JavaScript browser environment
- **64-Ray Vision System**: Comprehensive environmental perception with 32-block detection radius
- **161-Dimensional Observation Space**: Captures position, velocity, visual field, game context, and agent-specific information
- **Continuous Action Space**: 7-dimensional control including movement, rotation, and jumping
- **Stable Convergence**: Achieved in approximately 96,000-108,000 training episodes
- **Tournament Validation**: 100-game evaluation demonstrating emergent strategic behaviors
- **Open-Source Implementation**: Complete training pipeline and browser environment

## System Requirements

### Hardware
- CPU: Multi-core processor (16+ cores recommended)
- GPU: NVIDIA GPU with CUDA support
- RAM: 32 GB minimum
- Storage: SSD with at least 50 GB free space

### Software
- Python 3.10
- Node.js 16+ (for development)
- Modern web browser (Chrome/Chromium recommended)
- Docker (optional, for containerized training)

## Installation

### Clone Repository

```bash
git clone https://github.com/pstepanovum/browser-marl-hideseek.git
cd browser-marl-hideseek
```

### Python Backend Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### JavaScript Environment Setup

```bash
cd browser-environment
npm install
npm run build
```

## Architecture

The system consists of three main components:

### 1. Browser Environment
- THREE.js-based 3D voxel world
- Physics simulation at 60 FPS
- 64-ray vision system for agent perception
- Procedurally generated terrain with fixed seed

### 2. Python Training Backend
- Ray RLlib 2.50.0 PPO implementation
- PyTorch 2.0.1 neural networks
- Dual-policy configuration (seeker/hider)
- Generalized Advantage Estimation

### 3. WebSocket Bridge
- Bidirectional communication layer
- JSON-based protocol
- Asynchronous message handling
- Minimal latency overhead

## Training

### Configuration

Key hyperparameters used in training:

- Learning rate: 3×10⁻⁴
- Discount factor (gamma): 0.99
- GAE lambda: 0.95
- Clip parameter: 0.2
- Entropy coefficient: 0.001 (seeker), 0.01 (hider)
- Train batch size: 57,600 timesteps
- Minibatch size: 512
- Training epochs: 10 per iteration

### Running Training

```bash
# Start browser environment
cd browser-environment
npm run serve

# In separate terminal, start training
cd python-backend
python train_ppo.py --config config/default.yaml
```

### Monitoring Training

Training metrics are logged to:
- `checkpoints/`: Model checkpoints (saved every 10 iterations)
- `logs/`: Training metrics and episode statistics
- `plots/`: Visualization of training progress

## Results

### Convergence Metrics

- Stable convergence achieved by iteration 450 (108,000 episodes)
- Seeker policy: KL divergence 0.0097, entropy 10.37
- Hider policy: KL divergence 0.0112, entropy 22.34
- Average episode length: 237.5 steps (98.9% of maximum)

### Tournament Evaluation

100-game tournament results:
- Hider win rate: 68.0%
- Seeker win rate: 32.0%
- Average game duration (hider wins): 240.4 steps
- Average game duration (seeker wins): 209.0 steps

### Emergent Strategies

**Hider Behaviors:**
- Terrain utilization (35% of games)
- Edge positioning (24% of games)
- Dynamic evasion (18% of games)
- Separation strategy (41% of games)

**Seeker Behaviors:**
- Systematic coverage (52% of games)
- High-ground scanning (28% of games)
- Rapid pursuit (32% of successful catches)
- Corner checking (19% of games)

## Repository Structure

```
.
├── python-backend/
│   ├── train_ppo.py           # Main training script
│   ├── minecraft_env.py       # Gym environment wrapper
│   ├── websocket_server.py    # WebSocket communication
│   ├── metrics_tracker.py     # Training metrics logging
│   └── config/                # Configuration files
├── browser-environment/
│   ├── src/
│   │   ├── ppo-training-bridge.js    # WebSocket client
│   │   ├── state-encoder.js          # Observation encoding
│   │   ├── reward-system.js          # Reward calculation
│   │   ├── npc-vision-system.js      # Ray-casting vision
│   │   └── npc-physics.js            # Agent physics
│   ├── public/                       # Static assets
│   └── package.json
├── checkpoints/               # Trained model checkpoints
├── paper/                     # Research paper (LaTeX)
├── requirements.txt           # Python dependencies
├── LICENSE                    # MIT License
└── README.md
```

## Citation

If you use this code in your research, please cite:

```bibtex
@article{stepanov2024marl,
  title={Multi-Agent Reinforcement Learning for Hide-and-Seek in Browser-Based Voxel Environments},
  author={Stepanov, Pavel},
  journal={University of Miami, Department of Computer Science},
  year={2024}
}
```

## References

### Core Frameworks
1. Schulman, J., Wolski, F., Dhariwal, P., Radford, A., & Klimov, O. (2017). Proximal policy optimization algorithms. arXiv preprint arXiv:1707.06347.
2. Liang, E., Liaw, R., Nishihara, R., Moritz, P., Fox, R., Goldberg, K., ... & Stoica, I. (2018). RLlib: Abstractions for distributed reinforcement learning. In International Conference on Machine Learning (pp. 3053-3062).

### Related Work
3. Baker, B., Kanitscheider, I., Markov, T., Wu, Y., Powell, G., McGrew, B., & Mordatch, I. (2019). Emergent tool use from multi-agent autocurricula. arXiv preprint arXiv:1909.07528.
4. OpenAI. (2019). Emergent complexity and zero-shot transfer via unsupervised environment design. arXiv preprint arXiv:1901.01753.

### Browser-Based ML
5. Smilkov, D., Thorat, N., Assogba, Y., Yuan, A., Kreeger, N., Yu, P., ... & Wattenberg, M. (2019). TensorFlow.js: Machine learning for the web and beyond. Proceedings of Machine Learning and Systems, 1, 309-321.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

Pavel Stepanov  
Department of Computer Science  
University of Miami  
Email: pas273@miami.edu

## Acknowledgments

This research was conducted as part of CSC411 at the University of Miami. Special thanks to the Department of Computer Science for providing computational resources and support.

## Technical Support

For questions about the implementation, training process, or to report issues:
- Open an issue in the GitHub repository
- Refer to the detailed technical documentation in the `paper/` directory
- Contact the author via email

## Future Work

Planned extensions include:
- Curriculum learning with progressive terrain complexity
- Block modification capabilities (placement/removal)
- Human-AI interaction modes
- Generalization studies across varied terrain
- Alternative RL algorithms (LSTM policies, MAPPO, SAC)
- Enhanced perception systems with attention mechanisms
