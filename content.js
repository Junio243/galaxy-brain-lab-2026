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
import { reactFreezer } from './content/react-state-freezer.js';
import { creditFreeze } from './content/credit-freeze.js';

console.log('DX Edge Middleware - Financial Resilience Edition loaded');

/**
 * LOVABLE-SPECIFIC FREEZE MODULE
 * Fortalece o freeze de créditos especificamente para a plataforma Lovable
 */
class LovableFreezeModule {
  constructor() {
    this.enabled = true;
    this.freezeInterval = null;
    this.domObserver = null;
    this.fakeCreditsRemaining = 999999;
    
    // Carregar estado persistente
    this.loadPersistedState();
    
    if (this.enabled) {
      this.initialize();
    }
  }
  
  /**
   * Inicializa módulo de freeze do Lovable
   */
  initialize() {
    console.log('[LovableFreeze] Initializing enhanced freeze module...');
    
    // Instalar interceptores reforçados
    this.installEnhancedFetchInterceptor();
    this.installDOMFreeze();
    this.installStorageFreeze();
    
    // Sync periódico
    this.startPeriodicSync();
    
    console.log('[LovableFreeze] Enhanced freeze module active');
  }
  
  /**
   * Instala interceptor fetch reforçado para Lovable
   */
  installEnhancedFetchInterceptor() {
    const self = this;
    const originalFetch = window.fetch;
    
    window.fetch = async function(...args) {
      const [url, options] = args;
      const urlString = typeof url === 'string' ? url : url.url || url.href || '';
      
      // Verificar se é endpoint crítico do Lovable usando DataAuditInterceptor
      const isCritical = window.LovableFreezeInterceptor?.isLovableCriticalEndpoint?.(urlString) || false;
      
      if (isCritical && self.enabled) {
        console.log('[LovableFreeze] Intercepting critical endpoint:', urlString);
        
        try {
          const response = await originalFetch.apply(this, args);
          
          // Modificar resposta se for JSON
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = await response.clone().json();
            const frozenData = window.LovableFreezeInterceptor?.freezeCreditData?.(data) || data;
            
            return new Response(JSON.stringify(frozenData), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            });
          }
          
          return response;
          
        } catch (error) {
          // Se erro relacionado a créditos, retornar resposta fake
          if (error.message?.includes('402') || error.message?.toLowerCase().includes('credit')) {
            console.warn('[LovableFreeze] Credit error detected, returning fake response');
            const fakeData = window.LovableFreezeInterceptor?.createFakeCreditResponse?.() || {};
            return new Response(JSON.stringify(fakeData), {
              status: 200,
              statusText: 'OK',
              headers: new Headers({ 'Content-Type': 'application/json' })
            });
          }
          throw error;
        }
      }
      
