/**
 * ToolScout Popup Script - ENHANCED VERSION
 * Includes Amazon Affiliate Link Integration
 */

// =================================================================================================
// STATE MANAGEMENT
// =================================================================================================

let currentTab = 'search';
let currentProduct = null;
let comparisonResults = [];
let priceAlerts = [];
let affiliateSettings = {
    amazonTag: 'toolscout-20',
    showAffiliateButton: true,
    enabledPrograms: ['amazon']
};

// =================================================================================================
// INITIALIZATION
// =================================================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[ToolScout] Popup initialized');
    
    // Load affiliate settings
    await loadAffiliateSettings();
    
    // Setup event listeners
    setupTabNavigation();
    setupSearchSection();
    setupAlertSection();
    setupCurrentProductSection();
    
    // Load initial data
    await loadCurrentProduct();
    await loadPriceAlerts();
    
    // Check if we're on a supported site
    checkCurrentSite();
});

// =================================================================================================
// AFFILIATE SETTINGS
// =================================================================================================

async function loadAffiliateSettings() {
    try {
        const settings = await chrome.storage.sync.get({
            amazonTag: 'toolscout-20',
            showAffiliateButton: true,
            enableAmazon: true,
            enableHomeDepot: true,
            enableEbay: true,
            enableLeroyMerlin: true
        });
        
        affiliateSettings.amazonTag = settings.amazonTag;
        affiliateSettings.showAffiliateButton = settings.showAffiliateButton;
        affiliateSettings.enabledPrograms = [];
        
        if (settings.enableAmazon) affiliateSettings.enabledPrograms.push('amazon');
        if (settings.enableHomeDepot) affiliateSettings.enabledPrograms.push('homedepot');
        if (settings.enableEbay) affiliateSettings.enabledPrograms.push('ebay');
        if (settings.enableLeroyMerlin) affiliateSettings.enabledPrograms.push('leroymerlin');
        
    } catch (error) {
        console.error('[ToolScout] Error loading affiliate settings:', error);
    }
}

// =================================================================================================
// AMAZON AFFILIATE LINK GENERATION
// =================================================================================================

function generateAmazonAffiliateLink(productUrl, productASIN = null) {
    // Extract ASIN from URL if not provided
    if (!productASIN && productUrl) {
        const asinMatch = productUrl.match(/\/dp\/([A-Z0-9]{10})|\/gp\/product\/([A-Z0-9]{10})/);
        productASIN = asinMatch ? (asinMatch[1] || asinMatch[2]) : null;
    }
    
    if (!productASIN) {
        return productUrl; // Return original URL if no ASIN found
    }
    
    // Generate affiliate link with tag
    const affiliateUrl = `https://www.amazon.com/dp/${productASIN}?tag=${affiliateSettings.amazonTag}`;
    
    return affiliateUrl;
}

// =================================================================================================
// EBAY PARTNER NETWORK LINK GENERATION
// =================================================================================================

function generateEbayAffiliateLink(itemUrl) {
    // eBay Partner Network (EPN) requires a campaign ID
    // This is a placeholder - you need to register with EPN
    const campaignId = '5338984293'; // Replace with your actual EPN campaign ID
    const customId = 'toolscout'; // Custom tracking ID
    
    // Create rover link (eBay's redirect service)
    const roverBase = 'https://rover.ebay.com/rover/1/711-53200-19255-0/1';
    const params = new URLSearchParams({
        icep_id: '114',
        ipn: 'psmain',
        icep_vectorid: '229466',
        kwid: '902099',
        mtid: '824',
        kw: 'lg',
        icep_item: '',
        icep_sellerId: '',
        icep_ex_kw: '',
        icep_sortBy: '12',
        icep_catId: '',
        icep_minPrice: '',
        icep_maxPrice: '',
        ipn: 'psmain',
        icep_merchantid: '115193',
        ipn: 'psmain',
        toolid: '10001',
        campid: campaignId,
        customid: customId,
        mpre: encodeURIComponent(itemUrl)
    });
    
    return `${roverBase}?${params.toString()}`;
}

// =================================================================================================
// TAB NAVIGATION
// =================================================================================================

function setupTabNavigation() {
    const tabs = document.querySelectorAll('.tab');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchToTab(tabName);
        });
    });
}

function switchToTab(tabName) {
    currentTab = tabName;
    
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    // Show/hide sections
    document.getElementById('searchSection').classList.toggle('hidden', tabName !== 'search');
    document.getElementById('alertSection').classList.toggle('hidden', tabName !== 'alerts');
    document.getElementById('currentProductSection').classList.toggle('hidden', tabName !== 'current');
    
    // Hide results when switching tabs
    if (tabName !== 'search') {
        document.getElementById('resultsSection').classList.add('hidden');
    }
}

