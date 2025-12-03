"""
FILE: backend/python-rl/demo_model_selective.py
Enhanced demo mode - selective agent control for evaluation

Allows testing trained models in isolation:
- Seeker trained, hiders random
- Hiders trained, seeker random
- Both trained (baseline)
- Both random (control)
"""

import asyncio
import yaml
import sys
import numpy as np
from pathlib import Path
import json

from websocket_server import get_server
from ppo_trainer import create_ppo_trainer


class AgentController:
    """Controls which agents use trained models vs random actions"""

    # Evaluation modes
    MODE_ALL_TRAINED = "all_trained"
    MODE_SEEKER_TRAINED = "seeker_trained"
    MODE_HIDER_TRAINED = "hider_trained"
    MODE_ALL_RANDOM = "all_random"

    def __init__(self, mode, trainer=None):
        self.mode = mode
        self.trainer = trainer

        # Action space bounds (from config)
        self.action_low = np.array([-1.0, -1.0, -1.0, -1.0, 0.0, 0.0, 0.0])
        self.action_high = np.array([1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0])

    def get_action(self, agent_id, observation, role):
        """
        Get action for agent based on evaluation mode

        Args:
            agent_id: Agent identifier
            observation: Current observation
            role: 'seeker' or 'hider'

        Returns:
            dict: Action in browser format
        """
        use_trained = self._should_use_trained_policy(role)

        if use_trained and self.trainer:
            return self._get_trained_action(agent_id, observation, role)
        else:
            return self._get_random_action(agent_id, role)

    def _should_use_trained_policy(self, role):
        """Determine if this role should use trained policy"""
        if self.mode == self.MODE_ALL_TRAINED:
            return True
        elif self.mode == self.MODE_ALL_RANDOM:
            return False
        elif self.mode == self.MODE_SEEKER_TRAINED:
            return role == "seeker"
        elif self.mode == self.MODE_HIDER_TRAINED:
            return role == "hider"
        else:
            return False

    def _get_trained_action(self, agent_id, observation, role):
        """Get action from trained policy (deterministic)"""
        policy_id = f"{role}_policy"

        try:
            # Get action (deterministic - no exploration)
            action = self.trainer.compute_single_action(
                observation,
                policy_id=policy_id,
                explore=False
            )

            # Convert to browser format
            return {
                'movement_forward': float(action[0]),
                'movement_strafe': float(action[1]),
                'rotation': float(action[2]),
                'look': float(action[3]),
                'jump': bool(float(action[4]) > 0.5),
                'place_block': bool(float(action[5]) > 0.5),
                'remove_block': bool(float(action[6]) > 0.5),
            }
        except Exception as e:
            print(f"⚠️ Error computing trained action for {agent_id}: {e}")
            return self._get_zero_action()

    def _get_random_action(self, agent_id, role):
        """Get random action (uniform sampling)"""
        # Sample from uniform distribution within action bounds
        action = np.random.uniform(
            low=self.action_low,
            high=self.action_high
        )

        # Convert to browser format
        return {
            'movement_forward': float(action[0]),
            'movement_strafe': float(action[1]),
            'rotation': float(action[2]),
            'look': float(action[3]),
            'jump': bool(action[4] > 0.5),
            'place_block': bool(action[5] > 0.5),
            'remove_block': bool(action[6] > 0.5),
        }

    def _get_zero_action(self):
        """Fallback zero action"""
        return {
            'movement_forward': 0.0,
            'movement_strafe': 0.0,
            'rotation': 0.0,
            'look': 0.0,
            'jump': False,
            'place_block': False,
            'remove_block': False,
        }

    def get_description(self):
        """Get human-readable description of current mode"""
        descriptions = {
            self.MODE_ALL_TRAINED: "Both Seeker and Hiders using TRAINED models",
            self.MODE_SEEKER_TRAINED: "Seeker using TRAINED model, Hiders using RANDOM actions",
            self.MODE_HIDER_TRAINED: "Hiders using TRAINED models, Seeker using RANDOM actions",
            self.MODE_ALL_RANDOM: "Both Seeker and Hiders using RANDOM actions (baseline)",
        }
        return descriptions.get(self.mode, "Unknown mode")


