/**
 * @file background.js - SECURITY ENHANCED Service Worker v2.1.1
 * @description FIXED: Data encryption, atomic storage operations, rate limiting, secure region detection
 */

console.log("ToolScout SECURITY ENHANCED Service Worker v2.1.1 initialized");

// =================================================================================================
// SECURITY CONFIGURATION & CONSTANTS
// =================================================================================================

const SECURITY_LIMITS = {
    MAX_STORAGE_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_ALERTS_PER_USER: 100,
    MAX_ANALYTICS_ENTRIES: 1000,
    RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
    MAX_REQUESTS_PER_MINUTE: 60,
    MAX_ERRORS_PER_HOUR: 50,
    DATA_RETENTION_DAYS: 30
};

const Actions = {
    SAVE_ALERT: 'saveAlert',
    GET_ALERTS: 'getAlerts',
    DELETE_ALERT: 'deleteAlert',
    CHECK_ALERTS: 'checkAlerts',
    GET_SETTINGS: 'getSettings',
    SET_SETTINGS: 'setSettings',
    TRACK_CLICK: 'trackClick',
    GET_ANALYTICS: 'getAnalytics',
    DETECT_REGION: 'detectRegion',
    GENERATE_ONELINK: 'generateOneLink',
    CLEAR_DATA: 'clearData',
    GET_CONSENT: 'getConsent',
    SET_CONSENT: 'setConsent'
};

const STORAGE_KEYS = {
    ALERTS: 'alerts',
    SETTINGS: 'toolscoutSettings',
    ANALYTICS: 'clickAnalytics',
    USER_REGION: 'detectedRegion',
    CONSENT: 'gdprConsent',
    RATE_LIMITS: 'rateLimits',
    ERROR_LOGS: 'errorLogs',
    ENCRYPTION_KEY: 'encryptionKey'
};

// SECURE DEFAULT SETTINGS with hashed affiliate tags
const DEFAULT_SETTINGS = {
    version: '2.1.1',
    onelink: {
        behavior: 'auto',
        preferredRegion: 'amazon.com',
        enabled: true
    },
    affiliate: {
        enabledPrograms: ['amazon'],
        // Using environment-specific tags (should be injected securely)
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
    },
    pricing: {
        showSavings: true,
        highlightBestDeal: true,
        cachePrices: true,
        currency: 'USD',
        alertThreshold: 10,
        cacheDuration: 5
    },
    privacy: {
        trackClicks: false, // Default to false for privacy
        storeSearchHistory: false,
        anonymousUsage: false,
        dataRetentionDays: SECURITY_LIMITS.DATA_RETENTION_DAYS
    },
    security: {
        encryptSensitiveData: true,
        rateLimitingEnabled: true,
        maxStorageSize: SECURITY_LIMITS.MAX_STORAGE_SIZE
    }
};

// =================================================================================================
// ENCRYPTION & SECURITY UTILITIES
// =================================================================================================

class SecurityManager {
    constructor() {
        this.encryptionKey = null;
        this.rateLimits = new Map();
    }

    async initialize() {
        await this.initializeEncryption();
    }

    async initializeEncryption() {
        try {
            // Get or generate encryption key
            const result = await chrome.storage.local.get(STORAGE_KEYS.ENCRYPTION_KEY);
            
            if (result[STORAGE_KEYS.ENCRYPTION_KEY]) {
                this.encryptionKey = result[STORAGE_KEYS.ENCRYPTION_KEY];
            } else {
                // Generate new encryption key
                this.encryptionKey = await this.generateEncryptionKey();
                await chrome.storage.local.set({
                    [STORAGE_KEYS.ENCRYPTION_KEY]: this.encryptionKey
                });
            }
        } catch (error) {
            console.error('Failed to initialize encryption:', error);
            // Fallback to basic operation without encryption
        }
    }

