// ==============================================================
// FILE: research/src/console-optimizer.js
// Browser Console Optimization for Long Training Sessions
// ==============================================================

/**
 * Console Optimizer
 *
 * Problem: During long training (100+ iterations), console logs accumulate
 * in browser memory causing slowdown and potential crashes.
 *
 * Solution: Override console methods to:
 * 1. Disable verbose logging during training
 * 2. Periodically clear console
 * 3. Keep critical error messages
 *
 * Usage:
 *   Import this file FIRST in your script.js:
 *   import './console-optimizer.js';
 */

class ConsoleOptimizer {
  constructor() {
    this.enabled = false;  // 🔴 SET TO false FOR TRAINING
    this.autoClearing = true;
    this.operationCount = 0;
    this.clearInterval = 500;  // Clear every 500 operations

    // Store original console methods
    this.originalConsole = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      info: console.info.bind(console),
      debug: console.debug.bind(console),
      clear: console.clear.bind(console),
    };

    this.install();
  }

  install() {
    const self = this;

    // Override console.log
    console.log = function(...args) {
      if (self.enabled) {
        self._checkAndClear();
        self.originalConsole.log(...args);
      }
    };

    // Override console.warn
    console.warn = function(...args) {
      if (self.enabled) {
        self._checkAndClear();
        self.originalConsole.warn(...args);
      }
    };

    // Override console.info
    console.info = function(...args) {
      if (self.enabled) {
        self._checkAndClear();
        self.originalConsole.info(...args);
      }
    };

    // Override console.debug
    console.debug = function(...args) {
      if (self.enabled) {
        self._checkAndClear();
        self.originalConsole.debug(...args);
      }
    };

    // console.error ALWAYS works (critical errors)
    console.error = function(...args) {
      self._checkAndClear();
      self.originalConsole.error(...args);
    };

    // Add new console methods
    console.milestone = function(...args) {
      self._checkAndClear();
      self.originalConsole.log('🎯', ...args);
    };

    console.critical = function(...args) {
      self._checkAndClear();
      self.originalConsole.error('🚨', ...args);
    };

    this.originalConsole.log('%c📝 Console Optimizer Installed', 'color: #4CAF50; font-weight: bold');
    this.originalConsole.log('%c   Verbose logging: ' + (this.enabled ? 'ENABLED' : 'DISABLED'), this.enabled ? 'color: green' : 'color: orange');
    this.originalConsole.log('%c   Auto-clearing: ' + (this.autoClearing ? 'ENABLED' : 'DISABLED'), this.autoClearing ? 'color: green' : 'color: orange');
  }

  _checkAndClear() {
    if (!this.autoClearing) return;

    this.operationCount++;
    if (this.operationCount >= this.clearInterval) {
      this.originalConsole.clear();
      this.originalConsole.log('🧹 Console auto-cleared (operation #' + this.operationCount + ')');
      this.operationCount = 0;
    }
  }

  enable() {
    this.enabled = true;
    this.originalConsole.log('✅ Verbose logging ENABLED');
  }

  disable() {
    this.enabled = false;
    this.originalConsole.log('⚠️ Verbose logging DISABLED (memory optimized for training)');
  }

  enableAutoClearing() {
    this.autoClearing = true;
    this.originalConsole.log('✅ Auto-clearing ENABLED');
  }

  disableAutoClearing() {
    this.autoClearing = false;
    this.originalConsole.log('⚠️ Auto-clearing DISABLED');
  }

  clear() {
    this.originalConsole.clear();
    this.operationCount = 0;
  }

  restore() {
    console.log = this.originalConsole.log;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.info = this.originalConsole.info;
    console.debug = this.originalConsole.debug;
    this.originalConsole.log('🔄 Console methods restored to original');
  }

  getStatus() {
    return {
      enabled: this.enabled,
      autoClearing: this.autoClearing,
      operationCount: this.operationCount,
      clearInterval: this.clearInterval
    };
  }
}

// Create and install optimizer
const optimizer = new ConsoleOptimizer();

// Expose to window for runtime control
if (typeof window !== 'undefined') {
  window.consoleOptimizer = optimizer;

  // Helper functions
  window.enableLogs = () => optimizer.enable();
  window.disableLogs = () => optimizer.disable();
  window.clearConsole = () => optimizer.clear();
  window.restoreConsole = () => optimizer.restore();

  console.log('');
  console.log('%c💡 Console Control Commands:', 'color: #2196F3; font-weight: bold');
  console.log('%c   window.enableLogs()     ', 'color: #888') + '- Enable all console logs';
  console.log('%c   window.disableLogs()    ', 'color: #888') + '- Disable verbose logs (training mode)';
  console.log('%c   window.clearConsole()   ', 'color: #888') + '- Manually clear console';
  console.log('%c   window.restoreConsole() ', 'color: #888') + '- Restore original console';
  console.log('');
}

export default optimizer;
