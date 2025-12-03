// FILE: research/src/npc/config-npc-behavior.js

export const NPC = {
  PHYSICS: {
    JUMP_SPEED: 8.4,
    GRAVITY: 32.0,
    TERMINAL_VELOCITY: -78.4,

    WALK_SPEED: 4.3,
    SPRINT_SPEED: 6.5,
    SNEAK_SPEED: 1.3,

    PLAYER_WIDTH: 0.6,
    PLAYER_HEIGHT: 1.6,
  },

  VISION: {
    visionRange: 32,
    visionAngle: Math.PI * 0.6,
    rayCount: 64,
    rayAngleTolerance: 0.996,
    debug: false,
  },

  BLOCK_REMOVAL: {
    maxReachDistance: 5,
    maxBlocksRemoved: 0,
  },

  BLOCK_PLACEMENT: {
    maxReachDistance: 5,
    availableBlockTypes: [1, 2, 3, 4, 5],
    maxBlocksPlaced: 0,
  },

  HIDE_AND_SEEK: {
    seekerCount: 1,
    hiderCount: 2,

    // 🔴 CRITICAL FIX: Precise timing for 240 max_steps
    // Each RL step = 5 physics frames @ 60 FPS = 83.33ms
    // 240 steps × 83.33ms = 20,000ms total episode time
    // Countdown short, most time for seeking!
    countdownTime: 3000,   // 3 seconds prep (36 steps) - hiders hide quickly
    gameTimeLimit: 17000,  // 17 seconds seeking (204 steps) - seeker has most of the time

    SEEKER: {
      detectionTime: 500, // 1 second to catch - more forgiving
      visualIndicatorColor: 0xff4444,
    },

    HIDER: {
      visualIndicatorColor: 0x44ff44,
    },
  },

  GAME_STATES: {
    WAITING: "waiting",
    COUNTDOWN: "countdown",
    SEEKING: "seeking",
    FOUND: "found",
    HIDDEN: "hidden",
    FLEEING: "fleeing",
    GAME_OVER: "game_over",
  },

  VISUALS: {
    showNPCStatus: true,
    showVisionCones: false,
    showHidingSpots: false,
    effectDuration: 1000,
  },

  TRAINING: {
    enabled: true,
    debug: false,

    MODEL: {
      stateSize: 161,
    },
  },
};
