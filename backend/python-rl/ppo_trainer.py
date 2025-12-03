"""
FILE: backend/python-rl/ppo_trainer.py
Multi-agent PPO trainer for Minecraft Hide & Seek

This file should NOT be modified during training.
Only modify config.yaml for hyperparameter changes.
"""

import ray
from ray import tune
from ray.rllib.algorithms.ppo import PPOConfig
from ray.rllib.policy.policy import PolicySpec
from ray.rllib.env.multi_agent_env import MultiAgentEnv
import os
import sys
import numpy as np
from pathlib import Path
from datetime import datetime
import json
import gc  # 🔴 FIX: For garbage collection to prevent memory leaks
import torch  # 🔴 FIX: For GPU detection

from minecraft_env import MinecraftHideSeekEnv
from metrics_tracker import MetricsTracker


class RLlibMinecraftEnv(MultiAgentEnv):
    """Ray RLlib wrapper for Minecraft Hide & Seek environment"""
    
    def __init__(self, config):
        super().__init__()
        self.env = MinecraftHideSeekEnv(config)
        self.observation_space = self.env.observation_space
        self.action_space = self.env.action_space
        self._agent_ids = set()
        self.episode_count = config.get('episode_offset', 0)
        
        from gymnasium import spaces
        
        self.observation_space = spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(config['environment']['observation_size'],),
            dtype=np.float32
        )
        self.observation_space.contains = lambda x: True
        
        self.action_space = spaces.Box(
            low=np.array([-1.0, -1.0, -1.0, -1.0, 0.0, 0.0, 0.0], dtype=np.float32),
            high=np.array([1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], dtype=np.float32),
            dtype=np.float32
        )
    
    def reset(self, *, seed=None, options=None):
        if options is None:
            options = {}
        options['episode_number'] = self.episode_count
        
        obs_dict, info_dict = self.env.reset(seed=seed, options=options)
        self._agent_ids = set(obs_dict.keys())
        obs_dict = {k: np.array(v, dtype=np.float32) for k, v in obs_dict.items()}
        
        self.episode_count += 1
        return obs_dict, info_dict
    
    def step(self, action_dict):
        observations, rewards, terminateds, truncateds, infos = self.env.step(action_dict)
        observations = {k: np.array(v, dtype=np.float32) for k, v in observations.items()}
        return observations, rewards, terminateds, truncateds, infos
    
    def close(self):
        self.env.close()


