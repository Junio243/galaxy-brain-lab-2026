// DX Edge Middleware - Main Content Script
// Integrates CRDT engine, Session Manager, WebSocket Interceptor, Credit Freezing, and Data Audit Interceptor

import { crdtManager } from './crdt-engine.js';
import { sessionManager } from './session-manager.js';
import { wsInterceptor, protocolAnalyzer } from './websocket-interceptor.js';
import { httpInterceptor } from './http-interceptor.js';
import { reactFreezer } from './react-state-freezer.js';
import { creditBypass } from './credit-check-bypass.js';
import { antiDetection } from './anti-detection.js';
import { creditFreezingManager } from './credit-freezing-manager.js';

console.log('[DX Edge Middleware] Initializing...');

// Initialize session manager
async function initializeMiddleware() {
  try {
    await sessionManager.initialize({
      platform: detectPlatform()
    });
    
    console.log('[DX Edge Middleware] Initialized successfully');
    
    // Setup event listeners for UI feedback
    setupEventListeners();
    
    // Initialize data audit if available (from main)
    if (window.DataAuditInterceptor) {
      console.log('[DataAudit] Content script ready');
      setupFetchInterception();
    }
    
    // Expose unified credit freezing API (from freeze-credit branch)
    exposeCreditFreezingAPI();
    
  } catch (error) {
    console.error('[DX Edge Middleware] Initialization failed:', error);
  }
}

/**
 * Intercepta fetch e XMLHttpRequest para auditoria de dados
 */
function setupFetchInterception() {
  // Override fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const [url, options] = args;
    const urlString = typeof url === 'string' ? url : url.url || url.href;
    
    // Verificar se é endpoint monitorado
    if (window.DataAuditInterceptor && 
        window.DataAuditInterceptor.isMonitoredEndpoint(urlString)) {
      
      let postData = null;
      if (options && options.body) {
        try {
          postData = JSON.parse(options.body);
        } catch (e) {
          // Body não é JSON
        }
      }
      
      if (postData) {
        const exposureScore = window.DataAuditInterceptor.calculateExposureScore(postData);
        const metadata = window.DataAuditInterceptor.extractMetadata(postData);
        
        // Log sensitive data found
        for (const [key, value] of Object.entries(metadata)) {
          window.DataAuditInterceptor.logSensitiveData({
            type: 'metadata',
            field: key,
            value: String(value),
            url: urlString
          });
        }
        
        // Log request
        window.DataAuditInterceptor.logRequest({
          url: urlString,
          method: options.method || 'POST',
          endpoint: urlString,
          exposureScore,
          metadata,
          tabId: chrome.runtime?.id || 0,
          payloadSize: options.body?.length || 0
        });
        
        console.log('[DataAudit] Request intercepted:', urlString, 'Score:', exposureScore);
      }
    }
    
    // Check if it's a tracking request to block
    if (window.DataAuditInterceptor && 
        window.DataAuditInterceptor.isTrackingRequest(urlString)) {
      console.log('[DataAudit] Blocking tracking request:', urlString);
      return Promise.reject(new Error('Blocked by Data Audit Extension'));
    }
    
    // Make original request
    const response = await originalFetch.apply(this, args);
    
    // Clone response to read body
    const clonedResponse = response.clone();
    
    // Sanitize response if needed
    if (window.DataAuditInterceptor && 
        window.DataAuditInterceptor.getState().sanitizeResponses) {
      try {
        const data = await clonedResponse.json();
        const sanitized = window.DataAuditInterceptor.sanitizeSensitiveData(data);
        
        // Create new response with sanitized data
        return new Response(JSON.stringify(sanitized), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch (e) {
        // Response não é JSON, retorna original
      }
    }
    
    return response;
  };
  
  // Override XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._auditUrl = url;
    this._auditMethod = method;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };
  
  XMLHttpRequest.prototype.send = function(body) {
    if (window.DataAuditInterceptor && this._auditUrl) {
      // Check if tracking
      if (window.DataAuditInterceptor.isTrackingRequest(this._auditUrl)) {
        console.log('[DataAudit] Blocking XHR tracking:', this._auditUrl);
        return;
      }
      
      // Check if monitored endpoint
      if (window.DataAuditInterceptor.isMonitoredEndpoint(this._auditUrl)) {
        try {
          const postData = JSON.parse(body);
          const exposureScore = window.DataAuditInterceptor.calculateExposureScore(postData);
          const metadata = window.DataAuditInterceptor.extractMetadata(postData);
          
          window.DataAuditInterceptor.logRequest({
            url: this._auditUrl,
            method: this._auditMethod,
            endpoint: this._auditUrl,
            exposureScore,
            metadata,
            tabId: chrome.runtime?.id || 0,
            payloadSize: body?.length || 0
          });
        } catch (e) {
          // Body não é JSON
        }
      }
    }
    
    return originalXHRSend.apply(this, arguments);
  };
}

