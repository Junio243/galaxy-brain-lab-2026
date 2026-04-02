/**
 * CRDT (Conflict-free Replicated Data Type) Engine
 * Implements local-first architecture with offline editing and later reconciliation
 * 
 * Uses a simplified LWW (Last-Writer-Wins) Register CRDT for text editing
 * with vector clocks for causality tracking
 */

(function(exports) {

class VectorClock {
  constructor(nodeId, initialClock = {}) {
    this.nodeId = nodeId;
    this.clock = { ...initialClock };
    if (!this.clock[nodeId]) {
      this.clock[nodeId] = 0;
    }
  }

  increment() {
    this.clock[this.nodeId]++;
    return this.getTimestamp();
  }

  getTimestamp() {
    return {
      nodeId: this.nodeId,
      timestamp: Date.now(),
      clock: { ...this.clock }
    };
  }

  merge(otherClock) {
    for (const [nodeId, time] of Object.entries(otherClock)) {
      this.clock[nodeId] = Math.max(this.clock[nodeId] || 0, time);
    }
    if (!this.clock[this.nodeId]) {
      this.clock[this.nodeId] = 0;
    }
    return this.getTimestamp();
  }

  happensBefore(other) {
    const otherClock = other.clock || other;
    let lessThan = false;
    
    for (const nodeId of new Set([...Object.keys(this.clock), ...Object.keys(otherClock)])) {
      const thisTime = this.clock[nodeId] || 0;
      const otherTime = otherClock[nodeId] || 0;
      
      if (thisTime > otherTime) {
        return false;
      }
      if (thisTime < otherTime) {
        lessThan = true;
      }
    }
    
    return lessThan;
  }

  concurrent(other) {
    return !this.happensBefore(other) && !other.happensBefore(this);
  }

  toJSON() {
    return { ...this.clock };
  }

  static fromJSON(json, nodeId) {
    return new VectorClock(nodeId, json);
  }
}

/**
 * LWW (Last-Writer-Wins) Register for text content
 */
class LWWRegister {
  constructor(nodeId, initialValue = '', initialTimestamp = null) {
    this.nodeId = nodeId;
    this.vectorClock = new VectorClock(nodeId);
    this.value = initialValue;
    this.timestamp = initialTimestamp || this.vectorClock.getTimestamp();
    this.operationLog = [];
  }

  set(newValue) {
    const timestamp = this.vectorClock.increment();
    const operation = {
      type: 'SET',
      value: newValue,
      timestamp,
      nodeId: this.nodeId
    };
    
    this.apply(operation);
    this.operationLog.push(operation);
    
    return operation;
  }

  apply(operation) {
    // LWW: Last writer wins based on timestamp comparison
    if (this.compareTimestamps(operation.timestamp, this.timestamp) > 0) {
      this.value = operation.value;
      this.timestamp = operation.timestamp;
      
      // Merge vector clocks
      this.vectorClock.merge(operation.timestamp.clock);
    }
    
    return this;
  }

  compareTimestamps(a, b) {
    // First compare by logical clock (vector clock)
    const aClock = a.clock || {};
    const bClock = b.clock || {};
    
    // Check if one happens before the other
    const aHappensBeforeB = this.happensBefore(aClock, bClock);
    const bHappensBeforeA = this.happensBefore(bClock, aClock);
    
    if (aHappensBeforeB) return -1;
    if (bHappensBeforeA) return 1;
    
    // Concurrent events: use physical timestamp as tiebreaker
    const aTime = a.timestamp || 0;
    const bTime = b.timestamp || 0;
    
    if (aTime < bTime) return -1;
    if (aTime > bTime) return 1;
    
    // Still tied: use nodeId as final tiebreaker for determinism
    return a.nodeId.localeCompare(b.nodeId);
  }

  happensBefore(clockA, clockB) {
    let lessThan = false;
    
    for (const nodeId of new Set([...Object.keys(clockA), ...Object.keys(clockB)])) {
      const timeA = clockA[nodeId] || 0;
      const timeB = clockB[nodeId] || 0;
      
      if (timeA > timeB) {
        return false;
      }
      if (timeA < timeB) {
        lessThan = true;
      }
    }
    
    return lessThan;
  }

  getValue() {
    return this.value;
  }

  getState() {
    return {
      value: this.value,
      timestamp: this.timestamp,
      vectorClock: this.vectorClock.toJSON(),
      operationLog: this.operationLog
    };
  }

  static fromState(state, nodeId) {
    const register = new LWWRegister(nodeId);
    register.value = state.value;
    register.timestamp = state.timestamp;
    register.vectorClock = VectorClock.fromJSON(state.vectorClock, nodeId);
    register.operationLog = state.operationLog || [];
    return register;
  }
}

/**
 * CRDT Document for multi-field state management
 */
class CRDTDocument {
  constructor(nodeId, documentId) {
    this.nodeId = nodeId;
    this.documentId = documentId;
    this.fields = new Map();
    this.vectorClock = new VectorClock(nodeId);
    this.pendingOperations = [];
    this.syncedOperations = [];
  }

  setField(fieldName, value) {
    if (!this.fields.has(fieldName)) {
      this.fields.set(fieldName, new LWWRegister(this.nodeId));
    }
    
    const register = this.fields.get(fieldName);
    const operation = register.set(value);
    operation.fieldName = fieldName;
    
    this.vectorClock.increment();
    this.pendingOperations.push(operation);
    
    return operation;
  }

  getField(fieldName) {
    const register = this.fields.get(fieldName);
    return register ? register.getValue() : undefined;
  }

  applyRemoteOperation(operation) {
    // Check if we already have this operation (idempotency)
    const exists = this.syncedOperations.some(
      op => op.timestamp.nodeId === operation.timestamp.nodeId &&
            op.timestamp.timestamp === operation.timestamp.timestamp
    );
    
    if (exists) {
      return false; // Already applied
    }

    if (!this.fields.has(operation.fieldName)) {
      this.fields.set(operation.fieldName, new LWWRegister(this.nodeId));
    }
    
    const register = this.fields.get(operation.fieldName);
    register.apply(operation);
    
    this.vectorClock.merge(operation.timestamp.clock);
    this.syncedOperations.push(operation);
    
    return true;
  }

  getPendingOperations() {
    return [...this.pendingOperations];
  }

  markOperationsSynced(operations) {
    this.pendingOperations = this.pendingOperations.filter(
      pending => !operations.some(
        synced => synced.timestamp.nodeId === pending.timestamp.nodeId &&
                  synced.timestamp.timestamp === pending.timestamp.timestamp
      )
    );
  }

  getAllFields() {
    const result = {};
    for (const [fieldName, register] of this.fields) {
      result[fieldName] = register.getValue();
    }
    return result;
  }

  getState() {
    return {
      documentId: this.documentId,
      nodeId: this.nodeId,
      fields: Array.from(this.fields.entries()).map(([name, reg]) => ({
        name,
        state: reg.getState()
      })),
      vectorClock: this.vectorClock.toJSON(),
      pendingOperations: this.pendingOperations,
      syncedOperations: this.syncedOperations
    };
  }

  static fromState(state, nodeId) {
    const doc = new CRDTDocument(nodeId, state.documentId);
    doc.vectorClock = VectorClock.fromJSON(state.vectorClock, nodeId);
    doc.pendingOperations = state.pendingOperations || [];
    doc.syncedOperations = state.syncedOperations || [];
    
    for (const fieldState of state.fields || []) {
      const register = LWWRegister.fromState(fieldState.state, nodeId);
      doc.fields.set(fieldState.name, register);
    }
    
    return doc;
  }
}

/**
 * CRDT Manager for handling multiple documents and sync operations
 */
class CRDTManager {
  constructor(nodeId) {
    this.nodeId = nodeId;
    this.documents = new Map();
    this.eventListeners = new Map();
  }

  getOrCreateDocument(documentId) {
    if (!this.documents.has(documentId)) {
      this.documents.set(documentId, new CRDTDocument(this.nodeId, documentId));
    }
    return this.documents.get(documentId);
  }

  updateDocument(documentId, updates) {
    const doc = this.getOrCreateDocument(documentId);
    const operations = [];
    
    for (const [field, value] of Object.entries(updates)) {
      const op = doc.setField(field, value);
      operations.push(op);
    }
    
    this.emit('update', { documentId, operations });
    
    return operations;
  }

  applyRemoteOperations(documentId, remoteOperations) {
    const doc = this.getOrCreateDocument(documentId);
    let hasChanges = false;
    
    for (const op of remoteOperations) {
      if (doc.applyRemoteOperation(op)) {
        hasChanges = true;
      }
    }
    
    if (hasChanges) {
      this.emit('sync', { documentId, operations: remoteOperations });
    }
    
    return hasChanges;
  }

  getPendingSyncOperations() {
    const allPending = [];
    
    for (const [documentId, doc] of this.documents) {
      const pending = doc.getPendingOperations();
      if (pending.length > 0) {
        allPending.push({
          documentId,
          operations: pending
        });
      }
    }
    
    return allPending;
  }

  markSynced(documentId, operations) {
    const doc = this.documents.get(documentId);
    if (doc) {
      doc.markOperationsSynced(operations);
    }
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
        console.error('[CRDTManager] Event listener error:', error);
      }
    }
  }

  exportAllStates() {
    const states = {};
    for (const [documentId, doc] of this.documents) {
      states[documentId] = doc.getState();
    }
    return states;
  }

  importStates(states) {
    for (const [documentId, state] of Object.entries(states)) {
      const doc = CRDTDocument.fromState(state, this.nodeId);
      this.documents.set(documentId, doc);
    }
  }
}

// Generate unique node ID for this instance
function generateNodeId() {
  return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Export singleton manager
const crdtManager = new CRDTManager(generateNodeId());

// Expose to global scope for other scripts
if (typeof window !== 'undefined') {
  window.crdtManager = crdtManager;
  window.VectorClock = VectorClock;
  window.LWWRegister = LWWRegister;
  window.CRDTDocument = CRDTDocument;
  window.CRDTManager = CRDTManager;
}

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
window.VectorClock = VectorClock;
window.LWWRegister = LWWRegister;
window.CRDTDocument = CRDTDocument;
window.CRDTManager = CRDTManager;
window.crdtManager = crdtManager;
