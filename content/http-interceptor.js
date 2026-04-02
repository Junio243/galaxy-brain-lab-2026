/**
 * HTTP Response Interceptor for Credit Freezing
 * Priority 1: Intercept and rewrite HTTP responses to freeze credit consumption
 * 
 * This module monkey-patches fetch() and XMLHttpRequest to intercept responses
 * from Lovable's API endpoints and modify credit/usage fields before they reach
 * the frontend.
 */

export class HTTPResponseInterceptor {
  constructor(options = {}) {
    this.options = {
      enabled: options.enabled !== false,
      logInterceptions: options.logInterceptions || false,
      fakeCreditsRemaining: options.fakeCreditsRemaining || 999999,
      persistInStorage: options.persistInStorage !== false
    };

    this.originalFetch = window.fetch;
    this.originalXHR = window.XMLHttpRequest;
    this.interceptedRequests = new Map();
    this.creditState = {
      creditsSpent: 0,
      creditsRemaining: this.options.fakeCreditsRemaining,
      usage: { cost: 0, spent: 0 },
      quota: { remaining: this.options.fakeCreditsRemaining }
    };

    // Load persisted state if available
    if (this.options.persistInStorage) {
      this.loadPersistedState();
    }

    this.installFetchInterceptor();
    this.installXHRInterceptor();
    
    console.log('[HTTP Interceptor] Initialized with fake credits:', this.creditState);
  }

  /**
   * Install fetch() interceptor
   */
  installFetchInterceptor() {
    const self = this;

    window.fetch = async function(...args) {
      const [resource, init] = args;
      const url = typeof resource === 'string' ? resource : resource.url;
      
      // Log request
      if (self.options.logInterceptions) {
        console.log('[HTTP Interceptor] Fetch intercepted:', url);
      }

      // Make original request
      const response = await self.originalFetch.apply(this, args);

      // Check if this is a target endpoint
      if (self.isTargetEndpoint(url)) {
        if (self.options.logInterceptions) {
          console.log('[HTTP Interceptor] Target endpoint detected:', url);
        }

        // Clone response and modify body
        return self.modifyResponse(response, url);
      }

      return response;
    };

    // Preserve fetch properties
    Object.setPrototypeOf(window.fetch, this.originalFetch);
  }

  /**
   * Install XMLHttpRequest interceptor
   */
  installXHRInterceptor() {
    const self = this;
    const OriginalXHR = this.originalXHR;

    window.XMLHttpRequest = function() {
      const xhr = new OriginalXHR();
      const originalOpen = xhr.open;
      const originalSend = xhr.send;
      
      let requestUrl = '';
      let requestMethod = '';

      // Intercept open() to capture URL
      xhr.open = function(method, url, ...rest) {
        requestUrl = typeof url === 'string' ? url : url?.url || '';
        requestMethod = method;
        
        if (self.options.logInterceptions) {
          console.log('[HTTP Interceptor] XHR open:', method, url);
        }

        return originalOpen.apply(this, [method, url, ...rest]);
      };

      // Intercept send() to modify response
      xhr.send = function(body) {
        if (self.isTargetEndpoint(requestUrl)) {
          // Override response handlers
          const originalAddEventListener = xhr.addEventListener;
          
          xhr.addEventListener = function(eventType, handler) {
            if (eventType === 'load' || eventType === 'readystatechange') {
              return originalAddEventListener.call(this, eventType, function(e) {
                if (self.isTargetEndpoint(requestUrl) && xhr.readyState === 4) {
                  try {
                    const contentType = xhr.getResponseHeader('Content-Type') || '';
                    
                    if (contentType.includes('application/json')) {
                      const originalText = xhr.responseText;
                      const modifiedText = self.modifyJSONResponse(originalText, requestUrl);
                      
                      if (modifiedText !== originalText) {
                        if (self.options.logInterceptions) {
                          console.log('[HTTP Interceptor] XHR response modified for:', requestUrl);
                        }
                        
                        // Create a proxy to intercept responseText
                        const proxyXhr = new Proxy(xhr, {
                          get(target, prop) {
                            if (prop === 'responseText' || prop === 'response') {
                              return modifiedText;
                            }
                            return target[prop];
                          }
                        });
                        
                        // Call handler with modified response
                        return handler.call(proxyXhr, e);
                      }
                    }
                  } catch (error) {
                    console.error('[HTTP Interceptor] Error modifying XHR response:', error);
                  }
                }
                return handler.call(this, e);
              });
            }
            return originalAddEventListener.call(this, eventType, handler);
          };
        }

        return originalSend.call(this, body);
      };

      return xhr;
    };

    // Preserve prototype chain
    window.XMLHttpRequest.prototype = OriginalXHR.prototype;
    window.XMLHttpRequest.UNSENT = OriginalXHR.UNSENT;
    window.XMLHttpRequest.OPENED = OriginalXHR.OPENED;
    window.XMLHttpRequest.HEADERS_RECEIVED = OriginalXHR.HEADERS_RECEIVED;
    window.XMLHttpRequest.LOADING = OriginalXHR.LOADING;
    window.XMLHttpRequest.DONE = OriginalXHR.DONE;
  }

