/**
 * ToolScout Content Script - Product Extraction
 * Works on Amazon, Home Depot, Leroy Merlin, and eBay
 */

(function() {
  'use strict';
  
  // Detect which site we're on
  const hostname = window.location.hostname;
  let retailer = null;
  
  if (hostname.includes('amazon.com')) retailer = 'amazon';
  else if (hostname.includes('homedepot.com')) retailer = 'homedepot';
  else if (hostname.includes('leroymerlin.fr')) retailer = 'leroymerlin';
  else if (hostname.includes('ebay.com')) retailer = 'ebay';
  
  if (!retailer) return;
  
  // Product extractors for each retailer
  const extractors = {
    amazon: () => {
      const title = document.querySelector('#productTitle, h1.a-size-large')?.innerText?.trim();
      const priceWhole = document.querySelector('.a-price-whole')?.innerText;
      const priceFraction = document.querySelector('.a-price-fraction')?.innerText || '00';
      const priceAlt = document.querySelector('.a-price.a-text-price.a-size-medium.apexPriceToPay, .a-price-offer-price')?.innerText;
      
      let price = null;
      if (priceWhole) {
        price = parseFloat(priceWhole.replace(/[^0-9.]/g, '') + '.' + priceFraction.replace(/[^0-9]/g, ''));
      } else if (priceAlt) {
        price = parseFloat(priceAlt.replace(/[^0-9.]/g, ''));
      }
      
      const image = document.querySelector('#landingImage, #imgBlkFront, .a-dynamic-image')?.src;
      const brand = document.querySelector('#bylineInfo, .product-by-line')?.innerText?.replace('Brand: ', '').replace('Visit the ', '').replace(' Store', '');
      
      return { title, price, image, brand };
    },
    
    homedepot: () => {
      const title = document.querySelector('h1.product-details__title, .product-header__title')?.innerText?.trim();
      const priceElement = document.querySelector('.price-format__main-price, .price-detailed__full-price');
      const price = priceElement ? parseFloat(priceElement.innerText.replace(/[^0-9.]/g, '')) : null;
      const image = document.querySelector('.mediagallery__mainimage img, .media-gallery__main-image img')?.src;
      const brand = document.querySelector('.product-header__brand, .product-details__brand')?.innerText?.trim();
      
      return { title, price, image, brand };
    },
    
    leroymerlin: () => {
      const title = document.querySelector('h1.xlarge, h1.product-title')?.innerText?.trim();
      const priceElement = document.querySelector('.xlarge, .price, .product-price');
      const price = priceElement ? parseFloat(priceElement.innerText.replace(/[^0-9,]/g, '').replace(',', '.')) : null;
      const image = document.querySelector('.mc-product-media-container img, .product-image img')?.src;
      const brand = document.querySelector('.mc-product-brand, .product-brand')?.innerText?.trim();
      
      return { title, price, image, brand };
    },
    
    ebay: () => {
      // eBay has different layouts for different listing types
      const title = document.querySelector('.x-item-title__mainTitle, .it-ttl, h1.it-ttl, .vi-VR-txtCtr h1')?.innerText?.trim() ||
                   document.querySelector('[data-testid="x-item-title"]')?.innerText?.trim();
      
      // Price extraction - eBay has many price formats
      let price = null;
      const priceSelectors = [
        '.x-price-primary span.ux-textspans--BOLD',
        '.x-price-approx__price span.ux-textspans--BOLD',
        '.vi-VR-priceBox-now',
        '.prc-now',
        '[data-testid="x-price-primary"] span',
        '.x-bin-price__content span.ux-textspans--BOLD',
        'span.notranslate[itemprop="price"]',
        '.vi-price-value span'
      ];
      
      for (const selector of priceSelectors) {
        const priceElement = document.querySelector(selector);
        if (priceElement) {
          const priceText = priceElement.innerText || priceElement.textContent;
          const extracted = priceText.match(/[\d,]+\.?\d*/);
          if (extracted) {
            price = parseFloat(extracted[0].replace(/,/g, ''));
            break;
          }
        }
      }
      
      // Get shipping cost if available
      let shipping = 0;
      const shippingElement = document.querySelector('.vi-acc-del-range b, .vi-shp-free, [data-testid="x-shipping-delivery"] span');
      if (shippingElement) {
        const shippingText = shippingElement.innerText;
        if (!shippingText.toLowerCase().includes('free')) {
          const shippingMatch = shippingText.match(/[\d,]+\.?\d*/);
          if (shippingMatch) {
            shipping = parseFloat(shippingMatch[0].replace(/,/g, ''));
          }
        }
      }
      
      // Get item condition
      const condition = document.querySelector('.u-flL.condText, .vi-cond-txt, [data-testid="x-item-condition"]')?.innerText?.trim() || 'Unknown';
      
      // Get image
      const image = document.querySelector('.ux-image-carousel-item.active img, #icImg, .vi-image-gallery__main-image img')?.src ||
                   document.querySelector('[data-testid="x-picture-primary"] img')?.src;
      
      // Get seller info
      const sellerName = document.querySelector('.x-sellercard-atf__info__about-seller a, .si-inner .mbg-nw')?.innerText?.trim();
      const sellerRating = document.querySelector('.x-sellercard-atf__data-item span, .si-fb')?.innerText?.match(/\d+/)?.[0];
      
      // Get item number (useful for API calls)
      const itemNumber = window.location.pathname.match(/\/(\d+)/)?.[1] || 
                        document.querySelector('.vi-VR-itmcd, .iti-act-num')?.innerText?.replace(/[^0-9]/g, '');
      
      // Determine listing type
      const listingType = document.querySelector('.vi-notify-new-bg-dBtm') ? 'Auction' : 'Buy It Now';
      
      return { 
        title, 
        price, 
        shipping,
        totalPrice: price + shipping,
        condition,
        image, 
        brand: null, // eBay doesn't always show brand prominently
        seller: {
          name: sellerName,
          rating: sellerRating
        },
        itemNumber,
        listingType
      };
    }
  };
  
  // Extract product information
  function extractProductInfo() {
    const extractor = extractors[retailer];
    if (!extractor) return null;
    
    try {
      const productInfo = extractor();
      return {
        ...productInfo,
        retailer,
        url: window.location.href,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('ToolScout: Error extracting product info:', error);
      return null;
    }
  }
  
  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractProduct') {
      const productInfo = extractProductInfo();
      if (productInfo) {
        // Send to background script to store
        chrome.runtime.sendMessage({
          action: 'extractProductInfo',
          data: productInfo
        }, (response) => {
          sendResponse(response);
        });
      } else {
        sendResponse({ success: false, error: 'Could not extract product information' });
      }
      return true; // Keep channel open for async response
    }
  });
  
  // Auto-extract on page load for supported product pages
  window.addEventListener('load', () => {
    // Check if we're on a product page
    const isProductPage = (
      (retailer === 'amazon' && window.location.pathname.includes('/dp/')) ||
      (retailer === 'homedepot' && window.location.pathname.includes('/p/')) ||
      (retailer === 'leroymerlin' && window.location.pathname.includes('/p/')) ||
      (retailer === 'ebay' && window.location.pathname.includes('/itm/'))
    );
    
    if (isProductPage) {
      setTimeout(() => {
        const productInfo = extractProductInfo();
        if (productInfo) {
          // Store in background
          chrome.runtime.sendMessage({
            action: 'extractProductInfo',
            data: productInfo
          });
          
          // Add ToolScout indicator to page
          addToolScoutIndicator(productInfo);
        }
      }, 1000); // Wait for page to fully load
    }
  });
  
  // Add visual indicator that ToolScout is active
  function addToolScoutIndicator(productInfo) {
    // Don't add multiple indicators
    if (document.getElementById('toolscout-indicator')) return;
    
    const indicator = document.createElement('div');
    indicator.id = 'toolscout-indicator';
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 25px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      z-index: 99999;
      cursor: pointer;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.3s ease;
    `;
    
    indicator.innerHTML = `
      <span style="font-size: 18px;">🔧</span>
      <span>ToolScout Active</span>
      ${productInfo.price ? `<span style="opacity: 0.9;">| $${productInfo.price.toFixed(2)}</span>` : ''}
    `;
    
    indicator.addEventListener('mouseenter', () => {
      indicator.style.transform = 'scale(1.05)';
      indicator.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
    });
    
    indicator.addEventListener('mouseleave', () => {
      indicator.style.transform = 'scale(1)';
      indicator.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
    });
    
    indicator.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openPopup' });
    });
    
    document.body.appendChild(indicator);
    
    // Auto-hide after 5 seconds, show on hover
    setTimeout(() => {
      indicator.style.opacity = '0.3';
      indicator.addEventListener('mouseenter', () => {
        indicator.style.opacity = '1';
      });
      indicator.addEventListener('mouseleave', () => {
        indicator.style.opacity = '0.3';
      });
    }, 5000);
  }
})();