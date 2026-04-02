/**
 * Circuit Breaker Pattern Implementation
 * Handles graceful degradation when APIs return 429/402 errors
 * 
 * States: CLOSED (normal), OPEN (failing), HALF_OPEN (testing)
 */

export class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
    this.monitoringPeriod = options.monitoringPeriod || 60000; // 1 minute
    
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    this.failures = [];
    
    // Metrics for debugging and research
    this.metrics = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      circuitOpens: 0,
      stateChanges: []
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn, context = null) {
    this.metrics.totalRequests++;
    
    if (!this.canExecute()) {
      throw new CircuitBreakerError(
        'Circuit breaker is OPEN',
        this.getStateInfo()
      );
    }

    try {
      const result = await fn.call(context);
      this.onSuccess();
      return result;
    } catch (error) {
      if (this.isFailureReason(error)) {
        this.onFailure(error);
      }
      throw error;
    }
  }

  /**
   * Check if circuit breaker allows execution
   */
  canExecute() {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      const now = Date.now();
      if (this.nextAttempt && now >= this.nextAttempt) {
        this.transitionTo('HALF_OPEN');
        return true;
      }
      return false;
    }

    if (this.state === 'HALF_OPEN') {
      return true;
    }

    return false;
  }

  /**
   * Determine if an error should trigger circuit breaker
   * Focus on 429 (Rate Limit) and 402 (Payment Required/Credits Exhausted)
   */
  isFailureReason(error) {
    // HTTP status code checks
    if (error.status === 429 || error.status === 402) {
      return true;
    }
    
    if (error.statusCode === 429 || error.statusCode === 402) {
      return true;
    }

    // Network errors that might indicate quota issues
    if (error.message?.includes('rate limit')) {
      return true;
    }
    
    if (error.message?.includes('quota exceeded')) {
      return true;
    }

    if (error.message?.includes('insufficient credits')) {
      return true;
    }

    return false;
  }

  /**
   * Handle successful request
   */
  onSuccess() {
    this.metrics.totalSuccesses++;
    this.failureCount = 0;
    this.successCount++;

    if (this.state === 'HALF_OPEN') {
      this.transitionTo('CLOSED');
    }
  }

  /**
   * Handle failed request
   */
  onFailure(error) {
    this.failureCount++;
    this.metrics.totalFailures++;
    this.lastFailureTime = Date.now();
    this.failures.push({
      timestamp: Date.now(),
      error: error.message || error,
      status: error.status || error.statusCode
    });

    // Keep only recent failures
    if (this.failures.length > 100) {
      this.failures.shift();
    }

    if (this.shouldOpenCircuit()) {
      this.openCircuit();
    }
  }

  /**
   * Check if circuit should open based on failure threshold
   */
  shouldOpenCircuit() {
    if (this.failureCount >= this.failureThreshold) {
      return true;
    }

    // Also check failure rate in monitoring period
    const now = Date.now();
    const recentFailures = this.failures.filter(
      f => now - f.timestamp < this.monitoringPeriod
    ).length;

    const failureRate = recentFailures / this.metrics.totalRequests;
    
    // Open if more than 50% failure rate with minimum 10 requests
    if (this.metrics.totalRequests >= 10 && failureRate > 0.5) {
      return true;
    }

    return false;
  }

  /**
   * Open the circuit breaker
   */
  openCircuit() {
    this.transitionTo('OPEN');
    this.nextAttempt = Date.now() + this.resetTimeout;
    this.metrics.circuitOpens++;
    
    console.warn('[CircuitBreaker] OPENED - Graceful degradation activated', {
      failureCount: this.failureCount,
      nextAttempt: new Date(this.nextAttempt).toISOString()
    });
  }

  /**
   * Transition to a new state
   */
  transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    
    this.metrics.stateChanges.push({
      from: oldState,
      to: newState,
      timestamp: Date.now()
    });

    // Keep only recent state changes
    if (this.metrics.stateChanges.length > 50) {
      this.metrics.stateChanges.shift();
    }

    console.log(`[CircuitBreaker] State change: ${oldState} → ${newState}`);
  }

  /**
   * Get current state information
   */
  getStateInfo() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt,
      metrics: { ...this.metrics }
    };
  }

  /**
   * Reset the circuit breaker to initial state
   */
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    this.failures = [];
  }

  /**
   * Force open the circuit (manual override)
   */
  forceOpen() {
    this.openCircuit();
  }

  /**
   * Force close the circuit (manual override)
   */
  forceClose() {
    this.transitionTo('CLOSED');
    this.failureCount = 0;
  }
}

/**
 * Custom error for circuit breaker rejections
 */
export class CircuitBreakerError extends Error {
  constructor(message, stateInfo) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.stateInfo = stateInfo;
    this.isCircuitBreakerError = true;
  }
}

/**
 * Multi-tier circuit breaker for different API endpoints
 */
export class MultiCircuitBreaker {
  constructor() {
    this.breakers = new Map();
    this.defaultOptions = {
      failureThreshold: 5,
      resetTimeout: 30000,
      monitoringPeriod: 60000
    };
  }

  getBreaker(endpoint, options = {}) {
    if (!this.breakers.has(endpoint)) {
      this.breakers.set(
        endpoint,
        new CircuitBreaker({ ...this.defaultOptions, ...options })
      );
    }
    return this.breakers.get(endpoint);
  }

  async execute(endpoint, fn, options = {}) {
    const breaker = this.getBreaker(endpoint, options);
    return breaker.execute(fn);
  }

  getAllStates() {
    const states = {};
    for (const [endpoint, breaker] of this.breakers) {
      states[endpoint] = breaker.getStateInfo();
    }
    return states;
  }
}

// Export singleton instance for global use
export const globalCircuitBreaker = new MultiCircuitBreaker();
