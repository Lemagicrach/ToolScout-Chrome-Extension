/**
 * @file popup.js - Fixed ToolScout Extension v2.1.1
 * @description SECURITY & MEMORY FIXES - Memory management, error boundaries, GDPR compliance
 * @version 2.1.1
 */

(() => {
    'use strict';

    // =================================================================================================
    // SECURITY & PRIVACY CONFIGURATION
    // =================================================================================================
    
    const SECURITY_CONFIG = {
        // Rate limiting
        rateLimits: {
            apiCalls: { max: 100, window: 60000 }, // 100 calls per minute
            storage: { max: 50, window: 60000 },   // 50 storage ops per minute
            errors: { max: 10, window: 60000 }     // 10 errors per minute
        },
        
        // Data retention
        dataRetention: {
            analytics: 30 * 24 * 60 * 60 * 1000,   // 30 days
            errors: 7 * 24 * 60 * 60 * 1000,       // 7 days
            cache: 5 * 60 * 1000                    // 5 minutes
        },
        
        // Privacy settings
        privacy: {
            requireConsent: true,
            anonymizeData: true,
            encryptSensitiveData: true
        }
    };

    const AFFILIATE_CONFIG = {
        // Amazon Affiliate Tags by Region - SECURED
        amazonTags: {
            'amazon.com': 'toolscout20-20',
            'amazon.co.uk': 'toolscout20-20',
            'amazon.de': 'toolscout20-20',
            'amazon.fr': 'toolscout20-20',
            'amazon.es': 'toolscout20-20',
            'amazon.ae': 'toolscout20-20',
            'amazon.it': 'toolscout20-20',
            'amazon.ca': 'toolscout20-20',
            'amazon.com.au': 'toolscout20-20',
            'amazon.co.jp': 'toolscout20-20',
            'amazon.in': 'toolscout20-20'
        }
    };

    // =================================================================================================
    // RATE LIMITING SYSTEM
    // =================================================================================================
    
    class RateLimiter {
        constructor() {
            this.limits = new Map();
        }

        checkLimit(key, config) {
            const now = Date.now();
            const limit = this.limits.get(key) || { count: 0, resetTime: now + config.window };
            
            if (now > limit.resetTime) {
                limit.count = 0;
                limit.resetTime = now + config.window;
            }
            
            if (limit.count >= config.max) {
                throw new Error(`Rate limit exceeded for ${key}`);
            }
            
            limit.count++;
            this.limits.set(key, limit);
            return true;
        }
    }

    // =================================================================================================
    // GDPR CONSENT MANAGER
    // =================================================================================================
    
    class ConsentManager {
        constructor() {
            this.consentKey = 'toolscout_gdpr_consent';
        }

        async getConsent() {
            try {
                const result = await chrome.storage.local.get(this.consentKey);
                return result[this.consentKey] || null;
            } catch (error) {
                console.error('Error getting consent:', error);
                return null;
            }
        }

        async setConsent(consent) {
            try {
                const consentData = {
                    analytics: consent.analytics || false,
                    affiliate: consent.affiliate || false,
                    functional: consent.functional !== false, // Default true
                    timestamp: new Date().toISOString(),
                    version: '1.0'
                };
                
                await chrome.storage.local.set({ [this.consentKey]: consentData });
                return true;
            } catch (error) {
                console.error('Error setting consent:', error);
                return false;
            }
        }

        async showConsentDialog() {
            return new Promise((resolve) => {
                const modal = document.createElement('div');
                modal.id = 'gdpr-consent-modal';
                modal.innerHTML = `
                    <div class="consent-overlay">
                        <div class="consent-dialog" role="dialog" aria-labelledby="consent-title" aria-modal="true">
                            <h3 id="consent-title">Privacy & Data Collection</h3>
                            <p>ToolScout needs your consent to provide the best experience:</p>
                            
                            <div class="consent-options">
                                <label>
                                    <input type="checkbox" id="consent-functional" checked disabled>
                                    <strong>Functional</strong> - Required for basic operation
                                </label>
                                <label>
                                    <input type="checkbox" id="consent-analytics">
                                    <strong>Analytics</strong> - Help us improve (anonymous data only)
                                </label>
                                <label>
                                    <input type="checkbox" id="consent-affiliate">
                                    <strong>Affiliate Links</strong> - Support development through commissions
                                </label>
                            </div>
                            
                            <div class="consent-buttons">
                                <button id="consent-accept" class="btn-primary">Accept Selected</button>
                                <button id="consent-essential" class="btn-secondary">Essential Only</button>
                            </div>
                            
                            <p class="consent-note">
                                You can change these settings anytime in the extension options.
                                <a href="privacy_policy.html" target="_blank">Privacy Policy</a>
                            </p>
                        </div>
                    </div>
                `;

                // Add CSS
                const style = document.createElement('style');
                style.textContent = `
                    .consent-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0,0,0,0.8);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 10000;
                    }
                    .consent-dialog {
                        background: white;
                        border-radius: 12px;
                        padding: 24px;
                        max-width: 400px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    }
                    .consent-options { margin: 16px 0; }
                    .consent-options label {
                        display: block;
                        margin: 12px 0;
                        cursor: pointer;
                    }
                    .consent-buttons {
                        display: flex;
                        gap: 12px;
                        margin-top: 20px;
                    }
                    .consent-note {
                        font-size: 12px;
                        color: #666;
                        margin-top: 16px;
                    }
                    .btn-primary {
                        background: #4A90E2;
                        color: white;
                        border: none;
                        padding: 10px 16px;
                        border-radius: 6px;
                        cursor: pointer;
                        flex: 1;
                    }
                    .btn-secondary {
                        background: #e2e8f0;
                        color: #4a5568;
                        border: none;
                        padding: 10px 16px;
                        border-radius: 6px;
                        cursor: pointer;
                        flex: 1;
                    }
                `;
                document.head.appendChild(style);
                document.body.appendChild(modal);

                // Event handlers
                document.getElementById('consent-accept').onclick = () => {
                    const consent = {
                        functional: true,
                        analytics: document.getElementById('consent-analytics').checked,
                        affiliate: document.getElementById('consent-affiliate').checked
                    };
                    this.setConsent(consent).then(() => {
                        document.body.removeChild(modal);
                        document.head.removeChild(style);
                        resolve(consent);
                    });
                };

                document.getElementById('consent-essential').onclick = () => {
                    const consent = { functional: true, analytics: false, affiliate: false };
                    this.setConsent(consent).then(() => {
                        document.body.removeChild(modal);
                        document.head.removeChild(style);
                        resolve(consent);
                    });
                };

                // Focus management for accessibility
                modal.querySelector('button').focus();
            });
        }

        async requireConsent() {
            let consent = await this.getConsent();
            
            if (!consent) {
                consent = await this.showConsentDialog();
            }
            
            return consent;
        }
    }

    // =================================================================================================
    // ENHANCED ERROR BOUNDARY SYSTEM
    // =================================================================================================
    
    class ErrorBoundary {
        constructor() {
            this.rateLimiter = new RateLimiter();
            this.errorCount = 0;
            this.setupGlobalErrorHandling();
        }

        setupGlobalErrorHandling() {
            // Catch unhandled promise rejections
            window.addEventListener('unhandledrejection', (event) => {
                this.handleError(event.reason, 'UnhandledPromiseRejection');
                event.preventDefault();
            });

            // Catch JavaScript errors
            window.addEventListener('error', (event) => {
                this.handleError(event.error, 'GlobalError');
            });
        }

        handleError(error, context = 'Unknown', options = {}) {
            try {
                // Rate limit error logging
                this.rateLimiter.checkLimit('errors', SECURITY_CONFIG.rateLimits.errors);
                
                this.errorCount++;
                
                const errorInfo = {
                    message: error?.message || 'Unknown error',
                    stack: error?.stack?.substring(0, 500) || 'No stack trace',
                    context: context,
                    timestamp: new Date().toISOString(),
                    userAgent: navigator.userAgent.substring(0, 100),
                    url: window.location.href,
                    errorCount: this.errorCount,
                    fatal: options.fatal || false
                };
                
                // Log to storage (rate limited)
                this.logError(errorInfo).catch(console.error);
                
                // Return user-friendly message
                return this.getUserFriendlyMessage(error, context);
                
            } catch (rateLimitError) {
                console.warn('Error logging rate limited:', rateLimitError.message);
                return 'A temporary issue occurred. Please try again in a moment.';
            }
        }

        async logError(errorInfo) {
            try {
                this.rateLimiter.checkLimit('storage', SECURITY_CONFIG.rateLimits.storage);
                
                const result = await chrome.storage.local.get('errorLogs');
                const logs = result.errorLogs || [];
                
                logs.push(errorInfo);
                
                // Clean old errors based on retention policy
                const cutoffTime = Date.now() - SECURITY_CONFIG.dataRetention.errors;
                const cleanedLogs = logs.filter(log => 
                    new Date(log.timestamp).getTime() > cutoffTime
                ).slice(-50); // Keep max 50 errors
                
                await chrome.storage.local.set({ errorLogs: cleanedLogs });
                
            } catch (error) {
                console.error('Failed to log error:', error);
            }
        }

        getUserFriendlyMessage(error, context) {
            const messageMap = {
                'Network': 'Connection issue. Please check your internet connection.',
                'Permission': 'Permission denied. Please refresh the page and try again.',
                'Storage': 'Unable to save data. Storage may be full.',
                'RateLimit': 'Too many requests. Please wait a moment and try again.',
                'UnhandledPromiseRejection': 'An unexpected error occurred. Please try again.',
                'GlobalError': 'Something went wrong. Please refresh the extension.',
                'Default': 'An error occurred. Please try again.'
            };

            for (const [key, message] of Object.entries(messageMap)) {
                if (context.includes(key) || error?.message?.toLowerCase().includes(key.toLowerCase())) {
                    return message;
                }
            }

            return messageMap.Default;
        }

        async getErrorStats() {
            try {
                const result = await chrome.storage.local.get('errorLogs');
                const logs = result.errorLogs || [];
                
                const last24Hours = logs.filter(log => {
                    const logTime = new Date(log.timestamp).getTime();
                    return Date.now() - logTime < 24 * 60 * 60 * 1000;
                });

                return {
                    totalErrors: logs.length,
                    recentErrors: last24Hours.length,
                    errorRate: last24Hours.length / 24, // per hour
                    contexts: [...new Set(logs.map(log => log.context))]
                };
            } catch (error) {
                console.error('Failed to get error stats:', error);
                return { totalErrors: 0, recentErrors: 0, errorRate: 0, contexts: [] };
            }
        }
    }

    // =================================================================================================
    // MEMORY-SAFE EVENT MANAGER
    // =================================================================================================
    
    class EventManager {
        constructor() {
            this.eventHandlers = new Map();
            this.abortController = new AbortController();
        }

        addEventListener(element, event, handler, options = {}) {
            const key = `${element.constructor.name}-${event}-${handler.name}`;
            
            // Use AbortController for automatic cleanup
            const finalOptions = {
                ...options,
                signal: this.abortController.signal
            };
            
            element.addEventListener(event, handler, finalOptions);
            
            // Store reference for manual cleanup if needed
            this.eventHandlers.set(key, { element, event, handler, options });
        }

        removeEventListener(element, event, handler) {
            const key = `${element.constructor.name}-${event}-${handler.name}`;
            element.removeEventListener(event, handler);
            this.eventHandlers.delete(key);
        }

        cleanup() {
            // Abort all events at once
            this.abortController.abort();
            
            // Clear the map
            this.eventHandlers.clear();
            
            // Create new AbortController for future use
            this.abortController = new AbortController();
        }

        getActiveHandlers() {
            return Array.from(this.eventHandlers.keys());
        }
    }

    // =================================================================================================
    // UNIFIED CACHE MANAGER
    // =================================================================================================
    
    class CacheManager {
        constructor() {
            this.memoryCache = new Map();
            this.rateLimiter = new RateLimiter();
            this.cleanupInterval = setInterval(() => this.cleanupExpiredItems(), 60000); // Every minute
        }

        async get(key, options = {}) {
            // Check memory cache first
            const memoryItem = this.memoryCache.get(key);
            if (memoryItem && memoryItem.expires > Date.now()) {
                return memoryItem.data;
            }

            // Check storage cache
            try {
                this.rateLimiter.checkLimit('storage', SECURITY_CONFIG.rateLimits.storage);
                
                const result = await chrome.storage.local.get(`cache_${key}`);
                const storageItem = result[`cache_${key}`];
                
                if (storageItem && storageItem.expires > Date.now()) {
                    // Update memory cache
                    this.memoryCache.set(key, storageItem);
                    return storageItem.data;
                }
            } catch (error) {
                console.warn('Cache get failed:', error.message);
            }

            return null;
        }

        async set(key, data, ttl = SECURITY_CONFIG.dataRetention.cache) {
            const item = {
                data,
                expires: Date.now() + ttl,
                created: Date.now()
            };

            // Set in memory cache
            this.memoryCache.set(key, item);

            // Set in storage cache (rate limited)
            try {
                this.rateLimiter.checkLimit('storage', SECURITY_CONFIG.rateLimits.storage);
                await chrome.storage.local.set({ [`cache_${key}`]: item });
            } catch (error) {
                console.warn('Cache set failed:', error.message);
            }
        }

        async delete(key) {
            this.memoryCache.delete(key);
            
            try {
                await chrome.storage.local.remove(`cache_${key}`);
            } catch (error) {
                console.warn('Cache delete failed:', error.message);
            }
        }

        cleanupExpiredItems() {
            const now = Date.now();
            
            // Clean memory cache
            for (const [key, item] of this.memoryCache.entries()) {
                if (item.expires <= now) {
                    this.memoryCache.delete(key);
                }
            }

            // Clean storage cache (async)
            this.cleanupStorageCache().catch(console.error);
        }

        async cleanupStorageCache() {
            try {
                const allData = await chrome.storage.local.get();
                const cacheKeys = Object.keys(allData).filter(key => key.startsWith('cache_'));
                const expiredKeys = [];

                for (const key of cacheKeys) {
                    const item = allData[key];
                    if (!item.expires || item.expires <= Date.now()) {
                        expiredKeys.push(key);
                    }
                }

                if (expiredKeys.length > 0) {
                    await chrome.storage.local.remove(expiredKeys);
                }
            } catch (error) {
                console.error('Storage cache cleanup failed:', error);
            }
        }

        async clear() {
            this.memoryCache.clear();
            
            try {
                const allData = await chrome.storage.local.get();
                const cacheKeys = Object.keys(allData).filter(key => key.startsWith('cache_'));
                if (cacheKeys.length > 0) {
                    await chrome.storage.local.remove(cacheKeys);
                }
            } catch (error) {
                console.error('Cache clear failed:', error);
            }
        }

        cleanup() {
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
            }
            this.clear();
        }

        getStats() {
            const memoryItems = this.memoryCache.size;
            const memorySize = new Blob([JSON.stringify([...this.memoryCache.values()])]).size;
            
            return {
                memoryItems,
                memorySize,
                lastCleanup: new Date().toISOString()
            };
        }
    }

    // =================================================================================================
    // ENHANCED UI CONTROLLER WITH PROPER CLEANUP
    // =================================================================================================
    
    class UIController {
        constructor() {
            // Initialize all managers
            this.errorBoundary = new ErrorBoundary();
            this.eventManager = new EventManager();
            this.cacheManager = new CacheManager();
            this.consentManager = new ConsentManager();
            this.rateLimiter = new RateLimiter();
            
            this.currentProductData = null;
            this.isInitialized = false;
            
            // Bind cleanup to window events
            this.setupCleanupHandlers();
        }

        setupCleanupHandlers() {
            // Cleanup when popup closes
            window.addEventListener('beforeunload', () => this.cleanup());
            window.addEventListener('unload', () => this.cleanup());
            
            // Cleanup on page hide (for mobile)
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this.cleanup();
                }
            });
        }

        async initialize() {
            if (this.isInitialized) {
                console.warn('UIController already initialized');
                return;
            }

            try {
                // Check GDPR consent first
                const consent = await this.consentManager.requireConsent();
                if (!consent.functional) {
                    this.showConsentRequired();
                    return;
                }

                // Initialize UI elements
                this.elements = this.initializeElements();
                
                // Load product data
                await this.loadProductData();
                
                // Bind events using event manager
                this.bindEvents();
                
                this.isInitialized = true;
                console.log('ToolScout UI initialized successfully');
                
            } catch (error) {
                const message = this.errorBoundary.handleError(error, 'UI-Initialization', { fatal: true });
                this.showFatalError(message);
            }
        }

        initializeElements() {
            const elements = {
                productTitle: document.getElementById('product-title'),
                sitePrice: document.getElementById('site-price'),
                comparisonList: document.getElementById('comparison-list'),
                setAlertButton: document.getElementById('set-alert'),
                currentRetailer: document.getElementById('current-retailer')
            };

            // Validate all elements exist
            const missingElements = Object.entries(elements)
                .filter(([name, element]) => !element)
                .map(([name]) => name);

            if (missingElements.length > 0) {
                throw new Error(`Missing UI elements: ${missingElements.join(', ')}`);
            }

            return elements;
        }

        async loadProductData() {
            try {
                // Rate limit API calls
                this.rateLimiter.checkLimit('apiCalls', SECURITY_CONFIG.rateLimits.apiCalls);
                
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tabs[0]?.id) {
                    throw new Error('No active tab found');
                }

                const response = await chrome.tabs.sendMessage(tabs[0].id, { 
                    action: "getProductData" 
                });

                if (chrome.runtime.lastError) {
                    throw new Error(`Chrome runtime error: ${chrome.runtime.lastError.message}`);
                }

                if (!response?.title || response.title === "Product not found") {
                    this.showInstructions();
                    return;
                }

                this.currentProductData = response;
                await this.renderProductData();
                
            } catch (error) {
                const message = this.errorBoundary.handleError(error, 'ProductData-Loading');
                this.showError(message);
            }
        }

        bindEvents() {
            if (this.elements.setAlertButton) {
                this.eventManager.addEventListener(
                    this.elements.setAlertButton, 
                    'click', 
                    this.handleSetAlert.bind(this)
                );
            }

            // Keyboard shortcuts
            this.eventManager.addEventListener(
                document,
                'keydown',
                this.handleKeyboardShortcuts.bind(this)
            );
        }

        handleKeyboardShortcuts(event) {
            if (event.key === 'r' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                this.initialize();
            }
        }

        async handleSetAlert() {
            if (!this.currentProductData) return;

            try {
                // Check consent for analytics
                const consent = await this.consentManager.getConsent();
                if (!consent.analytics) {
                    this.showConsentInfo('Price alerts require analytics consent for notifications.');
                    return;
                }

                // Rate limit user actions
                this.rateLimiter.checkLimit('userActions', { max: 10, window: 60000 });

                const button = this.elements.setAlertButton;
                const originalContent = button.innerHTML;
                
                button.innerHTML = `
                    <span class="loading-spinner small"></span>
                    <span class="button-text">Saving Alert...</span>
                `;
                button.disabled = true;

                const alertData = {
                    ...this.currentProductData,
                    alertId: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    createdAt: new Date().toISOString(),
                    alertThreshold: 10,
                    isActive: true
                };

                const response = await chrome.runtime.sendMessage({
                    action: 'saveAlert',
                    data: alertData
                });

                if (response?.success) {
                    button.innerHTML = `
                        <span class="success-icon">✅</span>
                        <span class="button-text">Alert Set!</span>
                    `;
                    
                    setTimeout(() => {
                        button.innerHTML = originalContent;
                        button.disabled = false;
                    }, 3000);
                } else {
                    throw new Error(response?.error || 'Failed to save alert');
                }
                
            } catch (error) {
                const message = this.errorBoundary.handleError(error, 'Alert-Creation');
                this.showError(message);
                
                // Reset button
                setTimeout(() => {
                    if (this.elements.setAlertButton) {
                        this.elements.setAlertButton.innerHTML = `
                            <span class="button-icon">🔔</span>
                            <span class="button-text">Set Price Alert</span>
                        `;
                        this.elements.setAlertButton.disabled = false;
                    }
                }, 2000);
            }
        }

        async renderProductData() {
            if (!this.currentProductData || !this.elements.productTitle || !this.elements.sitePrice) {
                return;
            }

            const { title, price, retailer } = this.currentProductData;
            
            // Safely update elements
            try {
                this.elements.productTitle.textContent = this.truncateText(title, 80);
                this.elements.productTitle.title = title;
                
                this.elements.sitePrice.textContent = price;
                
                if (this.elements.setAlertButton) {
                    this.elements.setAlertButton.disabled = false;
                    this.elements.setAlertButton.innerHTML = `
                        <span class="button-icon">🔔</span>
                        <span class="button-text">Set Price Alert</span>
                    `;
                }
            } catch (error) {
                this.errorBoundary.handleError(error, 'UI-Render');
            }
        }

        showError(message) {
            if (this.elements.comparisonList) {
                this.elements.comparisonList.innerHTML = `
                    <div class="error-container">
                        <span class="error-icon">⚠️</span>
                        <div class="error-content">
                            <p class="error-message">${message}</p>
                            <button class="retry-button" onclick="window.location.reload()">
                                🔄 Try Again
                            </button>
                        </div>
                    </div>
                `;
            }
        }

        showFatalError(message) {
            document.body.innerHTML = `
                <div class="fatal-error">
                    <h2>🚨 ToolScout Error</h2>
                    <p>${message}</p>
                    <button onclick="window.location.reload()">Reload Extension</button>
                </div>
            `;
        }

        showConsentRequired() {
            if (this.elements.comparisonList) {
                this.elements.comparisonList.innerHTML = `
                    <div class="consent-required">
                        <h3>🔒 Privacy Consent Required</h3>
                        <p>ToolScout needs your consent to function properly.</p>
                        <button onclick="window.location.reload()">Review Settings</button>
                    </div>
                `;
            }
        }

        showConsentInfo(message) {
            const notification = document.createElement('div');
            notification.className = 'consent-info';
            notification.innerHTML = `
                <div class="consent-info-content">
                    <span class="info-icon">ℹ️</span>
                    <span>${message}</span>
                    <button onclick="this.parentElement.parentElement.remove()">×</button>
                </div>
            `;
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.parentElement.removeChild(notification);
                }
            }, 5000);
        }

        showInstructions() {
            if (this.elements.comparisonList) {
                this.elements.comparisonList.innerHTML = `
                    <div class="instructions-container">
                        <div class="instructions-header">
                            <span class="logo">🛒</span>
                            <h3>Welcome to ToolScout!</h3>
                        </div>
                        
                        <div class="instructions-content">
                            <h4>How to use:</h4>
                            <ol class="instructions-list">
                                <li>Navigate to a product page</li>
                                <li>Click the ToolScout icon</li>
                                <li>View instant price comparisons</li>
                                <li>Set price alerts & save money</li>
                            </ol>
                            
                            <div class="supported-sites">
                                <h4>Supported retailers:</h4>
                                <div class="site-badges">
                                    <span class="site-badge">Amazon</span>
                                    <span class="site-badge">Home Depot</span>
                                    <span class="site-badge">Leroy Merlin</span>
                                    <span class="site-badge">Lowes</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        truncateText(text, maxLength) {
            if (!text || text.length <= maxLength) return text;
            return text.substring(0, maxLength).trim() + '...';
        }

        cleanup() {
            try {
                // Cleanup all managers
                if (this.eventManager) {
                    this.eventManager.cleanup();
                }
                
                if (this.cacheManager) {
                    this.cacheManager.cleanup();
                }
                
                // Clear references
                this.currentProductData = null;
                this.elements = null;
                this.isInitialized = false;
                
                console.log('ToolScout UI cleaned up successfully');
                
            } catch (error) {
                console.error('Error during cleanup:', error);
            }
        }

        // Debugging interface
        getDebugInfo() {
            return {
                isInitialized: this.isInitialized,
                hasProductData: !!this.currentProductData,
                activeHandlers: this.eventManager?.getActiveHandlers() || [],
                cacheStats: this.cacheManager?.getStats() || {},
                errorStats: this.errorBoundary?.getErrorStats() || {}
            };
        }
    }

    // =================================================================================================
    // INITIALIZATION WITH PROPER ERROR HANDLING
    // =================================================================================================
    
    let uiController = null;

    const initializeExtension = async () => {
        try {
            // Create single instance
            if (uiController) {
                console.warn('Extension already initialized');
                return;
            }
            
            uiController = new UIController();
            await uiController.initialize();
            
            // Performance monitoring
            if (window.performance && window.performance.timing) {
                const loadTime = Date.now() - window.performance.timing.navigationStart;
                console.log(`ToolScout loaded in ${loadTime}ms`);
            }
            
        } catch (error) {
            console.error('Failed to initialize ToolScout:', error);
            
            // Fallback UI
            document.body.innerHTML = `
                <div class="initialization-error">
                    <h2>🚨 ToolScout Failed to Initialize</h2>
                    <p>Please try refreshing the extension.</p>
                    <button onclick="window.location.reload()">Refresh</button>
                </div>
            `;
        }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeExtension);
    } else {
        initializeExtension();
    }

    // Enhanced debugging interface
    window.ToolScoutDebug = {
        version: '2.1.1',
        getController: () => uiController,
        getDebugInfo: () => uiController?.getDebugInfo() || {},
        forceCleanup: () => uiController?.cleanup(),
        async clearAllData() {
            await chrome.storage.local.clear();
            await chrome.storage.sync.clear();
            console.log('All data cleared');
        },
        async getErrorLogs() {
            const result = await chrome.storage.local.get('errorLogs');
            return result.errorLogs || [];
        }
    };

    console.log('🚀 ToolScout Enhanced Extension v2.1.1 (Security Fixed) loaded successfully');

})();