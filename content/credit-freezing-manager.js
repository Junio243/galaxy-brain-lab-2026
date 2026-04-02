/**
 * Credit Freezing Manager - Unified Controller
 * Priority: Coordinates all credit freezing modules
 * 
 * This module provides a unified interface to manage all credit freezing
 * functionality, including HTTP interception, WebSocket mutation, React
 * state freezing, check bypasses, and anti-detection.
 */

import { httpInterceptor, HTTPResponseInterceptor } from './http-interceptor.js';
import { wsInterceptor, WebSocketInterceptor } from './websocket-interceptor.js';
import { reactFreezer, ReactStateFreezer } from './react-state-freezer.js';
import { creditBypass, CreditCheckBypass } from './credit-check-bypass.js';
import { antiDetection, AntiDetection } from './anti-detection.js';

export class CreditFreezingManager {
  constructor(options = {}) {
    this.options = {
      enabled: options.enabled !== false,
      logOperations: options.logOperations || false,
      fakeCreditsRemaining: options.fakeCreditsRemaining || 999999,
      autoStart: options.autoStart !== false,
      
      // Module-specific overrides
      httpInterceptor: options.httpInterceptor || {},
      wsInterceptor: options.wsInterceptor || {},
      reactFreezer: options.reactFreezer || {},
      creditBypass: options.creditBypass || {},
      antiDetection: options.antiDetection || {}
    };

    this.modules = {
      http: null,
      ws: null,
      react: null,
      bypass: null,
      antiDetection: null
    };

    this.state = {
      initialized: false,
      running: false,
      frozenCredits: this.options.fakeCreditsRemaining,
      lastSync: null
    };

    if (this.options.autoStart) {
      this.initialize();
    }
  }

