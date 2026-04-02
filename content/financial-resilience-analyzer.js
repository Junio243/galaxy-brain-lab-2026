/**
 * Financial Resilience Analyzer
 * 
 * Módulo especializado em detectar, registrar e analisar incidentes de 
 * "credit desync" em plataformas de IA generativa.
 * 
 * Foco em edge cases de sistemas distribuídos com Supabase/Postgres como source of truth:
 * - Refills atrasados (monthly refill não processado no tempo esperado)
 * - Créditos não refletidos (compra via Stripe webhook não reconciliada)
 * - Permissões incorretas (estado local permite operações que deveriam estar bloqueadas)
 * - Split-brain em contadores de quota (divergência local vs remote)
 */

import { sessionManager } from './session-manager.js';
import { crdtManager } from './crdt-engine.js';

/**
 * Tipos de incidentes de billing que causam perda de acesso
 */
export const IncidentType = {
  /** Refill mensal atrasado além da janela esperada */
  DELAYED_REFILL: 'delayed_refill',
  
  /** Compra via Stripe não refletida após webhook confirmado */
  CREDIT_NOT_REFLECTED: 'credit_not_reflected',
  
  /** Estado local diverge do servidor (split-brain) */
  SPLIT_BRAIN_QUOTA: 'split_brain_quota',
  
  /** Operação executada localmente que deveria estar bloqueada */
  OVERQUOTA_OPERATION: 'overquota_operation',
  
  /** Webhook de reconciliação falhou ou atrasou */
  WEBHOOK_RECONCILIATION_FAILURE: 'webhook_reconciliation_failure',
  
  /** Race condition entre expiração e operação offline */
  OFFLINE_EXPIRATION_RACE: 'offline_expiration_race',
  
  /** Inconsistência entre edge nodes durante sync */
  EDGE_NODE_INCONSISTENCY: 'edge_node_inconsistency',
  
  /** Credit counter negativo devido a async processing */
  NEGATIVE_CREDIT_COUNTER: 'negative_credit_counter'
};

/**
 * Severidade do incidente
 */
export const IncidentSeverity = {
  LOW: 'low',           // Impacto mínimo, auto-resolvável
  MEDIUM: 'medium',     // Requer intervenção manual
  HIGH: 'high',         // Perda temporária de acesso
  CRITICAL: 'critical'  // Perda de dados ou corrupção de estado
};

/**
 * Detector de anomalias de sincronização de créditos
 */
export class CreditSyncAnalyzer {
  constructor(options = {}) {
    this.platform = options.platform || 'unknown';
    this.expectedRefillDay = options.expectedRefillDay || 1;
    this.expectedWebhookLatency = options.expectedWebhookLatency || 5000; // 5 segundos
    this.creditCheckInterval = options.creditCheckInterval || 60000; // 1 minuto
    
    this.localCreditState = {
      credits: null,
      lastUpdate: null,
      pendingTransactions: [],
      version: 0
    };
    
    this.remoteCreditState = {
      credits: null,
      lastUpdate: null,
      serverVersion: 0
    };
    
    this.incidentLog = [];
    this.splitBrainEvents = [];
    this.checkpointHistory = [];
    
    // Thresholds para detecção de anomalias
    this.thresholds = {
      maxCreditDivergence: options.maxCreditDivergence || 10, // 10 créditos de diferença
      maxRefillDelay: options.maxRefillDelay || 3600000, // 1 hora
      maxWebhookLatency: options.maxWebhookLatency || 30000, // 30 segundos
      splitBrainWindow: options.splitBrainWindow || 10000 // 10 segundos
    };
  }

  /**
   * Atualiza estado local de créditos
   */
  updateLocalState(credits, metadata = {}) {
    const previousCredits = this.localCreditState.credits;
    
    this.localCreditState = {
      credits,
      lastUpdate: Date.now(),
      pendingTransactions: this.localCreditState.pendingTransactions,
      version: this.localCreditState.version + 1,
      previousCredits,
      ...metadata
    };
    
    return this.localCreditState;
  }