def select_evaluation_mode():
    """Interactive mode selection"""
    print(f"\n{'='*60}")
    print(f"🎯 EVALUATION MODE SELECTION")
    print(f"{'='*60}")
    print(f"\nAvailable evaluation modes:")
    print(f"  1. Seeker TRAINED, Hiders RANDOM")
    print(f"     → Tests if seeker learned to seek effectively")
    print(f"     → Shows seeking behavior in isolation")
    print(f"")
    print(f"  2. Hiders TRAINED, Seeker RANDOM")
    print(f"     → Tests if hiders learned to hide effectively")
    print(f"     → Shows hiding behavior in isolation")
    print(f"")
    print(f"  3. Both TRAINED (default)")
    print(f"     → Full trained interaction")
    print(f"     → Shows emergent multi-agent behavior")
    print(f"")
    print(f"  4. Both RANDOM (baseline)")
    print(f"     → Pure random behavior for comparison")
    print(f"     → Establishes performance baseline")
    print(f"")
    print(f"{'='*60}")

    choice = input(f"Select mode (1-4, or press Enter for mode 3): ").strip()

    if choice == '' or choice == '3':
        return AgentController.MODE_ALL_TRAINED
    elif choice == '1':
        return AgentController.MODE_SEEKER_TRAINED
    elif choice == '2':
        return AgentController.MODE_HIDER_TRAINED
    elif choice == '4':
        return AgentController.MODE_ALL_RANDOM
    else:
        print(f"⚠️ Invalid choice, using default (both trained)")
        return AgentController.MODE_ALL_TRAINED


def select_checkpoint(checkpoint_base_dir):
    """
    Interactive checkpoint selection (same as original demo_model.py)
    """
    checkpoint_base = Path(checkpoint_base_dir)

    if not checkpoint_base.exists():
        print(f"❌ Checkpoint directory not found: {checkpoint_base}")
        return None

    # Load checkpoint index
    index_file = checkpoint_base / "checkpoint_index.json"

    if index_file.exists():
        with open(index_file, 'r') as f:
            data = json.load(f)
            checkpoints = data.get('checkpoints', [])
    else:
        # Fallback: scan directory
        checkpoints = []
        for cp_dir in sorted(checkpoint_base.glob("checkpoint_*")):
            if cp_dir.is_dir():
                try:
                    iteration = int(cp_dir.name.split('_')[1])
                    checkpoints.append({
                        'iteration': iteration,
                        'path': cp_dir.name
                    })
                except:
                    pass

    if not checkpoints:
        print(f"❌ No checkpoints found in {checkpoint_base}")
        return None

    # Display available checkpoints
    print(f"\n{'='*60}")
    print(f"📂 Available Checkpoints ({len(checkpoints)} found)")
    print(f"{'='*60}")

    # Show last 15 checkpoints
    display_checkpoints = checkpoints[-15:]

    for i, cp in enumerate(display_checkpoints, 1):
        iteration = cp.get('iteration', '?')
        cp_path = checkpoint_base / cp['path']

        # Try to load metadata
        metadata_file = cp_path / "metadata.json"
        extra_info = ""

        if metadata_file.exists():
            try:
                with open(metadata_file, 'r') as f:
                    metadata = json.load(f)
                    episodes = metadata.get('total_episodes', 0)
                    timestamp = metadata.get('timestamp', '')
                    if timestamp:
                        timestamp = timestamp.split('T')[0]
                    extra_info = f" | Episodes: {episodes} | {timestamp}"
            except:
                pass

        print(f"  {i:2d}. Iteration {iteration:6d} {extra_info}")

    print(f"\nOptions:")
    print(f"  • Enter number (1-{len(display_checkpoints)}) to select checkpoint")
    print(f"  • Press Enter to use latest checkpoint")
    print(f"  • Type 'q' to quit")

    choice = input(f"\nSelect checkpoint: ").strip()

    if choice.lower() == 'q':
        return None

    if choice == '':
        latest = checkpoints[-1]
        checkpoint_path = checkpoint_base / latest['path']
        print(f"\n✅ Using latest checkpoint: {latest['path']}")
        return str(checkpoint_path)

    try:
        idx = int(choice) - 1
        if 0 <= idx < len(display_checkpoints):
            actual_idx = len(checkpoints) - len(display_checkpoints) + idx
            selected = checkpoints[actual_idx]
            checkpoint_path = checkpoint_base / selected['path']
            print(f"\n✅ Selected: {selected['path']}")
            return str(checkpoint_path)
        else:
            print(f"❌ Invalid selection")
            return None
    except ValueError:
        print(f"❌ Invalid input")
        return None


