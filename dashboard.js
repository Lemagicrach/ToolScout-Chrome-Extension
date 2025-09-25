/**
 * ToolScout Dashboard Script
 * Handles the dashboard page functionality
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[ToolScout Dashboard] Initializing...');
    
    // Load current product data
    loadCurrentProduct();
    
    // Load comparison results
    loadComparisonResults();
    
    // Load active alerts
    loadActiveAlerts();
});

async function loadCurrentProduct() {
    try {
        const result = await chrome.storage.local.get(['currentProduct']);
        const product = result.currentProduct;
        
        if (product) {
            document.getElementById('retailer').textContent = formatRetailerName(product.retailer || 'Unknown');
            document.getElementById('title').textContent = product.title || 'No product detected';
            document.getElementById('price').textContent = product.price ? 
                `$${product.price.toFixed(2)}` : 'Price not available';
        } else {
            document.getElementById('retailer').textContent = 'No product detected';
            document.getElementById('title').textContent = 'Visit a supported retailer to track products';
            document.getElementById('price').textContent = '--';
        }
    } catch (error) {
        console.error('[ToolScout Dashboard] Error loading product:', error);
        showError('Failed to load product data');
    }
}

async function loadComparisonResults() {
    try {
        // Send message to background script to get cached comparison results
        const response = await chrome.runtime.sendMessage({
            action: 'getComparisonResults'
        });
        
        const comparisonList = document.getElementById('comparison-list');
        
        if (response && response.results && response.results.length > 0) {
            let html = '';
            response.results.forEach((item, index) => {
                const savings = item.savings || 0;
                const savingsClass = savings > 0 ? 'savings-positive' : 'savings-negative';
                const savingsText = savings > 0 ? `Save $${savings.toFixed(2)}` : 
                                  savings < 0 ? `+$${Math.abs(savings).toFixed(2)}` : 'Same price';
                
                html += `
                    <li class="comparison-result-item" role="listitem">
                        <div class="result-retailer">
                            <span class="retailer-icon">${getRetailerIcon(item.retailer)}</span>
                            <span class="retailer-name">${formatRetailerName(item.retailer)}</span>
                        </div>
                        <div class="result-details">
                            <span class="result-price">$${item.price.toFixed(2)}</span>
                            <span class="result-savings ${savingsClass}">${savingsText}</span>
                            ${item.inStock ? '<span class="in-stock">✓ In Stock</span>' : '<span class="out-stock">Out of Stock</span>'}
                        </div>
                        <a href="${item.url}" 
                           class="view-deal-button" 
                           target="_blank" 
                           rel="noopener noreferrer"
                           aria-label="View deal at ${formatRetailerName(item.retailer)}">
                            View Deal →
                        </a>
                    </li>
                `;
            });
            comparisonList.innerHTML = html;
        } else {
            comparisonList.innerHTML = `
                <li class="no-data" role="listitem">
                    <p>No price comparisons available yet.</p>
                    <p>Visit a product page to start comparing prices.</p>
                </li>
            `;
        }
    } catch (error) {
        console.error('[ToolScout Dashboard] Error loading comparisons:', error);
        document.getElementById('comparison-list').innerHTML = 
            '<li class="error" role="listitem">Failed to load comparison data</li>';
    }
}

async function loadActiveAlerts() {
    try {
        const result = await chrome.storage.local.get(['priceAlerts']);
        const alerts = result.priceAlerts || [];
        
        const alertList = document.getElementById('alert-list');
        
        if (alerts.length > 0) {
            let html = '';
            alerts.forEach(alert => {
                const statusClass = alert.triggered ? 'triggered' : 'active';
                const statusText = alert.triggered ? 
                    `Triggered at $${alert.triggeredPrice}` : 
                    `Waiting for $${alert.targetPrice.toFixed(2)}`;
                
                html += `
                    <li class="alert-item ${statusClass}" role="listitem" data-id="${alert.id}">
                        <div class="alert-header">
                            <span class="alert-title">${alert.productTitle}</span>
                            <button class="delete-alert" 
                                    data-id="${alert.id}"
                                    aria-label="Delete alert for ${alert.productTitle}"
                                    title="Delete this alert">
                                ×
                            </button>
                        </div>
                        <div class="alert-details">
                            <span class="alert-status">${statusText}</span>
                            <span class="alert-retailer">${formatRetailerName(alert.retailer)}</span>
                            ${alert.triggered ? 
                                `<a href="${alert.dealUrl}" class="alert-link" target="_blank" rel="noopener">View Deal</a>` : 
                                `<span class="current-price">Current: $${(alert.lastCheckedPrice || alert.currentPrice || 0).toFixed(2)}</span>`
                            }
                        </div>
                    </li>
                `;
            });
            alertList.innerHTML = html;
            
            // Add delete handlers
            document.querySelectorAll('.delete-alert').forEach(button => {
                button.addEventListener('click', handleDeleteAlert);
            });
        } else {
            alertList.innerHTML = `
                <li class="no-data" role="listitem">
                    <p>No price alerts set.</p>
                    <p>Set alerts from the extension popup when viewing products.</p>
                </li>
            `;
        }
    } catch (error) {
        console.error('[ToolScout Dashboard] Error loading alerts:', error);
        document.getElementById('alert-list').innerHTML = 
            '<li class="error" role="listitem">Failed to load alerts</li>';
    }
}

async function handleDeleteAlert(event) {
    event.stopPropagation();
    const alertId = event.target.dataset.id;
    
    if (confirm('Delete this price alert?')) {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'deleteAlert',
                id: alertId
            });
            
            if (response.success) {
                // Reload alerts
                loadActiveAlerts();
                showNotification('Alert deleted successfully');
            }
        } catch (error) {
            console.error('[ToolScout Dashboard] Error deleting alert:', error);
            showError('Failed to delete alert');
        }
    }
}

function formatRetailerName(retailer) {
    const names = {
        'amazon': 'Amazon',
        'homedepot': 'Home Depot',
        'leroymerlin': 'Leroy Merlin',
        'ebay': 'eBay',
        'lowes': 'Lowe\'s'
    };
    return names[retailer] || retailer;
}

function getRetailerIcon(retailer) {
    const icons = {
        'amazon': '🛒',
        'homedepot': '🏠',
        'leroymerlin': '🔨',
        'ebay': '🏷️',
        'lowes': '🔧'
    };
    return icons[retailer] || '🛍️';
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#4caf50' : '#f44336'};
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function showError(message) {
    showNotification(message, 'error');
}

// Auto-refresh every 30 seconds
setInterval(() => {
    loadCurrentProduct();
    loadComparisonResults();
    loadActiveAlerts();
}, 30000);

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .comparison-result-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px;
        margin-bottom: 8px;
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        transition: all 0.2s ease;
    }
    
    .comparison-result-item:hover {
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        transform: translateX(4px);
    }
    
    .result-retailer {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
    }
    
    .retailer-icon {
        font-size: 20px;
    }
    
    .retailer-name {
        font-weight: 600;
        color: #1a202c;
    }
    
    .result-details {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        margin-right: 16px;
    }
    
    .result-price {
        font-size: 18px;
        font-weight: 700;
        color: #1a202c;
    }
    
    .result-savings {
        font-size: 12px;
        font-weight: 500;
        padding: 2px 6px;
        border-radius: 4px;
        margin-top: 4px;
    }
    
    .savings-positive {
        background: #e6ffed;
        color: #0d7523;
    }
    
    .savings-negative {
        background: #fef2f2;
        color: #b91c1c;
    }
    
    .in-stock {
        color: #0d7523;
        font-size: 11px;
        font-weight: 500;
    }
    
    .out-stock {
        color: #b91c1c;
        font-size: 11px;
        font-weight: 500;
    }
    
    .view-deal-button {
        padding: 8px 16px;
        background: linear-gradient(135deg, #4A90E2 0%, #357ABD 100%);
        color: white;
        text-decoration: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        transition: all 0.2s ease;
        white-space: nowrap;
    }
    
    .view-deal-button:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(74, 144, 226, 0.3);
    }
    
    .alert-item {
        padding: 12px;
        margin-bottom: 8px;
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        position: relative;
        transition: all 0.2s ease;
    }
    
    .alert-item.triggered {
        border-left: 4px solid #4caf50;
        background: #f0fff4;
    }
    
    .alert-item:hover {
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    
    .alert-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 8px;
    }
    
    .alert-title {
        font-weight: 600;
        color: #1a202c;
        flex: 1;
        margin-right: 8px;
    }
    
    .delete-alert {
        width: 24px;
        height: 24px;
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
    }
    
    .delete-alert:hover {
        transform: rotate(90deg);
        background: #dc2626;
    }
    
    .alert-details {
        display: flex;
        gap: 12px;
        font-size: 12px;
        color: #6b7280;
    }
    
    .alert-status {
        font-weight: 500;
    }
    
    .alert-link {
        color: #4A90E2;
        text-decoration: none;
        font-weight: 500;
    }
    
    .alert-link:hover {
        text-decoration: underline;
    }
    
    .no-data {
        text-align: center;
        padding: 24px;
        color: #6b7280;
        font-style: italic;
    }
    
    .error {
        text-align: center;
        padding: 16px;
        background: #fef2f2;
        color: #b91c1c;
        border-radius: 8px;
    }
`;
document.head.appendChild(style);

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.currentProduct) {
            loadCurrentProduct();
        }
        if (changes.priceAlerts) {
            loadActiveAlerts();
        }
    }
});

console.log('[ToolScout Dashboard] Ready');