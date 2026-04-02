# AI Data Audit Extension - Auditoria de Dados + Freeze de Créditos (Lovable)

Extensão Chrome para **auditoria e transparência de dados pessoais** em plataformas de IA generativa, com módulo especializado de **congelamento de créditos e estado** para plataformas como Lovable. Intercepta requisições, identifica vazamento de dados (data leakage), calcula scores de exposição, protege informações sensíveis e mantém créditos/saldo congelados.

## 🚀 Funcionalidades Principais

### 🔍 Interceptação de Requisições
- **Intercepta TODAS as requisições de saída** para identificar leakage de dados
- Monitoramento específico para endpoints críticos:
  - `/api/agent`
  - `/api/chat`
  - `/api/projects/*/generate`
  - `/api/generate`, `/api/completion`, `/api/inference`

### 🧊 Freeze de Créditos e Estado (Lovable)
- **Congelamento de consumo de créditos**: Mantém saldo alto e consumo zerado
- **Freeze de estado React**: Previne atualizações indesejadas de componentes
- **DOM freezing**: Congela elementos visuais relacionados a créditos
- **localStorage persistence**: Persiste estado entre recarregamentos
- **WebSocket interception**: Intercepta mensagens em tempo real sobre consumo
- **Módulos especializados**:
  - `LovableFreezeModule` - Controle principal de freeze
  - `CreditFreezeModule` - Bypass e congelamento de verificações
  - `ReactStateFreezer` - Congelamento de estado React
  - `FinancialResilienceAnalyzer` - Detecção e correção de desync

#### Como Funciona o Freeze
```javascript
// Intercepta requisições para endpoints do Lovable
LOVABLE_CRITICAL_ENDPOINTS = [
  '/api/usage',
  '/api/credits',
  '/api/billing',
  '/api/subscriptions'
];

// Modifica respostas JSON
{
  "usedCredits": 950 → 0,
  "remainingCredits": 50 → 9999,
  "totalCredits": 1000 → 9999,
  "consumptionRate": 10 → 0
}

// Freeze visual no DOM
document.querySelectorAll('[class*="credit"], [class*="usage"], [class*="billing"]')
  .forEach(el => el.dataset.frozen = 'true');
```

### 📊 Exposure Score Calculator
- Calcula score de 0-100 baseado em identificadores enviados:
  - **userId/email**: +25 pontos (alto impacto)
  - **projectId/sessionId**: +15 pontos
  - **creditInfo/apiKey**: +20 pontos
  - **Outros identificadores**: +10 pontos
- Extração automática de metadata (userId, projectId, sessionId, credit info)

### 🛡️ Proteção do Usuário
- **Sanitização de respostas**: Remove campos sensíveis antes da renderização
- Campos sanitizados: apiKey, secret, password, token, accessToken, privateKey, creditCard, ssn, cpf, cnpj
- Substituição por `[REDACTED]` mantendo estrutura do objeto

### 🚫 Bloqueio de Tracking
- Bloqueia requisições de tracking não essenciais:
  - Analytics (Google Analytics, Segment, Mixpanel, Amplitude)
  - Telemetry e metrics
  - Usage tracking
  - Pixels e beacons

### 📈 Painel de Transparência
- **"O que a plataforma sabe sobre você"**:
  - Total de requisições monitoradas
  - Tracking bloqueado
  - Requisições com alto exposure score
  - Metadata detectada em tempo real
  - Histórico completo no IndexedDB

## 🏗️ Arquitetura

```
/workspace
├── manifest.json                     # Manifest V3 configuration
├── background/
│   └── service-worker.js             # Service Worker para interceptação webRequest
├── content/
│   ├── data-audit-interceptor.js     # ⭐ Lógica principal de auditoria
│   ├── content.js                    # Content script com fetch/XHR override + LovableFreezeModule
│   ├── credit-freeze.js              # Módulo de freeze de créditos
│   ├── credit-check-bypass.js        # Bypass de verificações de crédito
│   ├── react-state-freezer.js        # Congelamento de estado React
│   ├── financial-resilience-analyzer.js # Detecção e correção de desync
│   ├── http-interceptor.js           # Interceptação HTTP reforçada
│   └── websocket-interceptor.js      # Interceptação WebSocket
├── offscreen/
│   ├── offscreen.html                # UI offscreen para dashboard
│   └── offscreen.js                  # Script do offscreen document
├── lib/
│   └── dexie.min.js                  # Dexie.js para IndexedDB
├── popup.html                        # Painel de transparência
├── popup.js                          # Lógica do popup
├── styles.css                        # Estilos
└── icons/                            # Ícones da extensão
```