async def run_demo(config, checkpoint_path, eval_mode):
    """Run selective demo mode"""

    server = get_server(
        config['websocket']['host'],
        config['websocket']['port']
    )

    # Start server
    server_task = asyncio.create_task(server.start_server())

    print(f"\n{'='*60}")
    print(f"⏳ Waiting for browser connection...")
    print(f"   (Click 'DEMO TRAINED MODEL' button in browser)")
    print(f"{'='*60}")

    while not server.connected:
        await asyncio.sleep(0.5)

    print(f"\n✅ Browser connected!")

    # Load trained model (if needed for this mode)
    trainer = None
    if eval_mode != AgentController.MODE_ALL_RANDOM:
        print(f"📂 Loading checkpoint: {checkpoint_path}")
        trainer, _ = create_ppo_trainer(config, restore_path=checkpoint_path)
        print(f"✅ Model loaded successfully!")
    else:
        print(f"🎲 Using random actions only (no model loading needed)")

    # Create controller
    controller = AgentController(eval_mode, trainer)

    print(f"\n{'='*60}")
    print(f"🎮 DEMO MODE ACTIVE")
    print(f"{'='*60}")
    print(f"Mode: {controller.get_description()}")
    print(f"{'='*60}\n")

    episode = 0

    try:
        while True:
            episode += 1

            print(f"\n{'─'*60}")
            print(f"🎮 Demo Episode {episode}")
            print(f"{'─'*60}")

            # Reset episode
            try:
                obs_data = await server.reset_episode(episode)
            except asyncio.TimeoutError:
                print("⚠️ Timeout waiting for reset")
                continue
            except Exception as e:
                print(f"❌ Reset error: {e}")
                continue

            # Episode statistics
            step = 0
            done = False
            total_reward = 0
            seeker_reward = 0
            hider_rewards = []
            seeker_steps = 0
            hider_steps = 0

            while not done:
                step += 1

                # Get observations
                agents = obs_data.get('agents', [])
                observations = {}
                agent_roles = {}

                for agent_data in agents:
                    agent_id = agent_data['id']
                    obs = agent_data['observation']
                    role = agent_data.get('role', 'seeker' if 'seeker' in agent_id else 'hider')

                    observations[agent_id] = obs
                    agent_roles[agent_id] = role

                # Compute actions using controller
                actions = {}
                for agent_id, obs in observations.items():
                    role = agent_roles[agent_id]
                    actions[agent_id] = controller.get_action(agent_id, obs, role)

                # Send step
                try:
                    obs_data = await server.step(actions)
                except asyncio.TimeoutError:
                    print(f"⚠️ Timeout at step {step}")
                    break
                except Exception as e:
                    print(f"❌ Step error: {e}")
                    break

                # Update statistics
                if 'agents' in obs_data:
                    for agent_data in obs_data['agents']:
                        reward = agent_data.get('reward', 0)
                        total_reward += reward

                        agent_id = agent_data['id']
                        if 'seeker' in agent_id:
                            seeker_reward += reward
                            seeker_steps += 1
                        else:
                            hider_rewards.append(reward)
                            hider_steps += 1

                done = obs_data.get('episode_done', False)

                # Progress logging
                if step % 30 == 0:
                    print(f"   Step {step:3d} | Total: {total_reward:6.2f} | "
                          f"Seeker: {seeker_reward:6.2f} | Hiders: {sum(hider_rewards):6.2f}")

            # Episode summary
            hider_avg = sum(hider_rewards) / len(hider_rewards) if hider_rewards else 0

            print(f"\n✅ Episode {episode} Complete")
            print(f"{'─'*60}")
            print(f"   Total steps:      {step}")
            print(f"   Total reward:     {total_reward:8.2f}")
            print(f"   Seeker reward:    {seeker_reward:8.2f}")
            print(f"   Hiders avg:       {hider_avg:8.2f}")
            print(f"   Evaluation mode:  {controller.get_description()}")
            print(f"{'─'*60}")

            # Pause before next episode
            await asyncio.sleep(2)

    except KeyboardInterrupt:
        print(f"\n\n⚠️ Demo stopped by user")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

    finally:
        print(f"\n👋 Shutting down...")
        if trainer:
            trainer.stop()
        server_task.cancel()


def main():
    # Load config
    config_path = Path(__file__).parent / "config.yaml"

    try:
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
    except Exception as e:
        print(f"❌ Failed to load config: {e}")
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"🎮 SELECTIVE DEMO MODE - Agent Evaluation")
    print(f"{'='*60}")
    print(f"Test trained models in isolation to evaluate learning:")
    print(f"  • Compare trained vs random performance")
    print(f"  • Isolate seeker vs hider behaviors")
    print(f"  • Establish baseline metrics")
    print(f"{'='*60}")

    # Select evaluation mode
    eval_mode = select_evaluation_mode()

    # Select checkpoint (skip if all random)
    checkpoint_path = None
    if eval_mode != AgentController.MODE_ALL_RANDOM:
        checkpoint_base = Path(__file__).parent / "checkpoints"
        checkpoint_path = select_checkpoint(checkpoint_base)

        if not checkpoint_path:
            print("\n❌ No checkpoint selected. Exiting.")
            sys.exit(1)

    print(f"\n{'='*60}")
    print(f"Starting demo with:")
    print(f"  Mode: {AgentController(eval_mode, None).get_description()}")
    if checkpoint_path:
        print(f"  Checkpoint: {checkpoint_path}")
    print(f"  WebSocket: {config['websocket']['host']}:{config['websocket']['port']}")
    print(f"{'='*60}\n")

    try:
        asyncio.run(run_demo(config, checkpoint_path, eval_mode))
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
