/**
 * ToolScout Content Script v2.2.0
 * Combines best features from both scripts with proper error handling
 */

(() => {
    'use strict';

    // =================================================================================================
    // CONFIGURATION
    // =================================================================================================
    
    const CONFIG = {
        SUPPORTED_SITES: {
            'amazon': {
                patterns: ['amazon.com', 'amazon.ca', 'amazon.co.uk'],
                productPagePattern: /\/dp\/|\/gp\/product\//
            },
            'homedepot': {
                patterns: ['homedepot.com', 'homedepot.ca'],
                productPagePattern: /\/p\//
            },
            'leroymerlin': {
                patterns: ['leroymerlin.fr'],
                productPagePattern: /\/p\//
            },
            'ebay': {
                patterns: ['ebay.com', 'ebay.ca', 'ebay.co.uk'],
                productPagePattern: /\/itm\//
            }
        },
        MAX_TEXT_LENGTH: 500,
        MAX_PRICE_LENGTH: 50,
        CACHE_TIMEOUT: 30000 // 30 seconds
    };

    // =================================================================================================
    // SITE DETECTOR
    // =================================================================================================
    
    function detectSite() {
        const hostname = window.location.hostname.toLowerCase();
        
        for (const [site, config] of Object.entries(CONFIG.SUPPORTED_SITES)) {
            if (config.patterns.some(pattern => hostname.includes(pattern))) {
                return site;
            }
        }
        return null;
    }

    // =================================================================================================
    // PRODUCT EXTRACTORS
    // =================================================================================================
    
    const extractors = {
        amazon: () => {
            const selectors = {
                title: [
                    '#productTitle',
                    'h1.a-size-large',
                    '[data-automation-id="product-title"]',
                    '.product-title'
                ],
                price: [
                    '.a-price .a-offscreen',
                    '.a-price-whole',
                    '.a-price.a-text-price.a-size-medium.apexPriceToPay .a-offscreen',
                    '#price_inside_buybox',
                    '.a-price-current'
                ],
                image: [
                    '#landingImage',
                    '#imgBlkFront',
                    '.a-dynamic-image'
                ]
            };

            const title = findBySelectors(selectors.title);
            const priceText = findBySelectors(selectors.price);
            const price = parsePrice(priceText);
            const image = findImageBySelectors(selectors.image);
            
            return { 
                title: title || 'Product title not found',
                price: price,
                image: image,
                currency: getCurrency(priceText)
            };
        },

        homedepot: () => {
            const selectors = {
                title: [
                    'h1.product-details__title',
                    '.product-header__title',
                    '[data-testid="product-header-title"]'
                ],
                price: [
                    '.price-format__main-price',
                    '.price-detailed__full-price',
                    '[data-testid="price"]'
                ],
                image: [
                    '.mediagallery__mainimage img',
                    '.media-gallery__main-image img'
                ]
            };

            const title = findBySelectors(selectors.title);
            const priceText = findBySelectors(selectors.price);
            const price = parsePrice(priceText);
            const image = findImageBySelectors(selectors.image);
            
            return { 
                title: title || 'Product title not found',
                price: price,
                image: image,
                currency: getCurrency(priceText)
            };
        },

        leroymerlin: () => {
            const selectors = {
                title: [
                    'h1.xlarge',
                    'h1.product-title',
                    '.product-name h1'
                ],
                price: [
                    '.xlarge',
                    '.price',
                    '.product-price'
                ],
                image: [
                    '.mc-product-media-container img',
                    '.product-image img'
                ]
            };

            const title = findBySelectors(selectors.title);
            const priceText = findBySelectors(selectors.price);
            const price = parsePrice(priceText, true); // true for European format
            const image = findImageBySelectors(selectors.image);
            
            return { 
                title: title || 'Product title not found',
                price: price,
                image: image,
                currency: getCurrency(priceText)
            };
        },

        ebay: () => {
            const selectors = {
                title: [
                    '.x-item-title__mainTitle',
                    '.it-ttl',
                    'h1.it-ttl',
                    '[data-testid="x-item-title"]'
                ],
                price: [
                    '.x-price-primary span.ux-textspans--BOLD',
                    '.x-bin-price__content span.ux-textspans--BOLD',
                    '.prc-now',
                    'span.notranslate[itemprop="price"]'
                ],
                image: [
                    '.ux-image-carousel-item.active img',
                    '#icImg',
                    '[data-testid="x-picture-primary"] img'
                ],
                condition: [
                    '.u-flL.condText',
                    '[data-testid="x-item-condition"]'
                ]
            };

            const title = findBySelectors(selectors.title);
            const priceText = findBySelectors(selectors.price);
            const price = parsePrice(priceText);
            const image = findImageBySelectors(selectors.image);
            const condition = findBySelectors(selectors.condition);
            
            return { 
                title: title || 'Product title not found',
                price: price,
                image: image,
                condition: condition || 'Unknown',
                currency: getCurrency(priceText)
            };
        }
    };

    // =================================================================================================
    // HELPER FUNCTIONS
    // =================================================================================================
    
    function findBySelectors(selectors) {
        for (const selector of selectors) {
            try {
                const element = document.querySelector(selector);
                if (element) {
                    const text = (element.innerText || element.textContent || '').trim();
                    if (text) return sanitizeText(text);
                }
            } catch (e) {
                continue;
            }
        }
        return null;
    }

    function findImageBySelectors(selectors) {
        for (const selector of selectors) {
            try {
                const element = document.querySelector(selector);
                if (element && element.src) {
                    return element.src;
                }
            } catch (e) {
                continue;
            }
        }
        return null;
    }

    function parsePrice(priceText, european = false) {
        if (!priceText) return null;
        
        try {
            // Remove currency symbols and spaces
            let cleanPrice = priceText.replace(/[^0-9.,]/g, '');
            
            if (european) {
                // European format: 1.234,56
                cleanPrice = cleanPrice.replace(/\./g, '').replace(',', '.');
            } else {
                // US format: 1,234.56
                cleanPrice = cleanPrice.replace(/,/g, '');
            }
            
            const price = parseFloat(cleanPrice);
            return isNaN(price) ? null : price;
        } catch (e) {
            return null;
        }
    }

    function getCurrency(priceText) {
        if (!priceText) return 'USD';
        
        if (priceText.includes('€')) return 'EUR';
        if (priceText.includes('£')) return 'GBP';
        if (priceText.includes('$')) return 'USD';
        if (priceText.includes('CAD')) return 'CAD';
        
        // Default based on domain
        const hostname = window.location.hostname;
        if (hostname.includes('.fr')) return 'EUR';
        if (hostname.includes('.co.uk')) return 'GBP';
        if (hostname.includes('.ca')) return 'CAD';
        
        return 'USD';
    }

    function sanitizeText(text) {
        if (!text || typeof text !== 'string') return '';
        
        return text
            .replace(/[<>\"'&]/g, '') // Remove XSS characters
            .replace(/\s+/g, ' ') // Normalize whitespace
            .substring(0, CONFIG.MAX_TEXT_LENGTH)
            .trim();
    }

    // =================================================================================================
    // PRODUCT DATA EXTRACTION
    // =================================================================================================
    
    function extractProductData() {
        const site = detectSite();
        if (!site || !extractors[site]) {
            return {
                success: false,
                error: 'Site not supported',
                site: window.location.hostname
            };
        }

        try {
            const productData = extractors[site]();
            
            return {
                success: true,
                title: productData.title,
                price: productData.price,
                image: productData.image,
                currency: productData.currency || 'USD',
                condition: productData.condition,
                retailer: site,
                url: window.location.href,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('[ToolScout] Extraction error:', error);
            return {
                success: false,
                error: error.message,
                site: site
            };
        }
    }

    // =================================================================================================
    // VISUAL INDICATOR
    // =================================================================================================
    
    function addToolScoutIndicator(productInfo) {
        // Remove existing indicator if present
        const existing = document.getElementById('toolscout-indicator');
        if (existing) existing.remove();
        
        const indicator = document.createElement('div');
        indicator.id = 'toolscout-indicator';
        indicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 99999;
            cursor: pointer;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 14px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.3s ease;
            opacity: 0.9;
        `;
        
        const priceDisplay = productInfo.price ? 
            ` | ${productInfo.currency || '$'}${productInfo.price.toFixed(2)}` : '';
        
        indicator.innerHTML = `
            <span style="font-size: 18px;">🔧</span>
            <span>ToolScout Active${priceDisplay}</span>
        `;
        
        indicator.addEventListener('mouseenter', () => {
            indicator.style.transform = 'scale(1.05)';
            indicator.style.opacity = '1';
        });
        
        indicator.addEventListener('mouseleave', () => {
            indicator.style.transform = 'scale(1)';
            indicator.style.opacity = '0.9';
        });
        
        indicator.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'openPopup' });
        });
        
        document.body.appendChild(indicator);
        
        // Auto-fade after 5 seconds
        setTimeout(() => {
            indicator.style.opacity = '0.3';
        }, 5000);
    }

    // =================================================================================================
    // MESSAGE HANDLERS
    // =================================================================================================
    
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        // Validate sender
        if (!sender || sender.id !== chrome.runtime.id) {
            sendResponse({ success: false, error: 'Invalid sender' });
            return true;
        }

        switch (request.action) {
            case 'extractProduct':
            case 'getProductData':
                const productData = extractProductData();
                sendResponse(productData);
                break;
                
            case 'ping':
                sendResponse({ 
                    status: 'ok',
                    site: detectSite(),
                    url: window.location.href
                });
                break;
                
            default:
                sendResponse({ 
                    success: false, 
                    error: `Unknown action: ${request.action}`
                });
        }
        
        return true; // Keep channel open for async response
    });

    // =================================================================================================
    // AUTO-EXTRACTION ON PRODUCT PAGES
    // =================================================================================================
    
    function checkAndExtractOnPageLoad() {
        const site = detectSite();
        if (!site) return;
        
        const config = CONFIG.SUPPORTED_SITES[site];
        const isProductPage = config.productPagePattern.test(window.location.pathname);
        
        if (isProductPage) {
            setTimeout(() => {
                const productData = extractProductData();
                
                if (productData.success && productData.price) {
                    // Send to background script
                    chrome.runtime.sendMessage({
                        action: 'productDetected',
                        data: productData
                    }).catch(() => {
                        // Ignore errors if background isn't ready
                    });
                    
                    // Add visual indicator
                    addToolScoutIndicator(productData);
                }
            }, 1500); // Wait for page to fully load
        }
    }

    // =================================================================================================
    // INITIALIZATION
    // =================================================================================================
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAndExtractOnPageLoad);
    } else {
        checkAndExtractOnPageLoad();
    }

    // Also check on page navigation (for SPAs)
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            setTimeout(checkAndExtractOnPageLoad, 1000);
        }
    }).observe(document, { subtree: true, childList: true });

    console.log('[ToolScout] Content script v2.2.0 loaded on:', window.location.hostname);
})();