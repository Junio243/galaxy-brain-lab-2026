# DX Edge Middleware - Development Notes

## Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                    Chrome Extension (Manifest V3)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                  │
│  │  Service Worker  │◄──►│  Circuit Breaker │                  │
│  │   (Background)   │    │   Pattern        │                  │
│  └────────┬─────────┘    └──────────────────┘                  │
│           │                                                      │
│           │ Message Passing                                      │
│           ▼                                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Content Scripts (Page Context)              │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │    │
│  │  │ CRDT Engine  │  │ Session Mgr  │  │ WebSocket Int │  │    │
│  │  │ + Vector     │  │ + Shadow     │  │ + Protocol    │  │    │
│  │  │   Clocks     │  │   Sync       │  │   Analyzer    │  │    │
│  │  └──────────────┘  └──────────────┘  └───────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────┐                                           │
│  │   IndexedDB      │ (Shadow Sync Storage)                     │
│  │   - sessions     │                                           │
│  │   - operations   │                                           │
│  │   - quotaState   │                                           │
│  │   - conflicts    │                                           │
│  └──────────────────┘                                           │
└─────────────────────────────────────────────────────────────────┘
```

## Componentes Principais

### 1. Circuit Breaker (`background/circuit-breaker.js`)

**Estados:**
- `CLOSED`: Operação normal, todas as requisições passam
- `OPEN`: Falhas detectadas, requisições são bloqueadas para graceful degradation
- `HALF_OPEN`: Período de teste após timeout, uma requisição é permitida

**Gatilhos para abrir o circuito:**
- HTTP 429 (Rate Limit Exceeded)
- HTTP 402 (Payment Required / Créditos Esgotados)
- Mensagens de erro contendo "rate limit", "quota exceeded", "insufficient credits"
- Taxa de falha > 50% em 10+ requisições

**Configuração:**
```javascript
{
  failureThreshold: 5,      // Falhas consecutivas para abrir
  resetTimeout: 30000,      // ms antes de tentar novamente (HALF_OPEN)
  monitoringPeriod: 60000   // Janela de tempo para cálculo de taxa de falha
}
```

### 2. CRDT Engine (`content/crdt-engine.js`)

**Tipos implementados:**

1. **VectorClock**: Rastreamento de causalidade distribuída
   - Incremento lógico por operação
   - Merge para reconciliação
   - Comparação happens-before

2. **LWWRegister**: Last-Writer-Wins Register
   - Timestamp lógico (vector clock) + físico
   - Tiebreaker por nodeId para determinismo
   - Idempotente

3. **CRDTDocument**: Multi-field document
   - Múltiplos registers por documento
   - Operações pendentes e sincronizadas
   - Log de operações para replay

4. **CRDTManager**: Gerenciamento de múltiplos documentos
   - Event-driven architecture
   - Export/import de estado
   - Detecção de operações pendentes

**Exemplo de uso:**
```javascript
// Atualização local (offline-safe)
crdtManager.updateDocument('doc-123', {
  code: 'console.log("hello")',
  cursorPosition: 42
});

// Aplicar operação remota
crdtManager.applyRemoteOperations('doc-123', remoteOps);
```

### 3. Session Manager (`content/session-manager.js`)

**Shadow Syncing Flow:**
```
1. Operação executada pelo usuário
         │
         ▼
2. Aplicar localmente (optimistic)
         │
         ▼
3. Shadow sync → IndexedDB ← Durabilidade garantida
         │
         ├──────────────┐
         │              │
    (online)        (offline)
         │              │
         ▼              ▼
4. Sync servidor   Queue operation
         │              │
         ▼              ▼
5. Confirmar       Retry later
   ou falhar       quando online
