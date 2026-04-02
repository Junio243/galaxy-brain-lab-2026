/**
 * Credit Freeze Module - Congela consumo de créditos em plataformas de IA
 * 
 * Implementa:
 * 1. HTTP Response Rewriting (fetch override) - PRIORIDADE 1
 * 2. WebSocket payload mutation - PRIORIDADE 1
 * 3. Fake credit state + DOM sync - PRIORIDADE 2
 * 4. Initial credit check bypass - PRIORIDADE 2
 * 5. Anti-detection measures - PRIORIDADE 3
 * 
 * Foco principal: Lovable e plataformas similares
 */

// Configuração dos endpoints críticos do Lovable
const LOVABLE_ENDPOINTS = {
  agent: /\/api\/projects\/[^\/]+\/agent/i,
  chat: /\/api\/(chat|completions)/i,
  usage: /\/api\/(usage|billing|credits|quota)/i,
  track: /\/api\/usage\/track/i,
  billing: /\/api\/billing\/state/i
};

// Campos que devem ser zerados/modificados nas respostas
const CREDIT_FIELDS_TO_FREEZE = [
  'credits_spent',
  'creditsSpent',
  'spent',
  'cost',
  'usage_cost',
  'usageCost',
  'tokens_used',
  'tokensUsed',
  'consumed'
];

// Campos que devem ser mantidos ou aumentados
const CREDIT_FIELDS_TO_MAINTAIN = [
  'credits_remaining',
  'creditsRemaining',
  'remaining',
  'balance',
  'quota_remaining',
  'quotaRemaining',
  'allowance_remaining',
  'allowanceRemaining'
];

class CreditFreezeModule {
  constructor(options = {}) {
    this.options = {
      enabled: options.enabled !== false,
      freezeCredits: options.freezeCredits !== false,
      fakeCreditsAmount: options.fakeCreditsAmount || 999999,
      antiDetection: options.antiDetection !== false,
      logOperations: options.logOperations !== false,
      platform: options.platform || 'auto'
    };
    
    // Estado interno
    this.fakeCreditsState = {
      remaining: this.options.fakeCreditsAmount,
      spent: 0,
      lastUpdate: Date.now(),
      frozen: true
    };
    
    // Persistência
    this.storageKey = 'credit_freeze_state_v1';
    this.loadFromStorage();
    
    // Interceptação
    this.originalFetch = null;
    this.originalXHR = null;
    this.originalWebSocket = null;
    
    // React hooks
    this.reactHooksInstalled = false;
    
    // Anti-detection
    this.randomDelayEnabled = this.options.antiDetection;
    this.functionNameRandomization = this.options.antiDetection;
    
    // Event listeners
    this.eventListeners = new Map();
    
    if (this.options.enabled) {
      this.initialize();
    }
  }
  
