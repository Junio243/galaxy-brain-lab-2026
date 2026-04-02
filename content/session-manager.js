/**
 * Session Manager with Shadow Syncing
 * Implements IndexedDB duplication before server commit
 * Manages optimistic concurrency and race condition detection
 */

// Use global crdtManager exposed by crdt-engine.js (now loaded as regular script)
const _crdtManager = typeof window !== 'undefined' ? (window.crdtManager || null) : null;

// CircuitBreaker will be available after background script loads or we define it inline
const _CircuitBreaker = typeof window !== 'undefined' ? (window.CircuitBreaker || null) : null;
const _CircuitBreakerError = typeof window !== 'undefined' ? (window.CircuitBreakerError || null) : null;

/**
 * IndexedDB wrapper using Dexie.js patterns
 * Shadow sync: duplicate state in IndexedDB before server commit
 */
class ShadowSyncDB {
  constructor(dbName = 'dx-edge-middleware') {
    this.dbName = dbName;
    this.db = null;
    this.version = 1;
  }

  async open() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Sessions store for shadow syncing
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionsStore = db.createObjectStore('sessions', { keyPath: 'sessionId' });
          sessionsStore.createIndex('status', 'status', { unique: false });
          sessionsStore.createIndex('lastModified', 'lastModified', { unique: false });
          sessionsStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        }

        // Operations queue for pending sync
        if (!db.objectStoreNames.contains('operations')) {
          const opsStore = db.createObjectStore('operations', { keyPath: 'id', autoIncrement: true });
          opsStore.createIndex('sessionId', 'sessionId', { unique: false });
          opsStore.createIndex('status', 'status', { unique: false });
          opsStore.createIndex('timestamp', 'timestamp', { unique: false });
          opsStore.createIndex('retryCount', 'retryCount', { unique: false });
        }

        // Credit/Quota tracking for race condition detection
        if (!db.objectStoreNames.contains('quotaState')) {
          const quotaStore = db.createObjectStore('quotaState', { keyPath: 'platform' });
          quotaStore.createIndex('lastCheck', 'lastCheck', { unique: false });
          quotaStore.createIndex('status', 'status', { unique: false });
        }

        // Conflict log for research and debugging
        if (!db.objectStoreNames.contains('conflicts')) {
          const conflictsStore = db.createObjectStore('conflicts', { keyPath: 'id', autoIncrement: true });
          conflictsStore.createIndex('sessionId', 'sessionId', { unique: false });
          conflictsStore.createIndex('timestamp', 'timestamp', { unique: false });
          conflictsStore.createIndex('type', 'type', { unique: false });
        }
      };
    });
  }

  async saveSession(sessionData) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readwrite');
      const store = tx.objectStore('sessions');
      
      sessionData.lastModified = Date.now();
      sessionData.shadowSyncedAt = Date.now();
      
      const request = store.put(sessionData);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getSession(sessionId) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readonly');
      const store = tx.objectStore('sessions');
      const request = store.get(sessionId);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async queueOperation(operation) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('operations', 'readwrite');
      const store = tx.objectStore('operations');
      
      operation.timestamp = Date.now();
      operation.status = 'pending';
      operation.retryCount = 0;
      
      const request = store.add(operation);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingOperations(limit = 100) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('operations', 'readonly');
      const store = tx.objectStore('operations');
      const index = store.index('status');
      const request = index.getAll('pending', limit);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async updateOperationStatus(id, status, error = null) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('operations', 'readwrite');
      const store = tx.objectStore('operations');
      
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const operation = getRequest.result;
        if (operation) {
          operation.status = status;
          operation.lastAttempt = Date.now();
          if (error) {
            operation.error = error;
          }
          if (status === 'pending') {
            operation.retryCount = (operation.retryCount || 0) + 1;
          }
          
          const putRequest = store.put(operation);
          putRequest.onsuccess = () => resolve(putRequest.result);
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve(null);
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async saveQuotaState(platform, quotaData) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('quotaState', 'readwrite');
      const store = tx.objectStore('quotaState');
      
      quotaData.platform = platform;
      quotaData.lastCheck = Date.now();
      
      const request = store.put(quotaData);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getQuotaState(platform) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('quotaState', 'readonly');
      const store = tx.objectStore('quotaState');
      const request = store.get(platform);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async logConflict(conflict) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('conflicts', 'readwrite');
      const store = tx.objectStore('conflicts');
      
      conflict.timestamp = Date.now();
      conflict.resolved = false;
      
      const request = store.add(conflict);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllConflicts() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('conflicts', 'readonly');
      const store = tx.objectStore('conflicts');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * Session Manager with optimistic concurrency control
 * Detects race conditions in credit validation scenarios
 */
export class SessionManager {
  constructor(options = {}) {
    this.sessionId = options.sessionId || this.generateSessionId();
    this.platform = options.platform || 'unknown';
    this.db = new ShadowSyncDB();
    this.circuitBreaker = new (_CircuitBreaker || (typeof CircuitBreaker !== 'undefined' ? CircuitBreaker : null))({
      failureThreshold: options.failureThreshold || 5,
      resetTimeout: options.resetTimeout || 30000
    });
    
    this.state = {
      isActive: false,
      credits: null,
      lastCreditCheck: null,
      pendingOperations: [],
      offlineMode: false,
      inconsistencyWindow: null
    };
    
    this.eventListeners = new Map();
    this.syncInProgress = false;
    
    // Research metrics for race condition analysis
    this.metrics = {
      totalOperations: 0,
      offlineOperations: 0,
      raceConditionsDetected: 0,
      creditExpirationsDuringOffline: 0,
      reconciliationConflicts: 0,
      inconsistencyWindows: []
    };
  }

  generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Initialize session with shadow sync
   * Duplicates state in IndexedDB before any server commit
   */
  async initialize(initialState = {}) {
    console.log('[SessionManager] Initializing session:', this.sessionId);
    
    this.state.isActive = true;
    this.state.offlineMode = !navigator.onLine;
    
    // Load existing session from IndexedDB if available
    const existingSession = await this.db.getSession(this.sessionId);
    if (existingSession) {
      this.state = { ...this.state, ...existingSession.state };
      console.log('[SessionManager] Restored session from IndexedDB');
    }
    
    // Save initial state to IndexedDB (shadow sync)
    await this.shadowSync();
    
    // Start background sync if online
    if (!this.state.offlineMode) {
      this.startBackgroundSync();
    }
    
    // Listen for online/offline events
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    
    this.emit('initialized', { sessionId: this.sessionId });
    
    return this.sessionId;
  }

  /**
   * Shadow Sync: Save state to IndexedDB BEFORE server commit
   * This ensures data durability even if server operations fail
   */
  async shadowSync() {
    const sessionData = {
      sessionId: this.sessionId,
      platform: this.platform,
      state: { ...this.state },
      syncStatus: 'shadow-synced',
      crdtState: _crdtManager ? _crdtManager.exportAllStates() : (typeof crdtManager !== 'undefined' ? crdtManager.exportAllStates() : {})
    };
    
    try {
      await this.db.saveSession(sessionData);
      console.log('[SessionManager] Shadow sync completed');
      return true;
    } catch (error) {
      console.error('[SessionManager] Shadow sync failed:', error);
      throw error;
    }
  }

  /**
   * Execute operation with optimistic concurrency
   * Writes to IndexedDB immediately, syncs to server asynchronously
   */
  async executeOperation(operation) {
    this.metrics.totalOperations++;
    
    // Apply operation locally first (optimistic)
    const localResult = this.applyLocalOperation(operation);
    
    // Shadow sync immediately
    await this.shadowSync();
    
    if (this.state.offlineMode || this.circuitBreaker.state === 'OPEN') {
      // Queue for later sync
      this.metrics.offlineOperations++;
      await this.db.queueOperation({
        sessionId: this.sessionId,
        operation,
        type: operation.type,
        payload: operation.payload
      });
      
      console.log('[SessionManager] Operation queued (offline mode)');
      return { success: true, synced: false, queued: true };
    }
    
    // Try to sync to server
    try {
      const serverResult = await this.syncToServer(operation);
      
      if (serverResult.success) {
        await this.db.updateOperationStatus(operation.id, 'completed');
        return { success: true, synced: true, queued: false };
      } else {
        throw new Error('Server rejected operation');
      }
    } catch (error) {
      // Handle race conditions and credit expiration scenarios
      if (this.isRaceCondition(error)) {
        this.metrics.raceConditionsDetected++;
        await this.handleRaceCondition(operation, error);
      }
      
      if (this.isCreditExpiration(error)) {
        this.metrics.creditExpirationsDuringOffline++;
        await this.handleCreditExpiration(error);
      }
      
      // Queue for retry
      await this.db.queueOperation({
        sessionId: this.sessionId,
        operation,
        type: operation.type,
        payload: operation.payload,
        error: error.message
      });
      
      return { success: false, synced: false, queued: true, error: error.message };
    }
  }

  applyLocalOperation(operation) {
    // Apply operation to CRDT manager for conflict-free merging
    if (operation.documentId) {
      _crdtManager ? _crdtManager.updateDocument.bind(_crdtManager) : (typeof crdtManager !== 'undefined' ? crdtManager.updateDocument.bind(crdtManager) : function() { console.warn('crdtManager not loaded'); })(operation.documentId, operation.payload);
    }
    
    // Update local state
    switch (operation.type) {
      case 'UPDATE_CREDITS':
        this.state.credits = operation.payload.credits;
        this.state.lastCreditCheck = Date.now();
        break;
      case 'START_INCONSISTENCY_WINDOW':
        this.state.inconsistencyWindow = {
          start: Date.now(),
          edgeNode: operation.payload.edgeNode,
          expectedDuration: operation.payload.duration
        };
        this.metrics.inconsistencyWindows.push({
          start: Date.now(),
          edgeNode: operation.payload.edgeNode
        });
        break;
      case 'END_INCONSISTENCY_WINDOW':
        if (this.state.inconsistencyWindow) {
          this.state.inconsistencyWindow.end = Date.now();
        }
        break;
    }
    
    this.emit('operation-applied', operation);
    return true;
  }

  async syncToServer(operation) {
    return this.circuitBreaker.execute(async () => {
      // Simulate server sync - in real implementation, this would call actual APIs
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          operation
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        error.status = response.status;
        throw error;
      }
      
      return response.json();
    });
  }

  /**
   * Detect race conditions in credit validation
   * Scenario: Offline operations replicated after credit expiration
   */
  isRaceCondition(error) {
    return (
      error.code === 'CREDIT_EXPIRED' ||
      error.code === 'QUOTA_EXCEEDED' ||
      error.message?.includes('credits expired') ||
      error.message?.includes('quota exceeded')
    );
  }

  /**
   * Detect credit expiration during offline period
   */
  isCreditExpiration(error) {
    if (!this.isRaceCondition(error)) return false;
    
    const offlineDuration = Date.now() - (this.state.lastCreditCheck || 0);
    
    // If we've been offline longer than typical credit refresh interval
    return offlineDuration > 300000; // 5 minutes
  }

  async handleRaceCondition(operation, error) {
    console.warn('[SessionManager] Race condition detected:', error);
    
    await this.db.logConflict({
      sessionId: this.sessionId,
      type: 'race-condition',
      operation,
      error: error.message,
      context: {
        offlineMode: this.state.offlineMode,
        lastCreditCheck: this.state.lastCreditCheck,
        inconsistencyWindow: this.state.inconsistencyWindow
      }
    });
    
    this.metrics.reconciliationConflicts++;
    
    // Emit event for UI to handle conflict resolution
    this.emit('race-condition', {
      operation,
      error,
      requiresResolution: true
    });
  }

  async handleCreditExpiration(error) {
    console.warn('[SessionManager] Credit expiration detected during offline period');
    
    this.state.credits = 0;
    this.state.offlineMode = true;
    
    await this.shadowSync();
    
    this.emit('credit-expired', {
      error,
      lastKnownCredits: this.state.credits,
      offlineSince: this.state.lastCreditCheck
    });
  }

  async handleOnline() {
    console.log('[SessionManager] Network online, starting sync');
    this.state.offlineMode = false;
    await this.shadowSync();
    this.startBackgroundSync();
  }

  async handleOffline() {
    console.log('[SessionManager] Network offline, entering offline mode');
    this.state.offlineMode = true;
    await this.shadowSync();
  }

  startBackgroundSync() {
    if (this.syncInProgress) return;
    
    this.syncInProgress = true;
    
    const syncLoop = async () => {
      try {
        const pendingOps = await this.db.getPendingOperations();
        
        for (const op of pendingOps) {
          if (this.state.offlineMode) break;
          
          try {
            const result = await this.syncToServer(op.operation);
            if (result.success) {
              await this.db.updateOperationStatus(op.id, 'completed');
            }
          } catch (error) {
            await this.db.updateOperationStatus(op.id, 'pending', error.message);
          }
        }
      } catch (error) {
        console.error('[SessionManager] Background sync error:', error);
      } finally {
        this.syncInProgress = false;
        
        // Continue syncing if there are more pending operations
        if (!this.state.offlineMode) {
          setTimeout(syncLoop, 5000); // Retry every 5 seconds
        }
      }
    };
    
    syncLoop();
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
        console.error('[SessionManager] Event listener error:', error);
      }
    }
  }

  getState() {
    return { ...this.state };
  }

  getMetrics() {
    return { ...this.metrics };
  }

  async getResearchData() {
    const conflicts = await this.db.getAllConflicts();
    return {
      metrics: this.getMetrics(),
      conflicts,
      circuitBreakerState: this.circuitBreaker.getStateInfo(),
      crdtState: _crdtManager ? _crdtManager.exportAllStates() : (typeof crdtManager !== 'undefined' ? crdtManager.exportAllStates() : {})
    };
  }
}

// Export singleton instance
const sessionManager = new SessionManager();

// Expose to global scope
if (typeof window !== 'undefined') {
  window.sessionManager = sessionManager;
  window.SessionManager = SessionManager;
}
