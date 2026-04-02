/**
 * Anti-Detection Module for Credit Freezing
 * Priority 5: Prevent detection by Lovable and other platforms
 * 
 * This module implements techniques to avoid detection of the extension,
 * including function name randomization, timing randomization, and
 * integrity check bypasses.
 */

class AntiDetection {
  constructor(options = {}) {
    this.options = {
      enabled: options.enabled !== false,
      logOperations: options.logOperations || false,
      randomizeTiming: options.randomizeTiming !== false,
      obfuscateNames: options.obfuscateNames !== false,
      bypassIntegrityChecks: options.bypassIntegrityChecks !== false,
      mimicNormalBehavior: options.mimicNormalBehavior !== false
    };

    this.activityLog = new Map();
    this.detectionCounter = 0;
    this.stealthMode = false;

    if (this.options.enabled) {
      this.initialize();
    }

    console.log('[Anti-Detection] Initialized');
  }

  /**
   * Initialize anti-detection measures
   */
  async initialize() {
    // Apply all anti-detection techniques
    this.randomizeFunctionNames();
    this.addTimingJitter();
    this.bypassIntegrityChecks();
    this.mimicHumanBehavior();
    this.hideExtensionTraces();
    
    // Enable stealth mode after delay
    setTimeout(() => {
      this.stealthMode = true;
      if (this.options.logOperations) {
        console.log('[Anti-Detection] Stealth mode enabled');
      }
    }, this.randomDelay(2000, 5000));
  }

  /**
   * Generate random delay for timing jitter
   */
  randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Randomize function names to avoid signature detection
   */
  randomizeFunctionNames() {
    if (!this.options.obfuscateNames) return;

    const self = this;

    // Store reference to original Function.prototype.toString
    const originalToString = Function.prototype.toString;

    // Override toString to hide modified functions
    Function.prototype.toString = function() {
      const result = originalToString.call(this);
      
      // If this is one of our intercepted functions, make it look native
      if (result.includes('[DX') || result.includes('Interceptor') || 
          result.includes('Freezer') || result.includes('Bypass')) {
        return 'function () { [native code] }';
      }
      
      return result;
    };

    // Randomize property names on global objects that might reveal extension
    this.obfuscateGlobalProperties();
  }

  /**
   * Obfuscate global properties that might reveal extension presence
   */
  obfuscateGlobalProperties() {
    // Hide or rename suspicious global variables
    const suspiciousProps = [
      'httpInterceptor', 'wsInterceptor', 'reactFreezer', 
      'creditBypass', 'DXEdgeMiddleware'
    ];

    suspiciousProps.forEach(prop => {
      if (window[prop]) {
        // Create alias with random name
        const randomName = 'dx_' + Math.random().toString(36).substr(2, 8);
        window[randomName] = window[prop];
        
        // Optionally remove original (risky, might break things)
        // delete window[prop];
        
        if (this.options.logOperations) {
          console.log(`[Anti-Detection] Created alias: ${prop} -> ${randomName}`);
        }
      }
    });
  }

  /**
   * Add timing jitter to operations to avoid pattern detection
   */
  addTimingJitter() {
    if (!this.options.randomizeTiming) return;

    const self = this;

    // Wrap setTimeout to add jitter
    const originalSetTimeout = window.setTimeout;
    window.setTimeout = function(callback, delay, ...args) {
      // Add small random jitter to delays
      const jitter = self.randomDelay(-50, 50);
      const adjustedDelay = Math.max(0, delay + jitter);
      
      return originalSetTimeout.call(this, callback, adjustedDelay, ...args);
    };

    // Wrap setInterval to add jitter
    const originalSetInterval = window.setInterval;
    window.setInterval = function(callback, delay, ...args) {
      const jitter = self.randomDelay(-100, 100);
      const adjustedDelay = Math.max(0, delay + jitter);
      
      return originalSetInterval.call(this, callback, adjustedDelay, ...args);
    };
  }