  /**
   * Atualiza estado remoto (servidor) e detecta divergências
   */
  updateRemoteState(credits, serverMetadata = {}) {
    const previousRemote = { ...this.remoteCreditState };
    
    this.remoteCreditState = {
      credits,
      lastUpdate: Date.now(),
      serverVersion: serverMetadata.version || this.remoteCreditState.serverVersion + 1,
      transactionId: serverMetadata.transactionId,
      source: serverMetadata.source // 'refill', 'purchase', 'usage', 'reconciliation'
    };
    
    // Detectar split-brain
    const divergence = this.detectSplitBrain(previousRemote);
    
    if (divergence.detected) {
      this.logIncident({
        type: IncidentType.SPLIT_BRAIN_QUOTA,
        severity: IncidentSeverity.HIGH,
        details: {
          localCredits: this.localCreditState.credits,
          remoteCredits: this.remoteCreditState.credits,
          divergenceAmount: divergence.amount,
          previousRemote: previousRemote.credits,
          timestamp: Date.now()
        }
      });
    }
    
    return { divergence, newState: this.remoteCreditState };
  }

  /**
   * Detecta estado split-brain entre local e remote
   */
  detectSplitBrain(previousRemote) {
    const localCredits = this.localCreditState.credits;
    const remoteCredits = this.remoteCreditState.credits;
    
    if (localCredits === null || remoteCredits === null) {
      return { detected: false };
    }
    
    const divergence = Math.abs(localCredits - remoteCredits);
    const detected = divergence > this.thresholds.maxCreditDivergence;
    
    if (detected) {
      const event = {
        timestamp: Date.now(),
        localCredits,
        remoteCredits,
        divergence,
        previousRemote: previousRemote.credits,
        duration: this.remoteCreditState.lastUpdate - (previousRemote.lastUpdate || 0)
      };
      
      this.splitBrainEvents.push(event);
    }
    
    return { detected, amount: divergence, event: detected ? this.splitBrainEvents[this.splitBrainEvents.length - 1] : null };
  }

  /**
   * Registra transação pendente (ex: compra via Stripe em processamento)
   */
  registerPendingTransaction(transaction) {
    this.localCreditState.pendingTransactions.push({
      id: transaction.id,
      type: transaction.type, // 'purchase', 'refund', 'adjustment'
      amount: transaction.amount,
      status: 'pending',
      createdAt: Date.now(),
      expectedCompletion: Date.now() + this.expectedWebhookLatency,
      provider: transaction.provider // 'stripe', 'paddle', etc.
    });
    
    return transaction.id;
  }

  /**
   * Marca transação como completada e verifica se créditos foram refletidos
   */
  completeTransaction(transactionId, actualCredits) {
    const txIndex = this.localCreditState.pendingTransactions.findIndex(t => t.id === transactionId);
    
    if (txIndex === -1) {
      console.warn('[CreditSyncAnalyzer] Transaction not found:', transactionId);
      return { success: false, reason: 'transaction_not_found' };
    }
    
    const transaction = this.localCreditState.pendingTransactions[txIndex];
    const latency = Date.now() - transaction.createdAt;
    const expectedCredits = this.localCreditState.credits + transaction.amount;
    const creditMismatch = Math.abs(actualCredits - expectedCredits);
    
    // Remover da lista de pendentes
    this.localCreditState.pendingTransactions.splice(txIndex, 1);
    
    // Verificar se créditos foram corretamente refletidos
    if (creditMismatch > this.thresholds.maxCreditDivergence) {
      this.logIncident({
        type: IncidentType.CREDIT_NOT_REFLECTED,
        severity: IncidentSeverity.MEDIUM,
        details: {
          transactionId,
          expectedCredits,
          actualCredits,
          mismatch: creditMismatch,
          latency,
          expectedLatency: this.expectedWebhookLatency
        }
      });
      
      return { 
        success: false, 
        reason: 'credit_mismatch',
        expectedCredits,
        actualCredits 
      };
    }
    
    // Verificar latência do webhook
    if (latency > this.thresholds.maxWebhookLatency) {
      this.logIncident({
        type: IncidentType.WEBHOOK_RECONCILIATION_FAILURE,
        severity: IncidentSeverity.LOW,
        details: {
          transactionId,
          latency,
          threshold: this.thresholds.maxWebhookLatency
        }
      });
    }
    
    return { success: true, latency };
  }

