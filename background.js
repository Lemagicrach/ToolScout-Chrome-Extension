/**
 * @file Enhanced Service Worker for ToolScout Extension v2.0
 * @description Handles background tasks, settings management, OneLink functionality,
 * and advanced analytics tracking
 */

console.log("ToolScout Enhanced Service Worker v2.0 initialized");

// =================================================================================================
// CONSTANTS & CONFIGURATION
// =================================================================================================

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
    GENERATE_ONELINK: 'generateOneLink'
};

const STORAGE_KEYS = {
    ALERTS: 'alerts',
    SETTINGS: 'toolscoutSettings',
    ANALYTICS: 'clickAnalytics',
    USER_REGION: 'detectedRegion'
};

const DEFAULT_SETTINGS = {
    onelink: {
        behavior: 'auto', // auto, ask, fixed, disabled
        preferredRegion: 'amazon.com'
    },
    affiliate: {
        enabledPrograms: ['amazon'],
        amazonTags: {
            'amazon.com': 'toolscout-20',
            'amazon.co.uk': 'toolscout-21',
            'amazon.de': 'toolscout01-21',
            'amazon.fr': 'toolscout08-21',
            'amazon.es': 'toolscout04-21',
            'amazon.it': 'toolscout01-21',
            'amazon.ca': 'toolscout0c-20',
            'amazon.com.au': 'toolscout-22',
            'amazon.co.jp': 'toolscout-22',
            'amazon.in': 'toolscout-21'
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
        trackClicks: true,
        storeSearchHistory: false,
        anonymousUsage: true
    }
};

// =================================================================================================
// SETTINGS MANAGEMENT
// =================================================================================================

class SettingsManager {
    static async getSettings() {
        try {
            const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
            const settings = { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
            return { success: true, settings };
        } catch (error) {
            console.error('Error getting settings:', error);
            return { success: false, error: error.message, settings: DEFAULT_SETTINGS };
        }
    }

    static async setSettings(newSettings) {
        try {
            const merged = { ...DEFAULT_SETTINGS, ...newSettings };
            await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: merged });
            return { success: true };
        } catch (error) {
            console.error('Error setting settings:', error);
            return { success: false, error: error.message };
        }
    }

    static async detectUserRegion() {
        try {
            // Check if we have a cached region
            const cached = await chrome.storage.local.get(STORAGE_KEYS.USER_REGION);
            if (cached[STORAGE_KEYS.USER_REGION]) {
                const cachedData = cached[STORAGE_KEYS.USER_REGION];
                const hoursSinceDetection = (Date.now() - cachedData.timestamp) / (1000 * 60 * 60);
                
                if (hoursSinceDetection < 24) { // Cache for 24 hours
                    return { success: true, region: cachedData.region };
                }
            }

            // Try to detect region via IP geolocation
            const response = await fetch('https://ipapi.co/json/', {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

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
                'IN': 'amazon.in'
            };

            const detectedRegion = regionMap[data.country_code] || 'amazon.com';
            
            // Cache the result
            await chrome.storage.local.set({
                [STORAGE_KEYS.USER_REGION]: {
                    region: detectedRegion,
                    country: data.country_code,
                    timestamp: Date.now()
                }
            });

            return { success: true, region: detectedRegion };

        } catch (error) {
            console.warn('Region detection failed, falling back to browser language:', error);
            
            // Fallback to browser language
            try {
                const lang = chrome.i18n.getUILanguage ? chrome.i18n.getUILanguage() : navigator.language;
                const countryCode = lang.split('-')[1]?.toUpperCase();
                
                const langMap = {
                    'GB': 'amazon.co.uk',
                    'DE': 'amazon.de',
                    'FR': 'amazon.fr',
                    'ES': 'amazon.es',
                    'IT': 'amazon.it',
                    'CA': 'amazon.ca',
                    'AU': 'amazon.com.au'
                };
                
                const fallbackRegion = langMap[countryCode] || 'amazon.com';
                return { success: true, region: fallbackRegion };
                
            } catch (fallbackError) {
                console.error('Fallback region detection failed:', fallbackError);
                return { success: false, error: fallbackError.message, region: 'amazon.com' };
            }
        }
    }
}

// =================================================================================================
// ONELINK FUNCTIONALITY
// =================================================================================================

class OneLinkManager {
    static extractASIN(amazonUrl) {
        const patterns = [
            /\/dp\/([A-Z0-9]{10})/,
            /\/product\/([A-Z0-9]{10})/,
            /\/gp\/product\/([A-Z0-9]{10})/,
            /asin=([A-Z0-9]{10})/i,
            /\/exec\/obidos\/ASIN\/([A-Z0-9]{10})/
        ];
        
        for (const pattern of patterns) {
            const match = amazonUrl.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    static async generateOneLink(originalUrl, targetRegion = null) {
        try {
            const settingsResult = await SettingsManager.getSettings();
            const settings = settingsResult.settings;

            // Extract ASIN
            const asin = this.extractASIN(originalUrl);
            if (!asin) {
                return { success: false, error: 'Could not extract ASIN from URL' };
            }

            // Determine target region
            let finalRegion = targetRegion;
            if (!finalRegion) {
                switch (settings.onelink.behavior) {
                    case 'auto':
                        const regionResult = await SettingsManager.detectUserRegion();
                        finalRegion = regionResult.region || 'amazon.com';
                        break;
                    case 'fixed':
                        finalRegion = settings.onelink.preferredRegion;
                        break;
                    case 'disabled':
                        return { success: true, url: originalUrl, note: 'OneLink disabled' };
                    default:
                        finalRegion = 'amazon.com';
                }
            }

            // Get affiliate tag for region
            const affiliateTag = settings.affiliate.amazonTags[finalRegion] || 'toolscout-20';

            // Generate OneLink URL
            const oneLinkUrl = `https://${finalRegion}/dp/${asin}?tag=${affiliateTag}&linkCode=as2&camp=1789&creative=9325`;

            return {
                success: true,
                url: oneLinkUrl,
                originalASIN: asin,
                targetRegion: finalRegion,
                affiliateTag: affiliateTag
            };

        } catch (error) {
            console.error('OneLink generation error:', error);
            return { success: false, error: error.message };
        }
    }
}

// =================================================================================================
// ANALYTICS SYSTEM
// =================================================================================================

class AnalyticsManager {
    static async trackClick(clickData) {
        try {
            const settingsResult = await SettingsManager.getSettings();
            if (!settingsResult.settings.privacy.trackClicks) {
                return { success: true, note: 'Tracking disabled' };
            }

            const result = await chrome.storage.local.get(STORAGE_KEYS.ANALYTICS);
            const analytics = result[STORAGE_KEYS.ANALYTICS] || [];

            const trackingData = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                timestamp: new Date().toISOString(),
                retailer: clickData.retailer || 'unknown',
                productTitle: clickData.productTitle ? clickData.productTitle.substring(0, 200) : 'Unknown Product',
                productPrice: clickData.productPrice || 'N/A',
                originalUrl: clickData.originalUrl ? this.sanitizeUrl(clickData.originalUrl) : null,
                affiliateUrl: clickData.affiliateUrl ? this.sanitizeUrl(clickData.affiliateUrl) : null,
                userAgent: clickData.userAgent ? clickData.userAgent.substring(0, 200) : null,
                sessionId: clickData.sessionId || null,
                // Additional metadata
                isAffiliateClick: !!(clickData.affiliateUrl),
                region: clickData.region || null,
                savings: clickData.savings || null
            };

            analytics.push(trackingData);

            // Keep only the last 2000 entries to prevent storage bloat
            if (analytics.length > 2000) {
                analytics.splice(0, analytics.length - 2000);
            }

            await chrome.storage.local.set({ [STORAGE_KEYS.ANALYTICS]: analytics });

            console.log('Click tracked:', clickData.retailer);
            return { success: true, id: trackingData.id };

        } catch (error) {
            console.error('Analytics tracking error:', error);
            return { success: false, error: error.message };
        }
    }

    static sanitizeUrl(url) {
        try {
            const urlObj = new URL(url);
            return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
        } catch {
            return 'invalid-url';
        }
    }

    static async getAnalytics(days = 30) {
        try {
            const result = await chrome.storage.local.get(STORAGE_KEYS.ANALYTICS);
            const analytics = result[STORAGE_KEYS.ANALYTICS] || [];

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);

            const filteredAnalytics = analytics.filter(click => {
                try {
                    return new Date(click.timestamp) > cutoffDate;
                } catch {
                    return false;
                }
            });

            // Generate summary statistics
            const summary = {
                totalClicks: filteredAnalytics.length,
                affiliateClicks: filteredAnalytics.filter(c => c.isAffiliateClick).length,
                retailerBreakdown: this.getRetailerBreakdown(filteredAnalytics),
                uniqueProducts: new Set(filteredAnalytics.map(c => c.productTitle)).size,
                averageClicksPerDay: Math.round(filteredAnalytics.length / Math.min(days, 30)),
                dateRange: {
                    from: cutoffDate.toISOString(),
                    to: new Date().toISOString()
                }
            };

            return {
                success: true,
                analytics: filteredAnalytics,
                summary: summary
            };

        } catch (error) {
            console.error('Error getting analytics:', error);
            return { success: false, error: error.message };
        }
    }

    static getRetailerBreakdown(analytics) {
        const breakdown = {};
        analytics.forEach(click => {
            const retailer = click.retailer || 'unknown';
            breakdown[retailer] = (breakdown[retailer] || 0) + 1;
        });
        return breakdown;
    }
}

// =================================================================================================
// ALERT SYSTEM (Enhanced)
// =================================================================================================

class AlertManager {
    static async saveAlert(alertData) {
        if (!alertData || !alertData.url || !alertData.title || !alertData.price) {
            return { success: false, error: "Invalid product data. Missing required fields." };
        }

        try {
            const result = await chrome.storage.local.get(STORAGE_KEYS.ALERTS);
            const alerts = result[STORAGE_KEYS.ALERTS] || [];

            // Check for existing alert
            const existingAlert = alerts.find(alert => alert.url === alertData.url);
            if (existingAlert) {
                return { success: false, error: "An alert for this product already exists." };
            }

            const newAlert = {
                ...alertData,
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                createdAt: new Date().toISOString(),
                lastChecked: new Date().toISOString(),
                originalPrice: this.parsePrice(alertData.price),
                isActive: true,
                checkCount: 0
            };

            alerts.push(newAlert);
            await chrome.storage.local.set({ [STORAGE_KEYS.ALERTS]: alerts });

            console.log("Alert saved:", newAlert.title);
            return { success: true, alert: newAlert };

        } catch (error) {
            console.error("Error saving alert:", error);
            return { success: false, error: error.message };
        }
    }

    static async getAlerts() {
        try {
            const result = await chrome.storage.local.get(STORAGE_KEYS.ALERTS);
            const alerts = result[STORAGE_KEYS.ALERTS] || [];
            return { success: true, alerts: alerts.filter(alert => alert.isActive) };
        } catch (error) {
            console.error("Error retrieving alerts:", error);
            return { success: false, error: error.message };
        }
    }

    static async deleteAlert(alertId) {
        try {
            const result = await chrome.storage.local.get(STORAGE_KEYS.ALERTS);
            const alerts = result[STORAGE_KEYS.ALERTS] || [];
            
            const alertIndex = alerts.findIndex(alert => alert.id === alertId);
            if (alertIndex === -1) {
                return { success: false, error: "Alert not found." };
            }

            alerts.splice(alertIndex, 1);
            await chrome.storage.local.set({ [STORAGE_KEYS.ALERTS]: alerts });

            console.log("Alert deleted:", alertId);
            return { success: true };

        } catch (error) {
            console.error("Error deleting alert:", error);
            return { success: false, error: error.message };
        }
    }

    static parsePrice(priceString) {
        if (!priceString || typeof priceString !== 'string') return 0;
        const cleaned = priceString.replace(/[^\d.,]/g, '');
        return parseFloat(cleaned.replace(',', '.')) || 0;
    }
}

// =================================================================================================
// CONTEXT MENU INTEGRATION
// =================================================================================================

function createContextMenus() {
    try {
        chrome.contextMenus.removeAll(() => {
            chrome.contextMenus.create({
                id: 'toolscout-compare',
                title: 'Compare prices with ToolScout',
                contexts: ['page'],
                documentUrlPatterns: [
                    '*://*.amazon.*/*',
                    '*://*.homedepot.*/*',
                    '*://*.leroymerlin.*/*',
                    '*://*.lowes.*/*'
                ]
            });

            chrome.contextMenus.create({
                id: 'toolscout-settings',
                title: 'ToolScout Settings',
                contexts: ['action']
            });
        });
    } catch (error) {
        console.error('Error creating context menus:', error);
    }
}

// =================================================================================================
// EVENT HANDLERS
// =================================================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Received message:", message.action);
    
    switch (message.action) {
        case Actions.SAVE_ALERT:
            AlertManager.saveAlert(message.data).then(sendResponse);
            break;
            
        case Actions.GET_ALERTS:
            AlertManager.getAlerts().then(sendResponse);
            break;
            
        case Actions.DELETE_ALERT:
            AlertManager.deleteAlert(message.data.alertId).then(sendResponse);
            break;

        case Actions.GET_SETTINGS:
            SettingsManager.getSettings().then(sendResponse);
            break;

        case Actions.SET_SETTINGS:
            SettingsManager.setSettings(message.data).then(sendResponse);
            break;

        case Actions.TRACK_CLICK:
            AnalyticsManager.trackClick(message.data).then(sendResponse);
            break;

        case Actions.GET_ANALYTICS:
            AnalyticsManager.getAnalytics(message.data?.days).then(sendResponse);
            break;

        case Actions.DETECT_REGION:
            SettingsManager.detectUserRegion().then(sendResponse);
            break;

        case Actions.GENERATE_ONELINK:
            OneLinkManager.generateOneLink(message.data.url, message.data.targetRegion).then(sendResponse);
            break;
            
        default:
            console.warn("Unknown message action:", message.action);
            sendResponse({ success: false, error: "Unknown action" });
            return false;
    }
    
    return true; // Async response
});

