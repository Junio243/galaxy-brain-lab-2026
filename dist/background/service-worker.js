/**
 * Service Worker para AI Data Audit Extension
 * Gerencia interceptação de requisições, bloqueio de tracking e sanitização de respostas
 */

// Estado global do service worker
const auditState = {
  enabled: true,
  blockTracking: true,
  sanitizeResponses: true,
  totalRequests: 0,
  blockedRequests: 0,
  highExposureCount: 0
};

// Configuração dos endpoints monitorados
const MONITORED_ENDPOINTS = [
  '/api/agent',
  '/api/chat',
  '/api/generate',
  '/api/completion',
  '/api/inference'
];

const PROJECT_ENDPOINT_PATTERN = /\/api\/projects\/[^\/]+\/generate/i;

// Campos de metadata que indicam dados pessoais
const METADATA_FIELDS = [
  'userId', 'user_id', 'projectId', 'project_id', 'sessionId', 'session_id',
  'creditInfo', 'credit_info', 'credits', 'apiKey', 'api_key', 'token',
  'email', 'username', 'accountId', 'account_id', 'organizationId', 
  'organization_id', 'customerId', 'customer_id'
];

// Padrões de tracking não essencial
const TRACKING_PATTERNS = [
  '/analytics', '/tracking', '/telemetry', '/metrics', '/usage',
  '/events', '/pixel', '/beacon', 'google-analytics', 'facebook-pixel',
  'segment', 'mixpanel', 'amplitude'
];

// Campos sensíveis para sanitização
const SENSITIVE_FIELDS = [
  'apiKey', 'api_key', 'secret', 'password', 'token', 'accessToken',
  'access_token', 'refreshToken', 'refresh_token', 'privateKey', 'private_key',
  'creditCard', 'credit_card', 'ssn', 'cpf', 'cnpj'
];

/**
 * Calcula o exposure score baseado nos identificadores encontrados no payload
 */
function calculateExposureScore(payload) {
  let score = 0;
  
  function searchFields(obj) {
    if (!obj || typeof obj !== 'object') return;
    
    for (const [key, value] of Object.entries(obj)) {
      if (METADATA_FIELDS.some(field => field.toLowerCase() === key.toLowerCase())) {
        if (key.toLowerCase().includes('userid') || key.toLowerCase().includes('email')) {
          score += 25;
        } else if (key.toLowerCase().includes('projectid') || key.toLowerCase().includes('sessionid')) {
          score += 15;
        } else if (key.toLowerCase().includes('credit') || key.toLowerCase().includes('api')) {
          score += 20;
        } else {
          score += 10;
        }
      }
      
      if (typeof value === 'object' && value !== null) {
        searchFields(value);
      }
    }
  }
  
  searchFields(payload);
  return Math.min(score, 100);
}

/**
 * Extrai metadata do payload
 */
function extractMetadata(payload) {
  const metadata = {};
  
  function searchMetadata(obj) {
    if (!obj || typeof obj !== 'object') return;
    
    for (const [key, value] of Object.entries(obj)) {
      if (METADATA_FIELDS.some(field => field.toLowerCase() === key.toLowerCase())) {
        metadata[key] = value;
      }
      if (typeof value === 'object' && value !== null) {
        searchMetadata(value);
      }
    }
  }
  
  searchMetadata(payload);
  return metadata;
}

/**
 * Sanitiza campos sensíveis em um objeto
 */