  /**
   * Initialize all credit freezing modules
   */
  async initialize() {
    if (this.state.initialized) {
      console.log('[Credit Freezing Manager] Already initialized');
      return;
    }

    console.log('[Credit Freezing Manager] Initializing...');

    try {
      // Initialize HTTP Response Interceptor (Priority 1)
      this.modules.http = new HTTPResponseInterceptor({
        enabled: true,
        logInterceptions: this.options.logOperations,
        fakeCreditsRemaining: this.options.fakeCreditsRemaining,
        persistInStorage: true,
        ...this.options.httpInterceptor
      });

      // Initialize WebSocket Interceptor with mutation (Priority 2)
      this.modules.ws = new WebSocketInterceptor({
        logFrames: this.options.logOperations,
        analyzeQuota: true,
        detectPatterns: true,
        mutatePayloads: true, // Enable payload mutation
        fakeCreditsRemaining: this.options.fakeCreditsRemaining,
        ...this.options.wsInterceptor
      });

      // Initialize React State Freezer (Priority 3)
      this.modules.react = new ReactStateFreezer({
        enabled: true,
        logOperations: this.options.logOperations,
        fakeCreditsRemaining: this.options.fakeCreditsRemaining,
        syncInterval: 1000,
        ...this.options.reactFreezer
      });

      // Initialize Credit Check Bypass (Priority 4)
      this.modules.bypass = new CreditCheckBypass({
        enabled: true,
        logOperations: this.options.logOperations,
        bypassAllChecks: true,
        randomizeBehavior: true,
        ...this.options.creditBypass
      });

      // Initialize Anti-Detection (Priority 5)
      this.modules.antiDetection = new AntiDetection({
        enabled: true,
        logOperations: this.options.logOperations,
        randomizeTiming: true,
        obfuscateNames: true,
        bypassIntegrityChecks: true,
        mimicHumanBehavior: true,
        ...this.options.antiDetection
      });

      this.state.initialized = true;
      this.state.lastSync = Date.now();

      console.log('[Credit Freezing Manager] All modules initialized successfully');
      console.log('[Credit Freezing Manager] Fake credits set to:', this.options.fakeCreditsRemaining);

      // Setup cross-module synchronization
      this.setupModuleSync();

    } catch (error) {
      console.error('[Credit Freezing Manager] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Setup synchronization between modules
   */
  setupModuleSync() {
    // Sync credit state across all modules periodically
    setInterval(() => {
      this.syncModules();
    }, 2000);

    // Listen for credit updates from any module and propagate
    if (this.modules.http) {
      // HTTP interceptor doesn't emit events, but we can poll
    }

    if (this.modules.ws) {
      this.modules.ws.on('quota-update', (data) => {
        if (this.options.logOperations) {
          console.log('[Credit Freezing Manager] WS quota update intercepted:', data);
        }
        this.updateAllModules();
      });
    }
  }

  /**
   * Sync credit state across all modules
   */
  syncModules() {
    const targetState = {
      creditsSpent: 0,
      creditsRemaining: this.options.fakeCreditsRemaining,
      usage: { cost: 0, spent: 0 },
      quota: { remaining: this.options.fakeCreditsRemaining }
    };

    // Update each module's state
    if (this.modules.http?.updateCreditState) {
      this.modules.http.updateCreditState(targetState);
    }

    if (this.modules.ws?.updateCreditState) {
      this.modules.ws.updateCreditState(targetState);
    }

    if (this.modules.react?.updateCreditState) {
      this.modules.react.updateCreditState(targetState);
    }

    this.state.lastSync = Date.now();
    this.state.frozenCredits = this.options.fakeCreditsRemaining;
  }

  /**
   * Force update all modules with current state
   */
  updateAllModules() {
    this.syncModules();
  }

  /**
   * Get comprehensive status of all modules
   */
  getStatus() {
    return {
      state: { ...this.state },
      modules: {
        http: this.modules.http?.getState?.() || null,
        ws: this.modules.ws?.getState?.() || null,
        react: this.modules.react?.getState?.() || null,
        bypass: this.modules.bypass?.getStats?.() || null,
        antiDetection: this.modules.antiDetection?.getStats?.() || null
      },
      summary: {
        initialized: this.state.initialized,
        running: this.state.running,
        frozenCredits: this.state.frozenCredits,
        lastSync: this.state.lastSync,
        modulesActive: Object.values(this.modules).filter(m => m !== null).length
      }
    };
  }

  /**
   * Export all research/debugging data
   */
  exportData() {
    return {
      timestamp: Date.now(),
      managerState: this.state,
      httpInterceptor: this.modules.http?.exportData?.() || null,
      wsInterceptor: this.modules.ws?.exportData?.() || null,
      reactFreezer: {
        state: this.modules.react?.getState?.(),
        frozenCount: this.modules.react?.getFrozenCount?.() || 0
      },
      creditBypass: this.modules.bypass?.getStats?.() || null,
      antiDetection: {
        stats: this.modules.antiDetection?.getStats?.(),
        recentActivity: this.modules.antiDetection?.getActivityLog?.(50) || []
      }
    };
  }

  /**
   * Download all data as JSON file
   */
  downloadData() {
    const data = this.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credit-freeze-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Reset all modules to initial state
   */
  reset() {
    console.log('[Credit Freezing Manager] Resetting all modules...');

    if (this.modules.http?.reset) {
      this.modules.http.reset();
    }

    if (this.modules.ws?.clear) {
      this.modules.ws.clear();
    }

    if (this.modules.react?.destroy) {
      this.modules.react.destroy();
    }

    if (this.modules.bypass?.restore) {
      this.modules.bypass.restore();
    }

    this.state.lastSync = Date.now();
    this.syncModules();

    console.log('[Credit Freezing Manager] Reset complete');
  }

  /**
   * Pause all modules (temporarily disable interception)
   */
  pause() {
    console.log('[Credit Freezing Manager] Pausing...');
    this.state.running = false;
    
    // Note: We don't actually disable the interceptors here
    // as re-enabling them is complex. This is more of a state flag.
  }

  /**
   * Resume all modules
   */
  resume() {
    console.log('[Credit Freezing Manager] Resuming...');
    this.state.running = true;
    this.syncModules();
  }

  /**
   * Update fake credit value
   */
  setFakeCredits(amount) {
    this.options.fakeCreditsRemaining = amount;
    this.state.frozenCredits = amount;
    this.syncModules();
    console.log('[Credit Freezing Manager] Updated fake credits to:', amount);
  }

  /**
   * Get singleton instance (for backward compatibility)
   */
  static getInstance(options = {}) {
    if (!this.instance) {
      this.instance = new CreditFreezingManager(options);
    }
    return this.instance;
  }
}

// Create and export singleton instance
export const creditFreezingManager = new CreditFreezingManager({
  enabled: true,
  logOperations: false,
  fakeCreditsRemaining: 999999,
  autoStart: true
});

// Also expose on window for debugging
if (typeof window !== 'undefined') {
  window.CreditFreezingManager = creditFreezingManager;
}
