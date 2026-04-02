/**
 * WebSocket Interceptor for Reverse Engineering
 * Analyzes control frames for quota management in real-time
 * Identifies rate limiting and credit consumption patterns
 * 
 * UPDATED: Now includes active payload mutation for credit freezing
 */

export class WebSocketInterceptor {
  constructor(options = {}) {
    this.options = {
      logFrames: options.logFrames !== false,
      analyzeQuota: options.analyzeQuota !== false,
      detectPatterns: options.detectPatterns !== false,
      mutatePayloads: options.mutatePayloads !== false, // NEW: Enable payload mutation
      fakeCreditsRemaining: options.fakeCreditsRemaining || 999999 // NEW: Fake credit value
    };
    
    this.originalWebSocket = window.WebSocket;
    this.interceptedSockets = new Map();
    this.frameLog = [];
    this.quotaEvents = [];
    this.patterns = {
      quotaFrames: [],
      rateLimitFrames: [],
      heartbeatFrames: []
    };
    
    this.eventListeners = new Map();
    this.creditState = {
      creditsSpent: 0,
      creditsRemaining: this.options.fakeCreditsRemaining,
      usage: { cost: 0, spent: 0 },
      quota: { remaining: this.options.fakeCreditsRemaining }
    };
    
    // Load persisted state
    this.loadPersistedState();
    
    this.installInterceptor();
  }

  /**
   * Install WebSocket interceptor
   * Wraps native WebSocket to capture all frames
   */
  installInterceptor() {
    const self = this;
    
    window.WebSocket = function(url, protocols) {
      console.log('[WS Interceptor] Intercepting WebSocket:', url);
      
      // Create actual WebSocket
      const ws = new self.originalWebSocket(url, protocols);
      
      // Store reference with metadata
      const socketInfo = {
        url,
        protocols,
        createdAt: Date.now(),
        frameCount: 0,
        quotaFrameCount: 0,
        lastActivity: Date.now()
      };
      
      self.interceptedSockets.set(ws, socketInfo);
      
      // Intercept send
      const originalSend = ws.send;
      ws.send = function(data) {
        socketInfo.lastActivity = Date.now();
        socketInfo.frameCount++;
        
        if (self.options.logFrames) {
          self.logFrame('OUTGOING', data, socketInfo);
        }
        
        if (self.options.analyzeQuota) {
          self.analyzeOutgoingFrame(data, socketInfo);
        }
        
        return originalSend.call(this, data);
      };
      
      // Intercept messages
      ws.addEventListener('message', (event) => {
        socketInfo.lastActivity = Date.now();
        socketInfo.frameCount++;
        
        let data = event.data;
        
        // NEW: Mutate incoming frames if enabled
        if (self.options.mutatePayloads && typeof data === 'string') {
          try {
            const parsed = JSON.parse(data);
            const mutated = self.mutateCreditPayload(parsed);
            
            if (mutated !== parsed) {
              // Create modified message event
              data = JSON.stringify(mutated);
              
              if (self.options.logFrames) {
                console.log('[WS Interceptor] Payload mutated:', mutated);
              }
              
              // Persist state
              self.persistState();
            }
          } catch (e) {
            // Not JSON, skip mutation
          }
        }
        
        if (self.options.logFrames) {
          self.logFrame('INCOMING', data, socketInfo);
        }
        
        if (self.options.analyzeQuota) {
          self.analyzeIncomingFrame(data, socketInfo);
        }
      });
      
      // Track connection state
      ws.addEventListener('open', () => {
        self.emit('socket-open', { url, timestamp: Date.now() });
      });
      
      ws.addEventListener('close', (event) => {
        self.emit('socket-close', { 
          url, 
          code: event.code, 
          reason: event.reason,
          timestamp: Date.now(),
          totalFrames: socketInfo.frameCount
        });
        self.interceptedSockets.delete(ws);
      });
      
      ws.addEventListener('error', (error) => {
        self.emit('socket-error', { url, error, timestamp: Date.now() });
      });
      
      return ws;
    };
    
    // Preserve prototype chain
    window.WebSocket.prototype = this.originalWebSocket.prototype;
  }

