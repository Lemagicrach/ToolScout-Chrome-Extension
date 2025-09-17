/**
 * @file Service worker for the ToolScout price tracker extension.
 * @description This script handles background tasks such as listening for messages,
 * managing product data, and storing price alerts.
 * Complete implementation with proper error handling and data validation.
 */

console.log("ToolScout Service Worker has started.");

// =================================================================================================
// #region Constants
// =================================================================================================

const Actions = {
  SAVE_ALERT: 'saveAlert',
  GET_ALERTS: 'getAlerts',
  DELETE_ALERT: 'deleteAlert',
  CHECK_ALERTS: 'checkAlerts'
};

const STORAGE_KEY_ALERTS = 'alerts';
const STORAGE_KEY_SETTINGS = 'settings';

// =================================================================================================
// #region Core Logic
// =================================================================================================

/**
 * Saves a new price alert to chrome.storage.
 * Includes validation to ensure data is correct and not duplicated.
 * @param {object} alertData - The product data for the new alert.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function saveAlert(alertData) {
    // Enhanced data validation
    if (!alertData || 
        typeof alertData.url !== 'string' || 
        !alertData.url.startsWith('http') ||
        !alertData.title ||
        !alertData.price) {
        return { success: false, error: "Invalid product data received. Missing required fields." };
    }

    try {
        const result = await chrome.storage.local.get(STORAGE_KEY_ALERTS);
        const alerts = result[STORAGE_KEY_ALERTS] || [];

        // Check for existing alert with same URL
        const existingAlert = alerts.find(alert => alert.url === alertData.url);
        if (existingAlert) {
            return { success: false, error: "An alert for this product already exists." };
        }

        // Add timestamp and unique ID
        const newAlert = {
            ...alertData,
            id: Date.now().toString(),
            createdAt: new Date().toISOString(),
            lastChecked: new Date().toISOString(),
            originalPrice: alertData.price
        };

        alerts.push(newAlert);
        await chrome.storage.local.set({ [STORAGE_KEY_ALERTS]: alerts });
        
        console.log("New alert saved:", newAlert);
        return { success: true, alert: newAlert };

    } catch (error) {
        console.error("Error saving alert to storage:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Retrieves all saved alerts from storage.
 * @returns {Promise<{success: boolean, alerts?: Array, error?: string}>}
 */
async function getAlerts() {
    try {
        const result = await chrome.storage.local.get(STORAGE_KEY_ALERTS);
        const alerts = result[STORAGE_KEY_ALERTS] || [];
        return { success: true, alerts };
    } catch (error) {
        console.error("Error retrieving alerts:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Deletes an alert by ID.
 * @param {string} alertId - The ID of the alert to delete.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteAlert(alertId) {
    try {
        const result = await chrome.storage.local.get(STORAGE_KEY_ALERTS);
        const alerts = result[STORAGE_KEY_ALERTS] || [];
        
        const filteredAlerts = alerts.filter(alert => alert.id !== alertId);
        
        if (filteredAlerts.length === alerts.length) {
            return { success: false, error: "Alert not found." };
        }
        
        await chrome.storage.local.set({ [STORAGE_KEY_ALERTS]: filteredAlerts });
        console.log("Alert deleted:", alertId);
        return { success: true };
        
    } catch (error) {
        console.error("Error deleting alert:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Parses price string to extract numeric value.
 * @param {string} priceString - The price string to parse.
 * @returns {number|null} The numeric price value or null if parsing fails.
 */
function parsePrice(priceString) {
    if (!priceString || typeof priceString !== 'string') {
        return null;
    }
    
    // Remove currency symbols and extract numbers
    const cleanPrice = priceString.replace(/[^\d.,]/g, '');
    const numericPrice = parseFloat(cleanPrice.replace(',', '.'));
    
    return isNaN(numericPrice) ? null : numericPrice;
}

/**
 * Validates that the extension has proper permissions and setup.
 * @returns {boolean} True if extension is properly configured.
 */
function validateExtensionSetup() {
    // Check if we have required permissions
    return chrome.storage && chrome.storage.local;
}

// =================================================================================================
// #region Event Listeners
// =================================================================================================

/**
 * Message listener for handling communication with popup and content scripts.
 * Properly structured for Manifest V3 with async response handling.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Received message:", message.action);
    
    switch (message.action) {
        case Actions.SAVE_ALERT:
            saveAlert(message.data).then(sendResponse);
            break;
            
        case Actions.GET_ALERTS:
            getAlerts().then(sendResponse);
            break;
            
        case Actions.DELETE_ALERT:
            deleteAlert(message.data.alertId).then(sendResponse);
            break;
            
        default:
            console.warn("Received unknown message action:", message.action);
            sendResponse({ success: false, error: "Unknown action" });
            return false;
    }
    
    // Return true to indicate that we will respond asynchronously
    return true;
});

/**
 * Extension installation/startup handler.
 */
chrome.runtime.onInstalled.addListener((details) => {
    console.log("ToolScout extension installed/updated:", details.reason);
    
    // Initialize default settings if needed
    if (details.reason === 'install') {
        chrome.storage.local.set({
            [STORAGE_KEY_SETTINGS]: {
                notifications: true,
                checkInterval: 24, // hours
                priceThreshold: 5 // percentage
            }
        });
    }
});

/**
 * Extension startup handler.
 */
chrome.runtime.onStartup.addListener(() => {
    console.log("ToolScout extension started");
    
    // Validate extension setup
    if (!validateExtensionSetup()) {
        console.error("Extension setup validation failed");
    }
});

// =================================================================================================
// #region Utility Functions
// =================================================================================================

/**
 * Logs extension activity for debugging purposes.
 * @param {string} action - The action being performed.
 * @param {object} data - Additional data to log.
 */
function logActivity(action, data = {}) {
    console.log(`ToolScout Activity: ${action}`, data);
}
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // Store that user has been notified
        chrome.storage.local.set({ 
            affiliateDisclosureShown: true,
            installDate: new Date().toISOString()
        });
        
        // Open a simple disclosure page
        chrome.tabs.create({
            url: 'disclosure.html'
        });
    }
});

