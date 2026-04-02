/**
 * Data Audit Interceptor - Intercepta requisições HTTP e identifica leakage de dados pessoais
 * 
 * Funcionalidades:
 * - Intercepta TODAS as requisições de saída para identificar leakage de dados
 * - Para endpoints específicos (/api/agent, /api/chat, /api/projects/*/generate):
 *   - Extrai e loga o payload completo
 *   - Identifica campos de metadata (userId, projectId, sessionId, credit info)
 *   - Calcula 'exposure score' baseado em quantos identificadores são enviados
 * - Modifica respostas para sanitizar campos sensíveis antes que sejam renderizados
 * - Bloqueia requisições de tracking de uso não essenciais
 */

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
  'userId',
  'user_id',
  'projectId',
  'project_id',
  'sessionId',
  'session_id',
  'creditInfo',
  'credit_info',
  'credits',
  'apiKey',
  'api_key',
  'token',
  'email',
  'username',
  'accountId',
  'account_id',
  'organizationId',
  'organization_id',
  'customerId',
  'customer_id'
];

// Campos sensíveis que devem ser sanitizados nas respostas
const SENSITIVE_FIELDS = [
  'apiKey',
  'api_key',
  'secret',
  'password',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'privateKey',
  'private_key',
  'creditCard',
  'credit_card',
  'ssn',
  'cpf',
  'cnpj'
];

// Padrões de tracking não essencial
const TRACKING_PATTERNS = [
  '/analytics',
  '/tracking',
  '/telemetry',
  '/metrics',
  '/usage',
  '/events',
  '/pixel',
  '/beacon',
  'google-analytics',
  'facebook-pixel',
  'segment',
  'mixpanel',
  'amplitude'
];

// IndexedDB setup usando Dexie
const db = new Dexie('DataAuditDB');
db.version(1).stores({
  requestLog: '++id,timestamp,endpoint,method,exposureScore,tabId',
  sensitiveData: '++id,timestamp,type,field,tabId',
  blockedRequests: '++id,timestamp,url,reason,tabId',
  dailyStats: 'date,totalRequests,blockedCount,highExposureCount'
});

// Estado global
const auditState = {
  enabled: true,
  blockTracking: true,
  sanitizeResponses: true,
  totalRequests: 0,
  blockedRequests: 0,
  highExposureCount: 0
};

/**
 * Calcula o exposure score baseado nos identificadores encontrados no payload
 * @param {Object} payload - Payload da requisição
 * @returns {number} - Score de 0 a 100
 */
function calculateExposureScore(payload) {
  let score = 0;
  const foundFields = [];
  
  function searchFields(obj, path = '') {
    if (!obj || typeof obj !== 'object') return;
    
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      // Verifica se é um campo de metadata
      if (METADATA_FIELDS.some(field => field.toLowerCase() === key.toLowerCase())) {
        foundFields.push(currentPath);
        
        // Peso diferente para tipos diferentes de identificadores
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
      
      // Recursivamente busca em objetos aninhados
      if (typeof value === 'object' && value !== null) {
        searchFields(value, currentPath);
      }
      
      // Busca em arrays
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === 'object') {
            searchFields(item, `${currentPath}[${index}]`);
          }
        });
      }
    }
  }
  
  searchFields(payload);
  
  // Cap em 100
  return Math.min(score, 100);
}

/**
 * Extrai metadata do payload
 * @param {Object} payload - Payload da requisição
 * @returns {Object} - Metadata encontrada
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
 * @param {Object} obj - Objeto para sanitizar
 * @returns {Object} - Objeto sanitizado
 */
function sanitizeSensitiveData(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sanitized = Array.isArray(obj) ? [] : {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.some(field => field.toLowerCase() === key.toLowerCase())) {
      // Substitui por [REDACTED] mantendo o tipo
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
 * @param {string} url - URL para verificar
 * @returns {boolean}
 */
function isTrackingRequest(url) {
  const lowerUrl = url.toLowerCase();
  return TRACKING_PATTERNS.some(pattern => lowerUrl.includes(pattern));
}

/**
 * Verifica se um endpoint deve ser monitorado
 * @param {string} url - URL para verificar
 * @returns {boolean}
 */
function isMonitoredEndpoint(url) {
  const urlLower = url.toLowerCase();
  
  // Verifica padrões específicos
  if (MONITORED_ENDPOINTS.some(endpoint => urlLower.includes(endpoint.toLowerCase()))) {
    return true;
  }
  
  // Verifica padrão de projects/*/generate
  if (PROJECT_ENDPOINT_PATTERN.test(url)) {
    return true;
  }
  
  return false;
}

/**
 * Registra uma requisição no IndexedDB
 */
async function logRequest(requestData) {
  try {
    await db.requestLog.add({
      timestamp: Date.now(),
      url: requestData.url,
      method: requestData.method,
      endpoint: requestData.endpoint,
      exposureScore: requestData.exposureScore,
      metadata: requestData.metadata,
      tabId: requestData.tabId,
      payloadSize: requestData.payloadSize
    });
    
    // Atualiza estatísticas diárias
    const today = new Date().toISOString().split('T')[0];
    const stats = await db.dailyStats.get(today);
    
    if (stats) {
      await db.dailyStats.update(today, {
        totalRequests: stats.totalRequests + 1,
        highExposureCount: requestData.exposureScore >= 50 ? stats.highExposureCount + 1 : stats.highExposureCount
      });
    } else {
      await db.dailyStats.add({
        date: today,
        totalRequests: 1,
        blockedCount: 0,
        highExposureCount: requestData.exposureScore >= 50 ? 1 : 0
      });
    }
    
    // Notifica o popup sobre nova requisição
    chrome.runtime.sendMessage({
      action: 'NEW_REQUEST',
      data: requestData
    }).catch(() => {}); // Ignora erro se popup não estiver aberto
    
  } catch (error) {
    console.error('[DataAudit] Error logging request:', error);
  }
}

/**
 * Registra dados sensíveis detectados
 */
async function logSensitiveData(data) {
  try {
    await db.sensitiveData.add({
      timestamp: Date.now(),
      type: data.type,
      field: data.field,
      value: data.value,
      tabId: data.tabId,
      url: data.url
    });
  } catch (error) {
    console.error('[DataAudit] Error logging sensitive data:', error);
  }
}

/**
 * Registra requisição bloqueada
 */
async function logBlockedRequest(data) {
  try {
    await db.blockedRequests.add({
      timestamp: Date.now(),
      url: data.url,
      reason: data.reason,
      tabId: data.tabId
    });
    
    auditState.blockedRequests++;
    
    // Atualiza estatísticas diárias
    const today = new Date().toISOString().split('T')[0];
    const stats = await db.dailyStats.get(today);
    
    if (stats) {
      await db.dailyStats.update(today, {
        blockedCount: stats.blockedCount + 1
      });
    }
  } catch (error) {
    console.error('[DataAudit] Error logging blocked request:', error);
  }
}

// Exporta funções para uso pelo content script
window.DataAuditInterceptor = {
  calculateExposureScore,
  extractMetadata,
  sanitizeSensitiveData,
  isTrackingRequest,
  isMonitoredEndpoint,
  logRequest,
  logSensitiveData,
  getState: () => ({ ...auditState })
};

console.log('[DataAudit] Interceptor loaded');
