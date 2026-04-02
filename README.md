# DX Edge Middleware - Local-First AI Code Platform

Extensão Chrome de **Developer Experience** com arquitetura avançada para plataformas de IA generativa de código.

## 🚀 Funcionalidades Principais

### Circuit Breaker Pattern
- **Graceful degradation** quando APIs retornam erros 429 (Rate Limit) ou 402 (Payment Required/Créditos Esgotados)
- Estados: CLOSED (normal), OPEN (falhando), HALF_OPEN (testando)
- Métricas detalhadas para debugging e research
- Multi-tier circuit breaker por endpoint de API

### Local-First Architecture com CRDTs
- **CRDT (Conflict-free Replicated Data Type)** para edição offline sem conflitos
- **Vector Clocks** para rastreamento de causalidade
- **LWW Registers** (Last-Writer-Wins) para merge automático de mudanças
- Reconciliação automática quando conexão é restaurada

### Shadow Syncing
- Duplicação de estado em **IndexedDB** antes do commit ao servidor
- Garante durabilidade dos dados mesmo se operações do servidor falharem
- Fila de operações pendentes com retry automático

### WebSocket Interceptor para Reverse Engineering
- Análise em tempo real de frames de controle de quota
- Detecção automática de padrões de rate limiting
- Identificação de plataformas low-code (Lovable, Replit, Cursor, etc.)
- Exportação de dados para research de protocolos

### 🔥 Financial Resilience Analyzer (NOVO)
- **Detector de Split-Brain**: Compara estados local vs remote de créditos/quota
- **Checkpoint de Segurança**: Serializa projetos ao detectar anomalias de sincronização
- **Análise de Padrões de Falha**: Refills atrasados, créditos não refletidos, permissões incorretas
- **Simulador de Cenários**: Testa edge cases de sistemas distribuídos

#### Tipos de Incidentes Detectados
| Tipo | Descrição | Severidade |
|------|-----------|------------|
| `delayed_refill` | Refill mensal atrasado além da janela esperada | HIGH |
| `credit_not_reflected` | Compra via Stripe não refletida após webhook | MEDIUM |
| `split_brain_quota` | Estado local diverge do servidor | HIGH |
| `overquota_operation` | Operação executada que deveria estar bloqueada | CRITICAL |
| `webhook_reconciliation_failure` | Webhook de reconciliação falhou/atrasou | LOW |
| `offline_expiration_race` | Race condition entre expiração e operação offline | HIGH |
| `edge_node_inconsistency` | Inconsistência entre edge nodes durante sync | MEDIUM |
| `negative_credit_counter` | Credit counter negativo devido a async processing | CRITICAL |

## 📁 Estrutura do Projeto

```
/workspace
├── manifest.json                 # Configuração Manifest V3
├── background/
│   ├── service-worker.js         # Service Worker com sync em background
│   └── circuit-breaker.js        # Implementação do Circuit Breaker
├── content/
│   ├── crdt-engine.js            # Motor CRDT com Vector Clocks
│   ├── session-manager.js        # Gerenciamento de sessão + Shadow Sync
│   ├── websocket-interceptor.js  # Interceptador e analisador WebSocket
│   ├── financial-resilience-analyzer.js  # ⭐ Detector de credit desync
│   └── content.js                # Script principal injetado nas páginas
├── lib/
│   └── dexie.min.js              # Dexie.js para IndexedDB
├── popup.html                    # Interface do popup
├── popup.js                      # Lógica do popup
├── styles.css                    # Estilos
└── icons/                        # Ícones da extensão
```

## 🔧 Stack Tecnológico

- **Manifest V3** - Última versão do Chrome Extensions
- **Dexie.js** - Wrapper moderno para IndexedDB
- **ES6 Modules** - Modularização nativa
- **CRDTs** - Conflict-free Replicated Data Types para consistência eventual

## 🎯 Casos de Uso para Research

### 1. Reverse Engineering de Protocolos WebSocket
A extensão intercepta e analisa frames WebSocket em tempo real:

```javascript
// No console da página, após carregar a extensão:
const data = await window.DXEdgeMiddleware.exportResearchData();
console.log('Plataformas detectadas:', data.detectedPlatforms);
console.log('Eventos de quota:', data.websocketAnalysis.quotaEvents);
```

### 2. Identificação de Race Conditions
Cenários onde operações offline são replicadas após expiração de créditos:

```javascript
// Acessar métricas de race conditions:
const metrics = window.DXEdgeMiddleware.sessionManager.getMetrics();
console.log('Race conditions detectadas:', metrics.raceConditionsDetected);
console.log('Expirações durante offline:', metrics.creditExpirationsDuringOffline);
```

### 3. Detecção de Split-Brain em Quota
Comparação entre estado local e remoto de créditos:

```javascript
// Detectar divergência manualmente:
const divergence = window.DXEdgeMiddleware.detectSplitBrain(50, 30);
console.log('Split-brain detectado:', divergence.detected);
console.log('Divergência:', divergence.amount);
```

### 4. Análise de Padrões de Falha Histórica
Identificar problemas recorrentes de billing:

```javascript
// Analisar últimas 24 horas:
const patterns = window.DXEdgeMiddleware.analyzeFailurePatterns({
  start: Date.now() - 86400000,
  end: Date.now()
});
console.log('Padrões de falha:', patterns);
console.log('Issues recorrentes:', patterns.recurringIssues);
```

### 5. Simulação de Cenários de Falha
Testar edge cases de sistemas distribuídos:

```javascript
// Executar simulações completas:
const results = await window.DXEdgeMiddleware.runFailureSimulations();
console.log('Cenários executados:', results.scenariosExecuted);
console.log('Incidentes gerados:', results.incidentsGenerated);
```

### 6. Checkpoint de Segurança
Serializar estado ao detectar anomalias:

```javascript
// Criar checkpoint manual:
const checkpoint = window.DXEdgeMiddleware.createSafetyCheckpoint('before_deployment');

// Listar checkpoints disponíveis:
const checkpoints = window.DXEdgeMiddleware.listCheckpoints();

// Restaurar de checkpoint:
window.DXEdgeMiddleware.restoreFromCheckpoint(checkpointId);
```

## 📊 Download de Dados para Research

```javascript
// Baixar todos os dados de research como JSON:
await window.DXEdgeMiddleware.downloadResearchData();
```

O arquivo exportado inclui:
- Incidentes de billing detectados
- Eventos de split-brain
- Checkpoints de segurança
- Padrões de falha histórica
- Métricas combinadas de resiliência

## 🔌 Instalação para Desenvolvimento

1. Clone este repositório
2. Instale o Dexie.js na pasta `lib/`:
   ```bash
   curl -o lib/dexie.min.js https://unpkg.com/dexie/dist/dexie.min.js
   ```
3. Crie ícones na pasta `icons/` (16x16, 48x48, 128x128 pixels)
4. No Chrome, vá para `chrome://extensions/`
5. Ative o "Modo do desenvolvedor"
6. Clique em "Carregar sem pacote" e selecione esta pasta

## 🧪 Contribuindo

Esta extensão é um projeto de research focado em:

- **Distributed Systems**: CRDTs, consistência eventual, reconciliação
- **Edge Computing**: Processamento local, sincronização assíncrona
- **Protocol Analysis**: Reverse engineering de APIs de plataformas low-code
- **Resilience Patterns**: Circuit breaker, retry strategies, graceful degradation
- **Financial Resilience**: Detecção de credit desync, split-brain, overquota operations

### Áreas para Contribuição

1. **Financial Resilience Analyzer**
   - Adicionar novos tipos de incidentes de billing
   - Melhorar thresholds de detecção de anomalias
   - Implementar recuperação automática de incidentes
   - Integração com APIs de billing (Stripe, Paddle, Lemon Squeezy)

2. **Melhorias no CRDT Engine**
   - Implementar outros tipos de CRDT (G-Counter, PN-Counter, OR-Set)
   - Otimizar merge de operações concorrentes
   - Adicionar suporte para edição colaborativa em tempo real

3. **Análise de Protocolos**
   - Adicionar padrões para novas plataformas
   - Melhorar detecção de schemas de quota
   - Criar visualizações de sequências de frames

4. **Otimização de Shadow Sync**
   - Compressão de dados em IndexedDB
   - Estratégias de purge inteligente
   - Batch operations para melhor performance

## 📝 Notas de Desenvolvimento

Veja `development-notes.md` para detalhes técnicos e decisões de arquitetura.

## ⚠️ Aviso Legal

Esta extensão é uma ferramenta de **research e desenvolvimento**. O uso em produção deve considerar:

- Termos de serviço das plataformas alvo
- Políticas de uso aceitável
- Privacidade e segurança de dados

## 📄 Licença

MIT License - Veja LICENSE.txt para detalhes.