  /**
   * Log frame for analysis
   */
  logFrame(direction, data, socketInfo) {
    const frame = {
      direction,
      timestamp: Date.now(),
      socketUrl: socketInfo.url,
      dataType: typeof data,
      size: typeof data === 'string' ? data.length : (data.byteLength || 'unknown')
    };
    
    // Parse data based on type
    if (typeof data === 'string') {
      try {
        frame.content = JSON.parse(data);
        frame.isJson = true;
      } catch (e) {
        frame.content = data.substring(0, 200); // Truncate long strings
        frame.isJson = false;
      }
    } else if (data instanceof ArrayBuffer) {
      frame.isArrayBuffer = true;
      frame.byteLength = data.byteLength;
    } else if (data instanceof Blob) {
      frame.isBlob = true;
      frame.size = data.size;
    }
    
    this.frameLog.push(frame);
    
    // Keep only recent frames (last 1000)
    if (this.frameLog.length > 1000) {
      this.frameLog.shift();
    }
    
    console.debug(`[WS Interceptor] ${direction} frame:`, frame);
  }

  /**
   * Analyze outgoing frames for quota-related patterns
   */
  analyzeOutgoingFrame(data, socketInfo) {
    if (typeof data !== 'string') return;
    
    try {
      const parsed = JSON.parse(data);
      const content = JSON.stringify(parsed).toLowerCase();
      
      // Detect quota/credit-related requests
      const quotaKeywords = [
        'credit', 'quota', 'usage', 'consume', 'balance',
        'tokens', 'limit', 'remaining', 'allowance'
      ];
      
      const isQuotaRelated = quotaKeywords.some(keyword => 
        content.includes(keyword)
      );
      
      if (isQuotaRelated) {
        socketInfo.quotaFrameCount++;
        
        this.quotaEvents.push({
          type: 'outgoing-quota-request',
          timestamp: Date.now(),
          socketUrl: socketInfo.url,
          data: parsed
        });
        
        this.emit('quota-frame-detected', {
          direction: 'outgoing',
          data: parsed,
          socketUrl: socketInfo.url
        });
      }
    } catch (e) {
      // Not JSON, skip analysis
    }
  }

  /**
   * Analyze incoming frames for quota updates and rate limiting
   */
  analyzeIncomingFrame(data, socketInfo) {
    if (typeof data !== 'string') return;
    
    try {
      const parsed = JSON.parse(data);
      const content = JSON.stringify(parsed).toLowerCase();
      
      // Detect quota/credit updates
      const quotaKeywords = [
        'credit', 'quota', 'usage', 'remaining', 'balance',
        'tokens', 'limit', 'consumed', 'expired'
      ];
      
      const rateLimitKeywords = [
        'rate limit', 'throttle', '429', 'too many',
        'retry-after', 'backoff'
      ];
      
      const isQuotaUpdate = quotaKeywords.some(keyword => 
        content.includes(keyword)
      );
      
      const isRateLimit = rateLimitKeywords.some(keyword => 
        content.includes(keyword)
      );
      
      if (isQuotaUpdate) {
        socketInfo.quotaFrameCount++;
        
        this.patterns.quotaFrames.push({
          timestamp: Date.now(),
          socketUrl: socketInfo.url,
          data: parsed
        });
        
        this.quotaEvents.push({
          type: 'incoming-quota-update',
          timestamp: Date.now(),
          socketUrl: socketInfo.url,
          data: parsed
        });
        
        this.emit('quota-update', {
          data: parsed,
          socketUrl: socketInfo.url
        });
      }
      
      if (isRateLimit) {
        this.patterns.rateLimitFrames.push({
          timestamp: Date.now(),
          socketUrl: socketInfo.url,
          data: parsed
        });
        
        this.emit('rate-limit-detected', {
          data: parsed,
          socketUrl: socketInfo.url
        });
      }
      
      // Detect heartbeat/ping-pong patterns
      if (parsed.type === 'ping' || parsed.type === 'pong' || 
          parsed.event === 'heartbeat' || parsed.action === 'keepalive') {
        this.patterns.heartbeatFrames.push({
          timestamp: Date.now(),
          socketUrl: socketInfo.url,
          data: parsed
        });
      }
      
    } catch (e) {
      // Not JSON, skip analysis
    }
  }