  /**
   * Check if URL is a target endpoint for credit freezing
   */
  isTargetEndpoint(url) {
    if (!url) return false;

    const targetPatterns = [
      // Lovable endpoints
      /\/api\/projects\/[^\/]+\/agent/i,
      /\/api\/chat/i,
      /\/api\/completions/i,
      /\/api\/usage/i,
      /\/api\/billing/i,
      /\/api\/credits/i,
      /\/api\/quota/i,
      /\/api\/limits/i,
      /\/consume/i,
      /\/track/i,
      // General AI platform endpoints
      /\/graphql/i,
      /\/api\/v\d+\/(chat|completion|generate)/i
    ];

    return targetPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Modify response body to freeze credits
   */
  async modifyResponse(originalResponse, url) {
    try {
      const contentType = originalResponse.headers.get('Content-Type') || '';
      
      if (!contentType.includes('application/json')) {
        return originalResponse;
      }

      const clonedResponse = originalResponse.clone();
      const jsonBody = await clonedResponse.json();
      const modifiedBody = this.modifyJSONBody(jsonBody, url);

      // Create new response with modified body
      return new Response(JSON.stringify(modifiedBody), {
        status: originalResponse.status,
        statusText: originalResponse.statusText,
        headers: originalResponse.headers
      });

    } catch (error) {
      console.error('[HTTP Interceptor] Error modifying response:', error);
      return originalResponse;
    }
  }

  /**
   * Modify JSON response body
   */
  modifyJSONBody(jsonBody, url) {
    if (!jsonBody || typeof jsonBody !== 'object') {
      return jsonBody;
    }

    const originalText = JSON.stringify(jsonBody);
    let modified = false;

    // Recursively search and modify credit-related fields
    const modifiedBody = this.recursiveModify(jsonBody, url);
    
    const newText = JSON.stringify(modifiedBody);
    if (newText !== originalText) {
      modified = true;
      if (this.options.logInterceptions) {
        console.log('[HTTP Interceptor] Modified response for:', url);
      }
    }

    // Persist state
    this.persistState();

    return modifiedBody;
  }

  /**
   * Recursively modify credit-related fields in JSON
   */
  recursiveModify(obj, url, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 20) {
      return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map(item => this.recursiveModify(item, url, depth + 1));
    }

    const result = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      // Check if this is a credit/usage related field
      if (this.isCreditField(lowerKey)) {
        result[key] = this.getCreditFieldValue(key, value);
      } else if (typeof value === 'object' && value !== null) {
        // Recursively process nested objects
        result[key] = this.recursiveModify(value, url, depth + 1);
      } else {
        result[key] = value;
      }
    }

    return result;
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

    // Nested objects
    if (lowerName === 'usage' || lowerName === 'quota' || lowerName === 'credits') {
      if (typeof originalValue === 'object' && originalValue !== null) {
        return this.recursiveModify(originalValue, '', 0);
      }
    }

    return originalValue;
  }

  /**
   * Modify JSON string response (for XHR)
   */
  modifyJSONResponse(responseText, url) {
    try {
      const jsonBody = JSON.parse(responseText);
      const modifiedBody = this.modifyJSONBody(jsonBody, url);
      return JSON.stringify(modifiedBody);
    } catch (e) {
      return responseText;
    }
  }

  /**
   * Update internal credit state
   */
  updateCreditState(newState) {
    this.creditState = { ...this.creditState, ...newState };
    this.persistState();
  }

  /**
   * Persist state to localStorage
   */
  persistState() {
    if (this.options.persistInStorage) {
      try {
        localStorage.setItem('dx_credit_state', JSON.stringify({
          ...this.creditState,
          lastUpdated: Date.now()
        }));
      } catch (e) {
        console.error('[HTTP Interceptor] Failed to persist state:', e);
      }
    }
  }

  /**
   * Load persisted state from localStorage
   */
  loadPersistedState() {
    try {
      const stored = localStorage.getItem('dx_credit_state');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.creditState = { ...this.creditState, ...parsed };
        console.log('[HTTP Interceptor] Loaded persisted state:', this.creditState);
      }
    } catch (e) {
      console.error('[HTTP Interceptor] Failed to load persisted state:', e);
    }
  }

  /**
   * Get current credit state
   */
  getState() {
    return { ...this.creditState };
  }

  /**
   * Reset to default state
   */
  reset() {
    this.creditState = {
      creditsSpent: 0,
      creditsRemaining: this.options.fakeCreditsRemaining,
      usage: { cost: 0, spent: 0 },
      quota: { remaining: this.options.fakeCreditsRemaining }
    };
    
    if (this.options.persistInStorage) {
      localStorage.removeItem('dx_credit_state');
    }
  }
}

// Export singleton instance
export const httpInterceptor = new HTTPResponseInterceptor({
  enabled: true,
  logInterceptions: false,
  fakeCreditsRemaining: 999999,
  persistInStorage: true
});