```

**Detecção de Race Conditions:**

Cenário crítico: Operações offline replicadas após expiração de créditos

```javascript
// Condições detectadas:
{
  code: 'CREDIT_EXPIRED',
  offlineDuration: 400000,  // > 5 minutos offline
  lastCreditCheck: 1234567890
}
```

**Métricas de research:**
- `raceConditionsDetected`: Quantas vezes operações conflitaram com expiração
- `creditExpirationsDuringOffline`: Expired credits while offline
- `reconciliationConflicts`: Conflitos durante merge
- `inconsistencyWindows`: Janelas de inconsistência entre edge nodes

### 4. WebSocket Interceptor (`content/websocket-interceptor.js`)

**Análise de frames em tempo real:**

```javascript
// Padrões detectados automaticamente:
{
  quotaKeywords: ['credit', 'quota', 'usage', 'consume', ...],
  rateLimitKeywords: ['rate limit', 'throttle', '429', ...]
}
```

**Protocolos suportados:**
- Lovable: `/api/credits`, `/api/usage`
- Replit: `/api/billing`, `/api/tokens`
- Cursor: `/api/quota`, `/api/limits`

**Export de dados para reverse engineering:**
```javascript
const data = wsInterceptor.exportData();
// Retorna: sockets, patterns, frameLog, quotaEvents, statistics
```

## Decisões de Arquitetura

### Por que CRDTs e não Operational Transformation (OT)?

| CRDT | OT |
|------|-----|
| Merge automático sem servidor central | Requer servidor para transformação |
| Offline-first nativo | Complexo para offline |
| Mais simples de implementar | Algoritmos complexos |
| Ideal para P2P | Ideal para cliente-servidor |

### Por que Shadow Sync?

1. **Durabilidade**: Dados persistem mesmo se servidor falhar
2. **Recuperação**: Pode reenviar operações após falha
3. **Auditoria**: Log completo de todas as operações
4. **Debug**: Estado reproduzível para troubleshooting

### Por que IndexedDB e não localStorage?

- **Capacidade**: ~50MB vs ~5MB
- **Performance**: Transações assíncronas não bloqueiam UI
- **Indexação**: Consultas eficientes em grandes datasets
- **Versionamento**: Schema migrations nativas

## Pesquisa em Distributed Systems

### Inconsistency Windows

Janela de tempo onde diferentes edge nodes podem ter estados inconsistentes:

```
Edge Node A          Edge Node B          Server
     │                    │                  │
     ├─ Write X=1         │                  │
     ├─ Shadow Sync       │                  │
     │                    │                  │
     │                    ├─ Write X=2       │
     │                    ├─ Shadow Sync     │
     │                    │                  │
     ├────────────────────┼─ Sync ──────────►│
     │                    │                  │
     │                    ├──────────────────┤
     │                                       │
     ◄───────────────────────────────────────┤
     │                    │                  │
```

**Research question**: Qual é a janela máxima aceitável para UX vs consistência?

### Otimistic Concurrency Patterns

```javascript
// Pattern implementado:
async executeOperation(op) {
  applyLocal(op);      // Imediato (optimistic)
  shadowSync(op);      // Durabilidade
  
  if (online) {
    try {
      await serverSync(op);  // Pode falhar
      markSuccess(op);
    } catch (e) {
      queueRetry(op);        // Fila para retry
      detectConflict(e);     // Analisar conflito
    }
  }
}
```

## Áreas para Contribuição

### 1. CRDT Avançado
- [ ] Implementar OR-Set para arrays colaborativos
- [ ] Adicionar Lattice para merging customizado
- [ ] Suporte a nested documents

### 2. Protocol Analysis
- [ ] Machine learning para detecção automática de schemas
- [ ] Visualização gráfica de sequências de frames
- [ ] Detecção de anomalias em padrões de quota

### 3. Performance
- [ ] Compressão de operações em IndexedDB
- [ ] WebAssembly para CRDT merge operations
- [ ] Background sync com Workbox strategies

### 4. Developer Experience
- [ ] DevTools panel integration
- [ ] Timeline de operações para debugging
- [ ] Replay de sessões para troubleshooting

## Debugging Tips

```javascript
// Acessar estado interno do console da página:
window.DXEdgeMiddleware.sessionManager.getState()
window.DXEdgeMiddleware.crdtManager.exportAllStates()
window.DXEdgeMiddleware.wsInterceptor.getStatistics()

// Download de dados completos:
await window.DXEdgeMiddleware.downloadResearchData()

// Reset manual do circuit breaker:
chrome.runtime.sendMessage({action: 'resetCircuitBreaker'})
```

## Test Scenarios

### Scenario 1: Offline Edit → Credit Expiration → Reconnect

1. User edits code while offline
2. Credits expire on server during offline period
3. User reconnects
4. Operations sync and trigger 402 errors
5. System detects race condition
6. Operations queued for manual resolution

### Scenario 2: High Rate Limit → Circuit Open → Recovery

1. API starts returning 429 errors
2. After 5 failures, circuit opens
3. New operations are queued locally
4. After 30s timeout, circuit goes HALF_OPEN
5. Test request succeeds → circuit closes
6. Queued operations resume syncing

### Scenario 3: Concurrent Edits on Two Devices

1. Device A edits line 10
2. Device B edits line 10 concurrently
3. Both sync to server
4. CRDT merge resolves conflict deterministically
5. Both devices converge to same state

## Referências

- [CRDT Papers](https://crdt.tech/papers.html)
- [Martin Kleppmann: CRDTs vs OT](https://martin.kleppmann.com/2014/09/02/the-trouble-with-websockets.html)
- [Circuit Breaker Pattern (Nygard)](https://www.oreilly.com/library/view/release-it/9781492041931/)
- [IndexedDB Best Practices](https://web.dev/indexeddb-best-practices/)