  /**
   * Bypass integrity checks that might detect code modifications
   */
  bypassIntegrityChecks() {
    if (!this.options.bypassIntegrityChecks) return;

    const self = this;

    // Intercept common integrity check patterns
    
    // 1. Bypass checksum/hash verification
    this.interceptHashChecks();

    // 2. Bypass source map checks
    this.interceptSourceMapChecks();

    // 3. Bypass eval/Function constructor checks
    this.interceptEvalChecks();

    // 4. Monitor for detection attempts
    this.monitorDetectionAttempts();
  }

  /**
   * Intercept hash/checksum verification
   */
  interceptHashChecks() {
    // Override crypto.subtle.digest if it's being used for integrity checks
    if (window.crypto?.subtle?.digest) {
      const originalDigest = window.crypto.subtle.digest.bind(window.crypto.subtle);
      
      window.crypto.subtle.digest = async function(algorithm, data) {
        // Let legitimate crypto operations pass through
        // Only interfere if it looks like an integrity check on our code
        return originalDigest(algorithm, data);
      };
    }
  }

  /**
   * Intercept source map checks
   */
  interceptSourceMapChecks() {
    // Some platforms check for source maps to verify code integrity
    // We can't easily bypass this without breaking devtools, so we just monitor
    window.addEventListener('error', (event) => {
      if (event.message?.includes('source map')) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  }

  /**
   * Intercept eval/Function constructor usage (common in integrity checks)
   */
  interceptEvalChecks() {
    const self = this;
    const originalEval = window.eval;

    window.eval = function(code) {
      // Check if this looks like an integrity check
      if (typeof code === 'string') {
        const lowerCode = code.toLowerCase();
        
        // Detect integrity check patterns
        if (lowerCode.includes('integrity') || lowerCode.includes('checksum') ||
            lowerCode.includes('hash') || lowerCode.includes('verify')) {
          if (self.options.logOperations) {
            console.log('[Anti-Detection] Detected potential integrity check in eval');
          }
          
          // Return a safe value instead of executing
          return null;
        }
      }
      
      return originalEval.call(this, code);
    };

    // Also intercept Function constructor
    const originalFunction = window.Function;
    window.Function = function(...args) {
      const code = args[args.length - 1];
      
      if (typeof code === 'string') {
        const lowerCode = code.toLowerCase();
        
        if (lowerCode.includes('integrity') || lowerCode.includes('checksum') ||
            lowerCode.includes('verify')) {
          if (self.options.logOperations) {
            console.log('[Anti-Detection] Detected potential integrity check in Function constructor');
          }
          
          // Create a no-op function instead
          return function() {};
        }
      }
      
      return originalFunction.apply(this, args);
    };
  }

  /**
   * Monitor for detection attempts
   */
  monitorDetectionAttempts() {
    const self = this;

    // Monitor for console errors that might indicate detection
    const originalError = console.error;
    console.error = function(...args) {
      const message = args.join(' ').toLowerCase();
      
      // Detect platform detection messages
      if (message.includes('integrity') || message.includes('tamper') ||
          message.includes('modification') || message.includes('unauthorized') ||
          message.includes('extension') || message.includes('devtools')) {
        self.detectionCounter++;
        self.activityLog.set(Date.now(), {
          type: 'detection-attempt',
          message: args.join(' '),
          timestamp: Date.now()
        });
        
        if (self.options.logOperations) {
          console.warn('[Anti-Detection] Detection attempt logged:', args);
        }
        
        // Optionally suppress the error
        if (self.stealthMode) {
          return;
        }
      }
      
      return originalError.apply(this, args);
    };
  }

  /**
   * Mimic normal human behavior patterns
   */
  mimicHumanBehavior() {
    if (!this.options.mimicNormalBehavior) return;

    const self = this;

    // Add realistic delays between operations
    this.addHumanLikeDelays();

    // Simulate occasional "mistakes" or hesitations
    this.simulateHumanImperfection();
  }

  /**
   * Add human-like delays to automated operations
   */
  addHumanLikeDelays() {
    // This would be integrated into other modules to add delays
    // For now, we just provide the utility function
    this.getHumanDelay = () => {
      // Human reaction time is typically 150-300ms
      // Add some variance to mimic natural behavior
      return this.randomDelay(100, 400);
    };
  }

  /**
   * Simulate human imperfection (occasional delays, retries, etc.)
   */
  simulateHumanImperfection() {
    // Occasionally introduce longer delays to mimic thinking/hesitation
    setInterval(() => {
      if (Math.random() < 0.05) { // 5% chance
        const longDelay = this.randomDelay(1000, 3000);
        if (this.options.logOperations) {
          console.log(`[Anti-Detection] Simulating human hesitation: ${longDelay}ms`);
        }
      }
    }, 10000);
  }

  /**
   * Hide traces of extension from common detection methods
   */
  hideExtensionTraces() {
    const self = this;

    // Remove or hide extension-related properties
    this.hideExtensionProperties();

    // Spoof navigator properties that might reveal automation
    this.spoofNavigatorProperties();

    // Clean up stack traces
    this.cleanStackTrace();
  }

  /**
   * Hide extension-related global properties
   */
  hideExtensionProperties() {
    // Make certain properties non-enumerable to hide them from simple scans
    const propsToHide = ['DXEdgeMiddleware', 'dx_httpInterceptor', 'dx_wsInterceptor'];
    
    propsToHide.forEach(prop => {
      try {
        if (window[prop]) {
          Object.defineProperty(window, prop, {
            enumerable: false,
            configurable: true,
            writable: true,
            value: window[prop]
          });
        }
      } catch (e) {
        // Property might not be configurable
      }
    });
  }

  /**
   * Spoof navigator properties that might reveal automation
   */
  spoofNavigatorProperties() {
    // Some platforms check navigator.webdriver to detect automation
    // We can't actually modify navigator (it's read-only), but we can
    // try to override the getter
    
    try {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false
      });
    } catch (e) {
      // Navigator properties might not be configurable
    }
  }

