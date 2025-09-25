/**
 * ToolScout Affiliate Manager
 * Handles Amazon Associates and eBay Partner Network integration
 */

class AffiliateManager {
  constructor() {
    // Replace these with your actual affiliate IDs
    this.affiliateIds = {
      amazon: {
        US: 'Toolscout20-20',  // Replace with your Amazon Associates tag
        UK: 'Toolscout20-21',  // Different tags for different regions
        CA: 'Toolscout20-22',
        DE: 'Toolscout20-23',
        FR: 'Toolscout20-24'
      },
      ebay: {
        campid: 'YOUR_EBAY_CAMPID',  // Your eBay Partner Network Campaign ID
        customid: 'toolscout',        // Custom tracking parameter
        siteid: {
          US: '0',    // eBay US
          UK: '3',    // eBay UK
          DE: '77',   // eBay Germany
          FR: '71',   // eBay France
          CA: '2'     // eBay Canada
        }
      }
    };
    
    this.loadAffiliateSettings();
  }

  /**
   * Load affiliate settings from storage
   */
  async loadAffiliateSettings() {
    try {
      const settings = await chrome.storage.sync.get(['affiliateSettings']);
      if (settings.affiliateSettings) {
        this.affiliateIds = { ...this.affiliateIds, ...settings.affiliateSettings };
      }
    } catch (error) {
      console.error('[ToolScout] Error loading affiliate settings:', error);
    }
  }

  /**
   * Save affiliate settings to storage
   */
  async saveAffiliateSettings(settings) {
    try {
      await chrome.storage.sync.set({ affiliateSettings: settings });
      this.affiliateIds = { ...this.affiliateIds, ...settings };
    } catch (error) {
      console.error('[ToolScout] Error saving affiliate settings:', error);
    }
  }

  /**
   * Create Amazon affiliate link
   */
  createAmazonAffiliateLink(originalUrl, region = 'US') {
    try {
      const url = new URL(originalUrl);
      const hostname = url.hostname.toLowerCase();
      
      // Detect region from hostname
      if (hostname.includes('.co.uk')) region = 'UK';
      else if (hostname.includes('.ca')) region = 'CA';
      else if (hostname.includes('.de')) region = 'DE';
      else if (hostname.includes('.fr')) region = 'FR';
      
      const tag = this.affiliateIds.amazon[region];
      if (!tag || tag.includes('YOUR_')) {
        console.warn('[ToolScout] Amazon affiliate tag not configured for region:', region);
        return originalUrl;
      }
      
      // Extract ASIN from various Amazon URL formats
      const asin = this.extractAmazonASIN(originalUrl);
      if (!asin) {
        // If no ASIN found, just add tag parameter
        url.searchParams.set('tag', tag);
        return url.toString();
      }
      
      // Create clean affiliate link
      const baseUrl = `https://${hostname}`;
      return `${baseUrl}/dp/${asin}?tag=${tag}&linkCode=ogi&th=1&psc=1`;
      
    } catch (error) {
      console.error('[ToolScout] Error creating Amazon affiliate link:', error);
      return originalUrl;
    }
  }

