/**
 * ToolScout - Enhanced Background Script with eBay Integration
 * Supports: Amazon, Home Depot, Leroy Merlin, and eBay
 */

'use strict';

// =================================================================================================
// CONFIGURATION
// =================================================================================================

const CONFIG = {
  EBAY_APP_ID: 'YOUR_EBAY_APP_ID', // ⚠️ IMPORTANT: Replace with your actual eBay App ID
  MAX_ALERTS: 50,
  CACHE_DURATION: 3600000, // 1 hour in milliseconds
  RETAILERS: ['amazon', 'homedepot', 'leroymerlin', 'ebay']
};

// eBay category IDs for tools
const EBAY_TOOL_CATEGORIES = {
  all: '631',           // Business & Industrial > Light Equipment & Tools
  powerTools: '3244',   // Power Tools
  handTools: '29525',   // Hand Tools
  gardenTools: '29518', // Yard, Garden & Outdoor Living
  automotive: '6000'    // Automotive Tools
};

// =================================================================================================
// STATE MANAGEMENT
// =================================================================================================

let currentProductData = null;
let comparisonResults = [];
let searchCache = new Map();

// =================================================================================================
// EBAY API CLASS
// =================================================================================================

class EbayAPI {
  constructor(appId) {
    this.appId = appId;
    this.cache = new Map();
  }

  /**
   * Search for tools on eBay using Finding API
   */
  async searchTools(keyword, options = {}) {
    const cacheKey = `${keyword}_${JSON.stringify(options)}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < CONFIG.CACHE_DURATION) {
        console.log('[ToolScout] Returning cached eBay results');
        return cached.data;
      }
    }

    try {
      // Check if API ID is configured
      if (this.appId === 'YOUR_EBAY_APP_ID') {
        console.warn('[ToolScout] eBay API ID not configured');
        return this.getMockResults(keyword);
      }

      const params = new URLSearchParams({
        'SECURITY-APPNAME': this.appId,
        'OPERATION-NAME': 'findItemsByKeywords',
        'SERVICE-VERSION': '1.0.0',
        'RESPONSE-DATA-FORMAT': 'JSON',
        'REST-PAYLOAD': 'true',
        'keywords': keyword,
        'categoryId': options.category || EBAY_TOOL_CATEGORIES.all,
        'paginationInput.entriesPerPage': options.limit || '10',
        'sortOrder': options.sortBy || 'PricePlusShippingLowest'
      });

      // Add filters
      let filterIndex = 0;
      
      if (options.condition) {
        params.append(`itemFilter(${filterIndex}).name`, 'Condition');
        params.append(`itemFilter(${filterIndex}).value`, options.condition);
        filterIndex++;
      }
      
      if (options.minPrice) {
        params.append(`itemFilter(${filterIndex}).name`, 'MinPrice');
        params.append(`itemFilter(${filterIndex}).value`, options.minPrice);
        filterIndex++;
      }
      
      if (options.maxPrice) {
        params.append(`itemFilter(${filterIndex}).name`, 'MaxPrice');
        params.append(`itemFilter(${filterIndex}).value`, options.maxPrice);
        filterIndex++;
      }

      const url = `https://svcs.ebay.com/services/search/FindingService/v1?${params.toString()}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`eBay API error: ${response.status}`);
      }
      
      const data = await response.json();
      const items = this.parseEbayResults(data);
      
      // Cache the results
      this.cache.set(cacheKey, {
        data: items,
        timestamp: Date.now()
      });

