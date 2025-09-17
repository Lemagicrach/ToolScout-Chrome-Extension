/**
 * @file popup.js
 * @description ToolScout Extension - FIXED VERSION with Working Affiliate Links
 * Replace your entire popup.js with this code
 */

(() => {
    'use strict';

    // =================================================================================================
    // AMAZON AFFILIATE CONFIGURATION - CHANGE THIS TO YOUR TAG!
    // =================================================================================================
    amazonTags: {
    'amazon.com': 'toolscout-20',      // Replace with your actual tags
    'amazon.co.uk': 'toolscout-21',   
    'amazon.de': 'toolscout01-21',
    // ... etc
}
}
    // =================================================================================================
    // UI Elements references
    // =================================================================================================
    
    const UIElements = {
        productTitle: document.getElementById('product-title'),
        sitePrice: document.getElementById('site-price'),
        comparisonList: document.getElementById('comparison-list'),
        setAlertButton: document.getElementById('set-alert')
    };

    let currentProductData = null;

    // Mock price data for comparisons
    const MOCK_PRICE_DATA = {
        'amazon.com': {
            'drill': { 'homedepot.com': '$89.00', 'leroymerlin.fr': '$105.00' },
            'hammer': { 'homedepot.com': '$45.00', 'leroymerlin.fr': '$48.00' },
            'saw': { 'homedepot.com': '$125.00', 'leroymerlin.fr': '$119.00' }
        },
        'homedepot.com': {
            'drill': { 'amazon.com': '$99.00', 'leroymerlin.fr': '$105.00' },
            'hammer': { 'amazon.com': '$42.00', 'leroymerlin.fr': '$48.00' },
            'saw': { 'amazon.com': '$130.00', 'leroymerlin.fr': '$119.00' }
        },
        'leroymerlin.fr': {
            'drill': { 'amazon.com': '$99.00', 'homedepot.com': '$89.00' },
            'hammer': { 'amazon.com': '$42.00', 'homedepot.com': '$45.00' },
            'saw': { 'amazon.com': '$130.00', 'homedepot.com': '$125.00' }
        }
    };

    // =================================================================================================
    // AFFILIATE BUTTON FUNCTION - This is the main function to add your Amazon button
    // =================================================================================================
    
    function addAmazonAffiliateButton() {
        // Only add if we have Amazon product data
        if (!currentProductData || !currentProductData.url || !currentProductData.url.includes('amazon')) {
            console.log('Not an Amazon product, skipping affiliate button');
            return;
        }

        // Check if button already exists
        if (document.getElementById('amazon-affiliate-btn')) {
            console.log('Affiliate button already exists');
            return;
        }

        // Create affiliate URL with your tag
        const affiliateUrl = currentProductData.url + 
                           (currentProductData.url.includes('?') ? '&' : '?') + 
                           'tag=' + AMAZON_TAG;

        // Create button HTML
        const buttonHTML = `
            <div id="affiliate-button-container" style="margin: 20px 0; padding: 15px; background: #FFF3E0; border-radius: 10px; border: 2px solid #FF9900;">
                <a id="amazon-affiliate-btn" 
                   href="${affiliateUrl}" 
                   target="_blank" 
                   style="display: block;
                          background: linear-gradient(135deg, #FF9900 0%, #FF6600 100%);
                          color: white;
                          padding: 14px 24px;
                          text-align: center;
                          border-radius: 25px;
                          text-decoration: none;
                          font-weight: bold;
                          font-size: 16px;
                          box-shadow: 0 4px 15px rgba(255, 153, 0, 0.3);
                          transition: all 0.3s ease;">
                    🛒 View Deal on Amazon →
                </a>
                <p style="font-size: 11px; color: #666; text-align: center; margin: 8px 0 0 0;">
                    We earn from qualifying purchases (Amazon Associate)
                </p>
            </div>
        `;

        // Add to comparison list
        if (UIElements.comparisonList) {
            UIElements.comparisonList.insertAdjacentHTML('beforeend', buttonHTML);
            
            // Track clicks
            const button = document.getElementById('amazon-affiliate-btn');
            if (button) {
                button.addEventListener('click', () => {
                    console.log('Affiliate link clicked:', affiliateUrl);
                    trackAffiliateClick();
                });
            }
        }

        console.log('✅ Amazon affiliate button added with tag:', AMAZON_TAG);
    }

    // Track affiliate clicks
    function trackAffiliateClick() {
        try {
            chrome.storage.local.get(['affiliateClicks'], (result) => {
                const clicks = result.affiliateClicks || [];
                clicks.push({
                    product: currentProductData.title || 'Unknown',
                    price: currentProductData.price || 'N/A',
                    timestamp: new Date().toISOString(),
                    url: currentProductData.url
                });
                
                chrome.storage.local.set({ 
                    affiliateClicks: clicks.slice(-100),
                    totalClicks: clicks.length 
                });
                
                console.log('Click tracked. Total clicks:', clicks.length);
            });
        } catch (error) {
            console.error('Error tracking click:', error);
        }
    }

    // Utility functions
    function getProductCategory(title) {
        if (!title) return 'drill';
        const titleLower = title.toLowerCase();
        if (titleLower.includes('drill')) return 'drill';
        if (titleLower.includes('hammer')) return 'hammer';
        if (titleLower.includes('saw')) return 'saw';
        return 'drill';
    }

    function parsePrice(priceString) {
        if (!priceString) return 0;
        return parseFloat(priceString.replace(/[^0-9.]/g, '')) || 0;
    }

    function formatPrice(price) {
        if (typeof price === 'number') {
            return `$${price.toFixed(2)}`;
        }
        return price || 'N/A';
    }

    function getSimplifiedDomain(hostname) {
        if (!hostname) return '';
        if (hostname.includes('amazon')) return 'amazon.com';
        if (hostname.includes('homedepot')) return 'homedepot.com';
        if (hostname.includes('leroymerlin')) return 'leroymerlin.fr';
        return hostname;
    }

    function formatRetailerName(domain) {
        const names = {
            'amazon.com': 'Amazon',
            'homedepot.com': 'Home Depot',
            'leroymerlin.fr': 'Leroy Merlin'
        };
        return names[domain] || domain;
    }

    // Generate comparison data
    function generateComparisonData(productData) {
        if (!productData) return [];

        const currentSite = getSimplifiedDomain(productData.retailer);
        const productCategory = getProductCategory(productData.title);
        const currentPrice = parsePrice(productData.price);

        let comparisons = [];
        
        if (MOCK_PRICE_DATA[currentSite] && MOCK_PRICE_DATA[currentSite][productCategory]) {
            const mockData = MOCK_PRICE_DATA[currentSite][productCategory];
            
            for (const [retailer, price] of Object.entries(mockData)) {
                const compPrice = parsePrice(price);
                comparisons.push({
                    retailer: formatRetailerName(retailer),
                    price: price,
                    numericPrice: compPrice,
                    savings: currentPrice - compPrice
                });
            }
        } else {
            const retailers = [
                { name: 'Amazon', domain: 'amazon.com' },
                { name: 'Home Depot', domain: 'homedepot.com' },
                { name: 'Leroy Merlin', domain: 'leroymerlin.fr' }
            ].filter(r => !productData.retailer.includes(r.domain.split('.')[0]));

            retailers.forEach(retailer => {
                const variation = 0.8 + Math.random() * 0.4;
                const compPrice = currentPrice * variation;
                comparisons.push({
                    retailer: retailer.name,
                    price: formatPrice(compPrice),
                    numericPrice: compPrice,
                    savings: currentPrice - compPrice
                });
            });
        }

        comparisons.sort((a, b) => a.numericPrice - b.numericPrice);
        return comparisons;
    }

    // Update UI
    function updateUI(data) {
        if (!data) return;
        
        if (UIElements.productTitle) {
            UIElements.productTitle.textContent = data.title || 'Product not found';
        }
        if (UIElements.sitePrice) {
            UIElements.sitePrice.textContent = data.price || 'N/A';
        }
    }

    function updateUIForError(message) {
        if (UIElements.productTitle) {
            UIElements.productTitle.textContent = message;
        }
        if (UIElements.sitePrice) {
            UIElements.sitePrice.textContent = "N/A";
        }
        if (UIElements.setAlertButton) {
            UIElements.setAlertButton.disabled = true;
            UIElements.setAlertButton.textContent = "Unavailable";
        }
    }

    // Display comparisons
    function displayActualComparisons(comparisons) {
        if (!UIElements.comparisonList || !comparisons) return;

        UIElements.comparisonList.innerHTML = '';
        
        // Add current retailer info
        if (currentProductData) {
            const currentRetailer = document.createElement('div');
            currentRetailer.style.cssText = 'font-size: 12px; color: #657786; margin-bottom: 10px;';
            currentRetailer.textContent = `Current: ${formatRetailerName(getSimplifiedDomain(currentProductData.retailer))}`;
            UIElements.comparisonList.appendChild(currentRetailer);
        }
        
        const comparisonContainer = document.createElement('div');
        comparisonContainer.style.cssText = 'margin-top: 10px;';
        
        comparisons.forEach((comp) => {
            const item = document.createElement('div');
            item.style.cssText = `
                padding: 10px;
                margin-bottom: 8px;
                background: white;
                border: 1px solid #e1e8ed;
                border-radius: 6px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                transition: all 0.2s ease;
            `;
            
            const retailerName = document.createElement('span');
            retailerName.style.cssText = 'font-weight: 600; color: #14171a;';
            retailerName.textContent = comp.retailer;
            
            const priceContainer = document.createElement('div');
            priceContainer.style.cssText = 'text-align: right;';
            
            const price = document.createElement('div');
            price.style.cssText = 'font-weight: 700; color: #1da1f2;';
            price.textContent = comp.price;
            
            const savings = document.createElement('div');
            savings.style.cssText = 'font-size: 11px; color: #17bf63;';
            if (comp.savings > 0) {
                savings.textContent = `Save ${formatPrice(comp.savings)}`;
            } else if (comp.savings < 0) {
                savings.style.color = '#e0245e';
                savings.textContent = `+${formatPrice(Math.abs(comp.savings))}`;
            }
            
            priceContainer.appendChild(price);
            if (comp.savings !== 0) {
                priceContainer.appendChild(savings);
            }
            
            item.appendChild(retailerName);
            item.appendChild(priceContainer);
            comparisonContainer.appendChild(item);
        });
        
        UIElements.comparisonList.appendChild(comparisonContainer);
        
        // Add best deal summary if found
        const bestDeal = comparisons[0];
        if (bestDeal && bestDeal.savings > 0) {
            const summary = document.createElement('div');
            summary.style.cssText = `
                margin-top: 12px;
                padding: 10px;
                background: linear-gradient(135deg, #17BF63 0%, #20d976 100%);
                color: white;
                border-radius: 8px;
                text-align: center;
                font-weight: 600;
            `;
            summary.textContent = `💰 Best deal: Save ${formatPrice(bestDeal.savings)} at ${bestDeal.retailer}!`;
            UIElements.comparisonList.appendChild(summary);
        }
        
        // ADD THE AMAZON AFFILIATE BUTTON HERE!
        addAmazonAffiliateButton();
    }

    function displayPriceComparisons() {
        if (!currentProductData || !UIElements.comparisonList) return;

        UIElements.comparisonList.innerHTML = '';
        
        const loading = document.createElement('li');
        loading.style.cssText = 'list-style: none; color: #999; font-style: italic;';
        loading.textContent = 'Checking other retailers...';
        UIElements.comparisonList.appendChild(loading);
        
        setTimeout(() => {
            const comparisons = generateComparisonData(currentProductData);
            displayActualComparisons(comparisons);
        }, 1000);
    }

    function showInstructions() {
        if (!UIElements.comparisonList) return;
        
        const instructions = document.createElement('div');
        instructions.innerHTML = `
            <p style="font-size: 12px; color: #657786; margin: 10px 0; line-height: 1.5;">
                <strong>How to use:</strong><br>
                1. Navigate to a product page<br>
                2. Click the ToolScout icon<br>
                3. View price comparisons instantly!
            </p>
        `;
        UIElements.comparisonList.innerHTML = '';
        UIElements.comparisonList.appendChild(instructions);
    }

    function showSupportedSites() {
        if (!UIElements.comparisonList) return;
        
        const supportedList = document.createElement('div');
        supportedList.innerHTML = `
            <p style="font-size: 12px; color: #657786; margin: 10px 0;">
                <strong>Supported sites:</strong><br>
                • Amazon (all regions)<br>
                • Home Depot<br>
                • Leroy Merlin
            </p>
        `;
        UIElements.comparisonList.innerHTML = '';
        UIElements.comparisonList.appendChild(supportedList);
    }

    // Main function to load product data
    function loadProductData() {
        updateUI({ title: "Scanning page...", price: "..." });
        
        if (UIElements.setAlertButton) {
            UIElements.setAlertButton.textContent = "Loading...";
            UIElements.setAlertButton.disabled = true;
        }

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0] || !tabs[0].id) {
                updateUIForError("Could not identify the active tab.");
                return;
            }

            const supportedSites = ['amazon.', 'homedepot.', 'leroymerlin.'];
            const currentUrl = tabs[0].url || '';
            const isSupported = supportedSites.some(site => currentUrl.includes(site));

            if (!isSupported) {
                updateUIForError("This site is not supported yet.");
                showSupportedSites();
                return;
            }

            chrome.tabs.sendMessage(tabs[0].id, { action: "getProductData" }, (response) => {
                if (chrome.runtime.lastError) {
                    updateUIForError("Please refresh the page and try again.");
                    console.warn("ToolScout:", chrome.runtime.lastError.message);
                    return;
                }

                if (!response || !response.title || response.title === "Product not found") {
                    updateUIForError("No product found on this page.");
                    showInstructions();
                    return;
                }

                if (!response.url || !response.url.startsWith('http')) {
                    updateUIForError("Invalid product page.");
                    return;
                }

                currentProductData = response;
                console.log('Product data loaded:', currentProductData);
                
                updateUI(currentProductData);
                displayPriceComparisons();
                checkIfAlertExists();
            });
        });
    }

    // Handle alert button click
    function handleSetAlertClick() {
        if (!currentProductData) {
            console.error("No product data available.");
            return;
        }

        if (!UIElements.setAlertButton) return;

        UIElements.setAlertButton.textContent = "Saving...";
        UIElements.setAlertButton.disabled = true;

        chrome.runtime.sendMessage({ 
            action: "saveAlert", 
            data: currentProductData 
        }, (response) => {
            if (chrome.runtime.lastError) {
                UIElements.setAlertButton.textContent = "Error!";
                console.error("Connection error:", chrome.runtime.lastError.message);
                setTimeout(() => {
                    UIElements.setAlertButton.textContent = "🔔 Set Price Alert";
                    UIElements.setAlertButton.disabled = false;
                }, 2000);
                return;
            }

            if (!response || !response.success) {
                const errorMessage = response ? response.error : "Unknown error";
                
                if (errorMessage.includes("already exists")) {
                    UIElements.setAlertButton.textContent = "✅ Alert Set!";
                } else {
                    UIElements.setAlertButton.textContent = "Error!";
                    setTimeout(() => {
                        UIElements.setAlertButton.textContent = "🔔 Set Price Alert";
                        UIElements.setAlertButton.disabled = false;
                    }, 2000);
                }
            } else {
                UIElements.setAlertButton.textContent = "✅ Alert Set!";
            }
        });
    }

    // Check if alert exists
    function checkIfAlertExists() {
        if (!currentProductData || !currentProductData.url || !UIElements.setAlertButton) {
            if (UIElements.setAlertButton) {
                UIElements.setAlertButton.disabled = true;
                UIElements.setAlertButton.textContent = "Invalid Data";
            }
            return;
        }

        chrome.storage.local.get("alerts", (result) => {
            if (chrome.runtime.lastError) {
                console.error("Error checking alerts:", chrome.runtime.lastError);
                UIElements.setAlertButton.textContent = "🔔 Set Price Alert";
                UIElements.setAlertButton.disabled = false;
                return;
            }

            const alerts = result.alerts || [];
            const isAlertSet = alerts.some(alert => alert.url === currentProductData.url);

            if (isAlertSet) {
                UIElements.setAlertButton.textContent = "✅ Alert Set!";
                UIElements.setAlertButton.disabled = true;
            } else {
                UIElements.setAlertButton.textContent = "🔔 Set Price Alert";
                UIElements.setAlertButton.disabled = false;
            }
        });
    }

    // Initialize
    function initialize() {
        const missingElements = Object.entries(UIElements)
            .filter(([, element]) => !element)
            .map(([key]) => key);

        if (missingElements.length > 0) {
            console.error("Missing DOM elements:", missingElements);
        }

        if (UIElements.setAlertButton) {
            UIElements.setAlertButton.addEventListener('click', handleSetAlertClick);
        }

        loadProductData();
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    // Debug functions
    window.ToolScoutDebug = {
        currentProductData: () => currentProductData,
        checkAffiliateTag: () => console.log('Your Amazon tag is:', AMAZON_TAG),
        testAffiliateButton: () => addAmazonAffiliateButton()
    };

})();