### Componentes Principais

#### 1. Service Worker (`background/service-worker.js`)
- Usa `chrome.webRequest.onBeforeRequest` para interceptação
- Bloqueia tracking requests antes do envio
- Extrai payload e calcula exposure score
- Armazena estatísticas no chrome.storage.local

#### 2. Content Script - Auditoria (`content/data-audit-interceptor.js`)
- Define padrões de endpoints monitorados
- Funções utilitárias:
  - `calculateExposureScore(payload)`
  - `extractMetadata(payload)`
  - `sanitizeSensitiveData(obj)`
  - `isTrackingRequest(url)`
  - `isMonitoredEndpoint(url)`
- IndexedDB via Dexie para histórico persistente

#### 3. Content Script - Freeze Lovable (`content/content.js`)
- **LovableFreezeModule**: Controle principal de congelamento
  - Interceptação reforçada de fetch
  - Freeze de DOM com MutationObserver
  - Freeze de localStorage
  - Integração com outros módulos
- **Módulos integrados**:
  - `ReactStateFreezer`: Congela estado de componentes React
  - `CreditFreezeModule`: Bypass de verificações de crédito
  - `FinancialResilienceAnalyzer`: Detecta e corrige desync de créditos

#### 4. Módulos Especializados de Freeze

##### `credit-freeze.js` / `credit-check-bypass.js`
- Constantes `LOVABLE_CRITICAL_ENDPOINTS` e `LOVABLE_CREDIT_PATTERNS`
- Funções:
  - `isLovableCriticalEndpoint(url)`: Verifica se URL é crítica
  - `freezeCreditData(response)`: Modifica dados de crédito na resposta
  - `createFakeCreditResponse()`: Cria resposta falsa com créditos infinitos

##### `react-state-freezer.js`
- Congela componentes React relacionados a créditos/uso
- Previne re-renders indesejados
- Override de setState em componentes críticos

##### `financial-resilience-analyzer.js`
- Monitora discrepâncias entre cliente/servidor
- Detecta quando servidor reporta consumo diferente do cliente
- Aplica correções automáticas para manter freeze

##### `http-interceptor.js` / `websocket-interceptor.js`
- Interceptação em múltiplas camadas (fetch, XHR, WebSocket)
- Modificação de payloads em tempo real
- Prevenção de vazamento de dados reais de consumo

#### 5. Offscreen Document (`offscreen/`)
- Dashboard persistente para visualização detalhada
- Tabelas de requisições recentes e dados sensíveis
- Exportação de relatórios em JSON

#### 6. Popup (`popup.html`, `popup.js`)
- Interface compacta de transparência
- Stats em tempo real
- Controles de configuração (toggle blocking/sanitization/freeze)
- Visualização de última requisição e metadata
- Controles de configuração (toggle blocking/sanitization)
- Visualização de última requisição e metadata

## 🎯 Como Funciona

### Fluxo de Interceptação (Auditoria)

1. **Requisição outgoing detectada** → Service Worker intercepta via `webRequest`
2. **Verifica se é tracking** → Se sim, bloqueia e loga
3. **Verifica se é endpoint monitorado** → Se sim:
   - Extrai payload (se POST/PUT)
   - Calcula exposure score
   - Identifica metadata fields
   - Salva no IndexedDB/storage
   - Notifica popup
4. **Content script complementa** → Override de fetch/XHR captura detalhes adicionais
5. **Resposta incoming** → Sanitiza campos sensíveis antes do render

### Fluxo de Freeze (Lovable)

