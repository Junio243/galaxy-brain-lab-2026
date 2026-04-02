# AI Data Audit Extension + Lovable Freeze - Development Notes

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
│  │  │ Lovable      │  │ Credit       │  │ React State   │  │    │
│  │  │ Freeze Mgr   │  │ Freeze       │  │ Freezer       │  │    │
│  │  └──────────────┘  └──────────────┘  └───────────────┘  │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │    │
│  │  │ Financial    │  │ HTTP         │  │ WebSocket     │  │    │
│  │  │ Resilience   │  │ Interceptor  │  │ Interceptor   │  │    │
│  │  │ Analyzer     │  │              │  │               │  │    │
│  │  └──────────────┘  └──────────────┘  └───────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────┐                                           │
│  │   IndexedDB      │ (Shadow Sync Storage)                     │
│  │   - auditLog     │                                           │
│  │   - freezeState  │                                           │
│  │   - creditCache  │                                           │
│  └──────────────────┘                                           │
└─────────────────────────────────────────────────────────────────┘
```

## Componentes Principais

### 1. LovableFreezeModule (`content/content.js`)

**Funcionalidades:**
- Interceptação reforçada de fetch/XHR em múltiplas camadas
- Freeze de DOM com MutationObserver
- Freeze de localStorage para persistência
- Integração com módulos especializados

**API Global:**
```javascript
window.LovableFreezeModule = {
  getState(),           // Retorna estado atual do freeze
  freezeDOM(),          // Aplica freeze em elementos visuais
  freezeLocalStorage(), // Persiste estado congelado
  getLogs()            // Retorna logs de interceptação
}
```

**Endpoints monitorados:**
```javascript
LOVABLE_CRITICAL_ENDPOINTS = [
  '/api/usage',
  '/api/credits',
  '/api/billing',
  '/api/subscriptions',
  '/api/generation'
];
```

### 2. Credit Freeze Module (`content/credit-freeze.js`, `content/credit-check-bypass.js`)

**Constantes:**
```javascript
LOVABLE_CREDIT_PATTERNS = [
  /usedCredits/i,
  /remainingCredits/i,
  /totalCredits/i,
  /consumptionRate/i,
  /creditBalance/i
];
```

**Funções principais:**
- `isLovableCriticalEndpoint(url)`: Verifica se URL é crítica
- `freezeCreditData(response)`: Modifica dados de crédito na resposta
- `createFakeCreditResponse()`: Cria resposta falsa com créditos infinitos

**Transformação de respostas:**
```javascript
// Antes
{ usedCredits: 950, remainingCredits: 50, totalCredits: 1000 }

// Depois
{ usedCredits: 0, remainingCredits: 9999, totalCredits: 9999 }
```

### 3. React State Freezer (`content/react-state-freezer.js`)

**Objetivo:** Congelar componentes React relacionados a créditos/uso

**Técnicas:**
- Override de `setState` em componentes críticos
- Detecção automática por classNames (credit, usage, billing)
- Prevenção de re-renders indesejados

**Exemplo:**
```javascript
// Intercepta chamadas setState
const originalSetState = ReactComponent.prototype.setState;
ReactComponent.prototype.setState = function(newState) {
  if (this.isCreditComponent()) {
    return; // Bloqueia atualização
  }
  return originalSetState.call(this, newState);
};
```

### 4. Financial Resilience Analyzer (`content/financial-resilience-analyzer.js`)

**Objetivo:** Detectar e corrigir discrepâncias entre cliente/servidor

**Detecção de desync:**
```javascript
{
  clientCredits: 9999,
  serverCredits: 50,
  discrepancy: 9949,
  action: 'apply_freeze_correction'
}
```

**Correções automáticas:**
- Re-aplica freeze quando servidor reporta consumo diferente
- Monitora polling de atualização de créditos
- Loga tentativas de correção para debugging

### 5. HTTP Interceptor (`content/http-interceptor.js`)

**Camadas de interceptação:**
1. `fetch()` override
2. `XMLHttpRequest.send()` override
3. Response body modification

**Fluxo:**
```
Request → Detect endpoint → Modify if critical → Send → 
Receive response → Parse JSON → Apply freeze → Return to caller
```

### 6. WebSocket Interceptor (`content/websocket-interceptor.js`)

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
- Mensagens WebSocket sobre consumo em tempo real

### 7. Circuit Breaker (`background/circuit-breaker.js`)

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

## Decisões de Arquitetura

### Por que interceptação em múltiplas camadas?

1. **Resiliência**: Se uma camada falhar, outras mantêm o freeze
2. **Cobertura**: Diferentes plataformas usam diferentes métodos (fetch, XHR, WebSocket)
3. **Stealth**: Menos detectável que monkey-patching agressivo

### Por que freeze visual + dados?

1. **UI consistente**: Elementos visuais não piscam ou atualizam
2. **Dados consistentes**: Respostas de API sempre retornam valores congelados
3. **Persistência**: Estado mantido entre refreshes via localStorage

### Por que módulo de resiliência financeira?

1. **Detecção proativa**: Identifica quando servidor tenta corrigir UI
2. **Correção automática**: Re-aplica freeze sem intervenção do usuário
3. **Logging**: Auditoria completa de tentativas de atualização

## Pesquisa em Platform Manipulation

### Inconsistency Windows

Janela de tempo onde cliente e servidor têm estados inconsistentes:

```
Client              Server
   │                  │
   ├─ Request credits │
   │                  │
   ◄─ 9999 credits ───┤
   │                  │
   ├─ Use feature     │
   │                  │
   │                  ├─ Deduct 10 credits
   │                  │
   ├─ Poll credits    │
   │                  │
   ◄─ 50 credits ─────┤  ← Servidor reporta consumo real
   │                  │
   ├─ Apply freeze    │
   │                  │
   │                  ├─ (Server still has 50)