  /**
   * Extract ASIN from Amazon URL
   */
  extractAmazonASIN(url) {
    // Match various Amazon URL patterns
    const patterns = [
      /\/dp\/([A-Z0-9]{10})/,
      /\/gp\/product\/([A-Z0-9]{10})/,
      /\/exec\/obidos\/ASIN\/([A-Z0-9]{10})/,
      /\/o\/ASIN\/([A-Z0-9]{10})/,
      /\/gp\/aw\/d\/([A-Z0-9]{10})/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    
    return null;
  }

  /**
   * Create eBay affiliate link using Rover (eBay's redirect service)
   */
  createEbayAffiliateLink(originalUrl, region = 'US') {
    try {
      const campid = this.affiliateIds.ebay.campid;
      if (!campid || campid.includes('YOUR_')) {
        console.warn('[ToolScout] eBay campaign ID not configured');
        return originalUrl;
      }
      
      // Extract item ID from eBay URL
      const itemId = this.extractEbayItemId(originalUrl);
      if (!itemId) {
        console.warn('[ToolScout] Could not extract eBay item ID from URL');
        return originalUrl;
      }
      
      // Detect region from URL
      const url = new URL(originalUrl);
      const hostname = url.hostname.toLowerCase();
      if (hostname.includes('.co.uk')) region = 'UK';
      else if (hostname.includes('.ca')) region = 'CA';
      else if (hostname.includes('.de')) region = 'DE';
      else if (hostname.includes('.fr')) region = 'FR';
      
      const siteid = this.affiliateIds.ebay.siteid[region] || '0';
      
      // Build Rover link (eBay's affiliate redirect service)
      const roverLink = new URL('https://rover.ebay.com/rover/1/');
      roverLink.pathname += `711-53200-19255-0/1`;
      roverLink.searchParams.set('icep_id', campid);
      roverLink.searchParams.set('ipn', 'psmain');
      roverLink.searchParams.set('icep_vectorid', '229466');
      roverLink.searchParams.set('kwid', '902099');
      roverLink.searchParams.set('mtid', '824');
      roverLink.searchParams.set('kw', 'lg');
      roverLink.searchParams.set('icep_item', itemId);
      roverLink.searchParams.set('icep_ff3', '2');
      roverLink.searchParams.set('pub', '5575378759');
      roverLink.searchParams.set('toolid', '20001');
      roverLink.searchParams.set('campid', campid);
      roverLink.searchParams.set('customid', this.affiliateIds.ebay.customid);
      roverLink.searchParams.set('icep_siteid', siteid);
      roverLink.searchParams.set('icep_uq', encodeURIComponent(originalUrl));
      
      return roverLink.toString();
      
    } catch (error) {
      console.error('[ToolScout] Error creating eBay affiliate link:', error);
      return originalUrl;
    }
  }

  /**
   * Extract item ID from eBay URL
   */
  extractEbayItemId(url) {
    const patterns = [
      /\/itm\/(\d+)/,
      /item=(\d+)/,
      /\/(\d{12,})/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    
    return null;
  }

  /**
   * Process any URL and add affiliate tracking if applicable
   */
  processAffiliateLink(url, retailer = null) {
    // Auto-detect retailer if not provided
    if (!retailer) {
      const hostname = new URL(url).hostname.toLowerCase();
      if (hostname.includes('amazon')) retailer = 'amazon';
      else if (hostname.includes('ebay')) retailer = 'ebay';
      else return url; // Not an affiliate-supported site
    }
    
    switch (retailer) {
      case 'amazon':
        return this.createAmazonAffiliateLink(url);
      case 'ebay':
        return this.createEbayAffiliateLink(url);
      default:
        return url;
    }
  }

  /**
   * Track conversion (for analytics)
   */
  async trackConversion(retailer, productInfo) {
    try {
      const conversions = await chrome.storage.local.get(['conversions']);
      const data = conversions.conversions || [];
      
      data.push({
        retailer,
        product: productInfo.title,
        price: productInfo.price,
        timestamp: Date.now(),
        url: productInfo.url
      });
      
      // Keep only last 1000 conversions
      if (data.length > 1000) {
        data.splice(0, data.length - 1000);
      }
      
      await chrome.storage.local.set({ conversions: data });
      
      // Update statistics
      const stats = await chrome.storage.local.get(['statistics']);
      const statistics = stats.statistics || {
        totalClicks: 0,
        amazonClicks: 0,
        ebayClicks: 0
      };
      
      statistics.totalClicks++;
      statistics[`${retailer}Clicks`]++;
      
      await chrome.storage.local.set({ statistics });
      
    } catch (error) {
      console.error('[ToolScout] Error tracking conversion:', error);
    }
  }

  /**
   * Calculate potential commission
   */
  calculateCommission(price, retailer) {
    // Approximate commission rates (these vary by category)
    const rates = {
      amazon: {
        tools: 0.03,      // 3% for tools
        general: 0.04     // 4% general rate
      },
      ebay: {
        tools: 0.05,      // 5% for tools
        general: 0.06     // 6% general rate
      }
    };
    
    const rate = rates[retailer]?.tools || rates[retailer]?.general || 0.03;
    return (price * rate).toFixed(2);
  }

  /**
   * Validate affiliate IDs
   */
  validateAffiliateIds() {
    const issues = [];
    
    // Check Amazon tags
    Object.entries(this.affiliateIds.amazon).forEach(([region, tag]) => {
      if (!tag || tag.includes('YOUR_')) {
        issues.push(`Amazon ${region} tag not configured`);
      }
    });
    
    // Check eBay campaign ID
    if (!this.affiliateIds.ebay.campid || this.affiliateIds.ebay.campid.includes('YOUR_')) {
      issues.push('eBay Campaign ID not configured');
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Generate disclosure text (required by FTC)
   */
  getDisclosureText() {
    return "As an Amazon Associate and eBay Partner, ToolScout earns from qualifying purchases. " +
           "This helps support the extension at no extra cost to you.";
  }
}

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AffiliateManager;
}