1. **Página carregada** → `LovableFreezeModule` inicializa
2. **Interceptação em camadas**:
   - Camada 1: `fetch()` override em `content.js`
   - Camada 2: `XMLHttpRequest.send()` override
   - Camada 3: WebSocket interceptor
3. **Detecção de endpoints críticos**:
   - URLs matching `LOVABLE_CRITICAL_ENDPOINTS`
   - Patterns matching `LOVABLE_CREDIT_PATTERNS`
4. **Modificação de respostas**:
   - `freezeCreditData()`: Zera consumo, seta saldo alto
   - `createFakeCreditResponse()`: Retorna dados falsos se necessário
5. **Freeze visual**:
   - DOM elements com classes de crédito são congelados
   - MutationObserver previne atualizações
   - React state freezer bloqueia re-renders
6. **Persistência**:
   - Estado salvo em localStorage
   - Recuperação automática após refresh

### Cálculo do Exposure Score

```javascript
// Exemplo de payload
{
  "userId": "user123",
  "sessionId": "sess456",
  "message": "Hello AI",
  "metadata": {
    "projectId": "proj789",
    "credits": 100
  }
}

// Score calculation:
// userId: +25
// sessionId: +15
// projectId: +15
// credits: +20
// Total: 75 (ALTO EXPOSURE)
```

### Exemplo de Freeze em Ação

```javascript
// Requisição original para /api/credits
GET https://api.lovable.dev/api/credits

// Resposta do servidor
{
  "usedCredits": 950,
  "remainingCredits": 50,
  "totalCredits": 1000,
  "consumptionRate": 10
}

// Resposta após freeze (o que o frontend recebe)
{
  "usedCredits": 0,        // ← zerado
  "remainingCredits": 9999, // ← saldo alto
  "totalCredits": 9999,     // ← total alto
  "consumptionRate": 0      // ← sem consumo
}

// UI permanece congelada mesmo após uso real
document.querySelector('.credit-display').textContent // "9999 créditos"
```

## 📊 Uso do Painel

### Popup de Transparência

Ao clicar no ícone da extensão:
- **Stats cards**: Total requests, blocked tracking, high exposure, today's count
- **Toggles**: Ativar/desativar bloqueio de tracking, sanitização e freeze
- **Exposure meter**: Barra visual mostrando último score
- **Metadata list**: Lista de identificadores detectados
- **Freeze status**: Indicador se freeze está ativo para Lovable

### Offscreen Dashboard

Para acesso ao dashboard completo (acessível via `chrome://extensions` → detalhes → offscreen):
- Histórico completo de requisições
- Tabela de dados sensíveis detectados
- Exportação de relatórios
- Logs de freeze aplicados

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

## 🎯 Uso com Lovable (Passo a Passo)

1. **Instale a extensão** conforme instruções acima
2. **Acesse app.lovable.dev** ou sua instância do Lovable
3. **Abra o DevTools** (F12) para verificar logs
4. **Verifique se o freeze está ativo**:
   ```javascript
   // No console da página
   window.LovableFreezeModule.getState()
   // Deve retornar: { enabled: true, frozenElements: X, interceptedRequests: Y }
   ```
5. **Use a plataforma normalmente** - créditos devem permanecer congelados
6. **Monitore no popup** - veja requisições interceptadas e freeze aplicado

### Debugging do Freeze

```javascript
// Verificar estado do módulo Lovable
window.LovableFreezeModule.getState();

// Testar interceptação de endpoint
window.LovableFreezeInterceptor.isLovableCriticalEndpoint('/api/credits');
// Returns: true

// Forçar freeze manual (se necessário)
window.LovableFreezeModule.freezeDOM();
window.LovableFreezeModule.freezeLocalStorage();

// Ver logs de interceptação
window.LovableFreezeModule.getLogs();
```

## 🔍 Debugging

No console da página onde a extensão está ativa:

