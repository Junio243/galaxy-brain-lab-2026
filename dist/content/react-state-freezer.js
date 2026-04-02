/**
 * React State Freezer for Lovable UI
 * Priority 3: Hook into React's internal state to freeze credit display
 * 
 * This module finds and manipulates React component state to prevent
 * credit/usage UI updates from reflecting actual consumption.
 */

class ReactStateFreezer {
  constructor(options = {}) {
    this.options = {
      enabled: options.enabled !== false,
      logOperations: options.logOperations || false,
      fakeCreditsRemaining: options.fakeCreditsRemaining || 999999,
      syncInterval: options.syncInterval || 1000 // ms
    };

    this.creditState = {
      creditsSpent: 0,
      creditsRemaining: this.options.fakeCreditsRemaining,
      usage: { cost: 0, spent: 0 },
      quota: { remaining: this.options.fakeCreditsRemaining }
    };

    this.frozenComponents = new Map();
    this.observer = null;
    this.syncTimer = null;

    // Load persisted state
    this.loadPersistedState();

    if (this.options.enabled) {
      this.initialize();
    }

    console.log('[React Freezer] Initialized with fake credits:', this.creditState);
  }

  /**
   * Initialize the React state freezer
   */
  async initialize() {
    // Wait for React to be available
    await this.waitForReact();

    // Find and freeze credit-related components
    this.findAndFreezeComponents();

    // Setup DOM observer for dynamic content
    this.setupDOMObserver();

    // Start periodic sync
    this.startSyncLoop();

    // Inject fake credit display override
    this.injectCreditOverride();
  }

  /**
   * Wait for React devtools hook to be available
   */
  waitForReact(timeout = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkReact = () => {
        if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
          if (this.options.logOperations) {
            console.log('[React Freezer] React devtools hook found');
          }
          resolve();
          return;
        }

        if (Date.now() - startTime > timeout) {
          console.warn('[React Freezer] React not found within timeout, continuing anyway');
          resolve(); // Continue even without React devtools
          return;
        }

        setTimeout(checkReact, 100);
      };

