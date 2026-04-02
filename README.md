# AI Data Audit Extension - Auditoria de Dados Pessoais em Plataformas de IA

Extensão Chrome para **auditoria e transparência de dados pessoais** em plataformas de IA generativa. Intercepta requisições, identifica vazamento de dados (data leakage), calcula scores de exposição e protege informações sensíveis.

## 🚀 Funcionalidades Principais

### 🔍 Interceptação de Requisições
- **Intercepta TODAS as requisições de saída** para identificar leakage de dados
- Monitoramento específico para endpoints críticos:
  - `/api/agent`
  - `/api/chat`
  - `/api/projects/*/generate`
  - `/api/generate`, `/api/completion`, `/api/inference`

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
│   └── content.js                    # Content script com fetch/XHR override
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

#### 2. Content Script (`content/data-audit-interceptor.js`)
- Define padrões de endpoints monitorados
- Funções utilitárias:
  - `calculateExposureScore(payload)`
  - `extractMetadata(payload)`
  - `sanitizeSensitiveData(obj)`
  - `isTrackingRequest(url)`
  - `isMonitoredEndpoint(url)`
- IndexedDB via Dexie para histórico persistente

#### 3. Fetch Interception (`content/content.js`)
- Override de `window.fetch()` para interceptar requisições
- Override de `XMLHttpRequest.prototype.send()`
- Sanitização de respostas em tempo real
- Log de dados sensíveis detectados

#### 4. Offscreen Document (`offscreen/`)
- Dashboard persistente para visualização detalhada
- Tabelas de requisições recentes e dados sensíveis
- Exportação de relatórios em JSON

#### 5. Popup (`popup.html`, `popup.js`)
- Interface compacta de transparência
- Stats em tempo real
- Controles de configuração (toggle blocking/sanitization)
- Visualização de última requisição e metadata

## 🎯 Como Funciona

### Fluxo de Interceptação

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

## 📊 Uso do Painel

### Popup de Transparência

Ao clicar no ícone da extensão:
- **Stats cards**: Total requests, blocked tracking, high exposure, today's count
- **Toggles**: Ativar/desativar bloqueio de tracking e sanitização
- **Exposure meter**: Barra visual mostrando último score
- **Metadata list**: Lista de identificadores detectados

### Offscreen Dashboard

Para acesso ao dashboard completo (acessível via `chrome://extensions` → detalhes → offscreen):
- Histórico completo de requisições
- Tabela de dados sensíveis detectados
- Exportação de relatórios

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

## 🔍 Debugging

No console da página onde a extensão está ativa:

```javascript
// Acessar interceptor
window.DataAuditInterceptor.calculateExposureScore({userId: '123', email: 'test@example.com'});
// Returns: 50

// Ver estado atual
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

### 3. Compliance (LGPD/GDPR)
Gerar relatórios para auditoria de conformidade:
- Usar offscreen dashboard
- Exportar relatório JSON
- Documentar fluxos de dados pessoais

### 4. Pesquisa de Segurança
Analisar padrões de leakage em diferentes plataformas:
- Comparar exposure scores entre serviços
- Identificar quais platforms coletam mais dados
- Reportar práticas problemáticas

## ⚠️ Limitações

- **webRequest API**: Requer permissão ampla em `<all_urls>`
- **Conteúdo criptografado**: Não consegue interceptar requisições com body criptografado customizado
- **Service Worker lifecycle**: Pode ser terminated pelo browser quando idle
- **CORS**: Algumas interceptações podem enfrentar restrições CORS

## 🔐 Privacidade e Segurança

Esta extensão:
- ✅ **Não envia dados para terceiros** - tudo fica local no IndexedDB
- ✅ **Código open source** - auditável publicamente
- ✅ **Sem telemetria própria** - pratica o que prega
- ⚠️ **Requer permissões amplas** - necessário para função de auditoria

## 📝 Contribuindo

Áreas para contribuição:
1. Novos padrões de detecção de tracking
2. Melhorias no algoritmo de exposure score
3. Suporte a mais formatos de payload (GraphQL, gRPC-web)
4. Integração com APIs de compliance (OneTrust, etc.)

## 📄 Licença

MIT License - Veja LICENSE.txt para detalhes.

## ⚖️ Aviso Legal

Esta extensão é uma ferramenta de **transparência e pesquisa**. O uso deve considerar:
- Termos de serviço das plataformas alvo
- Políticas de uso aceitável
- Esta extensão não contorna autenticação ou autorização
- Use responsavelmente para auditoria pessoal e pesquisa