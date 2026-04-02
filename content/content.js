// DX Edge Middleware - Main Content Script
// Integrates CRDT engine, Session Manager, and WebSocket Interceptor

import { crdtManager } from './crdt-engine.js';
import { sessionManager } from './session-manager.js';
import { wsInterceptor, protocolAnalyzer } from './websocket-interceptor.js';

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
    
  } catch (error) {
    console.error('[DX Edge Middleware] Initialization failed:', error);
  }
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
    // Could trigger UI notification here
  });
  
  // Credit expiration
  sessionManager.on('credit-expired', (data) => {
    console.warn('[DX Edge Middleware] Credits expired:', data);
    // Could trigger offline mode UI
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
  
  // Export research data
  exportResearchData: async () => {
    return {
      sessionMetrics: sessionManager.getMetrics(),
      sessionState: sessionManager.getState(),
      websocketData: wsInterceptor.exportData(),
      detectedPlatforms: protocolAnalyzer.getDetectedPlatforms(),
      researchData: await sessionManager.getResearchData()
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
