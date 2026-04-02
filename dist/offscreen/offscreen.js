/**
 * Offscreen Document Script - AI Data Audit Extension
 * Fornece UI persistente para visualização de dados de auditoria
 */

// Setup IndexedDB
const db = new Dexie('DataAuditDB');
db.version(1).stores({
  requestLog: '++id,timestamp,endpoint,method,exposureScore,tabId',
  sensitiveData: '++id,timestamp,type,field,tabId',
  blockedRequests: '++id,timestamp,url,reason,tabId',
  dailyStats: 'date,totalRequests,blockedCount,highExposureCount'
});

// Atualizar UI ao carregar
document.addEventListener('DOMContentLoaded', loadDashboard);

async function loadDashboard() {
  await refreshData();
  
  // Auto-refresh a cada 5 segundos
  setInterval(refreshData, 5000);
}

async function refreshData() {
  try {
    // Carregar estatísticas
    const totalRequests = await db.requestLog.count();
    const blockedRequests = await db.blockedRequests.count();
    const sensitiveDataCount = await db.sensitiveData.count();
    
    // Contar high exposure (score >= 50)
    const highExposureCount = await db.requestLog.where('exposureScore').aboveOrEqual(50).count();
    
    // Atualizar UI
    document.getElementById('totalRequests').textContent = totalRequests;
    document.getElementById('blockedRequests').textContent = blockedRequests;
    document.getElementById('highExposureCount').textContent = highExposureCount;
    document.getElementById('sensitiveDataCount').textContent = sensitiveDataCount;
    
    // Carregar últimas requisições
    await loadRecentRequests();
    
    // Carregar dados sensíveis detectados
    await loadSensitiveData();
    
  } catch (error) {
    console.error('[Offscreen] Error loading dashboard:', error);
  }
}

async function loadRecentRequests() {
  const requests = await db.requestLog
    .orderBy('timestamp')
    .reverse()
    .limit(10)
    .toArray();
  
  const tbody = document.getElementById('requestsTable');
  
  if (requests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999;">Nenhuma requisição registrada</td></tr>';
    return;
  }
  
  tbody.innerHTML = requests.map(req => {
    const scoreClass = getExposureClass(req.exposureScore);
    const metadataStr = req.metadata ? Object.keys(req.metadata).join(', ') : '-';
    const time = new Date(req.timestamp).toLocaleTimeString('pt-BR');
    
    return `
      <tr>
        <td>${truncateString(req.endpoint, 40)}</td>
        <td>${req.method}</td>
        <td class="${scoreClass}">${req.exposureScore}</td>
        <td>${metadataStr || '-'}</td>
        <td>${time}</td>
      </tr>
    `;
  }).join('');
}

async function loadSensitiveData() {
  const data = await db.sensitiveData
    .orderBy('timestamp')
    .reverse()
    .limit(10)
    .toArray();
  
  const tbody = document.getElementById('sensitiveTable');
  
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #999;">Nenhum dado sensível detectado</td></tr>';
    return;
  }
  
  tbody.innerHTML = data.map(item => {
    const time = new Date(item.timestamp).toLocaleTimeString('pt-BR');
    return `
      <tr>
        <td>${item.field}</td>
        <td>${item.type}</td>
        <td>${truncateString(item.url, 30)}</td>
        <td>${time}</td>
      </tr>
    `;
  }).join('');
}

function getExposureClass(score) {
  if (score < 30) return 'exposure-low';
  if (score < 70) return 'exposure-medium';
  return 'exposure-high';
}

function truncateString(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

async function exportData() {
  try {
    const requests = await db.requestLog.toArray();
    const sensitive = await db.sensitiveData.toArray();
    const blocked = await db.blockedRequests.toArray();
    const stats = await db.dailyStats.toArray();
    
    const report = {
      exportedAt: new Date().toISOString(),
      summary: {
        totalRequests: requests.length,
        sensitiveDataDetected: sensitive.length,
        blockedRequests: blocked.length
      },
      requests,
      sensitiveData: sensitive,
      blockedRequests: blocked,
      dailyStats: stats
    };
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data-audit-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    alert('Relatório exportado com sucesso!');
  } catch (error) {
    console.error('[Offscreen] Error exporting data:', error);
    alert('Erro ao exportar relatório: ' + error.message);
  }
}

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'REFRESH_DASHBOARD') {
    refreshData();
    sendResponse({ success: true });
  }
  return true;
});

console.log('[Offscreen] Dashboard loaded');
