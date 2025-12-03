// ==============================================================
// FILE: research/src/ml/reward-system.js
// ==============================================================

import { NPC } from "../npc/config-npc-behavior.js";

export class RewardSystem {
  constructor(npcSystem, visionSystem, chunkManager) {
    this.npcSystem = npcSystem;
    this.visionSystem = visionSystem;
    this.chunkManager = chunkManager;

    this.REWARD_CONFIG = {
      TIME_PENALTY: -0.001,

      // 🔴 FIX: Reduce vision reward so catching becomes primary goal!
      // OLD: 0.1 × 240 steps = 24 points (too high!)
      // NEW: 0.01 × 240 steps = 2.4 points (bootstrap only)
      SEEKER_SEES_HIDER: 0.01,        // Reduced from 0.1 (10x weaker - vision is just a hint!)

      // 🔴 FIX: Increase catching rewards to be the PRIMARY goal
      // Catching should be worth 20-50x more than just watching!
      SEEKER_CAUGHT_HIDER: 50.0,      // Increased from 10.0 (5x stronger!)
      SEEKER_CAUGHT_ALL: 100.0,       // Increased from 20.0 (5x stronger!)
      SEEKER_CAUGHT_NONE: -10.0,      // Increased from -5.0 (2x stronger penalty)

      HIDER_SURVIVED: 50.0,          // Increased from 10.0 to match seeker catching reward
      HIDER_CAUGHT: -50.0,           // Increased from -10.0 to match penalty magnitude
      HIDER_HIDDEN: 0.2,             // Increased from 0.05 (4x stronger - combat increasing entropy!)
      HIDER_BEING_SEEN: -0.2,        // Increased from -0.05 (4x stronger penalty)
    };
  }

  calculateSeekerReward(npc, visionData) {
    let reward = 0;

    // Vision reward (helps bootstrap looking around)
    const hiders = visionData.visibleNPCs.filter((n) => n.role === "hider");
    if (hiders.length > 0) {
      reward += this.REWARD_CONFIG.SEEKER_SEES_HIDER;

      // NEW: Distance-based reward - encourage approaching visible hiders
      const closestHider = hiders.reduce((closest, hider) => {
        const dist = npc.position.distanceTo(hider.position);
        return dist < closest.dist ? { npc: hider, dist } : closest;
      }, { npc: null, dist: Infinity });

      if (closestHider.npc && closestHider.dist < 32) {
        // Reward inversely proportional to distance (closer = better)
        // Max reward 0.005 at distance 2, decays to 0 at distance 32
        // Reduced from 0.02 to match new vision reward scale
        const proximityReward = 0.005 * Math.max(0, (32 - closestHider.dist) / 30);
        reward += proximityReward;
      }
    }

    return reward;
  }

  calculateHiderReward(npc, visionData) {
    let reward = 0;

    const seekers = this.npcSystem.getNPCsByRole('seeker');
    const isBeingSeen = this.visionSystem.isVisibleToAny(npc, seekers);

    if (isBeingSeen) {
      reward += this.REWARD_CONFIG.HIDER_BEING_SEEN;
    } else {
      reward += this.REWARD_CONFIG.HIDER_HIDDEN;
    }

    // NEW: Distance-based reward - encourage staying far from seekers during seeking phase
    // This gives hiders a clearer gradient to follow
    if (seekers.length > 0) {
      const closestSeeker = seekers.reduce((closest, seeker) => {
        const dist = npc.position.distanceTo(seeker.position);
        return dist < closest.dist ? { npc: seeker, dist } : closest;
      }, { npc: null, dist: Infinity });

      if (closestSeeker.npc && closestSeeker.dist < 32) {
        // Reward proportional to distance (farther = better)
        // Max reward 0.01 at distance 32, decays to 0 at distance 2
        // Reduced from 0.05 to be more balanced (0.2 hidden + 0.01 distance = 0.21 total)
        const distanceReward = 0.01 * Math.max(0, (closestSeeker.dist - 2) / 30);
        reward += distanceReward;
      }
    }

    return reward;
  }

  applyEndOfEpisodeRewards(rewards, hideSeekManager) {
    const totalHiders = hideSeekManager.hiders?.length || 0;
    const hidersFound = hideSeekManager.hidersFound || 0;
    const allHidersFound = hidersFound === totalHiders;

    const seekers = hideSeekManager.seekers || [];
    const hiders = hideSeekManager.hiders || [];

    const caughtHiders = new Set();
    hiders.forEach((hider) => {
      if (hider.hideSeekState === NPC.GAME_STATES.FOUND) {
        caughtHiders.add(hider.userData.id);
      }
    });

    seekers.forEach((seeker) => {
      let bonus = 0;

      if (allHidersFound) {
        bonus = this.REWARD_CONFIG.SEEKER_CAUGHT_ALL;
      } else if (hidersFound > 0) {
        bonus = hidersFound * this.REWARD_CONFIG.SEEKER_CAUGHT_HIDER;
      } else {
        bonus = this.REWARD_CONFIG.SEEKER_CAUGHT_NONE;
      }

      const prevReward = rewards[seeker.userData.id] || 0;
      rewards[seeker.userData.id] = prevReward + bonus;
    });

    hiders.forEach((hider) => {
      let bonus = 0;

      if (caughtHiders.has(hider.userData.id)) {
        bonus = this.REWARD_CONFIG.HIDER_CAUGHT;
      } else {
        bonus = this.REWARD_CONFIG.HIDER_SURVIVED;
      }

      const prevReward = rewards[hider.userData.id] || 0;
      rewards[hider.userData.id] = prevReward + bonus;
    });
  }

  getDistanceToBoundary(position) {
    const worldSize = this.chunkManager?.worldConfig?.SIZE || 100;

    const distToNorth = position.z;
    const distToSouth = worldSize - position.z;
    const distToWest = position.x;
    const distToEast = worldSize - position.x;

    return Math.min(distToNorth, distToSouth, distToWest, distToEast);
  }

  resetEpisode() {
    // Clean slate each episode
  }
}

export default RewardSystem;
