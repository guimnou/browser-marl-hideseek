// ==============================================================
// FILE: research/src/utils/logger.js
// Optimized logging system for long training sessions
// ==============================================================

/**
 * Lightweight logging wrapper that can be disabled for production/training
 *
 * Benefits:
 * - Prevents console log accumulation during long training (memory leak)
 * - Can toggle logging on/off without code changes
 * - Still logs critical errors even when disabled
 * - Periodic console clearing to prevent browser slowdown
 */

class TrainingLogger {
  constructor() {
    // 🔴 PRODUCTION MODE: Disable verbose logging during training
    this.enabled = false;  // Set to true for debugging, false for training
    this.errorLoggingEnabled = true;  // Always log errors
    this.logCount = 0;
    this.maxLogsBeforeClear = 1000;  // Clear console every 1000 logs

    // Bind methods
    this.log = this.log.bind(this);
    this.warn = this.warn.bind(this);
    this.error = this.error.bind(this);
    this.info = this.info.bind(this);
    this.debug = this.debug.bind(this);
  }

  /**
   * Enable/disable logging globally
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log(`🔧 Training Logger: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Regular log (disabled in training mode)
   */
  log(...args) {
    if (!this.enabled) return;
    this._checkAndClear();
    console.log(...args);
  }

  /**
   * Warning (disabled in training mode, but counted)
   */
  warn(...args) {
    if (!this.enabled) return;
    this._checkAndClear();
    console.warn(...args);
  }

  /**
   * Error (ALWAYS logged, even in training mode)
   */
  error(...args) {
    if (!this.errorLoggingEnabled) return;
    this._checkAndClear();
    console.error('❌ ERROR:', ...args);
  }

  /**
   * Info (disabled in training mode)
   */
  info(...args) {
    if (!this.enabled) return;
    this._checkAndClear();
    console.info(...args);
  }

  /**
   * Debug (disabled in training mode)
   */
  debug(...args) {
    if (!this.enabled) return;
    this._checkAndClear();
    console.debug(...args);
  }

  /**
   * Critical message (ALWAYS logged with special formatting)
   */
  critical(...args) {
    this._checkAndClear();
    console.error('🚨 CRITICAL:', ...args);
  }

  /**
   * Periodic console clearing to prevent memory buildup
   */
  _checkAndClear() {
    this.logCount++;

    if (this.logCount >= this.maxLogsBeforeClear) {
      console.clear();
      console.log('🧹 Console cleared (prevent memory buildup)');
      this.logCount = 0;
    }
  }

  /**
   * Force clear console
   */
  clear() {
    console.clear();
    this.logCount = 0;
  }

  /**
   * Get current settings
   */
  getStatus() {
    return {
      enabled: this.enabled,
      errorLoggingEnabled: this.errorLoggingEnabled,
      logCount: this.logCount,
      maxLogsBeforeClear: this.maxLogsBeforeClear
    };
  }
}

// Create singleton instance
const logger = new TrainingLogger();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  window.trainingLogger = logger;

  // Add helper functions to window
  window.enableLogs = () => logger.setEnabled(true);
  window.disableLogs = () => logger.setEnabled(false);
  window.clearLogs = () => logger.clear();

  console.log('📝 Training Logger initialized');
  console.log('   Usage: window.enableLogs() / window.disableLogs()');
  console.log('   Status: Logging is ' + (logger.enabled ? 'ENABLED' : 'DISABLED'));
}

export default logger;