  /**
   * Detecta refill mensal atrasado
   */
  checkDelayedRefill(expectedRefillTimestamp) {
    const now = Date.now();
    const delay = now - expectedRefillTimestamp;
    
    if (delay > this.thresholds.maxRefillDelay) {
      this.logIncident({
        type: IncidentType.DELAYED_REFILL,
        severity: IncidentSeverity.HIGH,
        details: {
          expectedRefillTimestamp,
          actualDelay: delay,
          threshold: this.thresholds.maxRefillDelay,
          daysOverdue: Math.floor(delay / 86400000)
        }
      });
      
      return { delayed: true, delay, daysOverdue: Math.floor(delay / 86400000) };
    }
    
    return { delayed: false, delay };
  }

  /**
   * Cria checkpoint de segurança quando detecta anomalias
   */
  createSafetyCheckpoint(reason, stateSnapshot) {
    const checkpoint = {
      id: `checkpoint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      reason,
      localState: { ...this.localCreditState },
      remoteState: { ...this.remoteCreditState },
      splitBrainEvents: this.splitBrainEvents.slice(-10),
      pendingTransactions: [...this.localCreditState.pendingTransactions],
      serializedProjectState: stateSnapshot
    };
    
    this.checkpointHistory.push(checkpoint);
    
    // Manter apenas últimos 50 checkpoints
    if (this.checkpointHistory.length > 50) {
      this.checkpointHistory.shift();
    }
    
    return checkpoint;
  }

  /**
   * Registra incidente de forma estruturada
   */
  logIncident(incident) {
    const loggedIncident = {
      id: `incident-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      platform: this.platform,
      timestamp: Date.now(),
      ...incident,
      resolved: false,
      resolutionTime: null
    };
    
    this.incidentLog.push(loggedIncident);
    
    console.warn(`[CreditSyncAnalyzer] Incident logged: ${incident.type} (${incident.severity})`);
    
    // Emitir evento para session manager
    sessionManager.db?.logConflict({
      sessionId: sessionManager.sessionId,
      type: 'billing-incident',
      incident: loggedIncident,
      context: {
        localCredits: this.localCreditState.credits,
        remoteCredits: this.remoteCreditState.credits,
        pendingTransactions: this.localCreditState.pendingTransactions.length
      }
    });
    
    return loggedIncident;
  }

  /**
   * Detecta operações overquota (executadas quando deveriam estar bloqueadas)
   */
  detectOverquotaOperation(operation, availableCredits, requiredCredits) {
    if (requiredCredits > availableCredits) {
      this.logIncident({
        type: IncidentType.OVERQUOTA_OPERATION,
        severity: IncidentSeverity.CRITICAL,
        details: {
          operation,
          availableCredits,
          requiredCredits,
          deficit: requiredCredits - availableCredits,
          executionContext: {
            offlineMode: sessionManager.state.offlineMode,
            lastCreditCheck: sessionManager.state.lastCreditCheck
          }
        }
      });
      
      return { detected: true, deficit: requiredCredits - availableCredits };
    }
    
    return { detected: false };
  }

