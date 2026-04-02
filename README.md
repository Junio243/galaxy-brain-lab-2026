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
│   └── content.js                # Script principal injetado nas páginas
├── lib/
│   └── dexie.min.js              # Dexie.js para IndexedDB (pendente)
├── popup.html                    # Interface do popup
├── popup.js                      # Lógica do popup
├── styles.css                    # Estilos
└── icons/                        # Ícones da extensão (pendente)
```

## 🔧 Stack Tecnológico

- **Manifest V3** - Última versão do Chrome Extensions
- **Workbox** - Cache e service worker patterns (planejado)
- **Dexie.js** - Wrapper moderno para IndexedDB
- **ES6 Modules** - Modularização nativa

## 🎯 Casos de Uso para Research

### 1. Reverse Engineering de Protocolos WebSocket
A extensão intercepta e analisa frames WebSocket em tempo real:

```javascript
// No console da página, após carregar a extensão:
const data = await window.DXEdgeMiddleware.exportResearchData();
console.log('Plataformas detectadas:', data.detectedPlatforms);
console.log('Eventos de quota:', data.websocketData.quotaEvents);
```

### 2. Identificação de Race Conditions
Cenários onde operações offline são replicadas após expiração de créditos:

```javascript
// Acessar métricas de race conditions:
const metrics = window.DXEdgeMiddleware.sessionManager.getMetrics();
console.log('Race conditions detectadas:', metrics.raceConditionsDetected);
console.log('Expirações durante offline:', metrics.creditExpirationsDuringOffline);
```

### 3. Research em Optimistic Concurrency
Exploração de janelas de inconsistência eventual entre edge nodes:

```javascript
// Iniciar janela de inconsistência para análise:
window.DXEdgeMiddleware.sessionManager.executeOperation({
  type: 'START_INCONSISTENCY_WINDOW',
  payload: { edgeNode: 'edge-1', duration: 5000 }
});
```

## 📊 Download de Dados para Research

```javascript
// Baixar todos os dados de research como JSON:
await window.DXEdgeMiddleware.downloadResearchData();
```

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

### Áreas para Contribuição

1. **Melhorias no CRDT Engine**
   - Implementar outros tipos de CRDT (G-Counter, PN-Counter, OR-Set)
   - Otimizar merge de operações concorrentes
   - Adicionar suporte para edição colaborativa em tempo real

2. **Análise de Protocolos**
   - Adicionar padrões para novas plataformas
   - Melhorar detecção de schemas de quota
   - Criar visualizações de sequências de frames

3. **Otimização de Shadow Sync**
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