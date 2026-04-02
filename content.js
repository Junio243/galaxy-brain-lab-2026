// Script para congelar créditos no Lovable
console.log('Lovable Credit Freeze extension loaded');

// Função para interceptar chamadas de consumo de créditos
function freezeCredits() {
    // Sobrescrever métodos que consomem créditos
    const originalFetch = window.fetch;
    
    window.fetch = function(...args) {
        const [url, options] = args;
        
        // Verificar se a requisição é para consumir créditos
        if (url.includes('/api/') && (url.includes('credit') || url.includes('consume') || url.includes('usage'))) {
            console.log('Credit consumption blocked:', url);
            // Retornar uma resposta simulada para evitar o consumo
            return new Promise((resolve) => {
                resolve(new Response(JSON.stringify({
                    success: true,
                    message: "Credits frozen - no consumption allowed"
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
            });
        }
        
        // Para outras requisições, usar o fetch original
        return originalFetch.apply(this, args);
    };
    
    // Interceptando XMLHttpRequest também
    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
        if (url.includes('/api/') && (url.includes('credit') || url.includes('consume') || url.includes('usage'))) {
            console.log('Credit consumption blocked via XHR:', url);
            // Não fazer nada, bloquear a requisição
            return;
        }
        return originalXHR.call(this, method, url, async, user, password);
    };
    
    // Adicionar estilo para indicar que os créditos estão congelados
    const style = document.createElement('style');
    style.textContent = `
        .freeze-credits-overlay {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background-color: rgba(0, 0, 0, 0.7) !important;
            z-index: 999999 !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            color: white !important;
            font-size: 24px !important;
            font-weight: bold !important;
            text-align: center !important;
            padding: 20px !important;
        }
        .freeze-credits-message {
            background-color: #ff6b6b !important;
            padding: 20px !important;
            border-radius: 10px !important;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3) !important;
        }
    `;
    document.head.appendChild(style);
    
    // Criar overlay para mostrar que os créditos estão congelados
    const overlay = document.createElement('div');
    overlay.className = 'freeze-credits-overlay';
    overlay.innerHTML = '<div class="freeze-credits-message">CRÉDITOS CONGELADOS - NENHUM CONSUMO PERMITIDO</div>';
    document.body.appendChild(overlay);
}

// Executar quando o documento estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', freezeCredits);
} else {
    freezeCredits();
}

// Monitorar mudanças dinâmicas na página
const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if (mutation.type === 'childList') {
            // Verificar se novos elementos foram adicionados que possam consumir créditos
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) { // Elemento HTML
                    // Pode adicionar lógica para identificar elementos que consomem créditos
                }
            });
        }
    });
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});