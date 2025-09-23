/**
 * ToolScout - Enhanced Background Script with eBay Integration
 * Now supports: Amazon, Home Depot, Leroy Merlin, and eBay
 */

'use strict';

// =================================================================================================
// Configuration
// =================================================================================================

const CONFIG = {
  EBAY_APP_ID: 'RachidEl-PriceDro-PRD-157177206-3983f679', // Replace with your actual App ID
  MAX_ALERTS: 50,
  CACHE_DURATION: 3600000, // 1 hour in milliseconds
  RETAILERS: ['amazon', 'homedepot', 'leroymerlin', 'ebay']
};

// eBay category IDs for tools
const EBAY_TOOL_CATEGORIES = {
  all: '631',           // Business & Industrial > Light Equipment & Tools
  powerTools: '3244',    // Power Tools
  handTools: '29525',    // Hand Tools
  gardenTools: '29518',  // Yard, Garden & Outdoor Living
  automotive: '6000'     // Automotive Tools
};

// =================================================================================================
// Price Extraction Functions
// =================================================================================================

const extractors = {
  amazon: (data) => {
    const price = data.querySelector('.a-price-whole, span.a-price.a-text-price.a-size-medium.apexPriceToPay, .a-price-offer-price')?.innerText;
    return price ? parseFloat(price.replace(/[^0-9.]/g, '')) : null;
  },
  
  homedepot: (data) => {
    const price = data.querySelector('.price-format__main-price, .price-detailed__full-price')?.innerText;
    return price ? parseFloat(price.replace(/[^0-9.]/g, '')) : null;
  },
  
  leroymerlin: (data) => {
    const price = data.querySelector('.xlarge, .price')?.innerText;
    return price ? parseFloat(price.replace(/[^0-9.]/g, '')) : null;
  },
  
  ebay: (data) => {
    // eBay data comes from API, not DOM
    return data.price ? parseFloat(data.price) : null;
  }
};

// =================================================================================================
// eBay API Integration
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
        console.log('Returning cached eBay results');
        return cached.data;
      }
    }

    try {
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

      // Add condition filter if specified
      if (options.condition) {
        params.append('itemFilter(0).name', 'Condition');
        params.append('itemFilter(0).value', options.condition);
      }

      // Add price range filter if specified
      if (options.minPrice) {
        params.append('itemFilter(1).name', 'MinPrice');
        params.append('itemFilter(1).value', options.minPrice);
      }
      if (options.maxPrice) {
        params.append('itemFilter(2).name', 'MaxPrice');
        params.append('itemFilter(2).value', options.maxPrice);
      }

      const url = `https://svcs.ebay.com/services/search/FindingService/v1?${params.toString()}`;
      const response = await fetch(url);
      const data = await response.json();

      // Parse and format the results
      const items = this.parseEbayResults(data);
      
      // Cache the results
      this.cache.set(cacheKey, {
        data: items,
        timestamp: Date.now()
      });

      return items;
    } catch (error) {
      console.error('eBay API error:', error);
      return [];
    }
  }

  /**
   * Parse eBay API response into a consistent format
   */
  parseEbayResults(data) {
    try {
      const response = data.findItemsByKeywordsResponse?.[0];
      if (!response || response.ack?.[0] !== 'Success') {
        return [];
      }

      const items = response.searchResult?.[0]?.item || [];
      
      return items.map(item => ({
        title: item.title?.[0] || 'Unknown Item',
        price: parseFloat(item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || 0),
        currency: item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || 'USD',
        shipping: parseFloat(item.shippingInfo?.[0]?.shippingServiceCost?.[0]?.__value__ || 0),
        condition: item.condition?.[0]?.conditionDisplayName?.[0] || 'Unknown',
        url: item.viewItemURL?.[0] || '',
        image: item.galleryURL?.[0] || '',
        endTime: item.listingInfo?.[0]?.endTime?.[0] || '',
        type: item.listingInfo?.[0]?.listingType?.[0] || 'Unknown',
        location: item.location?.[0] || 'Unknown',
        seller: {
          username: item.sellerInfo?.[0]?.sellerUserName?.[0] || 'Unknown',
          feedback: item.sellerInfo?.[0]?.feedbackScore?.[0] || 0,
          rating: item.sellerInfo?.[0]?.positiveFeedbackPercent?.[0] || 0
        }
      }));
    } catch (error) {
      console.error('Error parsing eBay results:', error);
      return [];
    }
  }

  /**
   * Get item details using Shopping API
   */
  async getItemDetails(itemId) {
    try {
      const params = new URLSearchParams({
        'appid': this.appId,
        'version': '967',
        'siteid': '0',
        'responseencoding': 'JSON',
        'callname': 'GetSingleItem',
        'ItemID': itemId,
        'IncludeSelector': 'Details,ItemSpecifics,Variations'
      });

      const url = `https://open.api.ebay.com/shopping?${params.toString()}`;
      const response = await fetch(url);
      const data = await response.json();

      return data.Item || null;
    } catch (error) {
      console.error('Error fetching item details:', error);
      return null;
    }
  }
}

// Initialize eBay API
const ebayAPI = new EbayAPI(CONFIG.EBAY_APP_ID);

// =================================================================================================
// Message Handling
// =================================================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request.action);

  switch (request.action) {
    case 'extractProductInfo':
      handleProductExtraction(request, sender, sendResponse);
      break;
      
    case 'searchEbay':
      handleEbaySearch(request, sendResponse);
      return true; // Keep channel open for async response
      
    case 'compareAllPrices':
      handlePriceComparison(request, sendResponse);
      return true; // Keep channel open for async response
      
    case 'saveAlert':
      handleSaveAlert(request.data, sendResponse);
      break;
      
    case 'getAlerts':
      handleGetAlerts(sendResponse);
      break;
      
    case 'deleteAlert':
      handleDeleteAlert(request.alertId, sendResponse);
      break;
      
    case 'checkPriceDrops':
      checkPriceDrops();
      sendResponse({ success: true });
      break;
      
    default:
      sendResponse({ error: 'Unknown action' });
  }
  
  return false;
});