function detectPlatform() {
  const url = window.location.href;
  if (url.includes('lovable')) return 'lovable';
  if (url.includes('replit')) return 'replit';
  if (url.includes('cursor')) return 'cursor';
  if (url.includes('windsurf')) return 'windsurf';
  if (url.includes('bolt')) return 'bolt';
  return 'unknown';
}

function setupEventListeners() {
  // Circuit breaker state changes
  sessionManager.on('circuit-breaker-change', (data) => {
    console.log('[DX Edge Middleware] Circuit breaker state changed:', data);
  });
  
  // Race condition detection
  sessionManager.on('race-condition', (data) => {
    console.warn('[DX Edge Middleware] Race condition detected:', data);
  });
  
  // Credit expiration
  sessionManager.on('credit-expired', (data) => {
    console.warn('[DX Edge Middleware] Credits expired:', data);
  });
  
  // WebSocket quota events
  wsInterceptor.on('quota-update', (data) => {
    console.log('[DX Edge Middleware] Quota update detected:', data);
  });
  
  wsInterceptor.on('rate-limit-detected', (data) => {
    console.warn('[DX Edge Middleware] Rate limit detected:', data);
  });
}

// Expose API for debugging and research
window.DXEdgeMiddleware = {
  sessionManager,
  crdtManager,
  wsInterceptor,
  protocolAnalyzer,
  httpInterceptor,
  reactFreezer,
  creditBypass,
  antiDetection,
  creditFreezingManager,
  
  // Credit Freezing specific API
  freezeCredits: (amount) => creditFreezingManager.setFakeCredits(amount),
  getCreditStatus: () => creditFreezingManager.getStatus(),
  resetCredits: () => creditFreezingManager.reset(),
  downloadCreditData: () => creditFreezingManager.downloadData(),
  
  // Export research data
  exportResearchData: async () => {
    return {
      sessionMetrics: sessionManager.getMetrics(),
      sessionState: sessionManager.getState(),
      websocketData: wsInterceptor.exportData(),
      detectedPlatforms: protocolAnalyzer.getDetectedPlatforms(),
      researchData: await sessionManager.getResearchData(),
      creditFreezingData: creditFreezingManager.exportData()
    };
  },
  
  // Download research data as JSON
  downloadResearchData: async () => {
    const data = await window.DXEdgeMiddleware.exportResearchData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dx-middleware-research-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
};

/**
 * Expose unified credit freezing API
 */
function exposeCreditFreezingAPI() {
  console.log('[DX Edge Middleware] Credit Freezing API exposed on window.CreditFreeze');
  
  window.CreditFreeze = {
    // Status
    getStatus: () => creditFreezingManager.getStatus(),
    
    // Control
    setCredits: (amount) => creditFreezingManager.setFakeCredits(amount),
    reset: () => creditFreezingManager.reset(),
    pause: () => creditFreezingManager.pause(),
    resume: () => creditFreezingManager.resume(),
    
    // Data export
    exportData: () => creditFreezingManager.exportData(),
    downloadData: () => creditFreezingManager.downloadData(),
    
    // Individual module access (for debugging)
    modules: {
      http: httpInterceptor,
      ws: wsInterceptor,
      react: reactFreezer,
      bypass: creditBypass,
      antiDetection: antiDetection
    }
  };
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeMiddleware);
} else {
  initializeMiddleware();
}

// Handle messages from popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getState':
      sendResponse({
        session: sessionManager.getState(),
        metrics: sessionManager.getMetrics()
      });
      break;
      
    case 'getResearchData':
      window.DXEdgeMiddleware.exportResearchData()
        .then(sendResponse)
        .catch(error => sendResponse({ error: error.message }));
      return true; // Keep channel open for async response
      
    case 'resetCircuitBreaker':
      sessionManager.circuitBreaker.reset();
      sendResponse({ success: true });
      break;
      
    default:
      sendResponse({ error: 'Unknown action' });
  }
});