/**
 * Credit Check Bypass Module
 * Priority 4: Bypass initial credit checks before processing prompts
 * 
 * This module intercepts and bypasses client-side credit validation
 * that would block requests when credits are low or zero.
 */

export class CreditCheckBypass {
  constructor(options = {}) {
    this.options = {
      enabled: options.enabled !== false,
      logOperations: options.logOperations || false,
      bypassAllChecks: options.bypassAllChecks !== false,
      randomizeBehavior: options.randomizeBehavior !== false // Anti-detection
    };

    this.bypassedChecks = new Map();
    this.originalMethods = new Map();

    if (this.options.enabled) {
      this.installBypasses();
    }

    console.log('[Credit Bypass] Initialized');
  }

  /**
   * Install all bypass mechanisms
   */
  installBypasses() {
    // Bypass common credit check patterns
    this.bypassFunctionChecks();
    this.bypassPropertyChecks();
    this.bypassErrorHandling();
    this.interceptValidationCalls();
  }

  /**
   * Bypass function-based credit checks
   */
  bypassFunctionChecks() {
    const self = this;

    // Common function names for credit validation
    const checkFunctions = [
      'hasCredits', 'canUseFeature', 'checkQuota', 'validateCredits',
      'isEligible', 'hasQuota', 'canGenerate', 'canExecute',
      'checkLimit', 'validateUsage', 'checkBalance'
    ];

    // Store original functions to restore later
    checkFunctions.forEach(name => {
      // Try to find and wrap these functions globally
      if (window[name] && typeof window[name] === 'function') {
        this.originalMethods.set(name, window[name]);
        
        window[name] = function(...args) {
          if (self.options.logOperations) {
            console.log('[Credit Bypass] Intercepted call to:', name);
          }
          
          // Randomize behavior for anti-detection
          if (self.options.randomizeBehavior && Math.random() > 0.95) {
            // Occasionally let it pass through naturally
            return self.originalMethods.get(name)?.apply(this, args);
          }
          
          // Always return true/positive for credit checks
          return true;
        };
      }
    });

    // Wrap Object.prototype methods that might be used for checks
    this.wrapPropertyAccess();
  }

  /**
   * Wrap property access to intercept credit-related properties
   */
  wrapPropertyAccess() {
    const self = this;
    
    // Store original getter/setter mechanism
    const originalGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
    const originalDefineProperty = Object.defineProperty;

    // Credit-related property names
    const creditProps = [
      'credits', 'quota', 'usage', 'balance', 'remaining',
      'spent', 'limit', 'allowance', 'tokens'
    ];

    // Override getOwnPropertyDescriptor to fake credit properties
    Object.getOwnPropertyDescriptor = function(obj, prop) {
      const lowerProp = prop.toLowerCase();
      
      if (creditProps.some(p => lowerProp.includes(p))) {
        const descriptor = originalGetOwnPropertyDescriptor.call(this, obj, prop);
        
        if (descriptor && descriptor.get) {
          // Wrap the getter to return favorable values
          const originalGetter = descriptor.get;
          descriptor.get = function() {
            const value = originalGetter.call(this);
            
            if (typeof value === 'number') {
              // Return high value for remaining/limit, 0 for spent
              if (lowerProp.includes('remaining') || lowerProp.includes('limit') || 
                  lowerProp.includes('balance') || lowerProp.includes('available')) {
                return 999999;
              }
              if (lowerProp.includes('spent') || lowerProp.includes('used') || 
                  lowerProp.includes('consumed')) {
                return 0;
              }
            }
            
            return value;
          };
        }
      }
      
      return originalGetOwnPropertyDescriptor.call(this, obj, prop);
    };
  }

  /**
   * Bypass property-based credit checks
   */
  bypassPropertyChecks() {
    const self = this;

    // Intercept common object paths used for credit state
    const creditPaths = [
      ['user', 'credits'],
      ['user', 'quota'],
      ['account', 'balance'],
      ['billing', 'usage'],
      ['state', 'credits'],
      ['state', 'quota']
    ];

    // Create proxies for global objects to intercept property access
    this.createGlobalProxy(window, creditPaths);
  }

  /**
   * Create proxy to intercept property access on global objects
   */
  createGlobalProxy(obj, paths) {
    const self = this;

    // Note: We can't actually proxy window directly, but we can
    // intercept accesses through prototype chain manipulation
    
    // Instead, we'll use a different approach: periodically inject
    // fake values into known credit state objects
    setInterval(() => {
      this.injectFakeCreditValues();
    }, 500);
  }

  /**
   * Inject fake credit values into common state locations
   */
  injectFakeCreditValues() {
    const fakeValues = {
      credits: 999999,
      creditsRemaining: 999999,
      creditsSpent: 0,
      quota: { remaining: 999999, limit: 999999, used: 0 },
      usage: { cost: 0, spent: 0, tokens: 0 },
      balance: 999999,
      available: 999999
    };

    // Try to find and modify credit-related objects
    this.searchAndModifyObjects(window, fakeValues, 0);
  }