      checkReact();
    });
  }

  /**
   * Find React components related to credits/usage
   */
  findAndFreezeComponents() {
    // Method 1: Try React DevTools hook
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      try {
        this.findComponentsViaDevTools();
      } catch (e) {
        console.error('[React Freezer] DevTools method failed:', e);
      }
    }

    // Method 2: Search DOM for credit displays and find their React instances
    this.findComponentsViaDOM();
  }

  /**
   * Find components via React DevTools
   */
  findComponentsViaDevTools() {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    
    if (!hook.renderers || hook.renderers.size === 0) {
      return;
    }

    // Iterate through renderers (React 18+)
    for (const renderer of hook.renderers.values()) {
      try {
        // Get all mounted components
        const fiberRoots = renderer.getFiberRoots?.(-1); // -1 for all roots
        
        if (fiberRoots) {
          for (const root of fiberRoots) {
            this.traverseFiber(root, (fiber) => {
              this.checkAndFreezeFiber(fiber);
            });
          }
        }
      } catch (e) {
        // Renderer might not support these methods
      }
    }
  }

  /**
   * Find components via DOM search
   */
  findComponentsViaDOM() {
    // Common selectors for credit/usage displays
    const creditSelectors = [
      '[class*="credit"]',
      '[class*="quota"]',
      '[class*="usage"]',
      '[class*="balance"]',
      '[class*="billing"]',
      '[data-testid*="credit"]',
      '[data-testid*="quota"]',
      '[aria-label*="credit"]',
      '[aria-label*="quota"]'
    ];

    const selector = creditSelectors.join(', ');
    const elements = document.querySelectorAll(selector);

    elements.forEach(el => {
      const reactInstance = this.findReactInstance(el);
      if (reactInstance) {
        this.freezeComponent(reactInstance, el);
      }
    });
  }

  /**
   * Traverse React fiber tree
   */
  traverseFiber(fiber, callback) {
    if (!fiber) return;

    callback(fiber);

    // Traverse children
    if (fiber.child) {
      this.traverseFiber(fiber.child, callback);
    }

    // Traverse siblings
    if (fiber.sibling) {
      this.traverseFiber(fiber.sibling, callback);
    }
  }

  /**
   * Check if fiber component is credit-related and freeze it
   */
  checkAndFreezeFiber(fiber) {
    if (!fiber || !fiber.stateNode) return;

    const element = fiber.stateNode;
    if (!(element instanceof Element)) return;

    // Check if element contains credit-related text
    const text = element.textContent?.toLowerCase() || '';
    const className = element.className?.toLowerCase() || '';

    const creditKeywords = ['credit', 'quota', 'usage', 'balance', 'tokens', 'remaining'];
    const isCreditRelated = creditKeywords.some(kw => 
      text.includes(kw) || className.includes(kw)
    );

    if (isCreditRelated) {
      this.freezeComponent(fiber, element);
    }
  }

  /**
   * Find React instance from DOM element
   */
  findReactInstance(element) {
    // React 17+ uses __reactFiber$ prefix
    // React 16 uses __reactInternalInstance$ prefix
    
    let fiber = null;
    
    // Try different React versions
    for (const key of Object.keys(element)) {
      if (key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')) {
        fiber = element[key];
        break;
      }
    }

    return fiber;
  }

  /**
   * Freeze a React component's credit state
   */
  freezeComponent(component, element) {
    const componentId = this.getComponentId(component);
    
    if (this.frozenComponents.has(componentId)) {
      return; // Already frozen
    }

    if (this.options.logOperations) {
      console.log('[React Freezer] Freezing component:', componentId);
    }

    this.frozenComponents.set(componentId, {
      component,
      element,
      frozenAt: Date.now(),
      originalText: element?.textContent || ''
    });

    // Freeze the display
    this.applyFreezeToComponent(component, element);
  }

  /**
   * Apply freeze effect to component
   */
  applyFreezeToComponent(component, element) {
    if (!element) return;

    // Update text content to show fake credits
    this.updateElementDisplay(element);

    // Prevent future updates by intercepting mutations
    this.preventUpdates(element);
  }

  /**
   * Update element display with fake credit values
   */
  updateElementDisplay(element) {
    const text = element.textContent?.toLowerCase() || '';
    
    // Detect what type of value to display
    if (text.includes('remaining') || text.includes('balance') || text.includes('left')) {
      element.textContent = `${this.creditState.creditsRemaining} credits remaining`;
    } else if (text.includes('spent') || text.includes('used') || text.includes('cost')) {
      element.textContent = `0 credits spent`;
    } else if (text.includes('quota') || text.includes('limit')) {
      element.textContent = `${this.creditState.quota.remaining} / ${this.creditState.quota.remaining}`;
    }
  }

  /**
   * Prevent updates to frozen elements
   */
  preventUpdates(element) {
    // Create a MutationObserver to revert changes
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          // Revert to frozen value
          this.updateElementDisplay(element);
          
          if (this.options.logOperations) {
            console.log('[React Freezer] Reverted unauthorized change');
          }
        }
      }
    });

    observer.observe(element, {
      childList: true,
      characterData: true,
      subtree: true
    });

    // Store observer reference for cleanup
    element._dxFreezeObserver = observer;
  }

  /**
   * Get unique ID for component
   */
  getComponentId(component) {
    if (component.stateNode instanceof Element) {
      return component.stateNode.getAttribute('data-dx-freeze-id') || 
             component.stateNode.id ||
             component.stateNode.className ||
             Math.random().toString(36).substr(2, 9);
    }
    return Math.random().toString(36).substr(2, 9);
  }

  /**
   * Setup DOM observer for dynamically added credit elements
   */
  setupDOMObserver() {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if this is a credit-related element
              const isCreditElement = this.isCreditElement(node);
              if (isCreditElement) {
                const reactInstance = this.findReactInstance(node);
                if (reactInstance) {
                  this.freezeComponent(reactInstance, node);
                }
              }

              // Check children
              const creditChildren = node.querySelectorAll?.('[class*="credit"], [class*="quota"], [class*="usage"]');
              if (creditChildren) {
                creditChildren.forEach(child => {
                  const reactInstance = this.findReactInstance(child);
                  if (reactInstance) {
                    this.freezeComponent(reactInstance, child);
                  }
                });
              }
            }
          });
        }
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Check if element is credit-related
   */
  isCreditElement(element) {
    const text = element.textContent?.toLowerCase() || '';
    const className = element.className?.toLowerCase() || '';
    
    const creditKeywords = ['credit', 'quota', 'usage', 'balance', 'tokens', 'remaining'];
    return creditKeywords.some(kw => text.includes(kw) || className.includes(kw));
  }

  /**
   * Inject credit override styles and scripts
   */
  injectCreditOverride() {
    // Add CSS to prevent visual updates
    const style = document.createElement('style');
    style.id = 'dx-credit-freeze-style';
    style.textContent = `
      [class*="credit"]:not(.dx-frozen),
      [class*="quota"]:not(.dx-frozen),
      [class*="usage"]:not(.dx-frozen) {
        /* Prevent flickering during updates */
      }
      
      .dx-frozen {
        pointer-events: auto !important;
      }
    `;
    
    if (!document.getElementById('dx-credit-freeze-style')) {
      document.head.appendChild(style);
    }
  }

  /**
   * Start periodic sync loop
   */
  startSyncLoop() {
    this.syncTimer = setInterval(() => {
      this.syncFrozenComponents();
      this.persistState();
    }, this.options.syncInterval);
  }

  /**
   * Sync all frozen components with current fake state
   */
  syncFrozenComponents() {
    for (const [id, info] of this.frozenComponents.values()) {
      if (info.element && document.contains(info.element)) {
        this.updateElementDisplay(info.element);
      }
    }
  }

  /**
   * Update credit state
   */
  updateCreditState(newState) {
    this.creditState = { ...this.creditState, ...newState };
    this.syncFrozenComponents();
    this.persistState();
  }

  /**
   * Persist state to localStorage
   */
  persistState() {
    try {
      localStorage.setItem('dx_react_credit_state', JSON.stringify({
        ...this.creditState,
        lastUpdated: Date.now()
      }));
    } catch (e) {
      console.error('[React Freezer] Failed to persist state:', e);
    }
  }

  /**
   * Load persisted state from localStorage
   */
  loadPersistedState() {
    try {
      const stored = localStorage.getItem('dx_react_credit_state');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.creditState = { ...this.creditState, ...parsed };
        if (this.options.logOperations) {
          console.log('[React Freezer] Loaded persisted state:', this.creditState);
        }
      }
    } catch (e) {
      console.error('[React Freezer] Failed to load persisted state:', e);
    }
  }

  /**
   * Get current state
   */
  getState() {
    return { ...this.creditState };
  }

  /**
   * Get frozen components count
   */
  getFrozenCount() {
    return this.frozenComponents.size;
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    
    if (this.observer) {
      this.observer.disconnect();
    }

    // Remove observers from elements
    for (const [, info] of this.frozenComponents) {
      if (info.element?._dxFreezeObserver) {
        info.element._dxFreezeObserver.disconnect();
      }
    }

    this.frozenComponents.clear();
  }
}

// Export singleton instance
const reactFreezer = new ReactStateFreezer({
  enabled: true,
  logOperations: false,
  fakeCreditsRemaining: 999999,
  syncInterval: 1000
});
window.ReactStateFreezer = ReactStateFreezer;
window.reactFreezer = reactFreezer;