  /**
   * Analisa padrão histórico de falhas
   */
  analyzeFailurePatterns(timeRange = { start: 0, end: Date.now() }) {
    const incidentsInRange = this.incidentLog.filter(
      i => i.timestamp >= timeRange.start && i.timestamp <= timeRange.end
    );
    
    const patterns = {
      totalIncidents: incidentsInRange.length,
      byType: {},
      bySeverity: {},
      avgResolutionTime: null,
      recurringIssues: [],
      peakFailureHours: []
    };
    
    // Agrupar por tipo
    for (const incident of incidentsInRange) {
      patterns.byType[incident.type] = (patterns.byType[incident.type] || 0) + 1;
      patterns.bySeverity[incident.severity] = (patterns.bySeverity[incident.severity] || 0) + 1;
    }
    
    // Calcular tempo médio de resolução
    const resolvedIncidents = incidentsInRange.filter(i => i.resolved && i.resolutionTime);
    if (resolvedIncidents.length > 0) {
      const totalTime = resolvedIncidents.reduce((sum, i) => sum + i.resolutionTime, 0);
      patterns.avgResolutionTime = totalTime / resolvedIncidents.length;
    }
    
    // Identificar issues recorrentes
    for (const [type, count] of Object.entries(patterns.byType)) {
      if (count >= 3) {
        patterns.recurringIssues.push({ type, count });
      }
    }
    
    // Analisar horas de pico de falha
    const hourCounts = {};
    for (const incident of incidentsInRange) {
      const hour = new Date(incident.timestamp).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
    
    const maxCount = Math.max(...Object.values(hourCounts), 0);
    patterns.peakFailureHours = Object.entries(hourCounts)
      .filter(([_, count]) => count >= maxCount * 0.8)
      .map(([hour]) => parseInt(hour));
    
    return patterns;
  }

  /**
   * Exporta dados completos para análise
   */
  exportAnalysisData() {
    return {
      platform: this.platform,
      exportTimestamp: Date.now(),
      currentstate: {
        local: this.localCreditState,
        remote: this.remoteCreditState
      },
      incidents: this.incidentLog,
      splitBrainEvents: this.splitBrainEvents,
      checkpoints: this.checkpointHistory,
      failurePatterns: this.analyzeFailurePatterns(),
      metrics: {
        totalIncidents: this.incidentLog.length,
        totalSplitBrainEvents: this.splitBrainEvents.length,
        unresolvedIncidents: this.incidentLog.filter(i => !i.resolved).length,
        pendingTransactions: this.localCreditState.pendingTransactions.length
      }
    };
  }

  /**
   * Restaura estado a partir de checkpoint
   */
  restoreFromCheckpoint(checkpointId) {
    const checkpoint = this.checkpointHistory.find(c => c.id === checkpointId);
    
    if (!checkpoint) {
      return { success: false, reason: 'checkpoint_not_found' };
    }
    
    this.localCreditState = { ...checkpoint.localState };
    this.remoteCreditState = { ...checkpoint.remoteState };
    
    return { 
      success: true, 
      checkpoint,
      restoredAt: Date.now()
    };
  }
}

/**
 * Simulador de cenários de falha para testing e research
 */
export class FailureScenarioSimulator {
  constructor(analyzer) {
    this.analyzer = analyzer;
    this.scenarioResults = [];
  }

  /**
   * Simula cenário: Refill atrasado com usuário tentando operar
   */
  async simulateDelayedRefill() {
    const scenario = {
      name: 'delayed_refill_with_user_operations',
      description: 'Refill mensal atrasado enquanto usuário tenta executar operações',
      steps: []
    };

    // Setup inicial
    this.analyzer.updateLocalState(100, { note: 'Initial state' });
    this.analyzer.updateRemoteState(100, { source: 'initial' });
    scenario.steps.push({ action: 'setup', localCredits: 100, remoteCredits: 100 });

    // Simular data do refill passando
    const expectedRefillTime = Date.now() - 7200000; // 2 horas atrás
    const refillCheck = this.analyzer.checkDelayedRefill(expectedRefillTime);
    scenario.steps.push({ action: 'check_refill', result: refillCheck });

    // Usuário consome créditos localmente
    this.analyzer.updateLocalState(50, { note: 'User consumed credits' });
    scenario.steps.push({ action: 'consume_locally', localCredits: 50 });

    // Refill finalmente chega no servidor
    this.analyzer.updateRemoteState(200, { source: 'refill', version: 2 });
    scenario.steps.push({ action: 'refill_arrives', remoteCredits: 200 });

    // Detectar split-brain temporário
    const divergence = this.analyzer.detectSplitBrain({ credits: 100, lastUpdate: expectedRefillTime });
    scenario.steps.push({ action: 'detect_divergence', result: divergence });

    this.scenarioResults.push(scenario);
    return scenario;
  }

  /**
   * Simula cenário: Stripe webhook não reconciliado
   */
  async simulateStripeWebhookFailure() {
    const scenario = {
      name: 'stripe_webhook_reconciliation_failure',
      description: 'Compra via Stripe não reflete créditos após webhook',
      steps: []
    };

    // Setup
    this.analyzer.updateLocalState(10, { note: 'Low credits' });
    this.analyzer.updateRemoteState(10, { source: 'initial' });
    scenario.steps.push({ action: 'setup', credits: 10 });

    // Usuário faz compra
    const txId = this.analyzer.registerPendingTransaction({
      id: `tx_${Date.now()}`,
      type: 'purchase',
      amount: 100,
      provider: 'stripe'
    });
    scenario.steps.push({ action: 'register_purchase', transactionId: txId, amount: 100 });

    // Usuário continua operando com expectativa de créditos
    this.analyzer.updateLocalState(110, { note: 'Optimistic update after purchase' });
    scenario.steps.push({ action: 'optimistic_update', localCredits: 110 });

    // Webhook chega com atraso e valor incorreto (bug de reconciliação)
    const completion = this.analyzer.completeTransaction(txId, 95); // Deveria ser 110
    scenario.steps.push({ action: 'webhook_complete', result: completion });

    this.scenarioResults.push(scenario);
    return scenario;
  }