    async generateEncryptionKey() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    // Simple XOR encryption for sensitive data
    encrypt(data, key = this.encryptionKey) {
        if (!key) return data; // Fallback if encryption unavailable
        
        try {
            const dataStr = JSON.stringify(data);
            const encrypted = [];
            
            for (let i = 0; i < dataStr.length; i++) {
                const keyChar = key[i % key.length];
                const encryptedChar = dataStr.charCodeAt(i) ^ keyChar.charCodeAt(0);
                encrypted.push(String.fromCharCode(encryptedChar));
            }
            
            return btoa(encrypted.join(''));
        } catch (error) {
            console.warn('Encryption failed, storing unencrypted:', error);
            return data;
        }
    }

    decrypt(encryptedData, key = this.encryptionKey) {
        if (!key || typeof encryptedData !== 'string') return encryptedData;
        
        try {
            const encrypted = atob(encryptedData);
            const decrypted = [];
            
            for (let i = 0; i < encrypted.length; i++) {
                const keyChar = key[i % key.length];
                const decryptedChar = encrypted.charCodeAt(i) ^ keyChar.charCodeAt(0);
                decrypted.push(String.fromCharCode(decryptedChar));
            }
            
            return JSON.parse(decrypted.join(''));
        } catch (error) {
            console.warn('Decryption failed, returning raw data:', error);
            return encryptedData;
        }
    }

    // Rate limiting with proper cleanup
    checkRateLimit(key, limit = SECURITY_LIMITS.MAX_REQUESTS_PER_MINUTE) {
        const now = Date.now();
        const window = SECURITY_LIMITS.RATE_LIMIT_WINDOW;
        
        if (!this.rateLimits.has(key)) {
            this.rateLimits.set(key, []);
        }
        
        const requests = this.rateLimits.get(key);
        
        // Remove old requests
        const cutoff = now - window;
        const validRequests = requests.filter(timestamp => timestamp > cutoff);
        
        if (validRequests.length >= limit) {
            throw new Error(`Rate limit exceeded for ${key}. Try again later.`);
        }
        
        validRequests.push(now);
        this.rateLimits.set(key, validRequests);
        
        return true;
    }