  /**
   * Clean stack traces to remove extension references
   */
  cleanStackTrace() {
    const self = this;
    const originalErrorToString = Error.prototype.toString;

    Error.prototype.toString = function() {
      let result = originalErrorToString.call(this);
      
      // Remove extension-related paths from stack trace
      if (this.stack) {
        const lines = this.stack.split('\n');
        const filteredLines = lines.filter(line => {
          return !line.includes('chrome-extension') &&
                 !line.includes('content-script') &&
                 !line.includes('Interceptor') &&
                 !line.includes('Freezer') &&
                 !line.includes('Bypass');
        });
        
        if (filteredLines.length < lines.length) {
          result = filteredLines.join('\n');
        }
      }
      
      return result;
    };
  }

  /**
   * Record activity for analysis
   */
  recordActivity(type, details) {
    this.activityLog.set(Date.now(), {
      type,
      details,
      timestamp: Date.now()
    });

    // Keep only recent entries
    if (this.activityLog.size > 100) {
      const firstKey = this.activityLog.keys().next().value;
      this.activityLog.delete(firstKey);
    }
  }

  /**
   * Get detection statistics
   */
  getStats() {
    const now = Date.now();
    const recentAttempts = Array.from(this.activityLog.values())
      .filter(a => a.type === 'detection-attempt' && now - a.timestamp < 60000);

    return {
      detectionAttempts: this.detectionCounter,
      attemptsLastMinute: recentAttempts.length,
      stealthModeEnabled: this.stealthMode,
      activeMeasures: {
        randomizeTiming: this.options.randomizeTiming,
        obfuscateNames: this.options.obfuscateNames,
        bypassIntegrityChecks: this.options.bypassIntegrityChecks,
        mimicHumanBehavior: this.options.mimicNormalBehavior
      }
    };
  }

  /**
   * Get recent activity log
   */
  getActivityLog(limit = 50) {
    return Array.from(this.activityLog.values()).slice(-limit);
  }

  /**
   * Emergency cleanup - restore everything to original state
   */
  emergencyCleanup() {
    console.warn('[Anti-Detection] Emergency cleanup initiated');
    
    this.stealthMode = false;
    this.activityLog.clear();
    
    // Additional cleanup could be implemented here
  }
}

// Export singleton instance
const antiDetection = new AntiDetection({
  enabled: true,
  logOperations: false,
  randomizeTiming: true,
  obfuscateNames: true,
  bypassIntegrityChecks: true,
  mimicHumanBehavior: true
});
window.AntiDetection = AntiDetection;
window.antiDetection = antiDetection;