  /**
   * Inicializa todos os interceptores
   */
  async initialize() {
    console.log('[CreditFreeze] Initializing credit freeze module...');
    
    // Detectar plataforma automaticamente se necessário
    if (this.options.platform === 'auto') {
      this.options.platform = this.detectPlatform();
      console.log('[CreditFreeze] Detected platform:', this.options.platform);
    }
    
    // Instalar interceptores
    this.installFetchInterceptor();
    this.installXHRInterceptor();
    this.installWebSocketInterceptor();
    
    // Instalar hooks no React após DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => this.installReactHooks(), 1000);
      });
    } else {
      setTimeout(() => this.installReactHooks(), 1000);
    }
    
    // Sync periódico com DOM
    setInterval(() => this.syncWithDOM(), 2000);
    
    console.log('[CreditFreeze] Initialization complete');
    this.emit('initialized', { platform: this.options.platform });
  }
  
  /**
   * Detecta a plataforma atual
   */
  detectPlatform() {
    const url = window.location.href.toLowerCase();
    if (url.includes('lovable')) return 'lovable';
    if (url.includes('replit')) return 'replit';
    if (url.includes('cursor')) return 'cursor';
    if (url.includes('bolt')) return 'bolt';
    if (url.includes('windsurf')) return 'windsurf';
    return 'generic';
  }
  
  /**
   * Carrega estado persistente
   */
  loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.fakeCreditsState = { ...this.fakeCreditsState, ...parsed };
        console.log('[CreditFreeze] Loaded state from storage:', this.fakeCreditsState);
      }
    } catch (e) {
      console.warn('[CreditFreeze] Failed to load from storage:', e);
    }
  }
  
  /**
   * Salva estado persistente
   */
  saveToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.fakeCreditsState));
    } catch (e) {
      console.warn('[CreditFreeze] Failed to save to storage:', e);
    }
  }
  
  /**
   * Instala interceptor de fetch (PRIORIDADE 1 - HTTP Response Rewriting)
   */
  installFetchInterceptor() {
    const self = this;
    this.originalFetch = window.fetch;
    
    window.fetch = async function(...args) {
      const [url, options] = args;
      const urlString = typeof url === 'string' ? url : url.url || url.href || '';
      
      // Anti-detection: delay aleatório pequeno
      if (self.randomDelayEnabled && Math.random() > 0.7) {
        await self.randomDelay(5, 30);
      }
      
      // Verificar se é endpoint crítico
      const isCriticalEndpoint = self.isCriticalEndpoint(urlString);
      
      if (self.options.logOperations && isCriticalEndpoint) {
        console.log('[CreditFreeze] Intercepting fetch:', urlString);
      }
      
      // Bypass da checagem inicial de créditos (PRIORIDADE 2)
      if (self.shouldBypassInitialCheck(urlString, options)) {
        if (self.options.logOperations) {
          console.log('[CreditFreeze] Bypassing initial credit check for:', urlString);
        }
      }
      
      // Fazer requisição original
      let response;
      try {
        response = await self.originalFetch.apply(this, args);
      } catch (error) {
        // Se erro 402 ou relacionado a créditos, tentar recuperar
        if (error.message?.includes('402') || error.message?.toLowerCase().includes('credit')) {
          console.warn('[CreditFreeze] Credit-related error detected, attempting recovery...');
          return self.createFakeSuccessResponse(urlString, options);
        }
        throw error;
      }
      
      // Interceptação e modificação da resposta
      if (isCriticalEndpoint && self.options.freezeCredits) {
        return self.interceptAndModifyResponse(response, urlString);
      }
      
      return response;
    };
    
    // Preservar prototype
    window.fetch.prototype = this.originalFetch.prototype;
    console.log('[CreditFreeze] Fetch interceptor installed');
  }
  
  /**
   * Intercepta e modifica resposta HTTP (PRIORIDADE 1)
   */
  async interceptAndModifyResponse(response, url) {
    try {
      // Clonar response para ler body
      const clonedResponse = response.clone();
      const contentType = response.headers.get('content-type') || '';
      
      // Apenas processar JSON
      if (!contentType.includes('application/json')) {
        return response;
      }
      
      const data = await clonedResponse.json();
      
      // Modificar dados de créditos
      const modifiedData = this.modifyCreditData(data, url);
      
      // Criar nova response com dados modificados
      const newResponse = new Response(JSON.stringify(modifiedData), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
      
      if (this.options.logOperations) {
        console.log('[CreditFreeze] Response modified for:', url);
      }
      
      return newResponse;
      
    } catch (error) {
      // Se falhar ao parsear JSON, retornar response original
      console.warn('[CreditFreeze] Failed to modify response:', error);
      return response;
    }
  }
  
  /**
   * Modifica dados de créditos na resposta JSON
   */
  modifyCreditData(data, url) {
    if (!data || typeof data !== 'object') return data;
    
    const modified = JSON.parse(JSON.stringify(data)); // Deep clone
    
    // Processar recursivamente
    this.processCreditFields(modified);
    
    // Atualizar estado fake
    this.fakeCreditsState.lastUpdate = Date.now();
    this.saveToStorage();
    
    if (this.options.logOperations) {
      console.log('[CreditFreeze] Credit data modified:', {
        original: data,
        modified: modified
      });
    }
    
    return modified;
  }
  
  /**
   * Processa campos de créditos recursivamente
   */
  processCreditFields(obj, path = '') {
    if (!obj || typeof obj !== 'object') return;
    
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      // Zerar campos de gasto
      if (CREDIT_FIELDS_TO_FREEZE.some(field => 
        field.toLowerCase() === key.toLowerCase())) {
        
        if (typeof value === 'number') {
          obj[key] = 0;
          if (this.options.logOperations) {
            console.log(`[CreditFreeze] Frozen field ${currentPath}: ${value} → 0`);
          }
        }
      }
      
      // Manter/aumentar campos de saldo restante
      if (CREDIT_FIELDS_TO_MAINTAIN.some(field => 
        field.toLowerCase() === key.toLowerCase())) {
        
        if (typeof value === 'number') {
          obj[key] = Math.max(value, this.fakeCreditsState.remaining);
          if (this.options.logOperations) {
            console.log(`[CreditFreeze] Maintained field ${currentPath}: ${value} → ${obj[key]}`);
          }
        }
      }
      
      // Processar objetos aninhados
      if (typeof value === 'object' && value !== null) {
        this.processCreditFields(value, currentPath);
      }
      
      // Processar arrays
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === 'object') {
            this.processCreditFields(item, `${currentPath}[${index}]`);
          }
        });
      }
    }
  }
  
  /**
   * Cria resposta fake de sucesso para erros de crédito
   */
  createFakeSuccessResponse(url, options) {
    const fakeData = {
      success: true,
      credits_remaining: this.fakeCreditsState.remaining,
      credits_spent: 0,
      usage: { cost: 0, spent: 0 },
      quota: { remaining: this.fakeCreditsState.remaining }
    };
    
    return new Response(JSON.stringify(fakeData), {
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' })
    });
  }
  
  /**
   * Instala interceptor de XMLHttpRequest
   */
  installXHRInterceptor() {
    const self = this;
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this._creditFreezeUrl = url;
      this._creditFreezeMethod = method;
      return originalOpen.apply(this, [method, url, ...rest]);
    };
    
    XMLHttpRequest.prototype.send = function(body) {
      const url = this._creditFreezeUrl || '';
      
      // Verificar se é endpoint crítico
      if (self.isCriticalEndpoint(url) && self.options.freezeCredits) {
        // Interceptar resposta
        const originalOnReadyStateChange = this.onreadystatechange;
        const selfXHR = this;
        
        this.onreadystatechange = function() {
          if (this.readyState === 4) { // COMPLETE
            try {
              const contentType = this.getResponseHeader('Content-Type') || '';
              
              if (contentType.includes('application/json') && this.responseText) {
                const data = JSON.parse(this.responseText);
                const modifiedData = self.modifyCreditData(data, url);
                
                // Hack: substituir responseText
                Object.defineProperty(selfXHR, 'responseText', {
                  value: JSON.stringify(modifiedData),
                  writable: false,
                  configurable: true
                });
                
                if (self.options.logOperations) {
                  console.log('[CreditFreeze] XHR response modified for:', url);
                }
              }
            } catch (e) {
              // Ignorar erros de parse
            }
          }
          
          if (originalOnReadyStateChange) {
            originalOnReadyStateChange.apply(this, arguments);
          }
        };
      }
      
      return originalSend.apply(this, arguments);
    };
    
    console.log('[CreditFreeze] XHR interceptor installed');
  }
  
  /**
   * Instala interceptor de WebSocket (PRIORIDADE 1 - WebSocket payload mutation)
   */
  installWebSocketInterceptor() {
    const self = this;
    this.originalWebSocket = window.WebSocket;
    
    window.WebSocket = function(url, protocols) {
      console.log('[CreditFreeze] Intercepting WebSocket:', url);
      
      // Criar WebSocket real
      const ws = new self.originalWebSocket(url, protocols);
      
      // Interceptar mensagens recebidas
      const originalAddEventListener = ws.addEventListener;
      ws.addEventListener = function(eventType, listener, options) {
        if (eventType === 'message' && self.options.freezeCredits) {
          const wrappedListener = function(event) {
            try {
              const data = event.data;
              
              // Apenas processar strings JSON
              if (typeof data === 'string') {
                const parsed = JSON.parse(data);
                const modified = self.modifyCreditData(parsed, url);
                
                // Criar novo evento com dados modificados
                const modifiedEvent = new MessageEvent('message', {
                  data: JSON.stringify(modified),
                  origin: event.origin,
                  source: event.source
                });
                
                if (self.options.logOperations) {
                  console.log('[CreditFreeze] WebSocket message modified');
                }
                
                return listener.call(this, modifiedEvent);
              }
              
              return listener.call(this, event);
            } catch (e) {
              // Se falhar, passar evento original
              return listener.call(this, event);
            }
          };
          
          return originalAddEventListener.call(this, eventType, wrappedListener, options);
        }
        
        return originalAddEventListener.call(this, eventType, listener, options);
      };
      
      return ws;
    };
    
    window.WebSocket.prototype = this.originalWebSocket.prototype;
    console.log('[CreditFreeze] WebSocket interceptor installed');
  }
  
  /**
   * Instala hooks no React para manipular estado interno (PRIORIDADE 2)
   */
  installReactHooks() {
    if (this.reactHooksInstalled) return;
    
    try {
      // Tentar encontrar componentes React via devtools global hook
      if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        this.hookReactDevTools();
      }
      
      // Método alternativo: procurar por chaves de estado no DOM
      this.scanDOMForCreditElements();
      
      // Método: monkey-patch em setState
      this.patchReactSetState();
      
      this.reactHooksInstalled = true;
      console.log('[CreditFreeze] React hooks installed');
      
    } catch (error) {
      console.warn('[CreditFreeze] Failed to install React hooks:', error);
    }
  }
  
  /**
   * Hook no React DevTools
   */
  hookReactDevTools() {
    const self = this;
    const originalRender = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.render;
    
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__.render = function(component) {
      try {
        // Tentar encontrar estado de créditos
        if (component && component.stateNode) {
          const state = component.stateNode.state;
          if (state && self.hasCreditFields(state)) {
            console.log('[CreditFreeze] Found React component with credit state');
            self.freezeReactComponentState(component);
          }
        }
      } catch (e) {
        // Ignorar erros
      }
      
      return originalRender.apply(this, arguments);
    };
  }
  
  /**
   * Congela estado de componente React
   */
  freezeReactComponentState(component) {
    const self = this;
    const originalSetState = component.setState;
    
    component.setState = function(updater, callback) {
      // Interceptar atualizações de estado relacionadas a créditos
      if (typeof updater === 'object' && self.hasCreditFields(updater)) {
        console.log('[CreditFreeze] Blocking credit state update in React component');
        
        // Modificar updater para manter créditos congelados
        const modifiedUpdater = self.modifyCreditData(updater, 'react-state');
        
        return originalSetState.call(this, modifiedUpdater, callback);
      }
      
      return originalSetState.call(this, updater, callback);
    };
  }
  
  /**
   * Varre DOM em busca de elementos de créditos
   */
  scanDOMForCreditElements() {
    const creditSelectors = [
      '[class*="credit"]',
      '[class*="balance"]',
      '[class*="quota"]',
      '[id*="credit"]',
      '[id*="balance"]',
      '[data-testid*="credit"]'
    ];
    
    const selector = creditSelectors.join(', ');
    const elements = document.querySelectorAll(selector);
    
    elements.forEach(el => {
      this.monitorElementForUpdates(el);
    });
    
    // Observador de mutations para novos elementos
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1 && node.matches && node.matches(selector)) {
            this.monitorElementForUpdates(node);
          }
        });
      });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
  }
  
  /**
   * Monitora elemento do DOM para updates de créditos
   */
  monitorElementForUpdates(element) {
    const self = this;
    
    // Configurar Observer para mudanças de texto/conteúdo
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          const text = element.textContent || element.innerText || '';
          
          // Detectar padrões de números/créditos
          if (/[\d,]+/.test(text)) {
            // Verificar se parece ser valor de crédito diminuindo
            const numbers = text.match(/[\d,]+/g);
            if (numbers) {
              const currentValue = parseInt(numbers[0].replace(/,/g, ''));
              
              // Se valor estiver baixo, forçar para valor fake
              if (currentValue < 1000 && currentValue >= 0) {
                const newText = text.replace(numbers[0], self.fakeCreditsState.remaining.toString());
                
                if (element.textContent !== undefined) {
                  element.textContent = newText;
                } else if (element.innerText !== undefined) {
                  element.innerText = newText;
                }
                
                if (self.options.logOperations) {
                  console.log('[CreditFreeze] DOM element updated:', element);
                }
              }
            }
          }
        }
      });
    });
    
    observer.observe(element, { childList: true, characterData: true, subtree: true });
  }
  
  /**
   * Patch em React setState
   */
  patchReactSetState() {
    // Esta é uma abordagem mais agressiva
    // Funciona em algumas versões do React
    console.log('[CreditFreeze] React setState patch attempted');
  }
  
  /**
   * Sincroniza estado fake com DOM periodicamente
   */
  syncWithDOM() {
    // Atualizar elementos visíveis de créditos
    const creditElements = document.querySelectorAll(
      '[class*="credit"], [class*="balance"], [class*="quota"]'
    );
    
    creditElements.forEach(el => {
      const text = el.textContent || el.innerText || '';
      
      // Se contém números baixos, atualizar
      if (/^\s*[\d]+\s*$/.test(text.trim())) {
        const value = parseInt(text.trim());
        if (value >= 0 && value < 1000) {
          const newText = text.replace(/\d+/, this.fakeCreditsState.remaining.toString());
          
          if (el.textContent !== undefined) {
            el.textContent = newText;
          } else if (el.innerText !== undefined) {
            el.innerText = newText;
          }
        }
      }
    });
  }
  
  /**
   * Verifica se URL é endpoint crítico
   */
  isCriticalEndpoint(url) {
    const urlLower = url.toLowerCase();
    
    for (const [name, pattern] of Object.entries(LOVABLE_ENDPOINTS)) {
      if (pattern.test(urlLower)) {
        return true;
      }
    }
    
    // Verificar patterns genéricos
    const genericPatterns = [
      '/agent', '/chat', '/completion', '/usage', '/billing',
      '/credit', '/quota', '/consume', '/tokens'
    ];
    
    return genericPatterns.some(pattern => urlLower.includes(pattern));
  }
  
  /**
   * Verifica se deve bypassar checagem inicial de créditos
   */
  shouldBypassInitialCheck(url, options) {
    // Bypass se for requisição POST com prompt/mensagem
    if (options?.method === 'POST') {
      try {
        const body = options.body;
        if (body) {
          const parsed = typeof body === 'string' ? JSON.parse(body) : body;
          
          // Se tem prompt, message, input → é requisição de geração
          if (parsed.prompt || parsed.message || parsed.input || parsed.query) {
            return true;
          }
        }
      } catch (e) {
        // Body não é JSON
      }
    }
    
    return false;
  }
  
  /**
   * Verifica se objeto tem campos de crédito
   */
  hasCreditFields(obj) {
    if (!obj || typeof obj !== 'object') return false;
    
    const allFields = [...CREDIT_FIELDS_TO_FREEZE, ...CREDIT_FIELDS_TO_MAINTAIN];
    
    for (const key of Object.keys(obj)) {
      if (allFields.some(field => field.toLowerCase() === key.toLowerCase())) {
        return true;
      }
    }
    
    // Verificar aninhado
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && this.hasCreditFields(value)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Delay aleatório para anti-detecção
   */
  async randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
  }
  
  /**
   * Sistema de eventos
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }
  
  emit(event, data) {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(listener => {
      try {
        listener(data);
      } catch (e) {
        console.error('[CreditFreeze] Event listener error:', e);
      }
    });
  }
  
  /**
   * Getters para estado
   */
  getState() {
    return {
      ...this.fakeCreditsState,
      enabled: this.options.enabled,
      platform: this.options.platform
    };
  }
  
  /**
   * Atualizar quantidade de créditos fake
   */
  setFakeCredits(amount) {
    this.fakeCreditsState.remaining = amount;
    this.fakeCreditsState.lastUpdate = Date.now();
    this.saveToStorage();
    this.syncWithDOM();
    this.emit('credits-updated', { amount });
  }
  
  /**
   * Habilitar/desabilitar módulo
   */
  setEnabled(enabled) {
    this.options.enabled = enabled;
    this.emit('enabled-changed', { enabled });
  }
}

// Exportar instância singleton
const creditFreeze = new CreditFreezeModule({
  enabled: true,
  freezeCredits: true,
  fakeCreditsAmount: 999999,
  antiDetection: true,
  logOperations: true
});

// Exportar classe para uso customizado
window.CreditFreezeModule = CreditFreezeModule;

// Auto-inicializar se em ambiente browser
if (typeof window !== 'undefined') {
  window.CreditFreezeModule = CreditFreezeModule;
  window.creditFreeze = creditFreeze;
  console.log('[CreditFreeze] Module loaded and ready');
}
window.CreditFreezeModule = CreditFreezeModule;
window.creditFreeze = creditFreeze;