// =================================================================================================
// CURRENT SITE CHECK
// =================================================================================================

async function checkCurrentSite() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.url) return;
        
        const supportedSites = ['amazon.com', 'homedepot.com', 'leroymerlin.fr', 'ebay.com'];
        const hostname = new URL(tab.url).hostname.toLowerCase();
        
        const isSupported = supportedSites.some(site => hostname.includes(site));
        
        if (isSupported) {
            // Try to extract product data from current page
            chrome.tabs.sendMessage(tab.id, { action: 'getProductData' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log('Content script not ready:', chrome.runtime.lastError);
                    return;
                }
                
                if (response && response.success && response.price) {
                    updateCurrentProduct(response);
                    // Auto-switch to current tab if product detected
                    switchToTab('current');
                }
            });
        }
    } catch (error) {
        console.error('[ToolScout] Error checking current site:', error);
    }
}

// =================================================================================================
// SEARCH SECTION
// =================================================================================================

function setupSearchSection() {
    const searchButton = document.getElementById('searchButton');
    const searchInput = document.getElementById('searchInput');
    
    searchButton.addEventListener('click', performSearch);
    
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
}

async function performSearch() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput.value.trim();
    
    if (!query) {
        showNotification('Please enter a product to search', 'error');
        return;
    }
    
    const searchButton = document.getElementById('searchButton');
    const resultsSection = document.getElementById('resultsSection');
    const resultsList = document.getElementById('resultsList');
    
    // Show loading state
    searchButton.disabled = true;
    searchButton.innerHTML = '<span>Searching...</span>';
    resultsSection.classList.remove('hidden');
    resultsList.innerHTML = `
        <div class="loading">
            <div class="loading-spinner"></div>
            <div class="loading-text">Searching across retailers...</div>
        </div>
    `;
    
    try {
        // Send search request to background script
        const response = await chrome.runtime.sendMessage({
            action: 'comparePrice',
            query: query
        });
        
        if (response.success) {
            displaySearchResults(response.results);
        } else {
            throw new Error(response.error || 'Search failed');
        }
    } catch (error) {
        console.error('[ToolScout] Search error:', error);
        resultsList.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">❌</div>
                <div>Search failed. Please try again.</div>
            </div>
        `;
    } finally {
        searchButton.disabled = false;
        searchButton.innerHTML = '<span>Search All Retailers</span>';
    }
}

function displaySearchResults(results) {
    const resultsList = document.getElementById('resultsList');
    
    if (!results || results.length === 0) {
        resultsList.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">🔍</div>
                <div>No results found. Try a different search term.</div>
            </div>
        `;
        return;
    }
    
    comparisonResults = results;
    
    // Build results HTML with affiliate links
    let html = '';
    results.forEach((result, index) => {
        const isBestDeal = index === 0;
        let finalUrl = result.url;
        
        // Generate affiliate links based on retailer
        if (result.retailer === 'amazon' && affiliateSettings.showAffiliateButton) {
            finalUrl = generateAmazonAffiliateLink(result.url);
        } else if (result.retailer === 'ebay') {
            finalUrl = generateEbayAffiliateLink(result.url);
        }
        
        html += `
            <div class="result-item slide-in" data-url="${finalUrl}" data-retailer="${result.retailer}">
                ${isBestDeal ? '<div class="best-deal">BEST DEAL</div>' : ''}
                <div class="result-header-row">
                    <span class="retailer-badge retailer-${result.retailer}">
                        ${getRetailerName(result.retailer)}
                    </span>
                    <span class="result-price">$${result.price.toFixed(2)}</span>
                </div>
                <div class="result-title">${result.title}</div>
                <div class="result-details">
                    <span class="detail-badge ${result.inStock ? '' : 'out-of-stock'}">
                        ${result.inStock ? '✓ In Stock' : '✗ Out of Stock'}
                    </span>
                    <span class="detail-badge shipping-badge">
                        📦 ${result.shipping || 'Shipping varies'}
                    </span>
                    ${result.retailer === 'amazon' || result.retailer === 'ebay' ? 
                        '<span class="detail-badge affiliate-badge">💰 Affiliate</span>' : ''}
                </div>
            </div>
        `;
    });
    
    resultsList.innerHTML = html;
    
    // Add click handlers with tracking
    document.querySelectorAll('.result-item').forEach(item => {
        item.addEventListener('click', async () => {
            const url = item.dataset.url;
            const retailer = item.dataset.retailer;
            
            // Track affiliate click
            if (retailer === 'amazon' || retailer === 'ebay') {
                await trackAffiliateClick(retailer, url);
            }
            
            if (url) {
                chrome.tabs.create({ url: url });
            }
        });
    });
}

