// DX Edge Middleware - Content Script Entry Point
// Integra todos os módulos: CRDT, Session Manager, WebSocket Interceptor e Financial Resilience

import { crdtManager } from './content/crdt-engine.js';
import { sessionManager } from './content/session-manager.js';
import { websocketInterceptor } from './content/websocket-interceptor.js';
import { 
  creditSyncAnalyzer, 
  failureSimulator,
  IncidentType,
  IncidentSeverity 
} from './content/financial-resilience-analyzer.js';

console.log('DX Edge Middleware - Financial Resilience Edition loaded');

/**
 * API global exposta para research e debugging no console da página
 */
window.DXEdgeMiddleware = {
  crdtManager,
  sessionManager,
  wsInterceptor: websocketInterceptor,
  
  // Financial Resilience Module
  creditSyncAnalyzer,
  failureSimulator,
  IncidentType,
  IncidentSeverity,
  
  /**
   * Exporta dados completos de research sobre incidentes de billing
   */
  async exportResearchData() {
    const creditData = creditSyncAnalyzer.exportAnalysisData();
    const sessionData = await sessionManager.getResearchData();
    const wsData = websocketInterceptor.exportData();
    
    return {
      timestamp: Date.now(),
      creditResilience: creditData,
      sessionMetrics: sessionData,
      websocketAnalysis: wsData,
      combinedMetrics: {
        totalIncidents: creditData.metrics.totalIncidents,
        splitBrainEvents: creditData.metrics.totalSplitBrainEvents,
        raceConditionsDetected: sessionData.metrics.raceConditionsDetected,
        creditExpirationsDuringOffline: sessionData.metrics.creditExpirationsDuringOffline,
        reconciliationConflicts: sessionData.metrics.reconciliationConflicts
      }
    };
  },
  
  /**
   * Executa simulações de cenários de falha para research
   */
  async runFailureSimulations() {
    console.log('[DXEdgeMiddleware] Running failure scenario simulations...');
    const results = await failureSimulator.runAllScenarios();
    console.log(`[DXEdgeMiddleware] Completed ${results.scenariosExecuted} scenarios`);
    console.log(`[DXEdgeMiddleware] Generated ${results.incidentsGenerated} incidents`);
    return results;
  },
  
  /**
   * Cria checkpoint de segurança manual
   */
  createSafetyCheckpoint(reason = 'manual_checkpoint') {
    const stateSnapshot = {
      crdt: crdtManager.exportAllStates(),
      session: sessionManager.getState(),
      credits: creditSyncAnalyzer.localCreditState
    };
    
    const checkpoint = creditSyncAnalyzer.createSafetyCheckpoint(reason, stateSnapshot);
    console.log('[DXEdgeMiddleware] Safety checkpoint created:', checkpoint.id);
    return checkpoint;
  },
  
  /**
   * Detecta split-brain manualmente entre estados local e remoto
   */
  detectSplitBrain(localCredits, remoteCredits) {
    return creditSyncAnalyzer.detectSplitBrain({ 
      credits: remoteCredits, 
      lastUpdate: Date.now() 
    });
  },
  
  /**
   * Baixa dados de research como arquivo JSON
   */
  async downloadResearchData() {
    const data = await this.exportResearchData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dx-edge-research-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('[DXEdgeMiddleware] Research data downloaded');
  },
  
  /**
   * Analisa padrões históricos de falha
   */
  analyzeFailurePatterns(timeRange) {
    return creditSyncAnalyzer.analyzeFailurePatterns(timeRange);
  },
  
  /**
   * Lista incidentes não resolvidos
   */
  getUnresolvedIncidents() {
    return creditSyncAnalyzer.incidentLog.filter(i => !i.resolved);
  },
  
  /**
   * Resolve incidente manualmente
   */
  resolveIncident(incidentId, resolutionNotes = '') {
    const incident = creditSyncAnalyzer.incidentLog.find(i => i.id === incidentId);
    if (incident) {
      incident.resolved = true;
      incident.resolutionTime = Date.now() - incident.timestamp;
      incident.resolutionNotes = resolutionNotes;
      console.log(`[DXEdgeMiddleware] Incident ${incidentId} resolved`);
      return { success: true, incident };
    }
    return { success: false, reason: 'incident_not_found' };
  },
  
  /**
   * Restaura estado a partir de checkpoint
   */
  restoreFromCheckpoint(checkpointId) {
    const result = creditSyncAnalyzer.restoreFromCheckpoint(checkpointId);
    if (result.success) {
      console.log(`[DXEdgeMiddleware] Restored from checkpoint: ${checkpointId}`);
    }
    return result;
  },
  
  /**
   * Lista checkpoints disponíveis
   */
  listCheckpoints() {
    return creditSyncAnalyzer.checkpointHistory.map(c => ({
      id: c.id,
      timestamp: c.timestamp,
      reason: c.reason,
      localCredits: c.localState.credits,
      remoteCredits: c.remoteState.credits
    }));
  }
};

// Inicializar interceptação WebSocket
websocketInterceptor.install();

// Expor função de inicialização para configuração customizada
window.DXEdgeMiddleware.initialize = async (options = {}) => {
  console.log('[DXEdgeMiddleware] Initializing with options:', options);
  
  // Configurar analyzer com plataforma específica
  if (options.platform) {
    creditSyncAnalyzer.platform = options.platform;
  }
  if (options.expectedRefillDay) {
    creditSyncAnalyzer.expectedRefillDay = options.expectedRefillDay;
  }
  
  // Inicializar session manager
  await sessionManager.initialize({
    sessionId: options.sessionId,
    platform: options.platform,
    failureThreshold: options.failureThreshold,
    resetTimeout: options.resetTimeout
  });
  
  // Sincronizar estado inicial de créditos se disponível
  if (options.initialCredits !== undefined) {
    creditSyncAnalyzer.updateLocalState(options.initialCredits);
    creditSyncAnalyzer.updateRemoteState(options.initialCredits);
  }
  
  console.log('[DXEdgeMiddleware] Initialization complete');
  return window.DXEdgeMiddleware;
};

// Auto-initialize com configurações padrão
window.DXEdgeMiddleware.initialize();

// Monitorar eventos de rede para detecção proativa de problemas
window.addEventListener('online', () => {
  console.log('[DXEdgeMiddleware] Network online - checking for sync issues');
  // Verificar divergências após reconexão
  setTimeout(() => {
    const divergence = creditSyncAnalyzer.detectSplitBrain({
      credits: creditSyncAnalyzer.remoteCreditState.credits,
      lastUpdate: Date.now()
    });
    if (divergence.detected) {
      console.warn('[DXEdgeMiddleware] Split-brain detected after reconnection:', divergence);
    }
  }, 2000);
});

window.addEventListener('offline', () => {
  console.log('[DXEdgeMiddleware] Network offline - creating safety checkpoint');
  window.DXEdgeMiddleware.createSafetyCheckpoint('network_offline');
});

console.log('[DXEdgeMiddleware] Use window.DXEdgeMiddleware.exportResearchData() to export analysis');
console.log('[DXEdgeMiddleware] Use window.DXEdgeMiddleware.runFailureSimulations() to test scenarios');