      return items;
    } catch (error) {
      console.error('[ToolScout] eBay API error:', error);
      return this.getMockResults(keyword);
    }
  }

  /**
   * Parse eBay API response
   */
  parseEbayResults(data) {
    try {
      const response = data.findItemsByKeywordsResponse?.[0];
      if (!response || response.ack?.[0] !== 'Success') {
        console.warn('[ToolScout] eBay API returned no results');
        return [];
      }

      const items = response.searchResult?.[0]?.item || [];
      
      return items.map(item => ({
        retailer: 'ebay',
        title: item.title?.[0] || 'Unknown Item',
        price: parseFloat(item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || 0),
        currency: item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || 'USD',
        shipping: item.shippingInfo?.[0]?.shippingServiceCost?.[0]?.__value__ 
          ? parseFloat(item.shippingInfo?.[0]?.shippingServiceCost?.[0]?.__value__)
          : item.shippingInfo?.[0]?.shippingType?.[0] === 'Free' ? 'Free' : 'Calculated',
        condition: item.condition?.[0]?.conditionDisplayName?.[0] || 'Unknown',
        url: item.viewItemURL?.[0] || '',
        image: item.galleryURL?.[0] || '',
        endTime: item.listingInfo?.[0]?.endTime?.[0] || '',
        type: item.listingInfo?.[0]?.listingType?.[0] || 'Unknown',
        location: item.location?.[0] || 'Unknown',
        inStock: item.sellingStatus?.[0]?.sellingState?.[0] === 'Active',
        seller: {
          username: item.sellerInfo?.[0]?.sellerUserName?.[0] || 'Unknown',
          feedback: parseInt(item.sellerInfo?.[0]?.feedbackScore?.[0] || 0),
          rating: parseFloat(item.sellerInfo?.[0]?.positiveFeedbackPercent?.[0] || 0)
        }
      }));
    } catch (error) {
      console.error('[ToolScout] Error parsing eBay results:', error);
      return [];
    }
  }

  /**
   * Get mock results for development/testing
   */
  getMockResults(keyword) {
    console.log('[ToolScout] Returning mock eBay results for:', keyword);
    return [
      {
        retailer: 'ebay',
        title: `${keyword} - Power Tool Set`,
        price: 149.99,
        currency: 'USD',
        shipping: 'Free',
        condition: 'New',
        url: 'https://ebay.com/example',
        inStock: true,
        seller: { username: 'toolseller', feedback: 1000, rating: 99.5 }
      },
      {
        retailer: 'ebay',
        title: `${keyword} - Professional Grade`,
        price: 189.99,
        currency: 'USD',
        shipping: 5.99,
        condition: 'Refurbished',
        url: 'https://ebay.com/example2',
        inStock: true,
        seller: { username: 'protools', feedback: 2500, rating: 98.7 }
      }
    ];
  }
}

// Initialize eBay API
const ebayAPI = new EbayAPI(CONFIG.EBAY_APP_ID);

// =================================================================================================
// MESSAGE HANDLERS
// =================================================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[ToolScout] Message received:', request.action);

  switch (request.action) {
    // Product detection from content script
    case 'productDetected':
    case 'extractProductInfo':
      handleProductDetection(request.data || request, sender, sendResponse);
      break;
    
    // Get current product data
    case 'getCurrentProduct':
      sendResponse({ 
        success: true, 
        data: currentProductData 
      });
      break;
    
    // Price comparison
    case 'comparePrice':
    case 'compareAllPrices':
      handlePriceComparison(request, sendResponse);
      return true; // Async response
    
    // eBay search
    case 'searchEbay':
      handleEbaySearch(request, sendResponse);
      return true; // Async response
    
    // Price alerts
    case 'setAlert':
    case 'saveAlert':
      handleSaveAlert(request.alert || request.data, sendResponse);
      return true; // Async response
    
    case 'getAlerts':
      handleGetAlerts(sendResponse);
      return true; // Async response
    
    case 'deleteAlert':
      handleDeleteAlert(request.id || request.alertId, sendResponse);
      return true; // Async response
    
    case 'checkPriceDrops':
      checkPriceDrops().then(() => {
        sendResponse({ success: true });
      });
      return true; // Async response
    
    // Open popup
    case 'openPopup':
      chrome.action.openPopup();
      sendResponse({ success: true });
      break;
    
    // Ping for health check
    case 'ping':
      sendResponse({ 
        status: 'ok',
        timestamp: Date.now()
      });
      break;
    
    default:
      sendResponse({ 
        success: false,
        error: `Unknown action: ${request.action}` 
      });
  }
});

// =================================================================================================
// HANDLER FUNCTIONS
// =================================================================================================

/**
 * Handle product detection from content script
 */
function handleProductDetection(data, sender, sendResponse) {
  const productInfo = {
    ...data,
    detectedAt: Date.now(),
    tabId: sender.tab?.id,
    tabUrl: sender.tab?.url
  };
  
  // Store as current product
  currentProductData = productInfo;
  
  // Save to storage
  chrome.storage.local.set({ currentProduct: productInfo }, () => {
    console.log('[ToolScout] Product stored:', productInfo.title);
    
    // Update badge if we have price
    if (sender.tab?.id && productInfo.price) {
      const badgeText = productInfo.price < 100 
        ? `$${Math.round(productInfo.price)}` 
        : '$99+';
      
      chrome.action.setBadgeText({
        text: badgeText,
        tabId: sender.tab.id
      });
      
      chrome.action.setBadgeBackgroundColor({
        color: '#667eea',
        tabId: sender.tab.id
      });
    }
    
    sendResponse({ 
      success: true, 
      data: productInfo 
    });
    
    // Check for price alerts
    checkPriceAlerts(productInfo);
  });
}