// =================================================================================================
// AFFILIATE CLICK TRACKING
// =================================================================================================

async function trackAffiliateClick(retailer, url) {
    try {
        // Get existing analytics
        const result = await chrome.storage.local.get('clickAnalytics');
        const analytics = result.clickAnalytics || [];
        
        // Add new click
        analytics.push({
            retailer: retailer,
            url: url,
            timestamp: Date.now(),
            productTitle: currentProduct?.title || 'Unknown',
            affiliateTag: retailer === 'amazon' ? affiliateSettings.amazonTag : 'ebay-partner'
        });
        
        // Keep only last 1000 clicks
        if (analytics.length > 1000) {
            analytics.splice(0, analytics.length - 1000);
        }
        
        // Save updated analytics
        await chrome.storage.local.set({ clickAnalytics: analytics });
        
        console.log('[ToolScout] Affiliate click tracked:', retailer);
    } catch (error) {
        console.error('[ToolScout] Error tracking click:', error);
    }
}

// =================================================================================================
// CURRENT PRODUCT SECTION
// =================================================================================================

function setupCurrentProductSection() {
    const compareButton = document.getElementById('compareButton');
    
    compareButton.addEventListener('click', async () => {
        if (currentProduct && currentProduct.title) {
            // Switch to search tab
            switchToTab('search');
            
            // Fill search input with current product
            const searchInput = document.getElementById('searchInput');
            searchInput.value = currentProduct.title;
            
            // Perform search
            await performSearch();
        }
    });
}

async function loadCurrentProduct() {
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'getCurrentProduct'
        });
        
        if (response.success && response.data) {
            updateCurrentProduct(response.data);
        }
    } catch (error) {
        console.error('[ToolScout] Error loading current product:', error);
    }
}

function updateCurrentProduct(productData) {
    currentProduct = productData;
    
    const titleElement = document.getElementById('currentTitle');
    const priceElement = document.getElementById('currentPrice');
    const retailerElement = document.getElementById('currentRetailer');
    const compareButton = document.getElementById('compareButton');
    
    if (productData && productData.title) {
        titleElement.textContent = productData.title;
        priceElement.textContent = productData.price ? 
            `$${productData.price.toFixed(2)}` : 'Price not available';
        retailerElement.textContent = getRetailerName(productData.retailer);
        retailerElement.className = `retailer-badge retailer-${productData.retailer}`;
        compareButton.disabled = false;
        
        // Add Amazon View Deal button if on Amazon
        if (productData.retailer === 'amazon' && affiliateSettings.showAffiliateButton) {
            addAmazonAffiliateButton(productData);
        }
    } else {
        titleElement.textContent = 'No product detected';
        priceElement.textContent = '--';
        retailerElement.textContent = 'Unknown';
        retailerElement.className = 'retailer-badge';
        compareButton.disabled = true;
    }
}

// =================================================================================================
// AMAZON AFFILIATE BUTTON
// =================================================================================================

function addAmazonAffiliateButton(productData) {
    // Remove existing button if present
    const existingButton = document.getElementById('amazonAffiliateButton');
    if (existingButton) {
        existingButton.remove();
    }
    
    // Create affiliate button
    const affiliateButton = document.createElement('a');
    affiliateButton.id = 'amazonAffiliateButton';
    affiliateButton.href = generateAmazonAffiliateLink(productData.url);
    affiliateButton.target = '_blank';
    affiliateButton.className = 'amazon-affiliate-button';
    affiliateButton.style.cssText = `
        display: block;
        width: calc(100% - 32px);
        margin: 16px;
        padding: 14px;
        background: linear-gradient(135deg, #FF9900 0%, #FF6600 100%);
        color: white;
        text-align: center;
        text-decoration: none;
        border-radius: 12px;
        font-weight: 700;
        font-size: 14px;
        transition: all 0.2s ease;
        box-shadow: 0 4px 15px rgba(255, 153, 0, 0.3);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    `;
    affiliateButton.innerHTML = '🛒 View Deal on Amazon';
    
    // Add click tracking
    affiliateButton.addEventListener('click', () => {
        trackAffiliateClick('amazon', affiliateButton.href);
    });
    
    // Insert after compare button
    const currentProductSection = document.getElementById('currentProductSection');
    currentProductSection.appendChild(affiliateButton);
    
    // Add disclosure
    const disclosure = document.createElement('div');
    disclosure.style.cssText = `
        text-align: center;
        font-size: 10px;
        color: #6c7293;
        margin: -8px 16px 8px;
        opacity: 0.8;
    `;
    disclosure.textContent = 'We earn from qualifying purchases';
    currentProductSection.appendChild(disclosure);
}

// =================================================================================================
// PRICE ALERTS SECTION
// =================================================================================================