// =================================================================================================
// Handler Functions
// =================================================================================================

/**
 * Handle eBay search requests
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
    console.error('eBay search error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Handle price comparison across all retailers
 */
async function handlePriceComparison(request, sendResponse) {
  try {
    const { productName, brand } = request;
    const searchQuery = `${brand} ${productName}`.trim();
    
    // Search eBay
    const ebayResults = await ebayAPI.searchTools(searchQuery, {
      limit: 5,
      condition: 'New',
      sortBy: 'PricePlusShippingLowest'
    });
    
    // Get best eBay price
    const ebayBestPrice = ebayResults.length > 0 ? {
      retailer: 'eBay',
      price: ebayResults[0].price + ebayResults[0].shipping,
      title: ebayResults[0].title,
      url: ebayResults[0].url,
      condition: ebayResults[0].condition,
      shipping: ebayResults[0].shipping,
      type: 'marketplace'
    } : null;
    
    // You can add searches for other retailers here
    // For now, returning eBay results
    const comparison = {
      query: searchQuery,
      timestamp: Date.now(),
      results: {
        ebay: ebayBestPrice,
        // Add other retailers as needed
      },
      alternatives: ebayResults.slice(0, 3) // Top 3 alternatives
    };
    
    sendResponse({
      success: true,
      data: comparison
    });
  } catch (error) {
    console.error('Price comparison error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Handle product extraction from current page
 */
function handleProductExtraction(request, sender, sendResponse) {
  const { url } = sender.tab;
  let retailer = null;
  
  // Detect retailer from URL
  if (url.includes('amazon.com')) retailer = 'amazon';
  else if (url.includes('homedepot.com')) retailer = 'homedepot';
  else if (url.includes('leroymerlin.fr')) retailer = 'leroymerlin';
  else if (url.includes('ebay.com')) retailer = 'ebay';
  
  if (!retailer) {
    sendResponse({ error: 'Unsupported website' });
    return;
  }
  
  // Store current product info
  const productInfo = {
    retailer,
    url,
    title: request.data.title,
    price: request.data.price,
    timestamp: Date.now()
  };
  
  chrome.storage.local.set({ currentProduct: productInfo }, () => {
    sendResponse({ success: true, data: productInfo });
  });
}

/**
 * Handle saving price alerts
 */
function handleSaveAlert(alertData, sendResponse) {
  chrome.storage.local.get(['alerts'], (result) => {
    const alerts = result.alerts || [];
    
    if (alerts.length >= CONFIG.MAX_ALERTS) {
      sendResponse({ 
        success: false, 
        error: 'Maximum number of alerts reached' 
      });
      return;
    }
    
    // Add unique ID and timestamp
    const newAlert = {
      ...alertData,
      id: Date.now().toString(),
      createdAt: Date.now(),
      triggered: false
    };
    
    alerts.push(newAlert);
    
    chrome.storage.local.set({ alerts }, () => {
      sendResponse({ 
        success: true, 
        alert: newAlert 
      });
      
      // Set up periodic price checking
      schedulePriceChecking();
    });
  });
}

/**
 * Handle getting all alerts
 */
function handleGetAlerts(sendResponse) {
  chrome.storage.local.get(['alerts'], (result) => {
    sendResponse({ 
      success: true, 
      alerts: result.alerts || [] 
    });
  });
}

/**
 * Handle deleting an alert
 */
function handleDeleteAlert(alertId, sendResponse) {
  chrome.storage.local.get(['alerts'], (result) => {
    const alerts = (result.alerts || []).filter(a => a.id !== alertId);
    
    chrome.storage.local.set({ alerts }, () => {
      sendResponse({ success: true });
    });
  });
}

// =================================================================================================
// Price Monitoring
// =================================================================================================

/**
 * Check for price drops on all alerts
 */
async function checkPriceDrops() {
  const { alerts } = await chrome.storage.local.get(['alerts']);
  if (!alerts || alerts.length === 0) return;
  
  for (const alert of alerts) {
    try {
      // Search eBay for current prices
      const results = await ebayAPI.searchTools(alert.productName, {
        limit: 1,
        condition: 'New',
        sortBy: 'PricePlusShippingLowest'
      });
      
      if (results.length > 0) {
        const currentPrice = results[0].price + results[0].shipping;
        
        // Check if price dropped below target
        if (currentPrice < alert.targetPrice && !alert.triggered) {
          // Send notification
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon-128.png',
            title: 'Price Drop Alert! 🎉',
            message: `${alert.productName} is now $${currentPrice} on eBay (target: $${alert.targetPrice})`
          });
          
          // Mark alert as triggered
          alert.triggered = true;
          alert.triggeredPrice = currentPrice;
          alert.triggeredDate = Date.now();
        }
      }
    } catch (error) {
      console.error('Error checking price for alert:', error);
    }
  }
  
  // Save updated alerts
  chrome.storage.local.set({ alerts });
}

/**
 * Schedule periodic price checking
 */
function schedulePriceChecking() {
  // Set up alarm to check prices every 6 hours
  chrome.alarms.create('checkPrices', {
    periodInMinutes: 360 // 6 hours
  });
}

// Listen for alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkPrices') {
    checkPriceDrops();
  }
});

// =================================================================================================
// Initialization
// =================================================================================================

console.log('ToolScout with eBay integration initialized');

// Check prices on startup
checkPriceDrops();