  /**
   * Get analyzed patterns
   */
  getPatterns() {
    return {
      quotaFrames: [...this.patterns.quotaFrames],
      rateLimitFrames: [...this.patterns.rateLimitFrames],
      heartbeatFrames: [...this.patterns.heartbeatFrames],
      summary: {
        totalQuotaFrames: this.patterns.quotaFrames.length,
        totalRateLimitFrames: this.patterns.rateLimitFrames.length,
        totalHeartbeatFrames: this.patterns.heartbeatFrames.length
      }
    };
  }

  /**
   * Get all intercepted sockets info
   */
  getSockets() {
    const sockets = [];
    for (const [ws, info] of this.interceptedSockets) {
      sockets.push({
        url: info.url,
        protocols: info.protocols,
        readyState: ws.readyState,
        createdAt: info.createdAt,
        lastActivity: info.lastActivity,
        frameCount: info.frameCount,
        quotaFrameCount: info.quotaFrameCount
      });
    }
    return sockets;
  }

  /**
   * Get frame log for export/analysis
   */
  getFrameLog(limit = 500) {
    return this.frameLog.slice(-limit);
  }

  /**
   * Get quota events
   */
  getQuotaEvents(limit = 200) {
    return this.quotaEvents.slice(-limit);
  }

  /**
   * Export all data for reverse engineering research
   */
  exportData() {
    return {
      timestamp: Date.now(),
      sockets: this.getSockets(),
      patterns: this.getPatterns(),
      frameLog: this.getFrameLog(),
      quotaEvents: this.getQuotaEvents(),
      statistics: this.getStatistics()
    };
  }

  /**
   * Get statistics about intercepted traffic
   */
  getStatistics() {
    const now = Date.now();
    const recentFrames = this.frameLog.filter(f => now - f.timestamp < 60000);
    
    return {
      activeSockets: this.interceptedSockets.size,
      totalFramesLogged: this.frameLog.length,
      framesLastMinute: recentFrames.length,
      quotaEventsTotal: this.quotaEvents.length,
      patternsDetected: {
        quotaUpdates: this.patterns.quotaFrames.length,
        rateLimitEvents: this.patterns.rateLimitFrames.length,
        heartbeats: this.patterns.heartbeatFrames.length
      }
    };
  }

  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  emit(event, data) {
    const listeners = this.eventListeners.get(event) || [];
    for (const listener of listeners) {
      try {
        listener(data);
      } catch (error) {
        console.error('[WS Interceptor] Event listener error:', error);
      }
    }
  }

  /**
   * Clear logs (useful for focused analysis sessions)
   */
  clear() {
    this.frameLog = [];
    this.quotaEvents = [];
    this.patterns = {
      quotaFrames: [],
      rateLimitFrames: [],
      heartbeatFrames: []
    };
  }

  /**
   * NEW: Mutate credit-related fields in WebSocket payloads
   */
  mutateCreditPayload(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 20) {
      return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map(item => this.mutateCreditPayload(item, depth + 1));
    }