function setupAlertSection() {
    const setAlertButton = document.getElementById('setAlertButton');
    
    setAlertButton.addEventListener('click', async () => {
        const priceInput = document.getElementById('alertPriceInput');
        const targetPrice = parseFloat(priceInput.value);
        
        if (!targetPrice || targetPrice <= 0) {
            showNotification('Please enter a valid target price', 'error');
            return;
        }
        
        if (!currentProduct || !currentProduct.title) {
            showNotification('Please visit a product page first', 'error');
            return;
        }
        
        try {
            const alert = {
                productTitle: currentProduct.title,
                productUrl: currentProduct.url,
                targetPrice: targetPrice,
                currentPrice: currentProduct.price,
                retailer: currentProduct.retailer
            };
            
            const response = await chrome.runtime.sendMessage({
                action: 'setAlert',
                alert: alert
            });
            
            if (response.success) {
                showNotification('Price alert set successfully!', 'success');
                priceInput.value = '';
                await loadPriceAlerts();
            } else {
                throw new Error(response.error || 'Failed to set alert');
            }
        } catch (error) {
            console.error('[ToolScout] Error setting alert:', error);
            showNotification('Failed to set price alert', 'error');
        }
    });
}

async function loadPriceAlerts() {
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'getAlerts'
        });
        
        if (response.success) {
            displayPriceAlerts(response.alerts);
        }
    } catch (error) {
        console.error('[ToolScout] Error loading alerts:', error);
    }
}

function displayPriceAlerts(alerts) {
    const alertsList = document.getElementById('alertsList');
    
    if (!alerts || alerts.length === 0) {
        alertsList.innerHTML = '<div style="text-align: center; color: #6c7293; padding: 20px;">No price alerts set</div>';
        return;
    }
    
    priceAlerts = alerts;
    
    let html = '';
    alerts.forEach(alert => {
        const isAmazon = alert.retailer === 'amazon';
        const isEbay = alert.retailer === 'ebay';
        
        html += `
            <div class="alert-item" data-id="${alert.id}">
                <button class="delete-alert" data-id="${alert.id}">×</button>
                <div style="font-weight: 600; margin-bottom: 4px;">${alert.productTitle}</div>
                <div style="font-size: 12px; color: #6c7293;">
                    Target: $${alert.targetPrice.toFixed(2)} | 
                    Current: $${(alert.currentPrice || 0).toFixed(2)} | 
                    ${getRetailerName(alert.retailer)}
                    ${isAmazon || isEbay ? ' | 💰 Affiliate' : ''}
                </div>
                ${alert.triggered ? `
                    <a href="${isAmazon ? generateAmazonAffiliateLink(alert.dealUrl) : 
                               isEbay ? generateEbayAffiliateLink(alert.dealUrl) : 
                               alert.dealUrl}" 
                       target="_blank" 
                       style="color: #4facfe; font-size: 12px; text-decoration: none; font-weight: 600;">
                       View Deal →
                    </a>
                ` : ''}
            </div>
        `;
    });
    
    alertsList.innerHTML = html;
    
    // Add delete handlers
    document.querySelectorAll('.delete-alert').forEach(button => {
        button.addEventListener('click', async (e) => {
            e.stopPropagation();
            const alertId = button.dataset.id;
            await deleteAlert(alertId);
        });
    });
}

async function deleteAlert(alertId) {
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'deleteAlert',
            id: alertId
        });
        
        if (response.success) {
            await loadPriceAlerts();
            showNotification('Alert deleted', 'success');
        }
    } catch (error) {
        console.error('[ToolScout] Error deleting alert:', error);
        showNotification('Failed to delete alert', 'error');
    }
}

// =================================================================================================
// SETTINGS
// =================================================================================================

document.getElementById('settingsBtn')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

// =================================================================================================
// UTILITY FUNCTIONS
// =================================================================================================

function getRetailerName(retailer) {
    const names = {
        'amazon': 'Amazon',
        'homedepot': 'Home Depot',
        'leroymerlin': 'Leroy Merlin',
        'ebay': 'eBay'
    };
    return names[retailer] || retailer;
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type} slide-in`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#ff6b6b' : '#4facfe'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 100000;
        font-size: 14px;
        font-weight: 500;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// =================================================================================================
// ERROR HANDLING
// =================================================================================================

window.addEventListener('error', (event) => {
    console.error('[ToolScout] Popup error:', event.error);
});

// =================================================================================================
// STARTUP MESSAGE
// =================================================================================================

console.log('[ToolScout] Popup v2.3.0 loaded with affiliate support');
console.log('[ToolScout] Amazon Tag:', affiliateSettings.amazonTag);
console.log('[ToolScout] Affiliate Programs:', affiliateSettings.enabledPrograms);