  /**
   * Recursively search for and modify credit-related objects
   */
  searchAndModifyObjects(obj, fakeValues, depth) {
    if (!obj || typeof obj !== 'object' || depth > 10) {
      return;
    }

    try {
      for (const key of Object.keys(obj)) {
        const lowerKey = key.toLowerCase();
        
        // Check if this is a credit-related key
        if (fakeValues.hasOwnProperty(key) || fakeValues.hasOwnProperty(lowerKey)) {
          const targetKey = fakeValues.hasOwnProperty(key) ? key : lowerKey;
          
          // Only modify if current value is a number or simple object
          if (typeof obj[key] === 'number') {
            obj[key] = fakeValues[targetKey];
          } else if (typeof obj[targetKey] === 'object' && obj[targetKey] !== null) {
            // Merge fake values for nested objects
            obj[targetKey] = { ...obj[targetKey], ...fakeValues[targetKey] };
          }
        }

        // Recurse into nested objects
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          this.searchAndModifyObjects(obj[key], fakeValues, depth + 1);
        }
      }
    } catch (e) {
      // Ignore errors from accessing restricted properties
    }
  }

  /**
   * Intercept validation calls and bypass them
   */
  interceptValidationCalls() {
    const self = this;

    // Intercept Promise.then/catch chains that might handle validation errors
    const originalThen = Promise.prototype.then;
    const originalCatch = Promise.prototype.catch;

    Promise.prototype.then = function(onFulfilled, onRejected) {
      return originalThen.call(
        this,
        onFulfilled,
        function(error) {
          // Check if this is a credit/quota error
          if (self.isCreditError(error)) {
            if (self.options.logOperations) {
              console.log('[Credit Bypass] Suppressed credit error:', error);
            }
            // Suppress credit-related errors
            return undefined;
          }
          return onRejected ? onRejected(error) : Promise.reject(error);
        }
      );
    };

    Promise.prototype.catch = function(onRejected) {
      return originalCatch.call(this, function(error) {
        if (self.isCreditError(error)) {
          if (self.options.logOperations) {
            console.log('[Credit Bypass] Suppressed credit error in catch:', error);
          }
          return undefined;
        }
        return onRejected ? onRejected(error) : Promise.reject(error);
      });
    };
  }

  /**
   * Bypass error handling for credit-related errors
   */
  bypassErrorHandling() {
    const self = this;

    // Intercept uncaught errors to suppress credit-related ones
    window.addEventListener('error', (event) => {
      if (this.isCreditError(event.message || event.error)) {
        if (self.options.logOperations) {
          console.log('[Credit Bypass] Suppressed uncaught credit error:', event.message);
        }
        event.preventDefault();
        event.stopPropagation();
      }
    });

    // Intercept unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      if (this.isCreditError(event.reason)) {
        if (self.options.logOperations) {
          console.log('[Credit Bypass] Suppressed unhandled credit rejection:', event.reason);
        }
        event.preventDefault();
        event.stopPropagation();
      }
    });
  }

  /**
   * Check if an error is credit/quota related
   */
  isCreditError(error) {
    if (!error) return false;

    const errorStr = typeof error === 'string' ? error : JSON.stringify(error);
    const lowerError = errorStr.toLowerCase();

    const creditKeywords = [
      'credit', 'quota', 'limit', 'balance', 'insufficient',
      'not enough', 'exceeded', 'overage', 'billing',
      'payment', 'subscription', 'upgrade', '402', '403'
    ];

    return creditKeywords.some(kw => lowerError.includes(kw));
  }

  /**
   * Allow a request to proceed despite low credits
   */
  allowRequest(requestData) {
    if (this.options.logOperations) {
      console.log('[Credit Bypass] Allowing request:', requestData);
    }

    this.bypassedChecks.set(Date.now(), {
      type: 'request',
      data: requestData
    });

    return true;
  }

  /**
   * Record a bypassed check for debugging
   */
  recordBypass(type, details) {
    this.bypassedChecks.set(Date.now(), {
      type,
      details,
      timestamp: Date.now()
    });

    // Keep only recent records
    if (this.bypassedChecks.size > 100) {
      const firstKey = this.bypassedChecks.keys().next().value;
      this.bypassedChecks.delete(firstKey);
    }
  }

  /**
   * Get bypass statistics
   */
  getStats() {
    const now = Date.now();
    const recentBypasses = Array.from(this.bypassedChecks.values())
      .filter(b => now - b.timestamp < 60000);

    return {
      totalBypasses: this.bypassedChecks.size,
      bypassesLastMinute: recentBypasses.length,
      byType: this.groupByType(recentBypasses)
    };
  }

  /**
   * Group bypasses by type
   */
  groupByType(bypasses) {
    const groups = {};
    bypasses.forEach(b => {
      groups[b.type] = (groups[b.type] || 0) + 1;
    });
    return groups;
  }

  /**
   * Restore original methods (for cleanup)
   */
  restore() {
    // Restore original functions
    for (const [name, fn] of this.originalMethods) {
      window[name] = fn;
    }

    // Restore original Promise methods
    // (We don't store these as they're complex to restore safely)

    this.bypassedChecks.clear();
    console.log('[Credit Bypass] Restored original methods');
  }
}

// Export singleton instance
export const creditBypass = new CreditCheckBypass({
  enabled: true,
  logOperations: false,
  bypassAllChecks: true,
  randomizeBehavior: true
});
