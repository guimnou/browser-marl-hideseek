// ==============================================================
// FILE: research/src/config-logging.js
// Global logging configuration for training optimization
// ==============================================================

/**
 * Logging Configuration
 *
 * During long training sessions (100+ iterations), browser console logs
 * can accumulate and cause memory issues. This config allows you to
 * disable verbose logging while keeping critical error messages.
 *
 * Toggle this during training vs debugging:
 * - Training: VERBOSE_LOGGING = false (memory optimized)
 * - Debugging: VERBOSE_LOGGING = true (full logs)
 */

export const LOGGING_CONFIG = {
  // 🔴 TOGGLE THIS: Set to false for long training sessions
  VERBOSE_LOGGING: false,  // Disable verbose logs during training

  // Always log errors (even in production)
  ERROR_LOGGING: true,

  // Always log critical training milestones
  MILESTONE_LOGGING: true,

  // Periodic console clearing (prevent memory buildup)
  AUTO_CLEAR_CONSOLE: true,
  CLEAR_INTERVAL: 1000,  // Clear every 1000 operations

  // Component-specific logging (can be toggled individually)
  COMPONENTS: {
    TRAINING_BRIDGE: false,   // PPO training loop logs
    NPC_SYSTEM: false,         // NPC creation/removal logs
    VISION_SYSTEM: false,      // Vision raycasting logs
    PHYSICS: false,            // Physics simulation logs
    TERRAIN: false,            // Terrain generation logs
    REWARDS: false,            // Reward calculation logs
    UI: false,                 // UI update logs
    WEBSOCKET: false,          // WebSocket communication logs
  }
};

/**
 * Console log wrapper - respects logging configuration
 */
class ConsoleLogger {
  constructor() {
    this.operationCount = 0;
  }

  /**
   * Verbose log (disabled during training)
   */
  log(...args) {
    if (!LOGGING_CONFIG.VERBOSE_LOGGING) return;
    this._checkClear();
    console.log(...args);
  }

  /**
   * Warning (disabled during training)
   */
  warn(...args) {
    if (!LOGGING_CONFIG.VERBOSE_LOGGING) return;
    this._checkClear();
    console.warn(...args);
  }

  /**
   * Error (ALWAYS logged)
   */
  error(...args) {
    if (!LOGGING_CONFIG.ERROR_LOGGING) return;
    this._checkClear();
    console.error('❌', ...args);
  }

  /**
   * Critical milestone (ALWAYS logged)
   */
  milestone(...args) {
    if (!LOGGING_CONFIG.MILESTONE_LOGGING) return;
    this._checkClear();
    console.log('🎯', ...args);
  }

  /**
   * Component-specific logging
   */
  component(componentName, ...args) {
    if (!LOGGING_CONFIG.COMPONENTS[componentName]) return;
    this._checkClear();
    console.log(`[${componentName}]`, ...args);
  }

  /**
   * Periodic console clearing
   */
  _checkClear() {
    if (!LOGGING_CONFIG.AUTO_CLEAR_CONSOLE) return;

    this.operationCount++;
    if (this.operationCount >= LOGGING_CONFIG.CLEAR_INTERVAL) {
      console.clear();
      console.log('🧹 Console auto-cleared (prevent memory buildup)');
      this.operationCount = 0;
    }
  }

  /**
   * Manual clear
   */
  clear() {
    console.clear();
    this.operationCount = 0;
  }
}

// Singleton instance
export const logger = new ConsoleLogger();

// Expose to window for runtime control
if (typeof window !== 'undefined') {
  window.LOGGING_CONFIG = LOGGING_CONFIG;
  window.logger = logger;

  // Helper functions
  window.enableVerboseLogs = () => {
    LOGGING_CONFIG.VERBOSE_LOGGING = true;
    console.log('✅ Verbose logging ENABLED');
  };

  window.disableVerboseLogs = () => {
    LOGGING_CONFIG.VERBOSE_LOGGING = false;
    console.log('⚠️ Verbose logging DISABLED (memory optimized)');
  };

  window.enableComponentLog = (component) => {
    if (LOGGING_CONFIG.COMPONENTS[component] !== undefined) {
      LOGGING_CONFIG.COMPONENTS[component] = true;
      console.log(`✅ ${component} logging ENABLED`);
    }
  };

  window.disableComponentLog = (component) => {
    if (LOGGING_CONFIG.COMPONENTS[component] !== undefined) {
      LOGGING_CONFIG.COMPONENTS[component] = false;
      console.log(`⚠️ ${component} logging DISABLED`);
    }
  };

  window.clearConsoleLogs = () => {
    logger.clear();
    console.log('🧹 Console manually cleared');
  };

  // Log initial status
  console.log('📝 Logging Configuration:');
  console.log('   Verbose Logging:', LOGGING_CONFIG.VERBOSE_LOGGING ? '✅ ENABLED' : '⚠️ DISABLED');
  console.log('   Auto Clear:', LOGGING_CONFIG.AUTO_CLEAR_CONSOLE ? '✅ ENABLED' : '⚠️ DISABLED');
  console.log('');
  console.log('💡 Runtime Control:');
  console.log('   window.enableVerboseLogs()  - Enable all logs');
  console.log('   window.disableVerboseLogs() - Disable verbose logs (training mode)');
  console.log('   window.clearConsoleLogs()   - Manually clear console');
}

export default logger;