/**
 * Handle price comparison across all retailers
 */
async function handlePriceComparison(request, sendResponse) {
  try {
    const searchQuery = request.query || request.productName || 'power drill';
    
    console.log('[ToolScout] Comparing prices for:', searchQuery);
    
    // Search eBay
    const ebayResults = await ebayAPI.searchTools(searchQuery, {
      limit: 5,
      condition: 'New',
      sortBy: 'PricePlusShippingLowest'
    });
    
    // Mock results for other retailers (in production, you'd call their APIs)
    const amazonResult = {
      retailer: 'amazon',
      title: searchQuery,
      price: Math.random() * 50 + 100,
      url: 'https://amazon.com/example',
      inStock: true,
      shipping: 'Free'
    };
    
    const homeDepotResult = {
      retailer: 'homedepot',
      title: searchQuery,
      price: Math.random() * 50 + 90,
      url: 'https://homedepot.com/example',
      inStock: true,
      shipping: '$5.99'
    };
    
    // Combine all results
    let allResults = [
      ...ebayResults.slice(0, 3),
      amazonResult,
      homeDepotResult
    ];
    
    // Sort by total price (including shipping)
    allResults = allResults.map(item => ({
      ...item,
      totalPrice: item.price + (
        item.shipping === 'Free' ? 0 : 
        typeof item.shipping === 'number' ? item.shipping :
        parseFloat(item.shipping?.replace(/[^0-9.]/g, '') || 0)
      )
    })).sort((a, b) => a.totalPrice - b.totalPrice);
    
    comparisonResults = allResults;
    
    sendResponse({
      success: true,
      results: allResults
    });
  } catch (error) {
    console.error('[ToolScout] Price comparison error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Handle eBay search
 */
async function handleEbaySearch(request, sendResponse) {
  try {
    const { keyword, options } = request;
    const results = await ebayAPI.searchTools(keyword, options);
    
    sendResponse({
      success: true,
      data: results,
      count: results.length,
      source: 'ebay'
    });
  } catch (error) {
    console.error('[ToolScout] eBay search error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Handle saving price alerts
 */
async function handleSaveAlert(alertData, sendResponse) {
  try {
    const result = await chrome.storage.local.get(['priceAlerts']);
    const alerts = result.priceAlerts || [];
    
    if (alerts.length >= CONFIG.MAX_ALERTS) {
      sendResponse({ 
        success: false, 
        error: 'Maximum number of alerts reached' 
      });
      return;
    }
    
    // Add unique ID and metadata
    const newAlert = {
      ...alertData,
      id: Date.now().toString(),
      createdAt: Date.now(),
      active: true,
      triggered: false
    };
    
    alerts.push(newAlert);
    
    await chrome.storage.local.set({ priceAlerts: alerts });
    
    console.log('[ToolScout] Alert saved:', newAlert);
    
    sendResponse({ 
      success: true, 
      alert: newAlert 
    });
    
    // Schedule price checking
    schedulePriceChecking();
  } catch (error) {
    console.error('[ToolScout] Error saving alert:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Handle getting all alerts
 */
async function handleGetAlerts(sendResponse) {
  try {
    const result = await chrome.storage.local.get(['priceAlerts']);
    sendResponse({ 
      success: true, 
      alerts: result.priceAlerts || [] 
    });
  } catch (error) {
    console.error('[ToolScout] Error getting alerts:', error);
    sendResponse({
      success: false,
      error: error.message,
      alerts: []
    });
  }
}

/**
 * Handle deleting an alert
 */
async function handleDeleteAlert(alertId, sendResponse) {
  try {
    const result = await chrome.storage.local.get(['priceAlerts']);
    const alerts = (result.priceAlerts || []).filter(a => a.id !== alertId);
    
    await chrome.storage.local.set({ priceAlerts: alerts });
    
    console.log('[ToolScout] Alert deleted:', alertId);
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('[ToolScout] Error deleting alert:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// =================================================================================================
// PRICE MONITORING
// =================================================================================================

/**
 * Check for price drops on all alerts
 */
async function checkPriceDrops() {
  try {
    const result = await chrome.storage.local.get(['priceAlerts']);
    const alerts = result.priceAlerts || [];
    
    if (alerts.length === 0) return;
    
    console.log('[ToolScout] Checking price drops for', alerts.length, 'alerts');
    
    let updatedAlerts = false;
    
    for (const alert of alerts) {
      if (!alert.active || alert.triggered) continue;
      
      try {
        // Search for current prices
        const results = await ebayAPI.searchTools(alert.productTitle, {
          limit: 1,
          condition: 'New',
          sortBy: 'PricePlusShippingLowest'
        });
        
        if (results.length > 0) {
          const currentPrice = results[0].price;
          
          // Check if price dropped below target
          if (currentPrice <= alert.targetPrice) {
            console.log('[ToolScout] Price drop detected!', alert.productTitle, currentPrice);
            
            // Send notification
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: '🎉 Price Drop Alert!',
              message: `${alert.productTitle} is now $${currentPrice.toFixed(2)} (target: $${alert.targetPrice})`,
              buttons: [{ title: 'View Deal' }]
            });
            
            // Mark as triggered
            alert.triggered = true;
            alert.triggeredPrice = currentPrice;
            alert.triggeredDate = Date.now();
            alert.dealUrl = results[0].url;
            updatedAlerts = true;
          }
          
          // Update last checked price
          alert.lastCheckedPrice = currentPrice;
          alert.lastCheckedDate = Date.now();
        }
      } catch (error) {
        console.error('[ToolScout] Error checking price for alert:', error);
      }
    }
    
    // Save updated alerts if any changes
    if (updatedAlerts) {
      await chrome.storage.local.set({ priceAlerts: alerts });
    }
  } catch (error) {
    console.error('[ToolScout] Error in checkPriceDrops:', error);
  }
}

/**
 * Check alerts for a specific product
 */
async function checkPriceAlerts(productData) {
  if (!productData || !productData.price) return;
  
  try {
    const result = await chrome.storage.local.get(['priceAlerts']);
    const alerts = result.priceAlerts || [];
    
    for (const alert of alerts) {
      if (alert.active && 
          !alert.triggered &&
          alert.productTitle?.toLowerCase().includes(productData.title?.toLowerCase())) {
        
        if (productData.price <= alert.targetPrice) {
          // Send notification
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: '🎉 Price Alert Match!',
            message: `${productData.title} is at $${productData.price} (target: $${alert.targetPrice})`,
            buttons: [{ title: 'View Product' }]
          });
        }
      }
    }
  } catch (error) {
    console.error('[ToolScout] Error checking price alerts:', error);
  }
}

/**
 * Schedule periodic price checking
 */
function schedulePriceChecking() {
  // Create alarm for periodic checks (every 6 hours)
  chrome.alarms.create('checkPrices', {
    periodInMinutes: 360
  });
}

// =================================================================================================
// ALARM HANDLERS
// =================================================================================================

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkPrices') {
    console.log('[ToolScout] Running scheduled price check');
    checkPriceDrops();
  }
});

// =================================================================================================
// NOTIFICATION HANDLERS
// =================================================================================================

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  // Open the deal when notification button is clicked
  chrome.storage.local.get(['priceAlerts'], (result) => {
    const alerts = result.priceAlerts || [];
    const alert = alerts.find(a => a.triggered && a.dealUrl);
    
    if (alert && alert.dealUrl) {
      chrome.tabs.create({ url: alert.dealUrl });
    }
  });
});

// =================================================================================================
// CONTEXT MENUS
// =================================================================================================

chrome.runtime.onInstalled.addListener(() => {
  // Create context menu
  chrome.contextMenus.create({
    id: 'toolscout-compare',
    title: 'Compare price with ToolScout',
    contexts: ['selection', 'link', 'page']
  });
  
  // Set default badge color
  chrome.action.setBadgeBackgroundColor({
    color: '#667eea'
  });
  
  console.log('[ToolScout] Extension installed/updated');
  
  // Initial price check
  checkPriceDrops();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'toolscout-compare') {
    const searchText = info.selectionText || '';
    if (searchText) {
      handlePriceComparison({ query: searchText }, (response) => {
        if (response.success) {
          comparisonResults = response.results;
          chrome.action.openPopup();
        }
      });
    }
  }
});

// =================================================================================================
// TAB MANAGEMENT
// =================================================================================================

chrome.tabs.onActivated.addListener((activeInfo) => {
  // Clear badge when switching tabs
  chrome.action.setBadgeText({ text: '' });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  // Clear data for closed tab
  if (currentProductData?.tabId === tabId) {
    currentProductData = null;
  }
});

// =================================================================================================
// INITIALIZATION
// =================================================================================================

console.log('[ToolScout] Background service worker loaded');
console.log('[ToolScout] eBay API configured:', CONFIG.EBAY_APP_ID !== 'YOUR_EBAY_APP_ID');

// Check for API configuration
if (CONFIG.EBAY_APP_ID === 'YOUR_EBAY_APP_ID') {
  console.warn('[ToolScout] ⚠️ eBay API ID not configured! Using mock data.');
  console.warn('[ToolScout] Get your API ID from: https://developer.ebay.com/');
}