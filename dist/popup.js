// Popup script for AI Data Audit Extension

document.addEventListener('DOMContentLoaded', function() {
    const blockTrackingToggle = document.getElementById('blockTrackingToggle');
    const sanitizeToggle = document.getElementById('sanitizeToggle');
    const freezeCreditsToggle = document.getElementById('freezeCreditsToggle');
    const fakeCreditsInput = document.getElementById('fakeCreditsInput');
    const setFakeCreditsBtn = document.getElementById('setFakeCreditsBtn');
    const creditFreezeStateEl = document.getElementById('creditFreezeState');
    const totalRequestsEl = document.getElementById('totalRequests');
    const blockedRequestsEl = document.getElementById('blockedRequests');
    const highExposureCountEl = document.getElementById('highExposureCount');
    const todayStatsEl = document.getElementById('todayStats');
    const exposureFillEl = document.getElementById('exposureFill');
    const lastRequestInfoEl = document.getElementById('lastRequestInfo');
    const metadataListEl = document.getElementById('metadataList');
    const refreshBtn = document.getElementById('refreshBtn');
    const clearDataBtn = document.getElementById('clearDataBtn');
    const statusBadge = document.getElementById('statusBadge');

    // Carregar estado inicial
    loadState();

    // Listen for messages from service worker
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'NEW_REQUEST') {
            updateUI(request.data);
        } else if (request.action === 'CREDIT_FREEZE_UPDATE') {
            updateCreditFreezeUI(request.state);
        }
        sendResponse({ received: true });
    });

    // Toggle bloquear tracking
    blockTrackingToggle.addEventListener('change', function() {
        chrome.runtime.sendMessage({ action: 'TOGGLE_BLOCKING' }, (response) => {
            if (response && response.success) {
                console.log('Block tracking:', response.blockTracking);
            }
        });
    });

    // Toggle sanitizar respostas
    sanitizeToggle.addEventListener('change', function() {
        chrome.runtime.sendMessage({ action: 'TOGGLE_SANITIZATION' }, (response) => {
            if (response && response.success) {
                console.log('Sanitize responses:', response.sanitizeResponses);
            }
        });
    });

    // Toggle congelar créditos
    freezeCreditsToggle.addEventListener('change', function() {
        chrome.runtime.sendMessage({ 
            action: 'SET_CREDIT_FREEZE_ENABLED', 
            enabled: this.checked 
        }, (response) => {
            if (response && response.success) {
                console.log('Credit freeze:', response.enabled);
            }
        });
    });

    // Set fake credits amount
    setFakeCreditsBtn.addEventListener('click', function() {
        const amount = parseInt(fakeCreditsInput.value, 10);
        if (isNaN(amount) || amount < 0) {
            alert('Por favor, insira um valor válido');
            return;
        }
        
        chrome.runtime.sendMessage({ 
            action: 'SET_FAKE_CREDITS', 
            amount: amount 
        }, (response) => {
            if (response && response.success) {
                alert(`Créditos fake atualizados para: ${amount}`);
                loadCreditFreezeState();
            } else {
                alert('Erro ao atualizar créditos: ' + (response?.error || 'Desconhecido'));
            }
        });
    });

    // Botão atualizar
    refreshBtn.addEventListener('click', loadState);

    // Botão limpar dados
    clearDataBtn.addEventListener('click', function() {
        if (confirm('Tem certeza que deseja limpar todo o histórico?')) {
            chrome.runtime.sendMessage({ action: 'CLEAR_DATA' }, (response) => {
                if (response && response.success) {
                    loadState();
                }
            });
        }
    });

    function loadState() {
        // Obter estado do service worker
        chrome.runtime.sendMessage({ action: 'GET_STATE' }, (state) => {
            if (state) {
                totalRequestsEl.textContent = state.totalRequests || 0;
                blockedRequestsEl.textContent = state.blockedRequests || 0;
                highExposureCountEl.textContent = state.highExposureCount || 0;
                
                blockTrackingToggle.checked = state.blockTracking !== false;
                sanitizeToggle.checked = state.sanitizeResponses !== false;
                
                updateStatusBadge(true);
            }
            
            // Carregar estado do credit freeze
            loadCreditFreezeState();
            
            // Obter estatísticas diárias
            chrome.runtime.sendMessage({ action: 'GET_STATS' }, (response) => {
                if (response && response.stats) {
                    const today = new Date().toISOString().split('T')[0];
                    const todayData = response.stats[today];
                    
                    if (todayData) {
                        todayStatsEl.textContent = todayData.totalRequests || 0;
                    } else {
                        todayStatsEl.textContent = '0';
                    }
                }
            });
            
            // Obter última requisição monitorada
            chrome.storage.local.get(['lastMonitoredRequest'], (result) => {
                if (result.lastMonitoredRequest) {
                    updateUI(result.lastMonitoredRequest);
                }
            });
        });
    }

    function loadCreditFreezeState() {
        chrome.runtime.sendMessage({ action: 'GET_CREDIT_STATE' }, (state) => {
            if (state) {
                updateCreditFreezeUI(state);
            }
        });
    }

    function updateCreditFreezeUI(state) {
        if (!state) return;
        
        // Atualizar toggle
        freezeCreditsToggle.checked = state.enabled !== false;
        
        // Atualizar input de créditos fake
        fakeCreditsInput.value = state.remaining || 999999;
        
        // Atualizar display de estado
        if (creditFreezeStateEl) {
            const platformText = state.platform ? ` (${state.platform})` : '';
            const statusText = state.enabled ? '✅ Ativo' : '❌ Desativado';
            const creditsText = `Créditos: ${state.remaining || 0}`;
            const frozenText = state.frozen ? '🔒 Congelado' : '🔓 Livre';
            
            creditFreezeStateEl.innerHTML = `
                <div>${statusText}</div>
                <div style="margin-top: 4px;">${creditsText}</div>
                <div style="margin-top: 2px; font-size: 10px; color: #888;">${frozenText}${platformText}</div>
            `;
        }
    }

    function updateUI(data) {
        if (!data) return;
        
        // Atualizar contador de total
        if (data.exposureScore !== undefined) {
            // Atualizar exposure meter
            exposureFillEl.style.width = data.exposureScore + '%';
            
            // Mostrar informações da última requisição
            lastRequestInfoEl.innerHTML = `
                <div style="margin-bottom: 8px;">
                    <strong>URL:</strong> ${truncateUrl(data.url)}
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>Método:</strong> ${data.method}
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>Exposure Score:</strong> 
                    <span style="color: ${getExposureColor(data.exposureScore)}; font-weight: bold;">
                        ${data.exposureScore}/100
                    </span>
                </div>
                <div style="font-size: 10px; color: #999;">
                    ${new Date(data.timestamp).toLocaleString('pt-BR')}
                </div>
            `;
            
            // Atualizar lista de metadata
            if (data.metadata && Object.keys(data.metadata).length > 0) {
                metadataListEl.innerHTML = '';
                for (const [key, value] of Object.entries(data.metadata)) {
                    const li = document.createElement('li');
                    li.className = 'metadata-item';
                    li.innerHTML = `
                        <span class="metadata-key">${escapeHtml(key)}:</span> 
                        <span>${formatValue(value)}</span>
                    `;
                    metadataListEl.appendChild(li);
                }
            } else {
                metadataListEl.innerHTML = '<li class="metadata-item" style="color: #999;">Nenhuma metadata detectada</li>';
            }
        }
    }

    function updateStatusBadge(active) {
        statusBadge.textContent = active ? 'Ativo' : 'Inativo';
        statusBadge.className = 'status-badge ' + (active ? 'status-active' : 'status-inactive');
    }

    function truncateUrl(url, maxLength = 50) {
        if (!url) return '';
        if (url.length <= maxLength) return url;
        return url.substring(0, maxLength) + '...';
    }

    function getExposureColor(score) {
        if (score < 30) return '#4caf50';
        if (score < 70) return '#ffeb3b';
        return '#f44336';
    }

    function formatValue(value) {
        if (typeof value === 'string') {
            // Truncate long strings
            if (value.length > 30) {
                return escapeHtml(value.substring(0, 30)) + '...';
            }
            return escapeHtml(value);
        }
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        return String(value);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});