function sanitizeSensitiveData(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sanitized = Array.isArray(obj) ? [] : {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.some(field => field.toLowerCase() === key.toLowerCase())) {
      sanitized[key] = typeof value === 'string' ? '[REDACTED]' : value.constructor();
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeSensitiveData(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Verifica se uma URL é de tracking não essencial
 */
function isTrackingRequest(url) {
  const lowerUrl = url.toLowerCase();
  return TRACKING_PATTERNS.some(pattern => lowerUrl.includes(pattern));
}

/**
 * Verifica se um endpoint deve ser monitorado
 */
function isMonitoredEndpoint(url) {
  const urlLower = url.toLowerCase();
  
  if (MONITORED_ENDPOINTS.some(endpoint => urlLower.includes(endpoint.toLowerCase()))) {
    return true;
  }
  
  if (PROJECT_ENDPOINT_PATTERN.test(url)) {
    return true;
  }
  
  return false;
}

// Intercepta requisições usando webRequest API
chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    // Verifica se é tracking não essencial
    if (auditState.blockTracking && isTrackingRequest(details.url)) {
      auditState.blockedRequests++;
      
      // Salva no storage
      await chrome.storage.local.set({ lastBlocked: {
        timestamp: Date.now(),
        url: details.url,
        tabId: details.tabId
      }});
      
      console.log('[DataAudit] Blocked tracking request:', details.url);
      
      // Cancela a requisição
      return { cancel: true };
    }
    
    // Monitora endpoints específicos
    if (isMonitoredEndpoint(details.url)) {
      auditState.totalRequests++;
      
      // Tenta extrair o payload se disponível
      let postData = null;
      let exposureScore = 0;
      let metadata = {};
      
      if (details.requestBody && details.requestBody.raw) {
        try {
          const decoder = new TextDecoder();
          const rawData = details.requestBody.raw[0]?.bytes;
          if (rawData) {
            const rawString = decoder.decode(rawData);
            postData = JSON.parse(rawString);
            exposureScore = calculateExposureScore(postData);
            metadata = extractMetadata(postData);
            
            if (exposureScore >= 50) {
              auditState.highExposureCount++;
            }
          }
        } catch (e) {
          console.warn('[DataAudit] Could not parse request body:', e);
        }
      }
      
      // Salva informações da requisição
      const requestData = {
        timestamp: Date.now(),
        url: details.url,
        method: details.method,
        exposureScore,
        metadata,
        tabId: details.tabId,
        hasPostData: !!postData
      };
      
      await chrome.storage.local.set({ lastMonitoredRequest: requestData });
      
      // Atualiza estatísticas diárias no storage
      const today = new Date().toISOString().split('T')[0];
      const stats = await chrome.storage.local.get(['dailyStats']);
      const currentStats = stats.dailyStats || {};
      
      currentStats[today] = currentStats[today] || {
        totalRequests: 0,
        blockedCount: 0,
        highExposureCount: 0
      };
      
      currentStats[today].totalRequests++;
      if (exposureScore >= 50) {
        currentStats[today].highExposureCount++;
      }
      
      await chrome.storage.local.set({ dailyStats: currentStats, auditState });
      
      console.log('[DataAudit] Monitored request:', details.url, 'Score:', exposureScore);
      
      // Notifica popup se estiver aberto
      try {
        chrome.runtime.sendMessage({
          action: 'NEW_REQUEST',
          data: requestData
        });
      } catch (e) {
        // Popup pode não estar aberto
      }
    }
    
    return { cancel: false };
  },
  { urls: ['<all_urls>'] },
  ['requestBody', 'extraHeaders']
);

// Intercepta respostas para sanitização
chrome.webRequest.onBeforeSendHeaders.addListener(
  async (details) => {
    // Adiciona headers para indicar que a extensão está ativa
    if (details.type === 'xmlhttprequest' || details.type === 'fetch') {
      return {
        requestHeaders: [
          ...details.requestHeaders,
          { name: 'X-Data-Audit-Active', value: 'true' }
        ]
      };
    }
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders', 'extraHeaders']
);

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'GET_STATE':
      sendResponse(auditState);
      break;
      
    case 'TOGGLE_BLOCKING':
      auditState.blockTracking = !auditState.blockTracking;
      chrome.storage.local.set({ auditState }).then(() => {
        sendResponse({ success: true, blockTracking: auditState.blockTracking });
      });
      return true; // Keep channel open for async response
      
    case 'TOGGLE_SANITIZATION':
      auditState.sanitizeResponses = !auditState.sanitizeResponses;
      chrome.storage.local.set({ auditState }).then(() => {
        sendResponse({ success: true, sanitizeResponses: auditState.sanitizeResponses });
      });
      return true;
      
    case 'GET_STATS':
      chrome.storage.local.get(['dailyStats']).then((result) => {
        sendResponse({ stats: result.dailyStats, currentState: auditState });
      });
      return true;
      
    case 'CLEAR_DATA':
      auditState.totalRequests = 0;
      auditState.blockedRequests = 0;
      auditState.highExposureCount = 0;
      chrome.storage.local.clear().then(() => {
        chrome.storage.local.set({ auditState });
        sendResponse({ success: true });
      });
      return true;
      
    // Credit Freeze module messages
    case 'SET_CREDIT_FREEZE_ENABLED':
      // Encaminha para content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'SET_CREDIT_FREEZE_ENABLED',
            enabled: request.enabled
          }, (response) => {
            sendResponse(response || { success: false, error: 'No response from content script' });
          });
        } else {
          sendResponse({ success: false, error: 'No active tab' });
        }
      });
      return true;
      
    case 'SET_FAKE_CREDITS':
      // Encaminha para content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'SET_FAKE_CREDITS',
            amount: request.amount
          }, (response) => {
            sendResponse(response || { success: false, error: 'No response from content script' });
          });
        } else {
          sendResponse({ success: false, error: 'No active tab' });
        }
      });
      return true;
      
    case 'GET_CREDIT_STATE':
      // Encaminha para content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'GET_CREDIT_STATE'
          }, (response) => {
            sendResponse(response || { enabled: false, remaining: 0 });
          });
        } else {
          sendResponse({ enabled: false, remaining: 0, error: 'No active tab' });
        }
      });
      return true;
      
    default:
      sendResponse({ error: 'Unknown action' });
  }
});

// Install event
self.addEventListener('install', (event) => {
  console.log('[DataAudit] Installing...');
  event.waitUntil(
    caches.open('data-audit-v1').then((cache) => {
      return cache.addAll(['/lib/dexie.min.js']);
    })
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[DataAudit] Activated');
  event.waitUntil(self.clients.claim());
});

console.log('[DataAudit] Service worker loaded');
