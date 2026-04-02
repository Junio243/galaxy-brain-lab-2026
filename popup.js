// Popup script for Lovable Credit Freeze extension

document.addEventListener('DOMContentLoaded', function() {
    const toggleBtn = document.getElementById('toggleBtn');
    const statusDiv = document.getElementById('status');
    
    // Verificar o estado atual da extensão
    chrome.storage.sync.get(['creditsFrozen'], function(result) {
        if (result.creditsFrozen) {
            statusDiv.textContent = 'Ativado';
            statusDiv.className = 'status active';
            toggleBtn.textContent = 'Descongelar Créditos';
            toggleBtn.className = 'unfreeze-btn';
        } else {
            statusDiv.textContent = 'Desativado';
            statusDiv.className = 'status inactive';
            toggleBtn.textContent = 'Congelar Créditos';
            toggleBtn.className = 'freeze-btn';
        }
    });
    
    // Adicionar evento ao botão
    toggleBtn.addEventListener('click', function() {
        chrome.storage.sync.get(['creditsFrozen'], function(result) {
            const newState = !result.creditsFrozen;
            
            chrome.storage.sync.set({creditsFrozen: newState}, function() {
                if (newState) {
                    statusDiv.textContent = 'Ativado';
                    statusDiv.className = 'status active';
                    toggleBtn.textContent = 'Descongelar Créditos';
                    toggleBtn.className = 'unfreeze-btn';
                    
                    // Enviar mensagem para o content script ativar o congelamento
                    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                        if (tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, {action: "freezeCredits"});
                        }
                    });
                } else {
                    statusDiv.textContent = 'Desativado';
                    statusDiv.className = 'status inactive';
                    toggleBtn.textContent = 'Congelar Créditos';
                    toggleBtn.className = 'freeze-btn';
                    
                    // Enviar mensagem para o content script desativar o congelamento
                    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                        if (tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, {action: "unfreezeCredits"});
                        }
                    });
                }
            });
        });
    });
});