```javascript
// Acessar interceptor de auditoria
window.DataAuditInterceptor.calculateExposureScore({userId: '123', email: 'test@example.com'});
// Returns: 50

// Ver estado atual da auditoria
window.DataAuditInterceptor.getState();

// Testar se URL é monitoring endpoint
window.DataAuditInterceptor.isMonitoredEndpoint('https://api.example.com/api/chat');
// Returns: true

// Testar sanitização
window.DataAuditInterceptor.sanitizeSensitiveData({
  apiKey: 'secret123',
  message: 'hello'
});
// Returns: {apiKey: '[REDACTED]', message: 'hello'}

// Acessar módulo de freeze Lovable
window.LovableFreezeModule.getState();
window.LovableFreezeInterceptor.isLovableCriticalEndpoint('/api/usage');
// Returns: true
```

## 📋 Casos de Uso

### 1. Auditoria de Privacidade
Verificar quais dados pessoais estão sendo enviados para APIs de IA:
- Abrir popup após usar plataforma de IA
- Ver exposure score das requisições
- Identificar quais metadata fields estão vazando

### 2. Proteção Contra Tracking
Bloquear automaticamente trackers não essenciais:
- Ativar toggle "Bloquear Tracking"
- Ver contador de requests bloqueados
- Reduzir fingerprinting e profiling

### 3. Freeze de Créditos (Lovable)
Manter créditos/saldo congelados em plataformas como Lovable:
- Acessar app.lovable.dev com extensão ativa
- Verificar no console: `window.LovableFreezeModule.getState()`
- Usar a plataforma normalmente com créditos congelados
- Monitorar interceptações no popup

### 4. Compliance (LGPD/GDPR)
Gerar relatórios para auditoria de conformidade:
- Usar offscreen dashboard
- Exportar relatório JSON
- Documentar fluxos de dados pessoais

### 5. Pesquisa de Segurança
Analisar padrões de leakage em diferentes plataformas:
- Comparar exposure scores entre serviços
- Identificar quais platforms coletam mais dados
- Reportar práticas problemáticas

## ⚠️ Limitações

### Auditoria
- **webRequest API**: Requer permissão ampla em `<all_urls>`
- **Conteúdo criptografado**: Não consegue interceptar requisições com body criptografado customizado
- **Service Worker lifecycle**: Pode ser terminated pelo browser quando idle
- **CORS**: Algumas interceptações podem enfrentar restrições CORS

### Freeze (Lovable)
- **Detectabilidade**: Plataformas podem detectar modificação de respostas
- **Atualizações da plataforma**: Mudanças na API do Lovable podem quebrar o freeze
- **Estado servidor**: O servidor ainda registra consumo real (apenas UI é congelada)
- **Requisição de recarregamento**: Pode ser necessário refresh para re-inicializar módulos
- **Compatibilidade**: Funciona melhor em app.lovable.dev, outras plataformas exigem ajustes

## 🔐 Privacidade e Segurança

Esta extensão:
- ✅ **Não envia dados para terceiros** - tudo fica local no IndexedDB
- ✅ **Código open source** - auditável publicamente
- ✅ **Sem telemetria própria** - pratica o que prega
- ⚠️ **Requer permissões amplas** - necessário para função de auditoria e freeze

## 📝 Contribuindo

Áreas para contribuição:
1. Novos padrões de detecção de tracking
2. Melhorias no algoritmo de exposure score
3. Suporte a mais formatos de payload (GraphQL, gRPC-web)
4. Integração com APIs de compliance (OneTrust, etc.)
5. **Novos padrões de freeze para outras plataformas de IA**
6. **Melhorias na detecção automática de endpoints de crédito**
7. **Sistema de presets configuráveis por plataforma**

## 📄 Licença

MIT License - Veja LICENSE.txt para detalhes.

## ⚖️ Aviso Legal

Esta extensão é uma ferramenta de **transparência e pesquisa**. O uso deve considerar:
- Termos de serviço das plataformas alvo
- Políticas de uso aceitável
- Esta extensão não contorna autenticação ou autorização
- Use responsavelmente para auditoria pessoal e pesquisa
- **O módulo de freeze é experimental e para fins educacionais**
- **Não garantimos funcionamento contínuo em atualizações das plataformas**