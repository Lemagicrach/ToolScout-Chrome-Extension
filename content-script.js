/**
 * @file content-script.js - SECURITY ENHANCED v2.1.1
 * @description FIXED: Input validation, XSS protection, rate limiting, error boundaries
 */

(() => {
    'use strict';

    // =================================================================================================
    // SECURITY CONFIGURATION
    // =================================================================================================
    
    const SECURITY_CONFIG = {
        MAX_MESSAGE_RATE: 10, // per minute
        MAX_TEXT_LENGTH: 500,
        MAX_PRICE_LENGTH: 50,
        ALLOWED_PROTOCOLS: ['https:', 'http:'],
        RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
        
        // Allowed domains for security validation
        ALLOWED_DOMAINS: [
            'amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.fr',
            'amazon.es', 'amazon.it', 'amazon.ca', 'amazon.com.au',
            'amazon.co.jp', 'amazon.in', 'amazon.ae',
            'homedepot.com', 'leroymerlin.fr', 'lowes.com'
        ]
    };

    // =================================================================================================
    // RATE LIMITER FOR CONTENT SCRIPT
    // =================================================================================================
    
    class ContentScriptRateLimiter {
        constructor() {
            this.requests = [];
        }

        checkLimit(maxRequests = SECURITY_CONFIG.MAX_MESSAGE_RATE) {
            const now = Date.now();
            const windowStart = now - SECURITY_CONFIG.RATE_LIMIT_WINDOW;
            
            // Remove old requests
            this.requests = this.requests.filter(timestamp => timestamp > windowStart);
            
            if (this.requests.length >= maxRequests) {
                throw new Error('Rate limit exceeded. Please wait before trying again.');
            }
            
            this.requests.push(now);
            return true;
        }
    }

    // =================================================================================================
    // SECURE DATA SCRAPER
    // =================================================================================================
    
    class SecureProductScraper {
        constructor() {
            this.rateLimiter = new ContentScriptRateLimiter();
            this.cache = new Map();
            this.cacheTimeout = 30000; // 30 seconds
        }

        scrapeProductData() {
            try {
                // Rate limiting
                this.rateLimiter.checkLimit();
                
                // Check cache first
                const cacheKey = window.location.href;
                const cached = this.cache.get(cacheKey);
                if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                    return cached.data;
                }

                // Validate current domain
                if (!this.isAllowedDomain()) {
                    throw new Error('Domain not supported');
                }

                // Validate URL protocol
                if (!SECURITY_CONFIG.ALLOWED_PROTOCOLS.includes(window.location.protocol)) {
                    throw new Error('Unsupported protocol');
                }

                const productData = this.extractProductData();
                
                // Cache the result
                this.cache.set(cacheKey, {
                    data: productData,
                    timestamp: Date.now()
                });
                
                return productData;
                
            } catch (error) {
                console.error('[ToolScout] Scraping error:', error);
                return this.getErrorResponse(error.message);
            }
        }

        isAllowedDomain() {
            const hostname = window.location.hostname.toLowerCase();
            return SECURITY_CONFIG.ALLOWED_DOMAINS.some(domain => 
                hostname === domain || hostname === `www.${domain}` || hostname.endsWith(`.${domain}`)
            );
        }

        extractProductData() {
            const hostname = window.location.hostname.toLowerCase();
            let title = "Product not found";
            let price = "Price not available";
            
            try {
                if (hostname.includes('amazon.')) {
                    const data = this.scrapeAmazonData();
                    title = data.title;
                    price = data.price;
                } else if (hostname.includes('homedepot.')) {
                    const data = this.scrapeHomeDepotData();
                    title = data.title;
                    price = data.price;
                } else if (hostname.includes('leroymerlin.')) {
                    const data = this.scrapeLeroyMerlinData();
                    title = data.title;
                    price = data.price;
                } else if (hostname.includes('lowes.')) {
                    const data = this.scrapeLowesData();
                    title = data.title;
                    price = data.price;
                } else {
                    const data = this.scrapeGenericData();
                    title = data.title;
                    price = data.price;
                }
                
            } catch (error) {
                console.warn('[ToolScout] Site-specific scraping failed:', error);
                // Fallback to generic scraping
                try {
                    const genericData = this.scrapeGenericData();
                    title = genericData.title;
                    price = genericData.price;
                } catch (genericError) {
                    console.error('[ToolScout] Generic scraping also failed:', genericError);
                }
            }

            return {
                title: this.sanitizeText(title),
                price: this.sanitizePrice(price),
                url: this.sanitizeUrl(window.location.href),
                retailer: hostname,
                timestamp: new Date().toISOString(),
                scrapeMethod: this.getScrapeMethodForDomain(hostname)
            };
        }

        scrapeAmazonData() {
            // Enhanced Amazon selectors with fallbacks
            const titleSelectors = [
                '#productTitle',
                '[data-automation-id="product-title"]',
                'h1.a-size-large',
                'h1[id*="title"]',
                '.product-title',
                'h1.a-size-base-plus'
            ];

            const priceSelectors = [
                '.a-price .a-offscreen',
                '.a-price-whole',
                '[data-automation-id="product-price"]',
                '.a-price-current',
                '#price_inside_buybox',
                '.a-price.a-text-price.a-size-medium.apexPriceToPay .a-offscreen',
                '[data-testid="price"]'
            ];

            const title = this.findTextBySelectors(titleSelectors);
            const price = this.findTextBySelectors(priceSelectors);

            if (!title) {
                throw new Error('Amazon product title not found');
            }

            return { title, price: price || "Price not available" };
        }

        scrapeHomeDepotData() {
            const titleSelectors = [
                '[data-testid="product-header-title"]',
                'h1[data-automation-id="product-title"]',
                '.product-title h1',
                'h1.product-title',
                '.product-details__title'
            ];

            const priceSelectors = [
                '[data-testid="price"]',
                '.price-format__main-price',
                '.price-current',
                '.price--large',
                '[data-automation-id="product-price"]'
            ];

            const title = this.findTextBySelectors(titleSelectors);
            const price = this.findTextBySelectors(priceSelectors);

            if (!title) {
                throw new Error('Home Depot product title not found');
            }

            return { title, price: price || "Price not available" };
        }

        scrapeLeroyMerlinData() {
            const titleSelectors = [
                'h1[data-testid="product-title"]',
                '.product-title h1',
                'h1.product-title',
                '.pdp-product-name h1',
                '[data-qa="product-title"]'
            ];

            const priceSelectors = [
                '[data-testid="product-price"]',
                '.price-current',
                '.price-value',
                '.product-price .price',
                '[data-qa="product-price"]'
            ];

            const title = this.findTextBySelectors(titleSelectors);
            const price = this.findTextBySelectors(priceSelectors);

            if (!title) {
                throw new Error('Leroy Merlin product title not found');
            }

            return { title, price: price || "Price not available" };
        }

        scrapeLowesData() {
            const titleSelectors = [
                'h1[data-testid="product-title"]',
                '.product-title h1',
                'h1.product-title',
                '[data-selector="product-title"]'
            ];

            const priceSelectors = [
                '[data-testid="product-price"]',
                '.price-current',
                '.price-value',
                '[data-selector="product-price"]'
            ];

            const title = this.findTextBySelectors(titleSelectors);
            const price = this.findTextBySelectors(priceSelectors);

            if (!title) {
                throw new Error('Lowes product title not found');
            }

            return { title, price: price || "Price not available" };
        }

        scrapeGenericData() {
            // Generic fallback selectors
            const titleSelectors = [
                'h1',
                '[data-testid*="title"]',
                '.product-title',
                '.product-name',
                'title'
            ];

            const priceSelectors = [
                '[data-testid*="price"]',
                '.price',
                '[class*="price"]',
                '[id*="price"]'
            ];

            const title = this.findTextBySelectors(titleSelectors);
            const price = this.findTextBySelectors(priceSelectors);

            if (!title) {
                throw new Error('Generic product title not found');
            }

            return { title, price: price || "Price not available" };
        }

        findTextBySelectors(selectors) {
            for (const selector of selectors) {
                try {
                    const element = document.querySelector(selector);
                    if (element) {
                        const text = element.innerText || element.textContent || '';
                        if (text.trim()) {
                            return text.trim();
                        }
                    }
                } catch (error) {
                    // Continue to next selector
                    continue;
                }
            }
            return null;
        }

        sanitizeText(text) {
            if (!text || typeof text !== 'string') {
                return "Product not found";
            }
            
            // Remove dangerous characters and limit length
            return text
                .replace(/[<>\"'&]/g, '') // Remove XSS characters
                .replace(/\s+/g, ' ') // Normalize whitespace
                .substring(0, SECURITY_CONFIG.MAX_TEXT_LENGTH)
                .trim();
        }

        sanitizePrice(price) {
            if (!price || typeof price !== 'string') {
                return "Price not available";
            }
            
            // Remove dangerous characters and limit length
            return price
                .replace(/[<>\"'&]/g, '') // Remove XSS characters
                .substring(0, SECURITY_CONFIG.MAX_PRICE_LENGTH)
                .trim();
        }

        sanitizeUrl(url) {
            try {
                const urlObj = new URL(url);
                
                // Validate protocol
                if (!SECURITY_CONFIG.ALLOWED_PROTOCOLS.includes(urlObj.protocol)) {
                    throw new Error('Invalid protocol');
                }
                
                // Return clean URL without sensitive parameters
                return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
                
            } catch (error) {
                console.error('[ToolScout] URL sanitization failed:', error);
                return window.location.origin;
            }
        }

        getScrapeMethodForDomain(hostname) {
            if (hostname.includes('amazon.')) return 'amazon';
            if (hostname.includes('homedepot.')) return 'homedepot';
            if (hostname.includes('leroymerlin.')) return 'leroymerlin';
            if (hostname.includes('lowes.')) return 'lowes';
            return 'generic';
        }

        getErrorResponse(errorMessage) {
            return {
                title: "Product not found",
                price: "Price not available",
                url: this.sanitizeUrl(window.location.href),
                retailer: window.location.hostname,
                error: true,
                errorMessage: this.sanitizeText(errorMessage || 'Unknown error'),
                timestamp: new Date().toISOString()
            };
        }

        // Clear cache periodically
        clearCache() {
            const now = Date.now();
            for (const [key, value] of this.cache.entries()) {
                if (now - value.timestamp > this.cacheTimeout) {
                    this.cache.delete(key);
                }
            }
        }
    }

    // =================================================================================================
    // SECURE MESSAGE HANDLER
    // =================================================================================================
    
    class SecureMessageHandler {
        constructor() {
            this.scraper = new SecureProductScraper();
            this.setupMessageListener();
            this.setupPeriodicCleanup();
        }

        setupMessageListener() {
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                try {
                    // Validate sender
                    if (!this.isValidSender(sender)) {
                        console.warn('[ToolScout] Invalid message sender');
                        sendResponse({ error: true, errorMessage: "Invalid sender" });
                        return false;
                    }

                    // Validate message format
                    if (!request || typeof request.action !== 'string') {
                        console.warn('[ToolScout] Invalid message format');
                        sendResponse({ error: true, errorMessage: "Invalid message format" });
                        return false;
                    }

                    // Handle the request
                    this.handleMessage(request, sendResponse);
                    
                } catch (error) {
                    console.error('[ToolScout] Message handler error:', error);
                    sendResponse({ 
                        error: true, 
                        errorMessage: "Message processing failed",
                        title: "Product not found",
                        price: "Price not available",
                        url: window.location.href,
                        retailer: window.location.hostname
                    });
                }
                
                return true; // Will respond asynchronously
            });
        }

        isValidSender(sender) {
            // Validate that message comes from our extension
            return sender && 
                   sender.id === chrome.runtime.id &&
                   (sender.url?.startsWith('chrome-extension://') || 
                    sender.tab?.url?.startsWith('chrome-extension://'));
        }

        handleMessage(request, sendResponse) {
            switch (request.action) {
                case "getProductData":
                    try {
                        const productData = this.scraper.scrapeProductData();
                        sendResponse(productData);
                    } catch (error) {
                        console.error('[ToolScout] Product data extraction failed:', error);
                        sendResponse(this.scraper.getErrorResponse(error.message));
                    }
                    break;
                    
                case "ping":
                    // Health check
                    sendResponse({ 
                        status: "ok", 
                        timestamp: new Date().toISOString(),
                        domain: window.location.hostname,
                        supported: this.scraper.isAllowedDomain()
                    });
                    break;
                    
                default:
                    console.warn('[ToolScout] Unknown action:', request.action);
                    sendResponse({ 
                        error: true, 
                        errorMessage: `Unknown action: ${request.action}` 
                    });
            }
        }

        setupPeriodicCleanup() {
            // Clear cache every 5 minutes
            setInterval(() => {
                this.scraper.clearCache();
            }, 5 * 60 * 1000);
        }
    }

    // =================================================================================================
    // SECURITY MONITORING
    // =================================================================================================
    
    class SecurityMonitor {
        constructor() {
            this.anomalies = [];
            this.maxAnomalies = 10;
            this.setupCSPViolationHandler();
        }

        setupCSPViolationHandler() {
            document.addEventListener('securitypolicyviolation', (event) => {
                console.warn('[ToolScout] CSP Violation:', {
                    violatedDirective: event.violatedDirective,
                    blockedURI: event.blockedURI,
                    documentURI: event.documentURI,
                    sourceFile: event.sourceFile,
                    lineNumber: event.lineNumber
                });
                
                this.reportAnomaly('csp_violation', {
                    directive: event.violatedDirective,
                    blocked: event.blockedURI
                });
            });
        }

        reportAnomaly(type, details) {
            const anomaly = {
                type: type,
                details: details,
                timestamp: new Date().toISOString(),
                url: window.location.href
            };
            
            this.anomalies.push(anomaly);
            
            // Keep only recent anomalies
            if (this.anomalies.length > this.maxAnomalies) {
                this.anomalies.shift();
            }
            
            // Report to background script if needed
            try {
                chrome.runtime.sendMessage({
                    action: 'reportAnomaly',
                    data: anomaly
                });
            } catch (error) {
                console.warn('[ToolScout] Could not report anomaly:', error);
            }
        }

        getAnomalies() {
            return this.anomalies;
        }
    }

    // =================================================================================================
    // INITIALIZATION WITH ERROR BOUNDARY
    // =================================================================================================
    
    let messageHandler = null;
    let securityMonitor = null;

    function initializeContentScript() {
        try {
            // Only initialize on supported domains
            const hostname = window.location.hostname.toLowerCase();
            const isSupported = SECURITY_CONFIG.ALLOWED_DOMAINS.some(domain => 
                hostname === domain || hostname === `www.${domain}` || hostname.endsWith(`.${domain}`)
            );

            if (!isSupported) {
                console.log('[ToolScout] Domain not supported:', hostname);
                return;
            }

            // Initialize security monitor
            securityMonitor = new SecurityMonitor();
            
            // Initialize message handler
            messageHandler = new SecureMessageHandler();
            
            console.log('[ToolScout] Content script initialized for:', hostname);
            
        } catch (error) {
            console.error('[ToolScout] Content script initialization failed:', error);
            
            // Fallback message handler for basic functionality
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                if (request.action === "getProductData") {
                    sendResponse({
                        title: "Product not found",
                        price: "Price not available",
                        url: window.location.href,
                        retailer: window.location.hostname,
                        error: true,
                        errorMessage: "Content script initialization failed"
                    });
                }
                return true;
            });
        }
    }

    // =================================================================================================
    // DOM READY INITIALIZATION
    // =================================================================================================
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeContentScript);
    } else {
        initializeContentScript();
    }

    // =================================================================================================
    // DEBUGGING INTERFACE (Development Only)
    // =================================================================================================
    
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        window.ToolScoutContentDebug = {
            getMessageHandler: () => messageHandler,
            getSecurityMonitor: () => securityMonitor,
            getScraper: () => messageHandler?.scraper,
            forceRescrape: () => {
                if (messageHandler?.scraper) {
                    messageHandler.scraper.cache.clear();
                    return messageHandler.scraper.scrapeProductData();
                }
                return null;
            },
            getAnomalies: () => securityMonitor?.getAnomalies() || [],
            testSelectors: (selectors) => {
                if (messageHandler?.scraper) {
                    return messageHandler.scraper.findTextBySelectors(selectors);
                }
                return null;
            }
        };
    }

    console.log('[ToolScout] Content Script v2.1.1 (Security Enhanced) loaded');

})();