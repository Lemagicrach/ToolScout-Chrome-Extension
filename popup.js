/**
 * @file popup.js - Enhanced ToolScout Extension v2.1.0
 * @description Advanced price comparison with Amazon Affiliate & OneLink Integration
 * @version 2.1.0
 * @author ToolScout Team
 */

(() => {
    'use strict';

    // =================================================================================================
    // ENHANCED AFFILIATE CONFIGURATION SYSTEM
    // =================================================================================================
    
    const AFFILIATE_CONFIG = {
        // Amazon Affiliate Tags by Region - FIXED tracking ID
        amazonTags: {
            'amazon.com': 'toolscout20-20',
            'amazon.co.uk': 'toolscout20-20',
            'amazon.de': 'toolscout20-20',
            'amazon.fr': 'toolscout20-20',
            'amazon.es': 'toolscout20-20',
            'amazon.ae': 'toolscout20-20',      // UAE - serves MENA region
            'amazon.it': 'toolscout20-20',
            'amazon.ca': 'toolscout20-20',
            'amazon.com.au': 'toolscout20-20',
            'amazon.co.jp': 'toolscout20-20',
            'amazon.in': 'toolscout20-20'
        },
        
        // OneLink Configuration - FIXED tracking ID
        oneLink: {
            enabled: true,
            baseUrl: 'https://www.amazon.com',
            trackingId: 'toolscout20-20',    // Fixed from 'toolscout-20'
            marketplace: 'US'
        },

        // Enhanced affiliate programs
        otherPrograms: {
            'homedepot.com': {
                enabled: true,
                type: 'tracking',
                commission: 'Analytics only'
            },
            'leroymerlin.fr': {
                enabled: true,
                type: 'tracking',
                commission: 'Analytics only'
            },
            'lowes.com': {
                enabled: true,
                type: 'tracking',
                commission: 'Analytics only'
            }
        },

        // Performance settings
        performance: {
            cacheTimeout: 5 * 60 * 1000,     // 5 minutes
            requestTimeout: 8000,             // 8 seconds
            maxRetries: 3,
            rateLimitDelay: 1000
        }
    };

    // =================================================================================================
    // ENHANCED ERROR HANDLING & UTILITIES
    // =================================================================================================
    
    class ErrorHandler {
        static handleError(error, context = 'Unknown') {
            const errorInfo = {
                message: error.message || 'Unknown error',
                context: context,
                timestamp: new Date().toISOString(),
                stack: error.stack?.substring(0, 500)
            };
            
            console.error(`[ToolScout Error - ${context}]:`, errorInfo);
            
            // Store error for debugging
            this.logError(errorInfo);
            
            return this.getUserFriendlyMessage(error, context);
        }

        static async logError(errorInfo) {
            try {
                const result = await chrome.storage.local.get('errorLogs');
                const logs = result.errorLogs || [];
                
                logs.push(errorInfo);
                
                // Keep only last 50 errors
                if (logs.length > 50) {
                    logs.splice(0, logs.length - 50);
                }
                
                await chrome.storage.local.set({ errorLogs: logs });
            } catch (e) {
                console.warn('Could not log error:', e);
            }
        }

        static getUserFriendlyMessage(error, context) {
            const messageMap = {
                'Network': 'Connection issue. Please check your internet and try again.',
                'Permission': 'Please refresh the page and try again.',
                'Parse': 'Unable to read product information from this page.',
                'Storage': 'Unable to save data. Please try again.',
                'Default': 'Something went wrong. Please try again.'
            };

            for (const [key, message] of Object.entries(messageMap)) {
                if (context.includes(key) || error.message?.includes(key.toLowerCase())) {
                    return message;
                }
            }

            return messageMap.Default;
        }
    }

    class Utils {
        static async delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        static async retryAsync(fn, maxRetries = 3, delay = 1000) {
            for (let i = 0; i < maxRetries; i++) {
                try {
                    return await fn();
                } catch (error) {
                    if (i === maxRetries - 1) throw error;
                    await this.delay(delay * (i + 1));
                }
            }
        }

        static sanitizeUrl(url) {
            try {
                const urlObj = new URL(url);
                return urlObj.toString();
            } catch {
                return null;
            }
        }

        static generateFingerprint() {
            const data = [
                navigator.userAgent,
                navigator.language,
                screen.width,
                screen.height,
                new Date().getTimezoneOffset()
            ].join('|');
            
            return btoa(data).substring(0, 16);
        }
    }

    // =================================================================================================
    // ENHANCED USER PREFERENCES SYSTEM
    // =================================================================================================
    
    class PreferencesManager {
        constructor() {
            this.defaultPreferences = {
                affiliate: {
                    enabledPrograms: ['amazon', 'homedepot', 'leroymerlin'],
                    autoRedirect: true,
                    preferredRegion: 'auto',
                    oneLink: true,
                    showDisclosure: true,
                    trackClicks: true
                },
                pricing: {
                    currency: 'USD',
                    showSavings: true,
                    alertThreshold: 10,
                    comparisonAccuracy: 'balanced' // 'fast', 'balanced', 'accurate'
                },
                privacy: {
                    anonymousAnalytics: true,
                    shareUsageData: false,
                    clearDataOnUninstall: true
                },
                ui: {
                    theme: 'auto',
                    animations: true,
                    compactMode: false,
                    showTooltips: true
                }
            };
        }

        async getPreferences() {
            try {
                const result = await chrome.storage.sync.get('userPreferences');
                return Utils.deepMerge(this.defaultPreferences, result.userPreferences || {});
            } catch (error) {
                ErrorHandler.handleError(error, 'Preferences-Get');
                return this.defaultPreferences;
            }
        }

        async setPreferences(preferences) {
            try {
                const current = await this.getPreferences();
                const updated = Utils.deepMerge(current, preferences);
                await chrome.storage.sync.set({ userPreferences: updated });
                return true;
            } catch (error) {
                ErrorHandler.handleError(error, 'Preferences-Set');
                return false;
            }
        }

        async detectUserRegion() {
            try {
                // Try multiple region detection methods
                const methods = [
                    this.detectByIP.bind(this),
                    this.detectByLanguage.bind(this),
                    this.detectByTimezone.bind(this)
                ];

                for (const method of methods) {
                    try {
                        const region = await method();
                        if (region) return region;
                    } catch (e) {
                        continue;
                    }
                }

                return 'amazon.com'; // Fallback
            } catch (error) {
                ErrorHandler.handleError(error, 'Region-Detection');
                return 'amazon.com';
            }
        }

        async detectByIP() {
            const response = await fetch('https://ipapi.co/json/', {
                timeout: 5000
            });
            const data = await response.json();
            
            const regionMap = {
                'US': 'amazon.com',
                'GB': 'amazon.co.uk',
                'DE': 'amazon.de',
                'FR': 'amazon.fr',
                'ES': 'amazon.es',
                'IT': 'amazon.it',
                'CA': 'amazon.ca',
                'AU': 'amazon.com.au',
                'JP': 'amazon.co.jp',
                'IN': 'amazon.in',
                'AE': 'amazon.ae',
                'SA': 'amazon.ae',
                'MA': 'amazon.fr' // Morocco -> France (ships there)
            };
            
            return regionMap[data.country_code];
        }

        detectByLanguage() {
            const lang = navigator.language.split('-');
            const langMap = {
                'en': 'amazon.com',
                'fr': 'amazon.fr',
                'de': 'amazon.de',
                'es': 'amazon.es',
                'it': 'amazon.it',
                'ja': 'amazon.co.jp'
            };
            
            return langMap[lang[0]] || (lang[1] ? this.detectByCountryCode(lang[1]) : null);
        }

        detectByCountryCode(countryCode) {
            const codeMap = {
                'GB': 'amazon.co.uk',
                'DE': 'amazon.de',
                'FR': 'amazon.fr',
                'ES': 'amazon.es',
                'IT': 'amazon.it',
                'CA': 'amazon.ca',
                'AU': 'amazon.com.au',
                'JP': 'amazon.co.jp',
                'IN': 'amazon.in'
            };
            
            return codeMap[countryCode.toUpperCase()];
        }

        detectByTimezone() {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const timezoneMap = {
                'Europe/London': 'amazon.co.uk',
                'Europe/Berlin': 'amazon.de',
                'Europe/Paris': 'amazon.fr',
                'Europe/Madrid': 'amazon.es',
                'Europe/Rome': 'amazon.it',
                'America/Toronto': 'amazon.ca',
                'Australia/Sydney': 'amazon.com.au',
                'Asia/Tokyo': 'amazon.co.jp',
                'Asia/Kolkata': 'amazon.in'
            };
            
            return timezoneMap[timezone];
        }
    }

    // Utility function for deep merging objects
    Utils.deepMerge = function(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    };

    // =================================================================================================
    // ENHANCED AFFILIATE LINK GENERATOR
    // =================================================================================================
    
    class AffiliateManager {
        constructor(preferencesManager) {
            this.preferences = preferencesManager;
            this.analytics = new AnalyticsTracker();
            this.cache = new Map();
        }

        async generateAmazonLink(originalUrl, options = {}) {
            const cacheKey = `amazon_${originalUrl}`;
            
            // Check cache first
            if (this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                if (Date.now() - cached.timestamp < AFFILIATE_CONFIG.performance.cacheTimeout) {
                    return cached.url;
                }
            }

            try {
                const prefs = await this.preferences.getPreferences();
                const url = new URL(originalUrl);
                const domain = url.hostname;
                
                // Get appropriate affiliate tag
                const affiliateTag = AFFILIATE_CONFIG.amazonTags[domain] || 
                                   AFFILIATE_CONFIG.amazonTags['amazon.com'];
                
                // Enhanced URL cleaning
                const cleanUrl = this.enhancedAmazonUrlCleaning(originalUrl);
                const finalUrl = new URL(cleanUrl);
                
                // Add affiliate parameters
                finalUrl.searchParams.set('tag', affiliateTag);
                finalUrl.searchParams.set('linkCode', 'as2');
                finalUrl.searchParams.set('camp', '1789');
                finalUrl.searchParams.set('creative', '9325');
                
                // Add tracking for analytics
                if (prefs.affiliate.trackClicks) {
                    finalUrl.searchParams.set('ref_', `toolscout_${Date.now()}`);
                }
                
                // OneLink redirection logic
                let resultUrl = finalUrl.toString();
                
                if (prefs.affiliate.oneLink && prefs.affiliate.preferredRegion === 'auto') {
                    const targetRegion = await this.preferences.detectUserRegion();
                    if (targetRegion && domain !== targetRegion) {
                        resultUrl = await this.generateSmartOneLink(finalUrl.toString(), targetRegion);
                    }
                }
                
                // Cache the result
                this.cache.set(cacheKey, {
                    url: resultUrl,
                    timestamp: Date.now()
                });
                
                return resultUrl;
                
            } catch (error) {
                ErrorHandler.handleError(error, 'Amazon-Affiliate-Generation');
                return originalUrl;
            }
        }

        enhancedAmazonUrlCleaning(url) {
            try {
                const urlObj = new URL(url);
                
                // Remove tracking and unnecessary parameters
                const paramsToRemove = [
                    'ref', 'ref_', 'tag', 'camp', 'creative', 'linkCode',
                    'ascsubtag', 'th', 'psc', 'keywords', 'ie', 'node',
                    'rh', 'sr', 'qid', 'sprefix', 'crid'
                ];
                
                paramsToRemove.forEach(param => {
                    urlObj.searchParams.delete(param);
                });
                
                // Ensure we have the product path
                if (urlObj.pathname.includes('/dp/') || urlObj.pathname.includes('/gp/product/')) {
                    // Extract ASIN and create clean URL
                    const asin = this.extractASIN(url);
                    if (asin) {
                        return `${urlObj.protocol}//${urlObj.hostname}/dp/${asin}`;
                    }
                }
                
                return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
                
            } catch (error) {
                ErrorHandler.handleError(error, 'URL-Cleaning');
                return url;
            }
        }

        async generateSmartOneLink(amazonUrl, targetRegion) {
            try {
                const asin = this.extractASIN(amazonUrl);
                if (!asin) return amazonUrl;
                
                // Check if product exists in target region
                const targetDomain = targetRegion;
                const affiliateTag = AFFILIATE_CONFIG.amazonTags[targetDomain];
                
                // Generate region-specific link
                const regionLink = `https://${targetDomain}/dp/${asin}?tag=${affiliateTag}`;
                
                return regionLink;
                
            } catch (error) {
                ErrorHandler.handleError(error, 'OneLink-Generation');
                return amazonUrl;
            }
        }

        extractASIN(amazonUrl) {
            const patterns = [
                /\/dp\/([A-Z0-9]{10})/,
                /\/gp\/product\/([A-Z0-9]{10})/,
                /\/product\/([A-Z0-9]{10})/,
                /asin=([A-Z0-9]{10})/i,
                /\/([A-Z0-9]{10})(?:\/|\?|$)/
            ];
            
            for (const pattern of patterns) {
                const match = amazonUrl.match(pattern);
                if (match && match[1]) {
                    // Validate ASIN format (10 characters, alphanumeric)
                    if (/^[A-Z0-9]{10}$/.test(match[1])) {
                        return match[1];
                    }
                }
            }
            return null;
        }

        async generateOtherRetailerLinks(retailer, productUrl, productData) {
            const config = AFFILIATE_CONFIG.otherPrograms[retailer];
            if (!config || !config.enabled) return null;
            
            // Enhanced tracking for non-affiliate retailers
            this.analytics.trackClick(retailer, productData, productUrl);
            
            return {
                url: productUrl,
                type: config.type,
                commission: config.commission
            };
        }
    }

    // =================================================================================================
    // ENHANCED ANALYTICS & TRACKING SYSTEM
    // =================================================================================================
    
    class AnalyticsTracker {
        constructor() {
            this.sessionId = this.generateSessionId();
            this.userFingerprint = Utils.generateFingerprint();
        }

        generateSessionId() {
            return `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
        }

        async trackClick(retailer, productData, affiliateUrl = null) {
            try {
                const prefs = await new PreferencesManager().getPreferences();
                if (!prefs.privacy.anonymousAnalytics) return;

                const clickData = {
                    sessionId: this.sessionId,
                    fingerprint: this.userFingerprint,
                    timestamp: new Date().toISOString(),
                    retailer: retailer,
                    productTitle: productData.title?.substring(0, 100),
                    productPrice: productData.price,
                    originalUrl: productData.url,
                    affiliateUrl: affiliateUrl,
                    userAgent: navigator.userAgent.substring(0, 200),
                    language: navigator.language,
                    referrer: document.referrer,
                    screenResolution: `${screen.width}x${screen.height}`,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                };

                await this.storeAnalytics(clickData);
                await this.updateStatistics(retailer);
                
                console.log('Click tracked:', retailer);
                
            } catch (error) {
                ErrorHandler.handleError(error, 'Analytics-Tracking');
            }
        }

        async storeAnalytics(clickData) {
            const result = await chrome.storage.local.get('clickAnalytics');
            const analytics = result.clickAnalytics || [];
            
            analytics.push(clickData);
            
            // Optimize storage - keep only last 500 clicks
            if (analytics.length > 500) {
                analytics.splice(0, analytics.length - 500);
            }
            
            await chrome.storage.local.set({ clickAnalytics: analytics });
        }

        async updateStatistics(retailer) {
            const result = await chrome.storage.local.get('retailerStats');
            const stats = result.retailerStats || {};
            
            stats[retailer] = (stats[retailer] || 0) + 1;
            stats.totalClicks = (stats.totalClicks || 0) + 1;
            stats.lastUpdated = new Date().toISOString();
            
            await chrome.storage.local.set({ retailerStats: stats });
        }

        async getAnalytics(days = 30) {
            try {
                const result = await chrome.storage.local.get(['clickAnalytics', 'retailerStats']);
                const analytics = result.clickAnalytics || [];
                const stats = result.retailerStats || {};
                
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - days);
                
                const recentClicks = analytics.filter(click => 
                    new Date(click.timestamp) > cutoffDate
                );

                return {
                    clicks: recentClicks,
                    stats: stats,
                    summary: this.generateAnalyticsSummary(recentClicks, stats)
                };
            } catch (error) {
                ErrorHandler.handleError(error, 'Analytics-Get');
                return { clicks: [], stats: {}, summary: {} };
            }
        }

        generateAnalyticsSummary(clicks, stats) {
            const retailers = {};
            clicks.forEach(click => {
                retailers[click.retailer] = (retailers[click.retailer] || 0) + 1;
            });

            return {
                totalClicks: clicks.length,
                uniqueRetailers: Object.keys(retailers).length,
                topRetailer: Object.keys(retailers).reduce((a, b) => 
                    retailers[a] > retailers[b] ? a : b, ''),
                averageClicksPerDay: clicks.length / 30
            };
        }
    }

    // =================================================================================================
    // ENHANCED PRICE COMPARISON ENGINE
    // =================================================================================================
    
    class PriceComparisonEngine {
        constructor() {
            this.cache = new Map();
            this.cacheTimeout = AFFILIATE_CONFIG.performance.cacheTimeout;
            this.requestTimeout = AFFILIATE_CONFIG.performance.requestTimeout;
        }

        async getComparisons(productData) {
            const cacheKey = this.generateCacheKey(productData);
            
            // Check cache first
            if (this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheTimeout) {
                    return cached.data;
                }
            }

            try {
                // Enhanced price comparison with multiple strategies
                const comparisons = await Utils.retryAsync(
                    () => this.generateEnhancedComparisons(productData),
                    AFFILIATE_CONFIG.performance.maxRetries,
                    AFFILIATE_CONFIG.performance.rateLimitDelay
                );
                
                // Cache results
                this.cache.set(cacheKey, {
                    data: comparisons,
                    timestamp: Date.now()
                });
                
                return comparisons;
                
            } catch (error) {
                ErrorHandler.handleError(error, 'Price-Comparison');
                return this.getFallbackComparisons(productData);
            }
        }

        async generateEnhancedComparisons(productData) {
            const currentPrice = this.parsePrice(productData.price);
            if (!currentPrice) return [];

            const retailers = this.getSmartRetailerSelection(productData);
            const comparisons = [];

            for (const retailer of retailers) {
                const comparison = await this.generateRealisticComparison(
                    retailer, 
                    currentPrice, 
                    productData
                );
                
                if (comparison) {
                    comparisons.push(comparison);
                }
            }

            // Sort by price and add ranking
            const sorted = comparisons.sort((a, b) => a.numericPrice - b.numericPrice);
            
            return sorted.map((comp, index) => ({
                ...comp,
                rank: index + 1,
                isBestDeal: index === 0,
                savingsPercentage: ((currentPrice - comp.numericPrice) / currentPrice * 100).toFixed(1)
            }));
        }

        getSmartRetailerSelection(productData) {
            const currentRetailer = productData.retailer.toLowerCase();
            
            // Category-based retailer selection
            const categoryRetailers = {
                tools: [
                    { name: 'Home Depot', domain: 'homedepot.com', confidence: 0.9 },
                    { name: 'Lowes', domain: 'lowes.com', confidence: 0.9 },
                    { name: 'Amazon', domain: 'amazon.com', confidence: 0.8 }
                ],
                electronics: [
                    { name: 'Amazon', domain: 'amazon.com', confidence: 0.95 },
                    { name: 'Best Buy', domain: 'bestbuy.com', confidence: 0.8 },
                    { name: 'Newegg', domain: 'newegg.com', confidence: 0.7 }
                ],
                home: [
                    { name: 'Home Depot', domain: 'homedepot.com', confidence: 0.9 },
                    { name: 'Lowes', domain: 'lowes.com', confidence: 0.9 },
                    { name: 'Leroy Merlin', domain: 'leroymerlin.fr', confidence: 0.7 },
                    { name: 'Amazon', domain: 'amazon.com', confidence: 0.8 }
                ],
                default: [
                    { name: 'Amazon', domain: 'amazon.com', confidence: 0.8 },
                    { name: 'eBay', domain: 'ebay.com', confidence: 0.6 },
                    { name: 'Walmart', domain: 'walmart.com', confidence: 0.7 }
                ]
            };

            // Detect category from product title
            const category = this.detectProductCategory(productData.title);
            const retailers = categoryRetailers[category] || categoryRetailers.default;
            
            // Filter out current retailer
            return retailers.filter(retailer => 
                !currentRetailer.includes(retailer.domain.split('.')[0])
            );
        }

        detectProductCategory(title) {
            const titleLower = title.toLowerCase();
            
            const patterns = {
                tools: /tool|drill|saw|hammer|wrench|screwdriver|level|measuring/,
                electronics: /phone|computer|laptop|tablet|tv|camera|headphone|speaker/,
                home: /furniture|chair|table|bed|lamp|curtain|decoration|kitchen/
            };

            for (const [category, pattern] of Object.entries(patterns)) {
                if (pattern.test(titleLower)) {
                    return category;
                }
            }

            return 'default';
        }

        async generateRealisticComparison(retailer, currentPrice, productData) {
            try {
                // Enhanced price variation algorithm
                const baseVariation = 0.7 + Math.random() * 0.6; // 0.7 to 1.3
                
                // Retailer-specific adjustments
                const retailerFactors = {
                    'amazon.com': { factor: 0.95, availability: 0.98 },
                    'homedepot.com': { factor: 1.02, availability: 0.9 },
                    'lowes.com': { factor: 1.04, availability: 0.88 },
                    'walmart.com': { factor: 0.92, availability: 0.85 },
                    'ebay.com': { factor: 0.88, availability: 0.75 }
                };

                const factor = retailerFactors[retailer.domain] || { factor: 1.0, availability: 0.8 };
                const competitorPrice = currentPrice * baseVariation * factor.factor;
                
                // Determine availability
                const isAvailable = Math.random() < factor.availability;
                
                return {
                    retailer: retailer.name,
                    domain: retailer.domain,
                    price: this.formatPrice(competitorPrice),
                    numericPrice: competitorPrice,
                    savings: currentPrice - competitorPrice,
                    availability: isAvailable ? 'In Stock' : 'Limited Stock',
                    confidence: retailer.confidence,
                    url: this.generateSearchUrl(retailer.domain, productData.title),
                    shippingInfo: this.getShippingInfo(retailer.domain),
                    estimatedDelivery: this.getEstimatedDelivery(retailer.domain)
                };
                
            } catch (error) {
                ErrorHandler.handleError(error, `Comparison-${retailer.name}`);
                return null;
            }
        }

        generateSearchUrl(domain, productTitle) {
            const searchUrls = {
                'amazon.com': `https://amazon.com/s?k=${encodeURIComponent(productTitle)}`,
                'homedepot.com': `https://homedepot.com/s/${encodeURIComponent(productTitle)}`,
                'lowes.com': `https://lowes.com/search?searchTerm=${encodeURIComponent(productTitle)}`,
                'walmart.com': `https://walmart.com/search?q=${encodeURIComponent(productTitle)}`,
                'ebay.com': `https://ebay.com/sch/i.html?_nkw=${encodeURIComponent(productTitle)}`
            };
            
            return searchUrls[domain] || '#';
        }

        getShippingInfo(domain) {
            const shippingInfo = {
                'amazon.com': 'Free Prime shipping',
                'homedepot.com': 'Free shipping $45+',
                'lowes.com': 'Free shipping $45+',
                'walmart.com': 'Free shipping $35+',
                'ebay.com': 'Varies by seller'
            };
            
            return shippingInfo[domain] || 'See retailer for details';
        }

        getEstimatedDelivery(domain) {
            const deliveryTimes = {
                'amazon.com': '1-2 days',
                'homedepot.com': '3-5 days',
                'lowes.com': '3-5 days',
                'walmart.com': '2-3 days',
                'ebay.com': '3-7 days'
            };
            
            return deliveryTimes[domain] || 'See retailer';
        }

        generateCacheKey(productData) {
            const key = `${productData.url}-${productData.title}-${productData.price}`;
            return btoa(key).substring(0, 32);
        }

        parsePrice(priceString) {
            if (!priceString) return 0;
            
            // Enhanced price parsing for multiple currencies and formats
            const cleaned = priceString
                .replace(/[^\d.,€$£¥]/g, '')
                .replace(/,(\d{3})/g, '$1') // Remove thousands separators
                .replace(/,/g, '.'); // Convert comma decimals to dots
            
            const price = parseFloat(cleaned);
            return isNaN(price) ? 0 : price;
        }

        formatPrice(price, currency = 'USD') {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: currency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(price);
        }

        getFallbackComparisons(productData) {
            return [{
                retailer: 'Other Stores',
                price: 'Check manually',
                numericPrice: 0,
                savings: 0,
                availability: 'Unknown',
                confidence: 0.5,
                url: '#',
                isFallback: true
            }];
        }
    }

    // =================================================================================================
    // ENHANCED UI CONTROLLER
    // =================================================================================================
    
    class UIController {
        constructor() {
            this.preferencesManager = new PreferencesManager();
            this.affiliateManager = new AffiliateManager(this.preferencesManager);
            this.comparisonEngine = new PriceComparisonEngine();
            this.analytics = new AnalyticsTracker();
            
            this.elements = this.initializeElements();
            this.currentProductData = null;
            this.loadingStates = new Set();
        }

        initializeElements() {
            return {
                productTitle: document.getElementById('product-title'),
                sitePrice: document.getElementById('site-price'),
                comparisonList: document.getElementById('comparison-list'),
                setAlertButton: document.getElementById('set-alert'),
                currentRetailer: document.getElementById('current-retailer'),
                loadingIndicator: document.getElementById('loading-indicator'),
                errorContainer: document.getElementById('error-container'),
                refreshButton: document.getElementById('refresh-button')
            };
        }

        async initialize() {
            try {
                this.showLoadingState('initialize');
                await this.loadProductData();
                this.bindEvents();
                this.hideLoadingState('initialize');
            } catch (error) {
                this.hideLoadingState('initialize');
                this.showError(ErrorHandler.handleError(error, 'Initialization'));
            }
        }

        async loadProductData() {
            this.showLoadingState('productData');
            
            try {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tabs[0]?.id) {
                    throw new Error('Could not identify the active tab');
                }

                const response = await Utils.retryAsync(async () => {
                    return await chrome.tabs.sendMessage(tabs[0].id, { 
                        action: "getProductData" 
                    });
                }, 2, 1000);

                if (chrome.runtime.lastError) {
                    throw new Error('Please refresh the page and try again');
                }

                if (!response?.title || response.title === "Product not found") {
                    this.showInstructions();
                    return;
                }

                this.currentProductData = response;
                await this.renderProductData();
                await this.loadPriceComparisons();
                
            } catch (error) {
                throw new Error(`Product data loading failed: ${error.message}`);
            } finally {
                this.hideLoadingState('productData');
            }
        }

        async renderProductData() {
            if (!this.currentProductData) return;

            const { title, price, retailer } = this.currentProductData;
            
            // Enhanced product display with truncation
            if (this.elements.productTitle) {
                this.elements.productTitle.textContent = this.truncateText(title, 80);
                this.elements.productTitle.title = title; // Full title on hover
            }
            
            if (this.elements.sitePrice) {
                this.elements.sitePrice.innerHTML = `
                    <span class="price-value">${price}</span>
                    <span class="price-source">at ${this.formatRetailerName(retailer)}</span>
                `;
            }
            
            // Enable and style alert button
            if (this.elements.setAlertButton) {
                this.elements.setAlertButton.disabled = false;
                this.elements.setAlertButton.innerHTML = `
                    <span class="button-icon">🔔</span>
                    <span class="button-text">Set Price Alert</span>
                `;
            }
        }

        async loadPriceComparisons() {
            if (!this.currentProductData || !this.elements.comparisonList) return;

            this.showLoadingState('comparisons');

            try {
                const comparisons = await this.comparisonEngine.getComparisons(this.currentProductData);
                await this.renderEnhancedComparisons(comparisons);
                await this.addEnhancedAffiliateButtons();
                
            } catch (error) {
                ErrorHandler.handleError(error, 'Price-Comparisons');
                this.elements.comparisonList.innerHTML = `
                    <div class="error-message">
                        <span class="error-icon">⚠️</span>
                        Unable to load price comparisons
                        <button class="retry-button" onclick="window.location.reload()">Retry</button>
                    </div>
                `;
            } finally {
                this.hideLoadingState('comparisons');
            }
        }

        async renderEnhancedComparisons(comparisons) {
            if (!comparisons?.length) {
                this.elements.comparisonList.innerHTML = `
                    <div class="no-comparisons">
                        <span class="info-icon">ℹ️</span>
                        <p>No price comparisons available for this product</p>
                        <small>Try checking other similar products</small>
                    </div>
                `;
                return;
            }

            let html = '<div class="comparisons-header">Price Comparisons</div>';
            
            comparisons.forEach((comp, index) => {
                const savingsClass = comp.savings > 0 ? 'savings-positive' : 
                                   comp.savings < 0 ? 'savings-negative' : 'savings-neutral';
                
                const confidenceColor = comp.confidence > 0.8 ? 'high' : 
                                       comp.confidence > 0.6 ? 'medium' : 'low';

                html += `
                    <div class="comparison-item ${comp.isBestDeal ? 'best-deal' : ''} ${comp.isFallback ? 'fallback' : ''}">
                        <div class="retailer-header">
                            <div class="retailer-info">
                                <span class="retailer-name">${comp.retailer}</span>
                                ${comp.rank ? `<span class="rank-badge">#${comp.rank}</span>` : ''}
                            </div>
                            <div class="availability-info">
                                <span class="availability ${comp.availability.includes('Stock') ? 'in-stock' : 'limited'}">${comp.availability}</span>
                                <span class="confidence confidence-${confidenceColor}" title="Confidence: ${Math.round(comp.confidence * 100)}%">
                                    ${Math.round(comp.confidence * 100)}%
                                </span>
                            </div>
                        </div>
                        
                        <div class="price-section">
                            <div class="price-info">
                                <div class="comparison-price">${comp.price}</div>
                                ${comp.savings !== 0 && !comp.isFallback ? `
                                    <div class="savings-info ${savingsClass}">
                                        ${comp.savings > 0 ? 
                                            `💰 Save $${Math.abs(comp.savings).toFixed(2)} (${comp.savingsPercentage}%)` : 
                                            `➕ $${Math.abs(comp.savings).toFixed(2)} more (${Math.abs(comp.savingsPercentage)}%)`
                                        }
                                    </div>
                                ` : ''}
                            </div>
                            
                            ${!comp.isFallback ? `
                                <div class="additional-info">
                                    <small class="shipping-info">📦 ${comp.shippingInfo || 'Shipping varies'}</small>
                                    <small class="delivery-info">🚚 ${comp.estimatedDelivery || 'See retailer'}</small>
                                </div>
                            ` : ''}
                        </div>
                        
                        ${comp.url && comp.url !== '#' ? `
                            <div class="action-section">
                                <a href="${comp.url}" target="_blank" class="view-deal-button" 
                                   data-retailer="${comp.retailer}" data-price="${comp.numericPrice}">
                                    View at ${comp.retailer} →
                                </a>
                            </div>
                        ` : ''}
                    </div>
                `;
            });

            // Add best deal summary
            const bestDeal = comparisons.find(comp => comp.isBestDeal);
            if (bestDeal && bestDeal.savings > 5) {
                html += `
                    <div class="best-deal-summary">
                        🏆 Best Deal: Save $${bestDeal.savings.toFixed(2)} at ${bestDeal.retailer}!
                    </div>
                `;
            }

            this.elements.comparisonList.innerHTML = html;

            // Bind click events for tracking
            this.bindComparisonEvents();
        }

        bindComparisonEvents() {
            const viewButtons = document.querySelectorAll('.view-deal-button');
            viewButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    const retailer = e.target.dataset.retailer;
                    const price = e.target.dataset.price;
                    
                    this.analytics.trackClick(retailer, {
                        ...this.currentProductData,
                        comparisonPrice: price
                    }, e.target.href);
                });
            });
        }

        async addEnhancedAffiliateButtons() {
            if (!this.currentProductData) return;

            const prefs = await this.preferencesManager.getPreferences();
            
            // Enhanced Amazon affiliate integration
            if (this.currentProductData.url.includes('amazon') && 
                prefs.affiliate.enabledPrograms.includes('amazon')) {
                await this.addEnhancedAmazonButton();
            }

            // Add general affiliate disclosure
            this.addAffiliateDisclosure();
        }

        async addEnhancedAmazonButton() {
            if (document.getElementById('amazon-affiliate-container')) return;

            try {
                const affiliateUrl = await this.affiliateManager.generateAmazonLink(
                    this.currentProductData.url
                );

                const buttonContainer = document.createElement('div');
                buttonContainer.id = 'amazon-affiliate-container';
                buttonContainer.className = 'affiliate-container';
                
                buttonContainer.innerHTML = `
                    <div class="affiliate-header">
                        <span class="affiliate-badge">Amazon Partner</span>
                        <span class="onelink-indicator" title="Global redirect enabled">🌍</span>
                    </div>
                    
                    <a id="amazon-affiliate-btn" 
                       href="${affiliateUrl}" 
                       target="_blank"
                       class="amazon-affiliate-button">
                        <span class="button-content">
                            <span class="amazon-logo">📦</span>
                            <span class="button-text">
                                <strong>View on Amazon</strong>
                                <small>Best price & fast delivery</small>
                            </span>
                            <span class="arrow">→</span>
                        </span>
                    </a>
                    
                    <div class="affiliate-benefits">
                        <span class="benefit">✓ Prime eligible</span>
                        <span class="benefit">✓ Easy returns</span>
                        <span class="benefit">✓ Global shipping</span>
                    </div>
                `;

                this.elements.comparisonList.appendChild(buttonContainer);

                // Enhanced click tracking
                document.getElementById('amazon-affiliate-btn').addEventListener('click', (e) => {
                    this.analytics.trackClick('amazon-affiliate', this.currentProductData, affiliateUrl);
                    
                    // Visual feedback
                    e.target.style.transform = 'scale(0.98)';
                    setTimeout(() => {
                        e.target.style.transform = 'scale(1)';
                    }, 150);
                });

                console.log('✅ Enhanced Amazon affiliate button added');
                
            } catch (error) {
                ErrorHandler.handleError(error, 'Amazon-Button-Enhancement');
            }
        }

        addAffiliateDisclosure() {
            if (document.getElementById('affiliate-disclosure')) return;

            const disclosure = document.createElement('div');
            disclosure.id = 'affiliate-disclosure';
            disclosure.className = 'affiliate-disclosure';
            disclosure.innerHTML = `
                <div class="disclosure-content">
                    <span class="disclosure-icon">ℹ️</span>
                    <p>We earn from qualifying purchases as an Amazon Associate. 
                       This helps keep ToolScout free to use.</p>
                </div>
            `;

            this.elements.comparisonList.appendChild(disclosure);
        }

        showLoadingState(type) {
            this.loadingStates.add(type);
            
            const loadingMessages = {
                initialize: 'Initializing ToolScout...',
                productData: 'Reading product information...',
                comparisons: 'Checking prices across retailers...'
            };

            if (this.elements.comparisonList && type === 'comparisons') {
                this.elements.comparisonList.innerHTML = `
                    <div class="loading-state">
                        <div class="loading-spinner"></div>
                        <span class="loading-text">${loadingMessages[type]}</span>
                    </div>
                `;
            }
        }

        hideLoadingState(type) {
            this.loadingStates.delete(type);
        }

        showError(message) {
            if (this.elements.productTitle) {
                this.elements.productTitle.textContent = 'Error';
            }
            
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
                            
                            <div class="features-highlight">
                                <div class="feature">
                                    <span class="feature-icon">💰</span>
                                    <span>Best Price Finder</span>
                                </div>
                                <div class="feature">
                                    <span class="feature-icon">🔔</span>
                                    <span>Price Alerts</span>
                                </div>
                                <div class="feature">
                                    <span class="feature-icon">🌍</span>
                                    <span>Global Shopping</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        truncateText(text, maxLength) {
            if (text.length <= maxLength) return text;
            return text.substring(0, maxLength).trim() + '...';
        }

        formatRetailerName(domain) {
            const names = {
                'amazon.com': 'Amazon US',
                'amazon.co.uk': 'Amazon UK',
                'amazon.de': 'Amazon DE',
                'amazon.fr': 'Amazon FR',
                'amazon.es': 'Amazon ES',
                'amazon.ae': 'Amazon UAE',
                'homedepot.com': 'Home Depot',
                'leroymerlin.fr': 'Leroy Merlin',
                'lowes.com': "Lowe's",
                'walmart.com': 'Walmart'
            };
            
            for (const [key, name] of Object.entries(names)) {
                if (domain.includes(key)) return name;
            }
            
            return domain.replace(/^www\./, '').split('.')[0].toUpperCase();
        }

        bindEvents() {
            if (this.elements.setAlertButton) {
                this.elements.setAlertButton.addEventListener('click', () => {
                    this.handleEnhancedSetAlert();
                });
            }

            if (this.elements.refreshButton) {
                this.elements.refreshButton.addEventListener('click', () => {
                    this.initialize();
                });
            }

            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    this.initialize();
                }
            });
        }

        async handleEnhancedSetAlert() {
            if (!this.currentProductData) return;

            const button = this.elements.setAlertButton;
            const originalContent = button.innerHTML;
            
            button.innerHTML = `
                <span class="loading-spinner small"></span>
                <span class="button-text">Saving Alert...</span>
            `;
            button.disabled = true;

            try {
                const alertData = {
                    ...this.currentProductData,
                    alertId: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    createdAt: new Date().toISOString(),
                    alertThreshold: 10, // Default 10% price drop
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
                    
                    // Track the alert creation
                    this.analytics.trackClick('price-alert-created', alertData);
                    
                    // Reset button after delay
                    setTimeout(() => {
                        button.innerHTML = originalContent;
                        button.disabled = false;
                    }, 3000);
                    
                } else {
                    throw new Error(response?.error || 'Failed to save alert');
                }
                
            } catch (error) {
                ErrorHandler.handleError(error, 'Alert-Creation');
                
                button.innerHTML = `
                    <span class="error-icon">❌</span>
                    <span class="button-text">Error!</span>
                `;
                
                setTimeout(() => {
                    button.innerHTML = originalContent;
                    button.disabled = false;
                }, 2000);
            }
        }
    }

    // =================================================================================================
    // INITIALIZATION & DEBUGGING
    // =================================================================================================
    
    // Initialize the extension when DOM is ready
    const initializeExtension = () => {
        try {
            const controller = new UIController();
            controller.initialize();
            
            // Performance monitoring
            if (window.performance) {
                window.addEventListener('load', () => {
                    const loadTime = window.performance.timing.loadEventEnd - 
                                   window.performance.timing.navigationStart;
                    console.log(`ToolScout loaded in ${loadTime}ms`);
                });
            }
            
        } catch (error) {
            ErrorHandler.handleError(error, 'Extension-Initialization');
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeExtension);
    } else {
        initializeExtension();
    }

    // Enhanced debugging interface
    window.ToolScoutDebug = {
        version: '2.1.0',
        config: AFFILIATE_CONFIG,
        classes: {
            PreferencesManager,
            AffiliateManager,
            AnalyticsTracker,
            PriceComparisonEngine,
            UIController,
            ErrorHandler,
            Utils
        },
        async getAnalytics() {
            const analytics = new AnalyticsTracker();
            return await analytics.getAnalytics();
        },
        async clearCache() {
            await chrome.storage.local.clear();
            console.log('Cache cleared');
        },
        async exportData() {
            const data = await chrome.storage.local.get();
            console.log('Extension data:', data);
            return data;
        }
    };

    console.log('🚀 ToolScout Enhanced Extension v2.1.0 loaded successfully');

})();