class CheckpointManager:
    """Manages checkpoint saving and loading for Ray 2.50.0"""
    
    def __init__(self, checkpoint_dir):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        self.checkpoint_history = []
        self._load_checkpoint_index()
    
    def _load_checkpoint_index(self):
        """Load checkpoint history from index file"""
        index_file = self.checkpoint_dir / "checkpoint_index.json"
        if index_file.exists():
            with open(index_file, 'r') as f:
                data = json.load(f)
                self.checkpoint_history = data.get('checkpoints', [])
                print(f"📂 Loaded {len(self.checkpoint_history)} checkpoint(s) from index")
    
    def _save_checkpoint_index(self):
        """Save checkpoint history to index file"""
        index_file = self.checkpoint_dir / "checkpoint_index.json"
        with open(index_file, 'w') as f:
            json.dump({
                'checkpoints': self.checkpoint_history,
                'last_updated': datetime.now().isoformat()
            }, f, indent=2)
    
    def save_checkpoint(self, trainer, iteration, config, metrics=None):
        """
        Save checkpoint with comprehensive metadata
        
        Args:
            trainer: Ray RLlib trainer instance
            iteration: Current iteration number
            config: Full training configuration
            metrics: Optional metrics dict (must include 'total_episodes')
        """
        checkpoint_name = f"checkpoint_{iteration:06d}"
        checkpoint_path = self.checkpoint_dir / checkpoint_name
        
        # Save Ray checkpoint
        saved_path = trainer.save(checkpoint_path)
        if hasattr(saved_path, 'path'):
            saved_path = saved_path.path
        saved_path = str(saved_path)
        
        # Create comprehensive metadata
        metadata = {
            # Training state
            'iteration': iteration,
            'timestamp': datetime.now().isoformat(),
            'checkpoint_path': saved_path,
            
            # Config info (for validation on resume)
            'observation_size': config['environment']['observation_size'],
            'action_size': 7,  # Fixed
            'max_steps': config['environment']['max_steps'],
            'train_batch_size': config['ppo']['train_batch_size'],
            
            # PPO hyperparameters (for reference)
            'lr_seeker': config['ppo']['lr_seeker'],
            'lr_hider': config['ppo']['lr_hider'],
            'entropy_coeff_seeker': config['ppo'].get('entropy_coeff_seeker', config['ppo'].get('entropy_coeff', 0.001)),
            'entropy_coeff_hider': config['ppo'].get('entropy_coeff_hider', config['ppo'].get('entropy_coeff', 0.001)),
            'gamma': config['ppo']['gamma'],
        }
        
        # Add training metrics if provided
        if metrics:
            metadata.update(metrics)
        
        # Save metadata file
        metadata_file = checkpoint_path / "metadata.json"
        with open(metadata_file, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        # Update checkpoint history
        self.checkpoint_history.append({
            'iteration': iteration,
            'path': checkpoint_name,
            'timestamp': metadata['timestamp'],
            'total_episodes': metrics.get('total_episodes', 0) if metrics else 0
        })
        
        self._save_checkpoint_index()
        
        # Print confirmation
        print(f"\n✅ Checkpoint saved: {checkpoint_name}")
        if metrics and 'total_episodes' in metrics:
            print(f"   Total episodes: {metrics['total_episodes']}")
        
        return saved_path
    
    def get_latest_checkpoint(self):
        """Get path to most recent checkpoint"""
        if not self.checkpoint_history:
            return None
        latest = self.checkpoint_history[-1]
        return str(self.checkpoint_dir / latest['path'])
    
    def get_checkpoint_metadata(self, checkpoint_path):
        """Load metadata from checkpoint"""
        cp_path = Path(checkpoint_path)
        metadata_file = cp_path / "metadata.json"
        
        if metadata_file.exists():
            with open(metadata_file, 'r') as f:
                return json.load(f)
        return {}


def validate_checkpoint_config(checkpoint_metadata, current_config):
    """
    Verify checkpoint is compatible with current config
    
    Returns:
        (bool, list): (is_valid, list of issues)
    """
    if not checkpoint_metadata:
        print("⚠️  No metadata found in checkpoint")
        return True, []  # Allow resume, but warn
    
    issues = []
    
    # Check observation size (CRITICAL)
    saved_obs_size = checkpoint_metadata.get('observation_size')
    current_obs_size = current_config['environment']['observation_size']
    if saved_obs_size and saved_obs_size != current_obs_size:
        issues.append(
            f"Observation size mismatch: "
            f"{saved_obs_size} (checkpoint) ≠ {current_obs_size} (config)"
        )
    
    # Check action space (CRITICAL)
    saved_action_size = checkpoint_metadata.get('action_size')
    if saved_action_size and saved_action_size != 7:
        issues.append(
            f"Action space changed: "
            f"{saved_action_size} (checkpoint) ≠ 7 (current)"
        )
    
    # Check max steps (WARNING - affects batch calculation)
    saved_max_steps = checkpoint_metadata.get('max_steps')
    current_max_steps = current_config['environment']['max_steps']
    if saved_max_steps and saved_max_steps != current_max_steps:
        print(f"\n⚠️  WARNING: Max steps changed:")
        print(f"   Checkpoint: {saved_max_steps}")
        print(f"   Config:     {current_max_steps}")
        print(f"   This will affect episodes per iteration!")
        # Not a critical error - just warn
    
    # Check batch size (INFO)
    saved_batch = checkpoint_metadata.get('train_batch_size')
    current_batch = current_config['ppo']['train_batch_size']
    if saved_batch and saved_batch != current_batch:
        print(f"\n📊 INFO: Batch size changed:")
        print(f"   Checkpoint: {saved_batch}")
        print(f"   Config:     {current_batch}")
    
    return len(issues) == 0, issues


def create_ppo_trainer(config, restore_path=None, episode_offset=0):
    """
    Create PPO trainer instance
    
    Args:
        config: Full configuration dict
        restore_path: Optional checkpoint path to restore from
        episode_offset: Episode number to start counting from
    
    Returns:
        (trainer, log_dir): Trainer instance and logging directory
    """
    ppo_config = config['ppo']
    
    env_config = config.copy()
    env_config['episode_offset'] = episode_offset
    
    def policy_mapping_fn(agent_id, episode, worker, **kwargs):
        """Map agent IDs to policy IDs"""
        if 'seeker' in agent_id:
            return "seeker_policy"
        else:
            return "hider_policy"
    
    # Create unique log directory
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_dir = os.path.abspath(".")
    log_dir = os.path.join(base_dir, "runs", f"ppo_minecraft_{timestamp}")
    os.makedirs(log_dir, exist_ok=True)
    
    # Build PPO configuration
    trainer_config = (
        PPOConfig()
        .api_stack(
            enable_rl_module_and_learner=False,
            enable_env_runner_and_connector_v2=False
        )
        .environment(
            env=RLlibMinecraftEnv,
            env_config=env_config,
            disable_env_checking=True
        )
        .framework("torch")
        .training(
            lr=ppo_config['lr_seeker'],
            gamma=ppo_config['gamma'],
            lambda_=ppo_config['lambda'],
            clip_param=ppo_config['clip_param'],
            vf_loss_coeff=ppo_config['vf_loss_coeff'],
            entropy_coeff=ppo_config.get('entropy_coeff_seeker', ppo_config.get('entropy_coeff', 0.001)),  # Default, overridden per-policy
            train_batch_size=ppo_config['train_batch_size'],
            minibatch_size=ppo_config['minibatch_size'],
            num_epochs=ppo_config['num_epochs'],
            grad_clip=ppo_config.get('grad_clip', 0.5),
            kl_coeff=ppo_config.get('kl_coeff', 0.2),
            kl_target=ppo_config.get('kl_target', 0.01),
            model={
                "fcnet_hiddens": ppo_config['model']['fcnet_hiddens'],
                "fcnet_activation": ppo_config['model']['fcnet_activation'],
            }
        )
        .env_runners(
            num_env_runners=ppo_config['num_workers'],
            num_envs_per_env_runner=ppo_config['num_envs_per_worker']
        )
        .multi_agent(
            policies={
                "seeker_policy": PolicySpec(
                    policy_class=None,
                    observation_space=None,
                    action_space=None,
                    config={
                        "lr": ppo_config['lr_seeker'],
                        "entropy_coeff": ppo_config.get('entropy_coeff_seeker', ppo_config.get('entropy_coeff', 0.001))
                    }
                ),
                "hider_policy": PolicySpec(
                    policy_class=None,
                    observation_space=None,
                    action_space=None,
                    config={
                        "lr": ppo_config['lr_hider'],
                        "entropy_coeff": ppo_config.get('entropy_coeff_hider', ppo_config.get('entropy_coeff', 0.001))
                    }
                )
            },
            policy_mapping_fn=policy_mapping_fn,
            policies_to_train=["seeker_policy", "hider_policy"]
        )
        .debugging(log_level="INFO")
        .resources(num_gpus=ppo_config['num_gpus'])
    )
    
    # Build trainer
    trainer = trainer_config.build_algo(
        logger_creator=lambda config: ray.tune.logger.UnifiedLogger(
            config, log_dir, loggers=None
        )
    )
    
    # Restore from checkpoint if provided
    if restore_path:
        print(f"\n📂 Restoring from checkpoint: {restore_path}")
        trainer.restore(restore_path)
        print(f"✅ Checkpoint restored successfully")
    
    return trainer, log_dir


def train(config, restore_checkpoint=None):
    """
    Main training loop
    
    Args:
        config: Full configuration dict
        restore_checkpoint: Optional checkpoint path to resume from
    """
    
    # Initialize Ray
    if not ray.is_initialized():
        # Detect platform and GPU availability
        is_mac = sys.platform == 'darwin'
        # 🔴 FIX: Check actual GPU availability, not just platform
        has_gpu = torch.cuda.is_available()

        # 🔴 FIX: Adjust object store for Docker /dev/shm limits
        # Docker typically has ~10GB /dev/shm, use 9GB to be safe
        # Spilling to disk will handle overflow automatically
        object_store_size = 2*1024*1024*1024 if is_mac else 9*1024*1024*1024
        num_gpus = 1 if has_gpu else 0

        if is_mac:
            print("🍎 Mac detected - using 2GB object store, CPU only")
        else:
            if has_gpu:
                gpu_name = torch.cuda.get_device_name(0)
                print(f"🐧 Linux detected - using 9GB object store (Docker /dev/shm limit)")
                print(f"🎮 GPU available: {gpu_name}")
            else:
                print("🐧 Linux detected - using 9GB object store (Docker /dev/shm limit)")
                print("⚠️  No GPU detected - using CPU training (slower but works)")

        ray.init(
            ignore_reinit_error=True,
            num_gpus=num_gpus,
            object_store_memory=object_store_size,
            _temp_dir='/tmp/ray',
            # 🔴 FIX: Enable automatic object spilling to disk
            _system_config={
                "automatic_object_spilling_enabled": True,
                "object_spilling_config": json.dumps({
                    "type": "filesystem",
                    "params": {"directory_path": "/tmp/ray_spill"}
                })
            }
        )
    
    # Override GPU setting in config if no GPU available
    has_gpu = torch.cuda.is_available()
    if not has_gpu:
        config['ppo']['num_gpus'] = 0
    
    # Initialize managers
    checkpoint_dir = config['ppo']['checkpoint_dir']
    checkpoint_manager = CheckpointManager(checkpoint_dir)
    metrics_tracker = MetricsTracker(checkpoint_dir)
    
    # Training configuration
    total_episodes = config['training']['total_episodes']
    checkpoint_freq = config['ppo']['checkpoint_freq']
    log_freq = config['training'].get('log_frequency', 1)
    
    train_batch_size = config['ppo']['train_batch_size']
    max_steps = config['environment']['max_steps']
    episodes_per_iteration = train_batch_size // max_steps
    training_iterations = total_episodes // episodes_per_iteration
    
    if total_episodes % episodes_per_iteration != 0:
        training_iterations += 1
    
    # Handle checkpoint restoration
    episode_offset = 0
    start_iteration = 1
    
    if restore_checkpoint:
        print(f"\n{'='*60}")
        print(f"RESTORING FROM CHECKPOINT")
        print(f"{'='*60}")
        
        # Load metadata
        metadata = checkpoint_manager.get_checkpoint_metadata(restore_checkpoint)
        
        # Validate config compatibility
        is_valid, issues = validate_checkpoint_config(metadata, config)
        
        if not is_valid:
            print(f"\n❌ CHECKPOINT INCOMPATIBLE WITH CURRENT CONFIG:")
            for issue in issues:
                print(f"   • {issue}")
            print(f"\nPlease either:")
            print(f"  1. Restore config.yaml to match checkpoint")
            print(f"  2. Start fresh training with new config")
            print(f"\n{'='*60}\n")
            sys.exit(1)
        
        # Get episode offset from metadata
        episode_offset = metadata.get('total_episodes', 0)
        
        # Parse iteration number from checkpoint name
        checkpoint_path = Path(restore_checkpoint)
        if 'checkpoint_' in checkpoint_path.name:
            try:
                iteration_num = int(checkpoint_path.name.split('_')[1])
                start_iteration = iteration_num + 1
                
                # Estimate episode offset if metadata missing
                if episode_offset == 0 and iteration_num > 0:
                    print(f"⚠️  Warning: Metadata missing episodes count")
                    episode_offset = iteration_num * episodes_per_iteration
                    print(f"   Estimated episode offset: {episode_offset}")
                else:
                    print(f"✅ Episode offset from metadata: {episode_offset}")
                    
            except Exception as e:
                print(f"⚠️  Could not parse checkpoint iteration: {e}")
        
        print(f"{'='*60}\n")
    
    # Create trainer
    trainer, log_dir = create_ppo_trainer(config, restore_checkpoint, episode_offset)
    total_episodes_completed = episode_offset
    
    # Print training info
    print(f"\n{'='*60}")
    print(f"🎯 TRAINING CONFIGURATION")
    print(f"{'='*60}")
    print(f"Total iterations: {training_iterations}")
    print(f"Starting iteration: {start_iteration}")
    print(f"Episodes per iteration: {episodes_per_iteration}")
    print(f"Episodes completed: {total_episodes_completed}/{total_episodes}")
    print(f"Checkpoint frequency: Every {checkpoint_freq} iterations")
    print(f"Log frequency: Every {log_freq} iteration(s)")
    print(f"\n📈 TensorBoard: tensorboard --logdir runs")
    print(f"📂 Checkpoints: {checkpoint_dir}")
    print(f"{'='*60}\n")
    
    try:
        # Main training loop
        for iteration in range(start_iteration, training_iterations + 1):
            result = trainer.train()
            
            # Extract episode count
            env_runners_stats = result.get('env_runners', {})
            episodes_this_iter = env_runners_stats.get('episodes_this_iter', 0)
            total_episodes_completed += episodes_this_iter
            
            # Track metrics
            metrics = metrics_tracker.extract_metrics(
                result, iteration, episodes_this_iter, 
                total_episodes_completed, max_steps
            )
            
            # Log progress
            if iteration % log_freq == 0:
                metrics_tracker.log_progress(metrics)
            
            # Save checkpoint and generate plots
            if iteration % checkpoint_freq == 0:
                checkpoint_metrics = {
                    'total_episodes': total_episodes_completed,
                    'episodes_this_iter': episodes_this_iter,
                }
                checkpoint_manager.save_checkpoint(
                    trainer, iteration, config, checkpoint_metrics
                )

                metrics_tracker.save_metrics()
                metrics_tracker.generate_plots(iteration)

                # 🔴 FIX: Force garbage collection after checkpoint/plotting to prevent slowdown
                gc.collect()
        
        # Training complete
        print(f"\n{'='*60}")
        print(f"✅ TRAINING COMPLETE!")
        print(f"{'='*60}")
        
        # Final checkpoint and summary
        final_metrics = {
            'total_episodes': total_episodes_completed,
            'final': True
        }
        checkpoint_manager.save_checkpoint(
            trainer, training_iterations, config, final_metrics
        )
        
        metrics_tracker.save_metrics()
        metrics_tracker.generate_plots(training_iterations)
        metrics_tracker.print_summary()
        
    except KeyboardInterrupt:
        print(f"\n{'='*60}")
        print(f"⚠️  TRAINING INTERRUPTED BY USER")
        print(f"{'='*60}")
        
        # Save interrupt checkpoint
        interrupt_metrics = {
            'total_episodes': total_episodes_completed,
            'interrupted': True
        }
        checkpoint_manager.save_checkpoint(
            trainer, iteration, config, interrupt_metrics
        )
        
        metrics_tracker.save_metrics()
        metrics_tracker.generate_plots(iteration)
        metrics_tracker.print_summary()
        
        print(f"\n✅ Progress saved to checkpoint_{iteration:06d}")
        print(f"Resume with: python main.py ./checkpoints/checkpoint_{iteration:06d}")
        print(f"{'='*60}\n")
    
    except Exception as e:
        print(f"\n{'='*60}")
        print(f"❌ TRAINING ERROR")
        print(f"{'='*60}")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        print(f"{'='*60}\n")
        import traceback
        traceback.print_exc()
        raise
    
    finally:
        # Cleanup
        trainer.stop()
        ray.shutdown()