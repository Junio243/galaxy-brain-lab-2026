/**
 * Service Worker for DX Edge Middleware
 * Handles background sync, message routing, and persistent state management
 */

import { CircuitBreaker, globalCircuitBreaker } from './circuit-breaker.js';

// Global state
const state = {
  activeSessions: new Map(),
  syncQueue: [],
  isSyncing: false
};

// Install event
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing DX Edge Middleware...');
  event.waitUntil(
    caches.open('dx-middleware-v1').then((cache) => {
      return cache.addAll([
        '/lib/dexie.min.js',
        '/content/crdt-engine.js',
        '/content/session-manager.js',
        '/content/websocket-interceptor.js',
        '/content/content.js'
      ]);
    })
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activated');
  event.waitUntil(self.clients.claim());
});

// Message handler
self.addEventListener('message', (event) => {
  const { action, payload } = event.data;
  
  switch (action) {
    case 'INIT_SESSION':
      handleInitSession(event.source, payload);
      break;
      
    case 'SYNC_OPERATION':
      handleSyncOperation(event.source, payload);
      break;
      
    case 'GET_STATE':
      handleGetState(event.source);
      break;
      
    case 'EXPORT_DATA':
      handleExportData(event.source);
      break;
      
    case 'RESET_CIRCUIT_BREAKER':
      handleResetCircuitBreaker(event.source, payload);
      break;
      
    default:
      console.warn('[ServiceWorker] Unknown action:', action);
  }
});

async function handleInitSession(client, payload) {
  const sessionId = payload.sessionId || `session-${Date.now()}`;
  const platform = payload.platform || 'unknown';
  
  state.activeSessions.set(sessionId, {
    platform,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    operationCount: 0
  });
  
  client.postMessage({
    type: 'SESSION_INITIALIZED',
    sessionId,
    platform
  });
}

async function handleSyncOperation(client, payload) {
  const { sessionId, operation } = payload;
  
  // Add to sync queue
  state.syncQueue.push({
    sessionId,
    operation,
    timestamp: Date.now(),
    retryCount: 0
  });
  
  // Update session activity
  if (state.activeSessions.has(sessionId)) {
    const session = state.activeSessions.get(sessionId);
    session.lastActivity = Date.now();
    session.operationCount++;
  }
  
  // Trigger background sync if not already running
  if (!state.isSyncing) {
    processSyncQueue();
  }
  
  client.postMessage({
    type: 'OPERATION_QUEUED',
    queuedCount: state.syncQueue.length
  });
}

async function processSyncQueue() {
  if (state.isSyncing || state.syncQueue.length === 0) {
    return;
  }
  
  state.isSyncing = true;
  
  while (state.syncQueue.length > 0) {
    const item = state.syncQueue[0];
    
    try {
      // Attempt to sync with server
      const success = await attemptSync(item);
      
      if (success) {
        state.syncQueue.shift();
        
        // Notify all clients about successful sync
        notifyClients({
          type: 'SYNC_SUCCESS',
          operation: item.operation
        });
      } else {
        // Increment retry count
        item.retryCount++;
        
        if (item.retryCount >= 3) {
          // Max retries reached, keep in queue but mark as failed
          state.syncQueue.shift();
          
          notifyClients({
            type: 'SYNC_FAILED',
            operation: item.operation,
            error: 'Max retries exceeded'
          });
        } else {
          // Move to end of queue for later retry
          state.syncQueue.shift();
          state.syncQueue.push(item);
        }
      }
    } catch (error) {
      console.error('[ServiceWorker] Sync error:', error);
      item.retryCount++;
      
      if (item.retryCount >= 3) {
        state.syncQueue.shift();
      }
    }
    
    // Small delay between operations
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  state.isSyncing = false;
}

async function attemptSync(item) {
  // In a real implementation, this would make actual API calls
  // For now, simulate success/failure based on circuit breaker state
  
  const endpoint = `/api/sync/${item.operation.type}`;
  
  try {
    const result = await globalCircuitBreaker.execute(endpoint, async () => {
      // Simulate API call
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.operation)
      });
      
      if (!response.ok) {
        const error = await response.json();
        error.status = response.status;
        throw error;
      }
      
      return response.json();
    });
    
    return true;
  } catch (error) {
    console.warn('[ServiceWorker] Sync attempt failed:', error);
    return false;
  }
}

function handleGetState(client) {
  client.postMessage({
    type: 'STATE',
    state: {
      activeSessions: Array.from(state.activeSessions.entries()),
      syncQueueLength: state.syncQueue.length,
      isSyncing: state.isSyncing,
      circuitBreakerStates: globalCircuitBreaker.getAllStates()
    }
  });
}

async function handleExportData(client) {
  const exportData = {
    timestamp: Date.now(),
    sessions: Array.from(state.activeSessions.entries()),
    syncQueue: state.syncQueue,
    circuitBreakerStates: globalCircuitBreaker.getAllStates()
  };
  
  client.postMessage({
    type: 'EXPORT_DATA',
    data: exportData
  });
}

function handleResetCircuitBreaker(client, payload) {
  const { endpoint } = payload;
  
  if (endpoint) {
    // Reset specific endpoint
    // Note: This would need access to the specific breaker instance
    console.log('[ServiceWorker] Reset request for:', endpoint);
  } else {
    // Reset all (would need implementation in MultiCircuitBreaker)
    console.log('[ServiceWorker] Reset all circuit breakers requested');
  }
  
  client.postMessage({
    type: 'CIRCUIT_BREAKER_RESET',
    success: true
  });
}

function notifyClients(message) {
  self.clients.matchAll().then((clients) => {
    for (const client of clients) {
      client.postMessage(message);
    }
  });
}

// Periodic cleanup of inactive sessions
setInterval(() => {
  const now = Date.now();
  const maxInactivity = 30 * 60 * 1000; // 30 minutes
  
  for (const [sessionId, session] of state.activeSessions) {
    if (now - session.lastActivity > maxInactivity) {
      state.activeSessions.delete(sessionId);
      console.log('[ServiceWorker] Cleaned up inactive session:', sessionId);
    }
  }
}, 5 * 60 * 1000); // Run every 5 minutes

console.log('[ServiceWorker] DX Edge Middleware service worker loaded');