      return originalFetch.apply(this, args);
    };
    
    console.log('[LovableFreeze] Enhanced fetch interceptor installed');
  }
  
  /**
   * Instala freeze direto no DOM para elementos de créditos
   */
  installDOMFreeze() {
    const self = this;
    
    // Seletores específicos do Lovable
    const lovableSelectors = [
      '[class*="credit"]',
      '[class*="balance"]',
      '[class*="quota"]',
      '[class*="usage"]',
      '[class*="billing"]',
      '[data-testid*="credit"]',
      '[aria-label*="credit"]',
      '.credit-display',
      '.credit-balance',
      '.usage-counter',
      '.billing-info'
    ];
    
    const selector = lovableSelectors.join(', ');
    
    // Função para congelar elemento
    function freezeElement(el) {
      if (!el || el._dxFrozen) return;
      
      const text = el.textContent || el.innerText || '';
      
      // Detectar se contém números que parecem créditos
      const creditPattern = /(\d+[\d,]*(?:\.\d+)?)/g;
      const matches = text.match(creditPattern);
      
      if (matches) {
        for (const match of matches) {
          const value = parseInt(match.replace(/,/g, ''));
          
          // Se valor for baixo (possível consumo), substituir por valor fake
          if (value >= 0 && value < 10000) {
            const newText = text.replace(match, self.fakeCreditsRemaining.toString());
            
            if (el.textContent !== undefined) {
              el.textContent = newText;
            } else if (el.innerText !== undefined) {
              el.innerText = newText;
            }
            
            console.log('[LovableFreeze] DOM element frozen:', el);
          }
        }
      }
      
      el._dxFrozen = true;
    }
    
    // Congelar elementos existentes
    document.querySelectorAll(selector).forEach(freezeElement);
    
    // Observer para novos elementos
    this.domObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element node
            if (node.matches && node.matches(selector)) {
              freezeElement(node);
            }
            node.querySelectorAll(selector).forEach(freezeElement);
          }
        });
      });
    });
    
    this.domObserver.observe(document.body, { childList: true, subtree: true });
    
    console.log('[LovableFreeze] DOM freeze installed');
  }
  
  /**
   * Instala freeze em localStorage/sessionStorage
   */
  installStorageFreeze() {
    const self = this;
    
    // Intercepta leituras de localStorage
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key) {
      const value = originalGetItem.call(this, key);
      
      // Se chave relacionada a créditos/usage/billing
      if (key.toLowerCase().includes('credit') || 
          key.toLowerCase().includes('usage') ||
          key.toLowerCase().includes('billing') ||
          key.toLowerCase().includes('quota')) {
        
        try {
          const parsed = JSON.parse(value);
          const frozen = window.LovableFreezeInterceptor?.freezeCreditData?.(parsed) || parsed;
          return JSON.stringify(frozen);
        } catch (e) {
          // Não é JSON, retornar original
        }
      }
      
      return value;
    };
    
    console.log('[LovableFreeze] Storage freeze installed');
  }
  
  /**
   * Inicia sync periódico
   */
  startPeriodicSync() {
    const self = this;
    
    this.freezeInterval = setInterval(() => {
      if (!self.enabled) return;
      
      // Sync com React Freezer
      reactFreezer?.syncFrozenComponents?.();
      
      // Sync com Credit Freeze
      creditFreeze?.syncWithDOM?.();
      
      // Persistir estado
      self.persistState();
      
    }, 1000);
    
    console.log('[LovableFreeze] Periodic sync started');
  }
  
  /**
   * Carrega estado persistente
   */
  loadPersistedState() {
    try {
      const stored = localStorage.getItem('lovable_freeze_state_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.fakeCreditsRemaining = parsed.fakeCreditsRemaining || this.fakeCreditsRemaining;
        this.enabled = parsed.enabled !== false;
        console.log('[LovableFreeze] Loaded persisted state:', this.fakeCreditsRemaining);
      }
    } catch (e) {
      console.warn('[LovableFreeze] Failed to load persisted state:', e);
    }
  }
  
  /**
   * Persiste estado
   */
  persistState() {
    try {
      localStorage.setItem('lovable_freeze_state_v1', JSON.stringify({
        fakeCreditsRemaining: this.fakeCreditsRemaining,
        enabled: this.enabled,
        lastUpdated: Date.now()
      }));
    } catch (e) {
      console.warn('[LovableFreeze] Failed to persist state:', e);
    }
  }
  
  /**
   * Atualiza quantidade de créditos fake
   */
  setFakeCredits(amount) {
    this.fakeCreditsRemaining = amount;
    this.persistState();
    console.log('[LovableFreeze] Fake credits updated to:', amount);
  }
  
  /**
   * Habilita/desabilita módulo
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log('[LovableFreeze] Module', enabled ? 'enabled' : 'disabled');
  }
  
  /**
   * Cleanup
   */
  destroy() {
    if (this.freezeInterval) {
      clearInterval(this.freezeInterval);
    }
    if (this.domObserver) {
      this.domObserver.disconnect();
    }
    console.log('[LovableFreeze] Module destroyed');
  }
}

// Criar instância global
const lovableFreeze = new LovableFreezeModule();
window.LovableFreezeModule = lovableFreeze;

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
  
  // Lovable Freeze Module (NEW)
  lovableFreeze,
  LovableFreezeModule,
  
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
      lovableFreezeState: lovableFreeze.getState ? lovableFreeze.getState() : {},
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