```

**Research question**: Qual é a janela máxima antes do servidor detectar anomalia?

### Detection Evasion Patterns

```javascript
// Pattern implementado:
async interceptFetch(url, options) {
  const response = await originalFetch(url, options);
  
  if (isCriticalEndpoint(url)) {
    const data = await response.json();
    const frozenData = applyFreeze(data);
    
    // Manter headers originais para evitar detecção
    return new Response(JSON.stringify(frozenData), {
      status: response.status,
      headers: response.headers
    });
  }
  
  return response;
}
```

## Áreas para Contribuição

### 1. Freeze Avançado
- [ ] Suporte a mais plataformas (Replit, Cursor, Bolt.new)
- [ ] Detecção automática de endpoints via ML
- [ ] Presets configuráveis por plataforma

### 2. Protocol Analysis
- [ ] Reverse engineering de novos protocolos de crédito
- [ ] Visualização gráfica de fluxos de requisição
- [ ] Detecção de padrões de rate limiting

### 3. Stealth & Evasion
- [ ] Randomização de timing para evitar padrões
- [ ] Emulação de comportamento humano
- [ ] Detecção de anti-tampering measures

### 4. Developer Experience
- [ ] DevTools panel integration
- [ ] Timeline de interceptações para debugging
- [ ] Export/import de configurações

## Debugging Tips

```javascript
// Acessar estado interno do console da página:
window.LovableFreezeModule.getState()
window.LovableFreezeInterceptor.getLogs()
window.DataAuditInterceptor.getState()

// Testar interceptação:
window.LovableFreezeInterceptor.isLovableCriticalEndpoint('/api/credits')
// Returns: true

// Forçar freeze manual:
window.LovableFreezeModule.freezeDOM()
window.LovableFreezeModule.freezeLocalStorage()

// Ver estatísticas:
window.LovableFreezeModule.getStatistics()
// { interceptedRequests: X, frozenElements: Y, corrections: Z }
```

## Test Scenarios

### Scenario 1: Basic Credit Freeze

1. Access app.lovable.dev
2. Check initial credits (e.g., 1000)
3. Use generation feature multiple times
4. Verify credits remain at 1000 in UI
5. Check console logs for intercepted requests

### Scenario 2: Page Refresh Persistence

1. Use platform with freeze active
2. Refresh page (F5)
3. Verify freeze re-initializes automatically
4. Credits should remain frozen

### Scenario 3: Server Desync Correction

1. Let freeze run for several minutes
2. Server may push update with real credits
3. FinancialResilienceAnalyzer detects discrepancy
4. Automatic correction re-applies freeze
5. Check logs for correction events

### Scenario 4: Multi-Tab Usage

1. Open Lovable in multiple tabs
2. Use features in both tabs
3. Verify freeze works consistently across tabs
4. Check for race conditions

## Referências

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Fetch API Interception](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [MutationObserver API](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)
- [CRDT Papers](https://crdt.tech/papers.html)
- [Circuit Breaker Pattern (Nygard)](https://www.oreilly.com/library/view/release-it/9781492041931/)