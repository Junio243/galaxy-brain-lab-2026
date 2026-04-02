// DX Edge Middleware - Content Script Entry Point (Bundled Version)
// Versão bundificada sem ES Modules para compatibilidade com Chrome Content Scripts

// Inline all dependencies from content/ directory
(function() {
  'use strict';

  console.log('[DX Edge Middleware] Bundled version initializing...');

  // CRDT Engine (inline from content/crdt-engine.js)
  var VectorClock = (function() {
    function VectorClock(nodeId, initialClock) {
      this.nodeId = nodeId;
      this.clock = Object.assign({}, initialClock || {});
      if (!this.clock[nodeId]) {
        this.clock[nodeId] = 0;
      }
    }
    VectorClock.prototype.increment = function() {
      this.clock[this.nodeId]++;
      return this.getTimestamp();
    };
    VectorClock.prototype.getTimestamp = function() {
      return {
        nodeId: this.nodeId,
        timestamp: Date.now(),
        clock: Object.assign({}, this.clock)
      };
    };
    VectorClock.prototype.merge = function(otherClock) {
      for (var nodeId in otherClock) {
        if (otherClock.hasOwnProperty(nodeId)) {
          var time = otherClock[nodeId];
          this.clock[nodeId] = Math.max(this.clock[nodeId] || 0, time);
        }
      }
      if (!this.clock[this.nodeId]) {
        this.clock[this.nodeId] = 0;
      }
      return this.getTimestamp();
    };
    VectorClock.prototype.happensBefore = function(other) {
      var otherClock = other.clock || other;
      var lessThan = false;
      var allNodes = Object.keys(Object.assign({}, this.clock, otherClock));
      for (var i = 0; i < allNodes.length; i++) {
        var nodeId = allNodes[i];
        var thisTime = this.clock[nodeId] || 0;
        var otherTime = otherClock[nodeId] || 0;
        if (thisTime > otherTime) return false;
        if (thisTime < otherTime) lessThan = true;
      }
      return lessThan;
    };
    return VectorClock;
  })();

  // LWW Register
  var LWWRegister = (function() {
    function LWWRegister(nodeId, value, timestamp) {
      this.nodeId = nodeId;
      this.value = value;
      this.timestamp = timestamp || { nodeId: nodeId, timestamp: Date.now(), clock: {} };
    }
    LWWRegister.prototype.set = function(value, timestamp) {
      if (!timestamp || (timestamp.timestamp > this.timestamp.timestamp)) {
        this.value = value;
        this.timestamp = timestamp;
        return true;
      }
      return false;
    };
    LWWRegister.prototype.get = function() {
      return this.value;
    };
    LWWRegister.prototype.getState = function() {
      return {
        nodeId: this.nodeId,
        value: this.value,
        timestamp: this.timestamp
      };
    };
    LWWRegister.fromState = function(state, localNodeId) {
      return new LWWRegister(state.nodeId, state.value, state.timestamp);
    };
    return LWWRegister;
  })();

  // CRDT Document
  var CRDTDocument = (function() {
    function CRDTDocument(documentId, nodeId) {
      this.documentId = documentId;
      this.nodeId = nodeId;
      this.registers = {};
      this.vectorClock = new VectorClock(nodeId);
    }
    CRDTDocument.prototype.applyOperation = function(op) {
      var register = this.registers[op.position];
      if (!register) {
        register = new LWWRegister(this.nodeId, '');
        this.registers[op.position] = register;
      }
      var applied = register.set(op.value, op.timestamp);
      if (applied) {
        this.vectorClock.merge(op.timestamp.clock);
      }
      return applied;
    };
    CRDTDocument.prototype.getContent = function() {
      var positions = Object.keys(this.registers).map(Number).sort(function(a, b) { return a - b; });
      return positions.map(function(pos) {
        return this.registers[pos].get();
      }, this).join('');
    };
    CRDTDocument.prototype.getState = function() {
      var registersState = {};
      for (var pos in this.registers) {
        if (this.registers.hasOwnProperty(pos)) {
          registersState[pos] = this.registers[pos].getState();
        }
      }
      return {
        documentId: this.documentId,
        nodeId: this.nodeId,
        registers: registersState,
        vectorClock: this.vectorClock.clock
      };
    };
    CRDTDocument.fromState = function(state, localNodeId) {
      var doc = new CRDTDocument(state.documentId, localNodeId || state.nodeId);
      doc.vectorClock = new VectorClock(localNodeId || state.nodeId, state.vectorClock);
      for (var pos in state.registers) {
        if (state.registers.hasOwnProperty(pos)) {
          doc.registers[pos] = LWWRegister.fromState(state.registers[pos], localNodeId);
        }
      }
      return doc;
    };
    return CRDTDocument;
  })();

  // CRDT Manager
  var CRDTManager = (function() {
    function CRDTManager(nodeId) {
      this.nodeId = nodeId;
      this.documents = new Map();
    }
    CRDTManager.prototype.getDocument = function(documentId) {
      if (!this.documents.has(documentId)) {
        this.documents.set(documentId, new CRDTDocument(documentId, this.nodeId));
      }
      return this.documents.get(documentId);
    };
    CRDTManager.prototype.exportAllStates = function() {
      var states = {};
      this.documents.forEach(function(doc, id) {
        states[id] = doc.getState();
      });
      return states;
    };
    CRDTManager.prototype.importStates = function(states) {
      var self = this;
      Object.keys(states).forEach(function(documentId) {
        var state = states[documentId];
        var doc = CRDTDocument.fromState(state, self.nodeId);
        self.documents.set(documentId, doc);
      });
    };
    return CRDTManager;
  })();

  function generateNodeId() {
    return 'node-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  var crdtManager = new CRDTManager(generateNodeId());

  // Expose to window
  if (typeof window !== 'undefined') {
    window.crdtManager = crdtManager;
    window.VectorClock = VectorClock;
    window.LWWRegister = LWWRegister;
    window.CRDTDocument = CRDTDocument;
    window.CRDTManager = CRDTManager;
  }

  console.log('[CRDT Engine] Initialized');

  // Session Manager (simplified inline version)
  var ShadowSyncDB = (function() {
    function ShadowSyncDB(dbName) {
      this.dbName = dbName || 'dx-edge-middleware';
      this.db = null;
      this.version = 1;
    }
    ShadowSyncDB.prototype.open = function() {
      var self = this;
      if (this.db) return Promise.resolve(this.db);
      return new Promise(function(resolve, reject) {
        var request = indexedDB.open(self.dbName, self.version);
        request.onerror = function() { reject(request.error); };
        request.onsuccess = function() {
          self.db = request.result;
          resolve(self.db);
        };
        request.onupgradeneeded = function(event) {
          var db = event.target.result;
          if (!db.objectStoreNames.contains('sessions')) {
            var sessionsStore = db.createObjectStore('sessions', { keyPath: 'sessionId' });
            sessionsStore.createIndex('status', 'status', { unique: false });
            sessionsStore.createIndex('lastModified', 'lastModified', { unique: false });
          }
          if (!db.objectStoreNames.contains('operations')) {
            var opsStore = db.createObjectStore('operations', { keyPath: 'id', autoIncrement: true });
            opsStore.createIndex('sessionId', 'sessionId', { unique: false });
            opsStore.createIndex('status', 'status', { unique: false });
          }
        };
      });
    };
    return ShadowSyncDB;
  })();

  var SessionManager = (function() {
    function SessionManager() {
      this.db = new ShadowSyncDB();
      this.currentSession = null;
      this.isOnline = navigator.onLine;
      this.conflictCallbacks = [];
    }
    SessionManager.prototype.initialize = function(options) {
      var self = this;
      this.platform = options.platform || 'unknown';
      return this.db.open().then(function() {
        return self.createOrLoadSession();
      }).then(function(session) {
        self.currentSession = session;
        window.addEventListener('online', function() { self.handleOnline(); });
        window.addEventListener('offline', function() { self.handleOffline(); });
        console.log('[SessionManager] Initialized with session:', session.sessionId);
        return session;
      });
    };
    SessionManager.prototype.createOrLoadSession = function() {
      var self = this;
      return new Promise(function(resolve) {
        var sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        var session = {
          sessionId: sessionId,
          platform: self.platform,
          createdAt: Date.now(),
          lastModified: Date.now(),
          status: 'active',
          syncStatus: 'pending',
          operations: []
        };
        resolve(session);
      });
    };
    SessionManager.prototype.handleOnline = function() {
      this.isOnline = true;
      console.log('[SessionManager] Online - syncing pending operations');
      this.syncPendingOperations();
    };
    SessionManager.prototype.handleOffline = function() {
      this.isOnline = false;
      console.log('[SessionManager] Offline - queueing operations locally');
    };
    SessionManager.prototype.syncPendingOperations = function() {
      console.log('[SessionManager] Syncing operations...');
    };
    SessionManager.prototype.getMetrics = function() {
      return {
        sessionId: this.currentSession ? this.currentSession.sessionId : null,
        isOnline: this.isOnline,
        platform: this.platform
      };
    };
    SessionManager.prototype.exportState = function() {
      return {
        metrics: this.getMetrics(),
        conflicts: [],
        crdtState: crdtManager ? crdtManager.exportAllStates() : {}
      };
    };
    return SessionManager;
  })();

  var sessionManager = new SessionManager();

  if (typeof window !== 'undefined') {
    window.sessionManager = sessionManager;
    window.SessionManager = SessionManager;
    window.ShadowSyncDB = ShadowSyncDB;
  }

  console.log('[Session Manager] Initialized');

  // Credit Freeze Module
  var creditFreeze = {
    enabled: false,
    freezeLevel: 'full',
    protectedElements: [],
    
    enable: function(level) {
      this.enabled = true;
      this.freezeLevel = level || 'full';
      this.protectCreditElements();
      console.log('[CreditFreeze] Enabled with level:', this.freezeLevel);
    },
    
    disable: function() {
      this.enabled = false;
      this.unprotectCreditElements();
      console.log('[CreditFreeze] Disabled');
    },
    
    protectCreditElements: function() {
      var self = this;
      var selectors = [
        '[data-testid*="credit"]',
        '[class*="credit"]',
        '[id*="credit"]',
        '.billing-info',
        '.usage-info',
        '[data-credit]',
        '[data-usage]'
      ];
      
      selectors.forEach(function(selector) {
        var elements = document.querySelectorAll(selector);
        elements.forEach(function(el) {
          if (self.protectedElements.indexOf(el) === -1) {
            self.protectedElements.push(el);
            el.style.pointerEvents = 'none';
            el.setAttribute('data-frozen', 'true');
          }
        });
      });
    },
    
    unprotectCreditElements: function() {
      this.protectedElements.forEach(function(el) {
        el.style.pointerEvents = '';
        el.removeAttribute('data-frozen');
      });
      this.protectedElements = [];
    },
    
    getStatus: function() {
      return {
        enabled: this.enabled,
        freezeLevel: this.freezeLevel,
        protectedCount: this.protectedElements.length
      };
    }
  };

  if (typeof window !== 'undefined') {
    window.creditFreeze = creditFreeze;
  }

  console.log('[Credit Freeze] Module loaded');

  // Main initialization
  async function initializeMiddleware() {
    try {
      await sessionManager.initialize({
        platform: detectPlatform()
      });

      console.log('[DX Edge Middleware] Initialized successfully');

      // Initialize credit freeze
      if (window.creditFreeze) {
        console.log('[CreditFreeze] Module integration starting...');
      }

    } catch (error) {
      console.error('[DX Edge Middleware] Initialization failed:', error);
    }
  }

  function detectPlatform() {
    if (window.location.hostname.includes('lovable.dev') || 
        window.location.hostname.includes('lovable.app')) {
      return 'lovable';
    }
    return 'web';
  }

  // Start initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMiddleware);
  } else {
    initializeMiddleware();
  }

  // Expose API to window
  window.DXEdgeMiddleware = {
    initialize: initializeMiddleware,
    getSessionManager: function() { return sessionManager; },
    getCRDTManager: function() { return crdtManager; },
    getCreditFreeze: function() { return creditFreeze; },
    exportResearchData: function() {
      return Promise.resolve({
        session: sessionManager.exportState(),
        crdt: crdtManager.exportAllStates(),
        creditFreeze: creditFreeze.getStatus(),
        timestamp: Date.now()
      });
    }
  };

  console.log('[DX Edge Middleware] Bundled version ready');

})();
