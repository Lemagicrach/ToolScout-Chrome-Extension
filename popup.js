/**
 * ToolScout Popup Script
 * Handles UI interactions and communication with content/background scripts
 */

// =================================================================================================
// STATE MANAGEMENT
// =================================================================================================

let currentTab = 'search';
let currentProduct = null;
let comparisonResults = [];
let priceAlerts = [];

// =================================================================================================
// INITIALIZATION
// =================================================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[ToolScout] Popup initialized');
    
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
    
    // Build results HTML
    let html = '';
    results.forEach((result, index) => {
        const isBestDeal = index === 0;
        
        html += `
            <div class="result-item slide-in" data-url="${result.url}">
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
                </div>
            </div>
        `;
    });
    
    resultsList.innerHTML = html;
    
    // Add click handlers
    document.querySelectorAll('.result-item').forEach(item => {
        item.addEventListener('click', () => {
            const url = item.dataset.url;
            if (url) {
                chrome.tabs.create({ url: url });
            }
        });
    });
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
    } else {
        titleElement.textContent = 'No product detected';
        priceElement.textContent = '--';
        retailerElement.textContent = 'Unknown';
        retailerElement.className = 'retailer-badge';
        compareButton.disabled = true;
    }
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
        html += `
            <div class="alert-item" data-id="${alert.id}">
                <button class="delete-alert" data-id="${alert.id}">×</button>
                <div style="font-weight: 600; margin-bottom: 4px;">${alert.productTitle}</div>
                <div style="font-size: 12px; color: #6c7293;">
                    Target: $${alert.targetPrice.toFixed(2)} | 
                    Current: $${(alert.currentPrice || 0).toFixed(2)} | 
                    ${getRetailerName(alert.retailer)}
                </div>
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