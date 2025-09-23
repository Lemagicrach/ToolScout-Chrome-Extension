/**
 * ToolScout Popup Script with eBay Integration
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const searchInput = document.getElementById('searchInput');
  const searchButton = document.getElementById('searchButton');
  const resultsSection = document.getElementById('resultsSection');
  const resultsList = document.getElementById('resultsList');
  const currentProductSection = document.getElementById('currentProductSection');
  const compareButton = document.getElementById('compareButton');
  const tabs = document.querySelectorAll('.tab');
  const searchSection = document.getElementById('searchSection');
  const alertSection = document.getElementById('alertSection');
  const alertsList = document.getElementById('alertsList');
  const alertPriceInput = document.getElementById('alertPriceInput');
  const setAlertButton = document.getElementById('setAlertButton');
  
  let currentProduct = null;
  let currentSearchResults = [];

  // Initialize
  init();

  function init() {
    checkCurrentPage();
    loadAlerts();
    setupEventListeners();
  }

  // =================================================================================================
  // Event Listeners
  // =================================================================================================

  function setupEventListeners() {
    // Tab switching
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        const tabName = tab.dataset.tab;
        handleTabSwitch(tabName);
      });
    });

    // Search functionality
    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') performSearch();
    });

    // Compare button
    compareButton.addEventListener('click', compareCurrentProduct);

    // Alert functionality
    setAlertButton.addEventListener('click', setNewAlert);
  }

  // =================================================================================================
  // Tab Management
  // =================================================================================================

  function handleTabSwitch(tabName) {
    // Hide all sections first
    searchSection.style.display = 'none';
    alertSection.classList.remove('active');
    currentProductSection.style.display = 'none';
    resultsSection.style.display = 'none';

    switch(tabName) {
      case 'search':
        searchSection.style.display = 'block';
        break;
      case 'alerts':
        alertSection.classList.add('active');
        loadAlerts();
        break;
      case 'current':
        if (currentProduct) {
          currentProductSection.style.display = 'block';
        } else {
          currentProductSection.style.display = 'block';
          document.getElementById('currentTitle').textContent = 'No product detected on current page';
          document.getElementById('currentPrice').textContent = '--';
          compareButton.style.display = 'none';
        }
        break;
    }
  }

  // =================================================================================================
  // Current Page Detection
  // =================================================================================================

  async function checkCurrentPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab.url;
      
      // Check if we're on a supported retailer
      const supportedSites = ['amazon.com', 'homedepot.com', 'leroymerlin.fr', 'ebay.com'];
      const isSupported = supportedSites.some(site => url.includes(site));
      
      if (isSupported) {
        // Try to get product info from storage
        chrome.storage.local.get(['currentProduct'], (result) => {
          if (result.currentProduct && result.currentProduct.url === url) {
            currentProduct = result.currentProduct;
            displayCurrentProduct();
          } else {
            // Inject content script to extract product info
            chrome.tabs.sendMessage(tab.id, { action: 'extractProduct' }, (response) => {
              if (response && response.success) {
                currentProduct = response.data;
                displayCurrentProduct();
              }
            });
          }
        });
      }
    } catch (error) {
      console.error('Error checking current page:', error);
    }
  }

  function displayCurrentProduct() {
    if (!currentProduct) return;
    
    document.getElementById('currentTitle').textContent = currentProduct.title || 'Product detected';
    document.getElementById('currentPrice').textContent = currentProduct.price ? `$${currentProduct.price}` : 'Price unavailable';
    
    const retailerBadge = document.getElementById('currentRetailer');
    retailerBadge.textContent = currentProduct.retailer;
    retailerBadge.className = `retailer-badge retailer-${currentProduct.retailer}`;
    
    compareButton.style.display = 'block';
  }

  // =================================================================================================
  // Search Functionality
  // =================================================================================================

  async function performSearch() {
    const query = searchInput.value.trim();
    if (!query) return;
    
    searchButton.disabled = true;
    searchButton.textContent = 'Searching...';
    
    // Show loading state
    resultsSection.style.display = 'block';
    resultsList.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Searching all retailers...</div>';
    
    try {
      // Search eBay
      const response = await chrome.runtime.sendMessage({
        action: 'searchEbay',
        keyword: query,
        options: {
          limit: 10,
          condition: 'New',
          sortBy: 'PricePlusShippingLowest'
        }
      });
      
      if (response.success) {
        currentSearchResults = response.data;
        displayResults(response.data);
      } else {
        showError('Search failed. Please try again.');
      }
    } catch (error) {
      console.error('Search error:', error);
      showError('An error occurred during search.');
    } finally {
      searchButton.disabled = false;
      searchButton.textContent = 'Search All Retailers';
    }
  }

  async function compareCurrentProduct() {
    if (!currentProduct) return;
    
    compareButton.disabled = true;
    compareButton.textContent = 'Comparing...';
    
    // Show loading state
    resultsSection.style.display = 'block';
    resultsList.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Finding best prices...</div>';
    
    try {
      // Extract brand and product name from title
      const title = currentProduct.title || '';
      const words = title.split(' ');
      const brand = words[0]; // Simple brand extraction
      const productName = words.slice(1, 4).join(' '); // Take next few words
      
      const response = await chrome.runtime.sendMessage({
        action: 'compareAllPrices',
        productName: productName,
        brand: brand
      });
      
      if (response.success && response.data.alternatives) {
        displayResults(response.data.alternatives);
      } else {
        showError('No alternatives found.');
      }
    } catch (error) {
      console.error('Comparison error:', error);
      showError('Failed to compare prices.');
    } finally {
      compareButton.disabled = false;
      compareButton.textContent = 'Compare Prices Across All Stores';
    }
  }

  // =================================================================================================
  // Results Display
  // =================================================================================================

  function displayResults(results) {
    if (!results || results.length === 0) {
      resultsList.innerHTML = '<div class="no-results">No results found. Try a different search term.</div>';
      return;
    }
    
    // Sort by total price (price + shipping)
    results.sort((a, b) => (a.price + a.shipping) - (b.price + b.shipping));
    
    let html = '';
    results.forEach((item, index) => {
      const totalPrice = item.price + item.shipping;
      const isBestDeal = index === 0;
      
      html += `
        <div class="result-item" data-url="${item.url}">
          <div class="result-header">
            <div>
              <span class="result-retailer retailer-ebay">eBay</span>
              ${isBestDeal ? '<span class="best-deal">Best Deal</span>' : ''}
            </div>
            <div class="result-price">$${totalPrice.toFixed(2)}</div>
          </div>
          <div class="result-title">${item.title}</div>
          <div class="result-details">
            <span class="result-condition">${item.condition}</span>
            <span class="result-shipping">
              ${item.shipping > 0 ? `+$${item.shipping.toFixed(2)} shipping` : 'Free shipping'}
            </span>
            <span>${item.type}</span>
            ${item.seller ? `<span>Seller: ${item.seller.username} (${item.seller.rating}%)</span>` : ''}
          </div>
        </div>
      `;
    });
    
    resultsList.innerHTML = html;
    
    // Add click handlers to open items
    document.querySelectorAll('.result-item').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.dataset.url;
        if (url) chrome.tabs.create({ url });
      });
    });
  }

  function showError(message) {
    resultsList.innerHTML = `<div class="error-message">${message}</div>`;
  }

  // =================================================================================================
  // Price Alerts
  // =================================================================================================

  async function loadAlerts() {
    const response = await chrome.runtime.sendMessage({ action: 'getAlerts' });
    
    if (response.success && response.alerts.length > 0) {
      displayAlerts(response.alerts);
    } else {
      alertsList.innerHTML = '<div class="no-results">No price alerts set. Search for a product and set your target price!</div>';
    }
  }

  function displayAlerts(alerts) {
    let html = '';
    alerts.forEach(alert => {
      const statusClass = alert.triggered ? 'triggered' : 'active';
      const statusText = alert.triggered ? 
        `✅ Triggered at $${alert.triggeredPrice}` : 
        `⏰ Watching for $${alert.targetPrice}`;
      
      html += `
        <div class="result-item">
          <div class="result-header">
            <div class="result-title" style="color: #333;">${alert.productName}</div>
            <button class="delete-alert" data-id="${alert.id}" style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">×</button>
          </div>
          <div class="result-details">
            <span>${statusText}</span>
            <span>Created: ${new Date(alert.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      `;
    });
    
    alertsList.innerHTML = html;
    
    // Add delete handlers
    document.querySelectorAll('.delete-alert').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const alertId = btn.dataset.id;
        await chrome.runtime.sendMessage({ 
          action: 'deleteAlert', 
          alertId 
        });
        loadAlerts();
      });
    });
  }

  async function setNewAlert() {
    const targetPrice = parseFloat(alertPriceInput.value);
    const productName = searchInput.value.trim() || (currentProduct && currentProduct.title);
    
    if (!productName || !targetPrice) {
      alert('Please enter a product name and target price');
      return;
    }
    
    const response = await chrome.runtime.sendMessage({
      action: 'saveAlert',
      data: {
        productName,
        targetPrice,
        currentPrice: currentProduct ? currentProduct.price : null,
        retailer: 'all'
      }
    });
    
    if (response.success) {
      alertPriceInput.value = '';
      alert(`Price alert set! We'll notify you when ${productName} drops below $${targetPrice}`);
      loadAlerts();
    } else {
      alert(response.error || 'Failed to set alert');
    }
  }
});