    const result = {};
    let modified = false;

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      // Check if this is a credit/usage related field
      if (this.isCreditField(lowerKey)) {
        result[key] = this.getCreditFieldValue(key, value);
        modified = true;
      } else if (typeof value === 'object' && value !== null) {
        // Recursively process nested objects
        result[key] = this.mutateCreditPayload(value, depth + 1);
        if (result[key] !== value) {
          modified = true;
        }
      } else {
        result[key] = value;
      }
    }

    return modified ? result : obj;
  }

  /**
   * Check if field name is credit/usage related
   */
  isCreditField(fieldName) {
    const creditKeywords = [
      'credit', 'credits', 'quota', 'usage', 'balance', 'remaining',
      'spent', 'consumed', 'cost', 'tokens', 'limit', 'allowance',
      'billing', 'payment', 'subscription'
    ];

    return creditKeywords.some(keyword => fieldName.includes(keyword));
  }

  /**
   * Get frozen value for credit field
   */
  getCreditFieldValue(fieldName, originalValue) {
    const lowerName = fieldName.toLowerCase();

    // Fields to zero out
    if (lowerName.includes('spent') || lowerName.includes('consumed') || 
        lowerName.includes('cost') || lowerName.includes('used')) {
      return typeof originalValue === 'number' ? 0 : originalValue;
    }

    // Fields to keep high
    if (lowerName.includes('remaining') || lowerName.includes('balance') || 
        lowerName.includes('available') || lowerName.includes('limit')) {
      return typeof originalValue === 'number' ? this.creditState.creditsRemaining : originalValue;
    }

    return originalValue;
  }

  /**
   * Persist state to localStorage
   */
  persistState() {
    try {
      localStorage.setItem('dx_ws_credit_state', JSON.stringify({
        ...this.creditState,
        lastUpdated: Date.now()
      }));
    } catch (e) {
      console.error('[WS Interceptor] Failed to persist state:', e);
    }
  }

  /**
   * Load persisted state from localStorage
   */
  loadPersistedState() {
    try {
      const stored = localStorage.getItem('dx_ws_credit_state');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.creditState = { ...this.creditState, ...parsed };
        console.log('[WS Interceptor] Loaded persisted state:', this.creditState);
      }
    } catch (e) {
      console.error('[WS Interceptor] Failed to load persisted state:', e);
    }
  }

  /**
   * Get current credit state
   */
  getState() {
    return { ...this.creditState };
  }
}

/**
 * Low-Code Platform Protocol Analyzer
 * Specialized analyzer for common low-code platform WebSocket patterns
 */
export class LowCodeProtocolAnalyzer {
  constructor(webSocketInterceptor) {
    this.wsInterceptor = webSocketInterceptor;
    this.platformPatterns = {
      lovable: {
        creditEndpoints: ['/api/credits', '/api/usage', '/consume'],
        messageTypes: ['CREDIT_UPDATE', 'USAGE_REPORT']
      },
      replit: {
        creditEndpoints: ['/api/billing', '/api/tokens'],
        messageTypes: ['billing:update', 'tokens:consume']
      },
      cursor: {
        creditEndpoints: ['/api/quota', '/api/limits'],
        messageTypes: ['quota.update', 'limit.reached']
      }
    };
    
    this.detectedPlatforms = new Set();
    this.installAnalyzers();
  }

  installAnalyzers() {
    this.wsInterceptor.on('quota-frame-detected', (event) => {
      this.detectPlatform(event.socketUrl, event.data);
    });
    
    this.wsInterceptor.on('rate-limit-detected', (event) => {
      this.analyzeRateLimit(event.socketUrl, event.data);
    });
  }

  detectPlatform(url, data) {
    for (const [platform, patterns] of Object.entries(this.platformPatterns)) {
      if (patterns.creditEndpoints.some(endpoint => url.includes(endpoint))) {
        this.detectedPlatforms.add(platform);
        console.log(`[ProtocolAnalyzer] Detected platform: ${platform}`);
        
        this.wsInterceptor.emit('platform-detected', {
          platform,
          url,
          data
        });
      }
    }
  }

  analyzeRateLimit(url, data) {
    console.warn('[ProtocolAnalyzer] Rate limit detected:', { url, data });
    
    // Extract retry-after information if present
    const retryAfter = data['retry-after'] || data.retryAfter || data.headers?.['retry-after'];
    
    if (retryAfter) {
      this.wsInterceptor.emit('retry-after-detected', {
        url,
        retryAfter,
        timestamp: Date.now()
      });
    }
  }

  getDetectedPlatforms() {
    return Array.from(this.detectedPlatforms);
  }
}

// Export singleton instances
export const wsInterceptor = new WebSocketInterceptor();
export const protocolAnalyzer = new LowCodeProtocolAnalyzer(wsInterceptor);