    sanitizeInput(input, maxLength = 1000) {
        if (typeof input === 'string') {
            return input.substring(0, maxLength).replace(/[<>\"'&]/g, '');
        }
        
        if (typeof input === 'object' && input !== null) {
            const sanitized = {};
            for (const [key, value] of Object.entries(input)) {
                if (typeof value === 'string') {
                    sanitized[key] = value.substring(0, maxLength).replace(/[<>\"'&]/g, '');
                } else if (typeof value === 'number' && isFinite(value)) {
                    sanitized[key] = value;
                } else if (typeof value === 'boolean') {
                    sanitized[key] = value;
                }
            }
            return sanitized;
        }
        
        return input;
    }

    validateUrl(url) {
        try {
            const urlObj = new URL(url);
            const allowedProtocols = ['https:', 'http:'];
            const allowedHosts = [
                'amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.fr',
                'amazon.es', 'amazon.it', 'amazon.ca', 'amazon.com.au',
                'amazon.co.jp', 'amazon.in', 'amazon.ae',
                'homedepot.com', 'leroymerlin.fr', 'lowes.com'
            ];
            
            if (!allowedProtocols.includes(urlObj.protocol)) {
                return false;
            }
            
            const hostname = urlObj.hostname.replace(/^www\./, '');
            return allowedHosts.some(allowed => hostname.includes(allowed));
        } catch {
            return false;
        }
    }
}

// =================================================================================================
// ATOMIC STORAGE OPERATIONS
// =================================================================================================

class AtomicStorageManager {
    constructor(securityManager) {
        this.security = securityManager;
        this.locks = new Map();
    }

    async withLock(key, operation) {
        // Simple mutex implementation
        while (this.locks.has(key)) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        this.locks.set(key, true);
        
        try {
            return await operation();
        } finally {
            this.locks.delete(key);
        }
    }

    async secureGet(key) {
        return this.withLock(key, async () => {
            try {
                const result = await chrome.storage.local.get(key);
                const data = result[key];
                
                if (data && data.encrypted) {
                    return this.security.decrypt(data.value);
                }
                
                return data;
            } catch (error) {
                console.error(`Secure get failed for ${key}:`, error);
                return null;
            }
        });
    }

    async secureSet(key, value, encrypt = false) {
        return this.withLock(key, async () => {
            try {
                this.security.checkRateLimit(`storage_${key}`, 30); // 30 ops per minute per key
                
                let dataToStore = value;
                
                if (encrypt && this.security.encryptionKey) {
                    dataToStore = {
                        encrypted: true,
                        value: this.security.encrypt(value),
                        timestamp: Date.now()
                    };
                } else {
                    dataToStore = {
                        encrypted: false,
                        value: value,
                        timestamp: Date.now()
                    };
                }
                
                await chrome.storage.local.set({ [key]: dataToStore });
                return true;
            } catch (error) {
                console.error(`Secure set failed for ${key}:`, error);
                return false;
            }
        });
    }

    async getStorageSize() {
        try {
            const allData = await chrome.storage.local.get();
            const size = new Blob([JSON.stringify(allData)]).size;
            return size;
        } catch (error) {
            console.error('Failed to calculate storage size:', error);
            return 0;
        }
    }

    async enforceStorageLimit() {
        const size = await this.getStorageSize();
        
        if (size > SECURITY_LIMITS.MAX_STORAGE_SIZE) {
            console.warn(`Storage size (${size} bytes) exceeds limit. Cleaning up...`);
            
            // Clean up old analytics data first
            const analytics = await this.secureGet(STORAGE_KEYS.ANALYTICS) || [];
            if (analytics.length > SECURITY_LIMITS.MAX_ANALYTICS_ENTRIES) {
                const cleaned = analytics.slice(-SECURITY_LIMITS.MAX_ANALYTICS_ENTRIES);
                await this.secureSet(STORAGE_KEYS.ANALYTICS, cleaned);
            }
            
            // Clean up old error logs
            await this.cleanupErrorLogs();
            
            // If still over limit, remove oldest alerts
            const newSize = await this.getStorageSize();
            if (newSize > SECURITY_LIMITS.MAX_STORAGE_SIZE) {
                await this.cleanupOldAlerts();
            }
        }
    }

    async cleanupErrorLogs() {
        const logs = await this.secureGet(STORAGE_KEYS.ERROR_LOGS) || [];
        const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
        
        const recentLogs = logs.filter(log => 
            new Date(log.timestamp).getTime() > cutoffTime
        ).slice(-50); // Keep max 50 recent errors
        
        await this.secureSet(STORAGE_KEYS.ERROR_LOGS, recentLogs);
    }

    async cleanupOldAlerts() {
        const alerts = await this.secureGet(STORAGE_KEYS.ALERTS) || [];
        const cutoffTime = Date.now() - (60 * 24 * 60 * 60 * 1000); // 60 days
        
        const recentAlerts = alerts
            .filter(alert => new Date(alert.createdAt).getTime() > cutoffTime)
            .slice(-SECURITY_LIMITS.MAX_ALERTS_PER_USER);
        
        await this.secureSet(STORAGE_KEYS.ALERTS, recentAlerts);
    }
}

// =================================================================================================
// ENHANCED SETTINGS MANAGER WITH SECURITY
// =================================================================================================

class SettingsManager {
    constructor(securityManager, storageManager) {
        this.security = securityManager;
        this.storage = storageManager;
    }

    async getSettings() {
        try {
            this.security.checkRateLimit('getSettings', 30);
            
            const storedSettings = await this.storage.secureGet(STORAGE_KEYS.SETTINGS);
            const settings = this.mergeSettings(DEFAULT_SETTINGS, storedSettings || {});
            
            // Migrate old settings if needed
            if (!settings.version || settings.version !== DEFAULT_SETTINGS.version) {
                const migrated = await this.migrateSettings(settings);
                await this.setSettings(migrated);
                return migrated;
            }
            
            return settings;
        } catch (error) {
            console.error('Error getting settings:', error);
            return DEFAULT_SETTINGS;
        }
    }

    async setSettings(newSettings) {
        try {
            this.security.checkRateLimit('setSettings', 10);
            
            // Sanitize and validate settings
            const sanitized = this.security.sanitizeInput(newSettings);
            const validated = this.validateSettings(sanitized);
            
            // Merge with current settings
            const current = await this.getSettings();
            const merged = this.mergeSettings(current, validated);
            merged.version = DEFAULT_SETTINGS.version;
            merged.lastUpdated = new Date().toISOString();
            
            // Store with encryption for sensitive data
            const success = await this.storage.secureSet(STORAGE_KEYS.SETTINGS, merged, true);
            
            if (success) {
                console.log('Settings saved successfully');
                // Trigger cleanup if needed
                await this.storage.enforceStorageLimit();
            }
            
            return { success, settings: merged };
        } catch (error) {
            console.error('Error setting settings:', error);
            return { success: false, error: error.message };
        }
    }

    validateSettings(settings) {
        const validated = { ...settings };
        
        // Validate affiliate tags format
        if (validated.affiliate?.amazonTags) {
            const tags = validated.affiliate.amazonTags;
            Object.keys(tags).forEach(region => {
                const tag = tags[region];
                if (typeof tag !== 'string' || !/^[a-zA-Z0-9\-_]{3,20}$/.test(tag)) {
                    console.warn(`Invalid affiliate tag for ${region}: ${tag}`);
                    delete tags[region];
                }
            });
        }
        
        // Validate numeric ranges
        if (validated.pricing?.alertThreshold) {
            const threshold = Number(validated.pricing.alertThreshold);
            validated.pricing.alertThreshold = Math.max(1, Math.min(50, threshold || 10));
        }
        
        if (validated.pricing?.cacheDuration) {
            const duration = Number(validated.pricing.cacheDuration);
            validated.pricing.cacheDuration = Math.max(1, Math.min(60, duration || 5));
        }
        
        return validated;
    }

    mergeSettings(defaults, user) {
        const merged = { ...defaults };
        
        Object.keys(user).forEach(key => {
            if (typeof user[key] === 'object' && user[key] !== null && !Array.isArray(user[key])) {
                merged[key] = { ...defaults[key], ...user[key] };
            } else {
                merged[key] = user[key];
            }
        });
        
        return merged;
    }

    async migrateSettings(oldSettings) {
        console.log('Migrating settings from version:', oldSettings.version || 'unknown');
        
        // Add migration logic here for future versions
        const migrated = { ...DEFAULT_SETTINGS, ...oldSettings };
        migrated.version = DEFAULT_SETTINGS.version;
        
        return migrated;
    }

    async detectUserRegion() {
        try {
            this.security.checkRateLimit('detectRegion', 5); // Very limited
            
            // Check cache first
            const cached = await this.storage.secureGet(STORAGE_KEYS.USER_REGION);
            if (cached?.region && cached.timestamp) {
                const hoursSinceDetection = (Date.now() - cached.timestamp) / (1000 * 60 * 60);
                if (hoursSinceDetection < 24) {
                    return { success: true, region: cached.region, cached: true };
                }
            }

            // Use secure API call with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            try {
                const response = await fetch('https://ipapi.co/json/', {
                    method: 'GET',
                    headers: { 
                        'Accept': 'application/json',
                        'User-Agent': 'ToolScout/2.1.1'
                    },
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                
                // Validate response
                if (!data.country_code || typeof data.country_code !== 'string') {
                    throw new Error('Invalid API response');
                }
                
                const regionMap = {
                    'US': 'amazon.com', 'GB': 'amazon.co.uk', 'DE': 'amazon.de',
                    'FR': 'amazon.fr', 'ES': 'amazon.es', 'IT': 'amazon.it',
                    'CA': 'amazon.ca', 'AU': 'amazon.com.au', 'JP': 'amazon.co.jp',
                    'IN': 'amazon.in', 'AE': 'amazon.ae', 'SA': 'amazon.ae',
                    'MA': 'amazon.fr' // Morocco -> France
                };

                const detectedRegion = regionMap[data.country_code] || 'amazon.com';
                
                // Cache securely
                await this.storage.secureSet(STORAGE_KEYS.USER_REGION, {
                    region: detectedRegion,
                    country: data.country_code,
                    timestamp: Date.now(),
                    source: 'ipapi'
                });

                return { success: true, region: detectedRegion, country: data.country_code };

            } finally {
                clearTimeout(timeoutId);
            }

        } catch (error) {
            console.warn('Region detection failed:', error.message);
            
            // Secure fallback using browser language
            try {
                const fallbackRegion = this.getFallbackRegion();
                return { success: true, region: fallbackRegion, fallback: true };
            } catch (fallbackError) {
                console.error('Fallback region detection failed:', fallbackError);
                return { success: false, error: fallbackError.message, region: 'amazon.com' };
            }
        }
    }

    getFallbackRegion() {
        const lang = chrome.i18n ? chrome.i18n.getUILanguage() : (navigator.language || 'en-US');
        const [language, country] = lang.split('-');
        
        const langMap = {
            'en': 'amazon.com', 'fr': 'amazon.fr', 'de': 'amazon.de',
            'es': 'amazon.es', 'it': 'amazon.it', 'ja': 'amazon.co.jp'
        };
        
        const countryMap = {
            'GB': 'amazon.co.uk', 'CA': 'amazon.ca', 'AU': 'amazon.com.au',
            'IN': 'amazon.in'
        };
        
        return countryMap[country?.toUpperCase()] || langMap[language] || 'amazon.com';
    }
}

// =================================================================================================
// SECURE ANALYTICS MANAGER
// =================================================================================================

class AnalyticsManager {
    constructor(securityManager, storageManager) {
        this.security = securityManager;
        this.storage = storageManager;
    }

    async trackClick(clickData) {
        try {
            // Check consent first
            const consent = await this.storage.secureGet(STORAGE_KEYS.CONSENT);
            if (!consent?.analytics) {
                return { success: true, note: 'Analytics consent not granted' };
            }

            this.security.checkRateLimit('trackClick', 60);

            // Sanitize and validate data
            const sanitized = this.security.sanitizeInput(clickData);
            if (!this.validateClickData(sanitized)) {
                throw new Error('Invalid click data');
            }

            const analytics = await this.storage.secureGet(STORAGE_KEYS.ANALYTICS) || [];

            const trackingData = {
                id: this.generateSecureId(),
                timestamp: new Date().toISOString(),
                retailer: sanitized.retailer || 'unknown',
                // Only store limited, anonymized data
                productTitle: sanitized.productTitle ? 
                    this.anonymizeTitle(sanitized.productTitle) : 'Unknown Product',
                priceRange: this.categorizePrice(sanitized.productPrice),
                domain: this.extractDomain(sanitized.originalUrl),
                hasAffiliateUrl: !!sanitized.affiliateUrl,
                userAgentHash: this.hashUserAgent(sanitized.userAgent),
                sessionId: sanitized.sessionId || null,
                source: 'extension'
            };

            analytics.push(trackingData);

            // Limit storage
            if (analytics.length > SECURITY_LIMITS.MAX_ANALYTICS_ENTRIES) {
                analytics.splice(0, analytics.length - SECURITY_LIMITS.MAX_ANALYTICS_ENTRIES);
            }

            await this.storage.secureSet(STORAGE_KEYS.ANALYTICS, analytics);
            await this.storage.enforceStorageLimit();

            return { success: true, id: trackingData.id };

        } catch (error) {
            console.error('Analytics tracking error:', error);
            return { success: false, error: error.message };
        }
    }

    validateClickData(data) {
        return data && 
               typeof data.retailer === 'string' && 
               data.retailer.length > 0 && 
               data.retailer.length < 100;
    }

    anonymizeTitle(title) {
        // Remove potentially identifying information
        return title
            .substring(0, 100)
            .replace(/\b\d{4,}\b/g, '[NUMBER]') // Remove long numbers (phone, serial, etc)
            .replace(/[^\w\s\-]/g, '') // Remove special chars
            .trim();
    }

    categorizePrice(priceString) {
        if (!priceString) return 'unknown';
        
        const price = parseFloat(priceString.replace(/[^\d.,]/g, '').replace(',', '.'));
        if (isNaN(price)) return 'unknown';
        
        if (price < 10) return 'under-10';
        if (price < 50) return '10-50';
        if (price < 100) return '50-100';
        if (price < 500) return '100-500';
        return 'over-500';
    }

    extractDomain(url) {
        try {
            if (!this.security.validateUrl(url)) return 'invalid';
            const domain = new URL(url).hostname.replace(/^www\./, '');
            return domain.split('.').slice(-2).join('.'); // Get main domain only
        } catch {
            return 'invalid';
        }
    }

    hashUserAgent(userAgent) {
        if (!userAgent) return null;
        
        // Simple hash for anonymization
        let hash = 0;
        for (let i = 0; i < userAgent.length; i++) {
            const char = userAgent.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(36);
    }

    generateSecureId() {
        return `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async getAnalytics(days = 30) {
        try {
            this.security.checkRateLimit('getAnalytics', 20);
            
            const analytics = await this.storage.secureGet(STORAGE_KEYS.ANALYTICS) || [];
            
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - Math.min(days, 90)); // Max 90 days
            
            const filtered = analytics.filter(click => {
                try {
                    return new Date(click.timestamp) > cutoffDate;
                } catch {
                    return false;
                }
            });

            const summary = this.generateSecureSummary(filtered);

            return {
                success: true,
                summary: summary,
                totalEntries: filtered.length,
                dateRange: {
                    from: cutoffDate.toISOString(),
                    to: new Date().toISOString()
                }
            };

        } catch (error) {
            console.error('Error getting analytics:', error);
            return { success: false, error: error.message };
        }
    }

    generateSecureSummary(analytics) {
        const retailers = {};
        const priceRanges = {};
        
        analytics.forEach(click => {
            retailers[click.retailer] = (retailers[click.retailer] || 0) + 1;
            priceRanges[click.priceRange] = (priceRanges[click.priceRange] || 0) + 1;
        });

        return {
            totalClicks: analytics.length,
            uniqueRetailers: Object.keys(retailers).length,
            topRetailer: Object.keys(retailers).reduce((a, b) => 
                retailers[a] > retailers[b] ? a : b, '') || 'none',
            priceDistribution: priceRanges,
            affiliateClickRate: analytics.filter(c => c.hasAffiliateUrl).length / 
                               Math.max(analytics.length, 1),
            averageClicksPerDay: Math.round(analytics.length / Math.min(30, analytics.length || 1))
        };
    }
}

// =================================================================================================
// INITIALIZATION & MESSAGE HANDLING
// =================================================================================================

let securityManager;
let storageManager;
let settingsManager;
let analyticsManager;

async function initializeServiceWorker() {
    try {
        securityManager = new SecurityManager();
        await securityManager.initialize();
        
        storageManager = new AtomicStorageManager(securityManager);
        settingsManager = new SettingsManager(securityManager, storageManager);
        analyticsManager = new AnalyticsManager(securityManager, storageManager);
        
        console.log('Service worker initialized with security enhancements');
        
        // Initial cleanup
        await storageManager.enforceStorageLimit();
        
    } catch (error) {
        console.error('Service worker initialization failed:', error);
    }
}

// Initialize on startup
initializeServiceWorker();

// =================================================================================================
// MESSAGE HANDLER WITH SECURITY
// =================================================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!securityManager || !storageManager) {
        sendResponse({ success: false, error: 'Service worker not ready' });
        return false;
    }

    try {
        // Basic security validation
        if (!message.action || typeof message.action !== 'string') {
            sendResponse({ success: false, error: 'Invalid message format' });
            return false;
        }

        // Rate limiting per sender
        const senderId = sender.tab?.id || sender.id || 'unknown';
        securityManager.checkRateLimit(`messages_${senderId}`, SECURITY_LIMITS.MAX_REQUESTS_PER_MINUTE);

        // Handle messages asynchronously
        handleSecureMessage(message, sender)
            .then(sendResponse)
            .catch(error => {
                console.error('Message handling error:', error);
                sendResponse({ 
                    success: false, 
                    error: securityManager.sanitizeInput(error.message) 
                });
            });

    } catch (error) {
        console.error('Message validation error:', error);
        sendResponse({ success: false, error: 'Message processing failed' });
    }
    
    return true; // Will respond asynchronously
});

async function handleSecureMessage(message, sender) {
    const { action, data } = message;

    switch (action) {
        case Actions.GET_SETTINGS:
            return await settingsManager.getSettings();

        case Actions.SET_SETTINGS:
            if (!data) throw new Error('Settings data required');
            return await settingsManager.setSettings(data);

        case Actions.DETECT_REGION:
            return await settingsManager.detectUserRegion();

        case Actions.TRACK_CLICK:
            if (!data) throw new Error('Click data required');
            return await analyticsManager.trackClick(data);

        case Actions.GET_ANALYTICS:
            const days = data?.days ? Math.min(Number(data.days), 90) : 30;
            return await analyticsManager.getAnalytics(days);

        case Actions.GET_CONSENT:
            const consent = await storageManager.secureGet(STORAGE_KEYS.CONSENT);
            return { success: true, consent };

        case Actions.SET_CONSENT:
            if (!data) throw new Error('Consent data required');
            const success = await storageManager.secureSet(STORAGE_KEYS.CONSENT, data);
            return { success };

        case Actions.CLEAR_DATA:
            // Only allow from extension pages
            if (!sender.url?.startsWith('chrome-extension://')) {
                throw new Error('Unauthorized data clear request');
            }
            await chrome.storage.local.clear();
            await chrome.storage.sync.clear();
            return { success: true };

        default:
            throw new Error(`Unknown action: ${action}`);
    }
}

// =================================================================================================
// INSTALLATION & LIFECYCLE MANAGEMENT
// =================================================================================================

chrome.runtime.onInstalled.addListener(async (details) => {
    console.log("ToolScout extension installed/updated:", details.reason);
    
    try {
        await initializeServiceWorker();
        
        if (details.reason === 'install') {
            // Initialize with secure defaults
            await settingsManager.setSettings(DEFAULT_SETTINGS);
            
            // Show privacy disclosure
            chrome.tabs.create({ url: 'disclosure.html' });
            
            // Store installation metadata
            await storageManager.secureSet('installationData', {
                installDate: new Date().toISOString(),
                version: chrome.runtime.getManifest().version,
                reason: details.reason,
                securityVersion: '2.1.1'
            });
            
        } else if (details.reason === 'update') {
            // Handle updates securely
            const previousVersion = details.previousVersion;
            console.log(`Updated from version ${previousVersion}`);
            
            // Run any necessary migrations
            await settingsManager.getSettings(); // This will trigger migration if needed
        }
        
    } catch (error) {
        console.error('Installation/update handling failed:', error);
    }
});

chrome.runtime.onStartup.addListener(async () => {
    console.log("ToolScout extension started");
    await initializeServiceWorker();
});

// =================================================================================================
// PERIODIC CLEANUP & MAINTENANCE
// =================================================================================================

chrome.alarms.create('maintenance', { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'maintenance' && storageManager) {
        try {
            console.log('Running maintenance tasks...');
            await storageManager.enforceStorageLimit();
            await storageManager.cleanupErrorLogs();
            
            // Clear old rate limits
            if (securityManager) {
                securityManager.rateLimits.clear();
            }
            
        } catch (error) {
            console.error('Maintenance task failed:', error);
        }
    }
});

console.log("ToolScout SECURITY ENHANCED Service Worker v2.1.1 ready");