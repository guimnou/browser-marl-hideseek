"""
FILE: backend/python-rl/metrics_tracker.py
"""

import os
import json
import numpy as np
from pathlib import Path
from datetime import datetime
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')


class MetricsTracker:
    """Handles all metrics tracking, plotting, and analysis"""
    
    def __init__(self, checkpoint_dir):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        self.metrics_history = []
        self._load_existing_metrics()
    
    def _load_existing_metrics(self):
        """Load existing metrics if continuing training"""
        metrics_file = self.checkpoint_dir / "metrics_history.json"
        if metrics_file.exists():
            try:
                with open(metrics_file, 'r') as f:
                    self.metrics_history = json.load(f)
                print(f"📊 Loaded {len(self.metrics_history)} previous metrics entries")
            except Exception as e:
                print(f"⚠️  Could not load existing metrics: {e}")
    
    def extract_metrics(self, result, iteration, episodes_this_iter, total_episodes, max_steps):
        """Extract all relevant metrics from Ray result"""
        env_runners_stats = result.get('env_runners', {})
        episode_len_mean = env_runners_stats.get('episode_len_mean', 0)
        episode_reward_mean = env_runners_stats.get('episode_reward_mean', 0)
        
        # Extract policy-specific metrics
        info = result.get('info', {})
        learner_info = info.get('learner', {})
        
        seeker_kl = 0
        hider_kl = 0
        seeker_entropy = 0
        hider_entropy = 0
        seeker_loss = 0
        hider_loss = 0
        seeker_vf_loss = 0
        hider_vf_loss = 0
        
        if 'seeker_policy' in learner_info:
            seeker_stats = learner_info['seeker_policy'].get('learner_stats', {})
            seeker_kl = seeker_stats.get('kl', 0)
            seeker_entropy = seeker_stats.get('entropy', 0)
            seeker_loss = seeker_stats.get('total_loss', 0)
            seeker_vf_loss = seeker_stats.get('vf_loss', 0)
        
        if 'hider_policy' in learner_info:
            hider_stats = learner_info['hider_policy'].get('learner_stats', {})
            hider_kl = hider_stats.get('kl', 0)
            hider_entropy = hider_stats.get('entropy', 0)
            hider_loss = hider_stats.get('total_loss', 0)
            hider_vf_loss = hider_stats.get('vf_loss', 0)
        
        metrics = {
            'iteration': iteration,
            'timestamp': datetime.now().isoformat(),
            'episode_len_mean': episode_len_mean,
            'episode_reward_mean': episode_reward_mean,
            'episodes_this_iter': episodes_this_iter,
            'total_episodes': total_episodes,
            'max_steps': max_steps,
            'seeker_kl': seeker_kl,
            'hider_kl': hider_kl,
            'seeker_entropy': seeker_entropy,
            'hider_entropy': hider_entropy,
            'seeker_loss': seeker_loss,
            'hider_loss': hider_loss,
            'seeker_vf_loss': seeker_vf_loss,
            'hider_vf_loss': hider_vf_loss,
        }
        
        self.metrics_history.append(metrics)
        return metrics
    
    def save_metrics(self):
        """Save metrics history to JSON"""
        metrics_file = self.checkpoint_dir / "metrics_history.json"
        with open(metrics_file, 'w') as f:
            json.dump(self.metrics_history, f, indent=2)
    
    def log_progress(self, metrics):
        """Print formatted progress update"""
        print(f"\n{'─'*60}")
        print(f"📊 Iteration {metrics['iteration']} Progress:")
        print(f"{'─'*60}")
        print(f"Episodes: {metrics['total_episodes']} ({metrics['episodes_this_iter']} this iter)")
        print(f"Episode Length: {metrics['episode_len_mean']:.1f} steps")
        print(f"Episode Reward: {metrics['episode_reward_mean']:.2f}")
        print(f"\nSeeker Policy:")
        print(f"  KL Divergence: {metrics['seeker_kl']:.6f}")
        print(f"  Entropy: {metrics['seeker_entropy']:.4f}")
        print(f"  Loss: {metrics['seeker_loss']:.4f}")
        print(f"  VF Loss: {metrics['seeker_vf_loss']:.4f}")
        print(f"\nHider Policy:")
        print(f"  KL Divergence: {metrics['hider_kl']:.6f}")
        print(f"  Entropy: {metrics['hider_entropy']:.4f}")
        print(f"  Loss: {metrics['hider_loss']:.4f}")
        print(f"  VF Loss: {metrics['hider_vf_loss']:.4f}")
        print(f"{'─'*60}\n")
    
    def generate_plots(self, iteration):
        """Generate comprehensive training plots"""
        if not self.metrics_history:
            return

        # 🔴 FIX: Only plot recent data to avoid slowdown
        # Plot last 200 iterations max (configurable)
        max_points_to_plot = 200
        if len(self.metrics_history) > max_points_to_plot:
            plot_data = self.metrics_history[-max_points_to_plot:]
            print(f"📊 Plotting last {max_points_to_plot} of {len(self.metrics_history)} iterations")
        else:
            plot_data = self.metrics_history

        fig, axes = plt.subplots(4, 2, figsize=(16, 16))
        fig.suptitle(f'Training Metrics - Iteration {iteration}', fontsize=16, fontweight='bold')

        iterations = [m['iteration'] for m in plot_data]
        
        # 1. Episode Length Over Time
        ax = axes[0, 0]
        episode_lengths = [m['episode_len_mean'] for m in plot_data]
        ax.plot(iterations, episode_lengths, 'b-', linewidth=2, label='Episode Length')
        ax.fill_between(iterations, episode_lengths, alpha=0.3)
        if plot_data:
            max_steps = plot_data[0]['max_steps']
            ax.axhline(y=max_steps, color='red', linestyle='--', alpha=0.5, label=f'Max ({max_steps})')
        ax.set_xlabel('Iteration')
        ax.set_ylabel('Steps')
        ax.set_title('Episode Length (Lower = Better)')
        ax.grid(True, alpha=0.3)
        ax.legend()

        # 2. Episode Reward Over Time
        ax = axes[0, 1]
        rewards = [m['episode_reward_mean'] for m in plot_data]
        ax.plot(iterations, rewards, 'g-', linewidth=2, label='Mean Reward')
        ax.fill_between(iterations, rewards, alpha=0.3, color='green')
        ax.set_xlabel('Iteration')
        ax.set_ylabel('Reward')
        ax.set_title('Episode Reward')
        ax.grid(True, alpha=0.3)
        ax.legend()

        # 3. Episodes Per Iteration
        ax = axes[1, 0]
        episodes_per_iter = [m['episodes_this_iter'] for m in plot_data]
        ax.plot(iterations, episodes_per_iter, 'purple', linewidth=2)
        ax.fill_between(iterations, episodes_per_iter, alpha=0.3, color='purple')
        ax.set_xlabel('Iteration')
        ax.set_ylabel('Episodes')
        ax.set_title('Episodes Per Iteration')
        ax.grid(True, alpha=0.3)

        # 4. Cumulative Episodes
        ax = axes[1, 1]
        total_episodes = [m['total_episodes'] for m in plot_data]
        ax.plot(iterations, total_episodes, 'orange', linewidth=2)
        ax.fill_between(iterations, total_episodes, alpha=0.3, color='orange')
        ax.set_xlabel('Iteration')
        ax.set_ylabel('Total Episodes')
        ax.set_title('Cumulative Episodes')
        ax.grid(True, alpha=0.3)

        # 5. KL Divergence - Both Policies
        ax = axes[2, 0]
        seeker_kl = [m['seeker_kl'] for m in plot_data]
        hider_kl = [m['hider_kl'] for m in plot_data]
        ax.plot(iterations, seeker_kl, 'r-', linewidth=2, label='Seeker', alpha=0.8)
        ax.plot(iterations, hider_kl, 'g-', linewidth=2, label='Hider', alpha=0.8)
        ax.axhline(y=0.01, color='orange', linestyle='--', alpha=0.7, label='Target (0.01)')
        ax.set_xlabel('Iteration')
        ax.set_ylabel('KL Divergence')
        ax.set_title('Policy Stability (KL Divergence)')
        ax.grid(True, alpha=0.3)
        ax.legend()
        ax.set_yscale('log')

        # 6. Entropy - Both Policies
        ax = axes[2, 1]
        seeker_entropy = [m['seeker_entropy'] for m in plot_data]
        hider_entropy = [m['hider_entropy'] for m in plot_data]
        ax.plot(iterations, seeker_entropy, 'r-', linewidth=2, label='Seeker', alpha=0.8)
        ax.plot(iterations, hider_entropy, 'g-', linewidth=2, label='Hider', alpha=0.8)
        ax.set_xlabel('Iteration')
        ax.set_ylabel('Entropy')
        ax.set_title('Policy Entropy (Exploration)')
        ax.grid(True, alpha=0.3)
        ax.legend()

        # 7. Total Loss - Both Policies
        ax = axes[3, 0]
        seeker_loss = [m['seeker_loss'] for m in plot_data]
        hider_loss = [m['hider_loss'] for m in plot_data]
        ax.plot(iterations, seeker_loss, 'r-', linewidth=2, label='Seeker', alpha=0.8)
        ax.plot(iterations, hider_loss, 'g-', linewidth=2, label='Hider', alpha=0.8)
        ax.set_xlabel('Iteration')
        ax.set_ylabel('Loss')
        ax.set_title('Total Policy Loss')
        ax.grid(True, alpha=0.3)
        ax.legend()

        # 8. Value Function Loss - Both Policies
        ax = axes[3, 1]
        seeker_vf_loss = [m['seeker_vf_loss'] for m in plot_data]
        hider_vf_loss = [m['hider_vf_loss'] for m in plot_data]
        ax.plot(iterations, seeker_vf_loss, 'r-', linewidth=2, label='Seeker', alpha=0.8)
        ax.plot(iterations, hider_vf_loss, 'g-', linewidth=2, label='Hider', alpha=0.8)
        ax.set_xlabel('Iteration')
        ax.set_ylabel('VF Loss')
        ax.set_title('Value Function Loss')
        ax.grid(True, alpha=0.3)
        ax.legend()
        
        plt.tight_layout()

        # Save plot
        plot_path = self.checkpoint_dir / f'training_metrics_iter_{iteration}.png'
        plt.savefig(plot_path, dpi=150, bbox_inches='tight')

        # 🔴 FIX: Explicit cleanup to prevent memory leaks
        plt.close('all')
        fig.clear()
        del fig, axes

        print(f"📊 Plot saved: {plot_path}")
    
    def generate_summary(self):
        """Generate training summary statistics"""
        if not self.metrics_history:
            return {}
        
        recent_window = min(20, len(self.metrics_history))
        recent = self.metrics_history[-recent_window:]
        latest = self.metrics_history[-1]
        
        summary = {
            'total_iterations': len(self.metrics_history),
            'total_episodes': latest['total_episodes'],
            'final_episode_length': latest['episode_len_mean'],
            'final_episode_reward': latest['episode_reward_mean'],
            'avg_episode_length_recent': np.mean([m['episode_len_mean'] for m in recent]),
            'avg_episode_reward_recent': np.mean([m['episode_reward_mean'] for m in recent]),
            'seeker_final_kl': latest['seeker_kl'],
            'hider_final_kl': latest['hider_kl'],
            'seeker_final_entropy': latest['seeker_entropy'],
            'hider_final_entropy': latest['hider_entropy'],
        }
        
        summary_file = self.checkpoint_dir / "training_summary.json"
        with open(summary_file, 'w') as f:
            json.dump(summary, f, indent=2)
        
        return summary
    
    def print_summary(self):
        """Print formatted training summary"""
        summary = self.generate_summary()
        
        if not summary:
            return
        
        print(f"\n{'='*60}")
        print(f"📊 TRAINING SUMMARY")
        print(f"{'='*60}")
        print(f"Total Iterations: {summary['total_iterations']}")
        print(f"Total Episodes: {summary['total_episodes']}")
        print(f"\nFinal Metrics:")
        print(f"  Episode Length: {summary['final_episode_length']:.1f} steps")
        print(f"  Episode Reward: {summary['final_episode_reward']:.2f}")
        print(f"\nRecent Performance (last 20 iterations):")
        print(f"  Avg Episode Length: {summary['avg_episode_length_recent']:.1f} steps")
        print(f"  Avg Episode Reward: {summary['avg_episode_reward_recent']:.2f}")
        print(f"\nPolicy Stability:")
        print(f"  Seeker KL: {summary['seeker_final_kl']:.6f}")
        print(f"  Hider KL: {summary['hider_final_kl']:.6f}")
        print(f"\nExploration:")
        print(f"  Seeker Entropy: {summary['seeker_final_entropy']:.4f}")
        print(f"  Hider Entropy: {summary['hider_final_entropy']:.4f}")
        print(f"{'='*60}\n")