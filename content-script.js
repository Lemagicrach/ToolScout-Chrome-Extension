/**
 * @file content-script.js
 * @description This script is injected into web pages to extract product information.
 * Enhanced version with proper URL extraction and multi-site support.
 */

// Listen for a message from the popup script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getProductData") {
    const productData = scrapeProductData();
    sendResponse(productData);
  }
  // Return true to indicate you will send a response asynchronously
  return true;
});

/**
 * Scrapes the current page for product title, price, and URL.
 * Supports multiple retail websites with different selectors.
 * @returns {object} An object containing the product title, price, and URL.
 */
function scrapeProductData() {
  const currentUrl = window.location.href;
  const hostname = window.location.hostname;
  
  let title = "Product not found";
  let price = "Price not available";
  
  try {
    // Amazon sites
    if (hostname.includes('amazon.')) {
      const titleElement = document.getElementById('productTitle') || 
                          document.querySelector('[data-automation-id="product-title"]') ||
                          document.querySelector('h1.a-size-large');
      title = titleElement ? titleElement.innerText.trim() : "Product not found";
      
      const priceElement = document.querySelector('.a-price .a-offscreen') ||
                          document.querySelector('.a-price-whole') ||
                          document.querySelector('[data-automation-id="product-price"]');
      price = priceElement ? priceElement.innerText.trim() : "Price not available";
    }
    
    // Home Depot
    else if (hostname.includes('homedepot.')) {
      const titleElement = document.querySelector('[data-testid="product-header-title"]') ||
                          document.querySelector('h1[data-automation-id="product-title"]');
      title = titleElement ? titleElement.innerText.trim() : "Product not found";
      
      const priceElement = document.querySelector('[data-testid="price"]') ||
                          document.querySelector('.price-format__main-price');
      price = priceElement ? priceElement.innerText.trim() : "Price not available";
    }
    
    // Leroy Merlin
    else if (hostname.includes('leroymerlin.')) {
      const titleElement = document.querySelector('h1[data-testid="product-title"]') ||
                          document.querySelector('.product-title');
      title = titleElement ? titleElement.innerText.trim() : "Product not found";
      
      const priceElement = document.querySelector('[data-testid="product-price"]') ||
                          document.querySelector('.price-current');
      price = priceElement ? priceElement.innerText.trim() : "Price not available";
    }
    
    // Generic fallback for other sites
    else {
      const titleElement = document.querySelector('h1') ||
                          document.querySelector('[data-testid*="title"]') ||
                          document.querySelector('.product-title');
      title = titleElement ? titleElement.innerText.trim() : "Product not found";
      
      const priceElement = document.querySelector('[data-testid*="price"]') ||
                          document.querySelector('.price') ||
                          document.querySelector('[class*="price"]');
      price = priceElement ? priceElement.innerText.trim() : "Price not available";
    }
  } catch (error) {
    console.error('ToolScout: Error scraping product data:', error);
  }
  
  return { 
    title, 
    price, 
    url: currentUrl,
    retailer: hostname
  };
}