  /**
   * Simula cenário: Split-brain entre edge nodes
   */
  async simulateEdgeNodeSplitBrain() {
    const scenario = {
      name: 'edge_node_split_brain',
      description: 'Dois edge nodes com estados inconsistentes de quota',
      steps: []
    };

    // Node A
    this.analyzer.updateLocalState(50, { nodeId: 'edge-a' });
    scenario.steps.push({ action: 'edge_a_state', credits: 50 });

    // Node B opera independentemente
    this.analyzer.updateRemoteState(30, { source: 'edge-b-usage' });
    scenario.steps.push({ action: 'edge_b_usage', remoteCredits: 30 });

    // Detecção de inconsistência
    const divergence = this.analyzer.detectSplitBrain({ credits: 50, lastUpdate: Date.now() - 5000 });
    scenario.steps.push({ action: 'detect_split_brain', result: divergence });

    // Criar checkpoint de segurança
    const checkpoint = this.analyzer.createSafetyCheckpoint('split_brain_detected', {
      projects: ['project-a', 'project-b'],
      unsavedChanges: true
    });
    scenario.steps.push({ action: 'create_checkpoint', checkpointId: checkpoint.id });

    this.scenarioResults.push(scenario);
    return scenario;
  }

  /**
   * Simula cenário: Operação offline após expiração de créditos
   */
  async simulateOfflineExpirationRace() {
    const scenario = {
      name: 'offline_expiration_race_condition',
      description: 'Usuário offline executa operações após créditos expirarem no servidor',
      steps: []
    };

    // Setup com créditos válidos
    this.analyzer.updateLocalState(20, { note: 'Valid credits' });
    this.analyzer.updateRemoteState(20, { source: 'initial' });
    scenario.steps.push({ action: 'setup', credits: 20 });

    // Usuário fica offline
    sessionManager.state.offlineMode = true;
    sessionManager.state.lastCreditCheck = Date.now() - 600000; // 10 minutos atrás
    scenario.steps.push({ action: 'go_offline', lastCreditCheck: sessionManager.state.lastCreditCheck });

    // Créditos expiram no servidor (simulado)
    this.analyzer.updateRemoteState(0, { source: 'expiration' });
    scenario.steps.push({ action: 'server_expiration', remoteCredits: 0 });

    // Usuário executa operação offline consumindo créditos locais
    const overquotaResult = this.analyzer.detectOverquotaOperation(
      { type: 'code_generation', tokens: 1000 },
      0, // Créditos reais no servidor
      15 // Créditos necessários
    );
    scenario.steps.push({ action: 'overquota_operation', result: overquotaResult });

    // Reconciliação ao reconectar
    sessionManager.state.offlineMode = false;
    const incident = this.analyzer.logIncident({
      type: IncidentType.OFFLINE_EXPIRATION_RACE,
      severity: IncidentSeverity.HIGH,
      details: {
        offlineDuration: 600000,
        operationsExecuted: 1,
        creditsConsumedLocally: 15,
        actualCreditsOnServer: 0
      }
    });
    scenario.steps.push({ action: 'reconciliation', incident });

    this.scenarioResults.push(scenario);
    return scenario;
  }

  /**
   * Executa todos os cenários e exporta resultados
   */
  async runAllScenarios() {
    await this.simulateDelayedRefill();
    await this.simulateStripeWebhookFailure();
    await this.simulateEdgeNodeSplitBrain();
    await this.simulateOfflineExpirationRace();

    return {
      scenariosExecuted: this.scenarioResults.length,
      results: this.scenarioResults,
      incidentsGenerated: this.analyzer.incidentLog.length,
      exportData: this.analyzer.exportAnalysisData()
    };
  }
}

// Export singleton instances
export const creditSyncAnalyzer = new CreditSyncAnalyzer();
export const failureSimulator = new FailureScenarioSimulator(creditSyncAnalyzer);