chrome.runtime.onInstalled.addListener((details) => {
    console.log("ToolScout extension installed/updated:", details.reason);
    
    if (details.reason === 'install') {
        // Initialize default settings
        SettingsManager.setSettings(DEFAULT_SETTINGS).then(() => {
            console.log('Default settings initialized');
        });

        // Show welcome/disclosure page
        chrome.tabs.create({ url: 'disclosure.html' });
        
        // Store installation data
        chrome.storage.local.set({
            installationData: {
                installDate: new Date().toISOString(),
                version: chrome.runtime.getManifest().version,
                reason: details.reason
            }
        });
    }

    // Create context menus
    createContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
    console.log("ToolScout extension started");
    createContextMenus();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    switch (info.menuItemId) {
        case 'toolscout-compare':
            // Open popup programmatically (if possible) or inject content script
            chrome.action.openPopup();
            break;
            
        case 'toolscout-settings':
            chrome.runtime.openOptionsPage();
            break;
    }
});

chrome.commands.onCommand.addListener((command) => {
    switch (command) {
        case 'toggle-toolscout':
            chrome.action.openPopup();
            break;
            
        case 'open-settings':
            chrome.runtime.openOptionsPage();
            break;
    }
});

// =================================================================================================
// PERIODIC TASKS
// =================================================================================================

// Set up alarm for price checking (every 4 hours)
chrome.alarms.create('priceCheck', { periodInMinutes: 240 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'priceCheck') {
        // Future: Implement automatic price checking for alerts
        console.log('Price check alarm triggered (feature coming soon)');
    }
});

// =================================================================================================
// ERROR HANDLING & LOGGING
// =================================================================================================

function logActivity(action, data = {}) {
    console.log(`ToolScout Activity: ${action}`, data);
}

// Global error handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        // Message handling is already implemented above
    } catch (error) {
        console.error('Unhandled error in message handler:', error);
        sendResponse({ success: false, error: error.message });
    }
});

console.log("ToolScout Enhanced Service Worker v2.0 ready");