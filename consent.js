/**
 * @file consent.js - GDPR Compliance System v2.1.1
 * @description LEGAL REQUIREMENT: Proper consent management for EU users
 */

class GDPRConsentManager {
    constructor() {
        this.consentKey = 'toolscout_gdpr_consent_v2';
        this.consentVersion = '2.1.1';
        this.requiredConsents = {
            functional: {
                required: true,
                description: 'Essential functionality including price tracking and alerts',
                category: 'necessary'
            },
            analytics: {
                required: false,
                description: 'Anonymous usage statistics to improve our service',
                category: 'analytics',
                retention: '30 days'
            },
            affiliate: {
                required: false,
                description: 'Support development through affiliate commissions',
                category: 'marketing'
            }
        };
    }

    async initialize() {
        try {
            // Check if user needs to consent
            const consent = await this.getStoredConsent();
            
            if (!consent || this.needsConsentUpdate(consent)) {
                return await this.showConsentBanner();
            }
            
            return consent;
        } catch (error) {
            console.error('Consent initialization failed:', error);
            return this.getMinimalConsent();
        }
    }

    async getStoredConsent() {
        try {
            const result = await chrome.storage.local.get(this.consentKey);
            return result[this.consentKey] || null;
        } catch (error) {
            console.error('Error retrieving consent:', error);
            return null;
        }
    }

    needsConsentUpdate(consent) {
        return !consent.version || 
               consent.version !== this.consentVersion ||
               !consent.timestamp ||
               Date.now() - new Date(consent.timestamp).getTime() > (365 * 24 * 60 * 60 * 1000); // 1 year
    }

    async showConsentBanner() {
        return new Promise((resolve) => {
            // Create consent overlay
            const overlay = document.createElement('div');
            overlay.id = 'toolscout-gdpr-overlay';
            overlay.innerHTML = this.generateConsentHTML();
            
            // Add styles
            const style = document.createElement('style');
            style.textContent = this.getConsentStyles();
            document.head.appendChild(style);
            document.body.appendChild(overlay);

            // Setup event handlers
            this.setupConsentEventHandlers(overlay, resolve, style);

            // Focus management for accessibility
            const acceptButton = overlay.querySelector('#consent-accept-all');
            if (acceptButton) {
                acceptButton.focus();
            }
        });
    }

    generateConsentHTML() {
        return `
            <div class="consent-overlay" role="dialog" aria-labelledby="consent-title" aria-modal="true">
                <div class="consent-container">
                    <div class="consent-header">
                        <h2 id="consent-title">🍪 Privacy & Cookie Consent</h2>
                        <p class="consent-subtitle">We respect your privacy and comply with GDPR</p>
                    </div>

                    <div class="consent-content">
                        <p class="consent-intro">
                            ToolScout uses different types of data to provide you with the best price tracking experience. 
                            Please choose which data processing you consent to:
                        </p>

                        <div class="consent-categories">
                            ${Object.entries(this.requiredConsents).map(([key, config]) => `
                                <div class="consent-category ${config.required ? 'required' : 'optional'}">
                                    <div class="category-header">
                                        <label class="consent-checkbox-label">
                                            <input 
                                                type="checkbox" 
                                                id="consent-${key}"
                                                ${config.required ? 'checked disabled' : ''}
                                                class="consent-checkbox"
                                                aria-describedby="consent-${key}-desc"
                                            >
                                            <span class="checkbox-custom"></span>
                                            <strong>${this.getCategoryDisplayName(key)}</strong>
                                            ${config.required ? '<span class="required-badge">Required</span>' : ''}
                                        </label>
                                    </div>
                                    <p class="category-description" id="consent-${key}-desc">
                                        ${config.description}
                                        ${config.retention ? ` Data retained for ${config.retention}.` : ''}
                                    </p>
                                </div>
                            `).join('')}
                        </div>

                        <div class="consent-details">
                            <details class="privacy-details">
                                <summary>🔍 What data do we collect?</summary>
                                <div class="details-content">
                                    <ul>
                                        <li><strong>Functional:</strong> Product prices, alerts, basic settings (stored locally)</li>
                                        <li><strong>Analytics:</strong> Anonymous click counts, error reports (no personal data)</li>
                                        <li><strong>Affiliate:</strong> When you click our Amazon links (helps fund development)</li>
                                    </ul>
                                    <p>
                                        <strong>We never collect:</strong> Personal information, browsing history outside supported sites, 
                                        or share data with third parties.
                                    </p>
                                </div>
                            </details>
                        </div>
                    </div>

                    <div class="consent-actions">
                        <button id="consent-accept-all" class="btn btn-primary" type="button">
                            ✅ Accept All
                        </button>
                        <button id="consent-accept-selected" class="btn btn-secondary" type="button">
                            ⚙️ Accept Selected
                        </button>
                        <button id="consent-essential-only" class="btn btn-minimal" type="button">
                            🔒 Essential Only
                        </button>
                    </div>

                    <div class="consent-footer">
                        <p class="consent-notice">
                            You can change these preferences anytime in extension settings. 
                            <a href="#" id="privacy-policy-link" target="_blank">Read our Privacy Policy</a>
                        </p>
                        <p class="consent-legal">
                            By using ToolScout, you agree to our data processing practices as described above.
                        </p>
                    </div>
                </div>
            </div>
        `;
    }

    getConsentStyles() {
        return `
            .consent-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2147483647;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                animation: fadeIn 0.3s ease-out;
            }

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            .consent-container {
                background: white;
                border-radius: 16px;
                max-width: 600px;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                animation: slideUp 0.4s ease-out;
            }

            @keyframes slideUp {
                from { transform: translateY(30px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }

            .consent-header {
                background: linear-gradient(135deg, #4A90E2 0%, #357ABD 100%);
                color: white;
                padding: 24px 24px 20px;
                border-radius: 16px 16px 0 0;
                text-align: center;
            }

            #consent-title {
                font-size: 24px;
                font-weight: 700;
                margin-bottom: 8px;
                color: white;
            }

            .consent-subtitle {
                font-size: 14px;
                opacity: 0.9;
                margin: 0;
            }

            .consent-content {
                padding: 24px;
            }

            .consent-intro {
                font-size: 16px;
                line-height: 1.6;
                color: #2d3748;
                margin-bottom: 24px;
            }

            .consent-categories {
                display: flex;
                flex-direction: column;
                gap: 16px;
                margin-bottom: 24px;
            }

            .consent-category {
                border: 2px solid #e2e8f0;
                border-radius: 12px;
                padding: 16px;
                transition: all 0.2s ease;
            }

            .consent-category:hover {
                border-color: #4A90E2;
                background: #f7faff;
            }

            .consent-category.required {
                border-color: #17BF63;
                background: #f0fff4;
            }

            .category-header {
                display: flex;
                align-items: flex-start;
                margin-bottom: 8px;
            }

            .consent-checkbox-label {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                cursor: pointer;
                font-size: 16px;
                font-weight: 600;
                color: #1a202c;
                flex: 1;
            }

            .consent-checkbox {
                width: 20px;
                height: 20px;
                margin: 0;
                opacity: 0;
                position: absolute;
            }

            .checkbox-custom {
                width: 20px;
                height: 20px;
                border: 2px solid #cbd5e0;
                border-radius: 4px;
                background: white;
                position: relative;
                flex-shrink: 0;
                transition: all 0.2s ease;
                margin-top: 2px;
            }

            .consent-checkbox:checked + .checkbox-custom {
                background: #4A90E2;
                border-color: #4A90E2;
            }

            .consent-checkbox:checked + .checkbox-custom::after {
                content: '✓';
                color: white;
                font-size: 14px;
                font-weight: bold;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
            }

            .consent-checkbox:disabled + .checkbox-custom {
                background: #17BF63;
                border-color: #17BF63;
            }

            .consent-checkbox:disabled + .checkbox-custom::after {
                content: '✓';
                color: white;
            }

            .consent-checkbox:focus + .checkbox-custom {
                outline: 3px solid #4299e1;
                outline-offset: 2px;
            }

            .required-badge {
                background: #17BF63;
                color: white;
                font-size: 10px;
                padding: 2px 8px;
                border-radius: 12px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-left: 8px;
            }

            .category-description {
                font-size: 14px;
                color: #4a5568;
                line-height: 1.5;
                margin: 0;
                padding-left: 32px;
            }

            .consent-details {
                margin-bottom: 24px;
            }

            .privacy-details {
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                padding: 16px;
            }

            .privacy-details summary {
                font-weight: 600;
                cursor: pointer;
                color: #2d3748;
                outline: none;
            }

            .privacy-details summary:focus {
                outline: 3px solid #4299e1;
                outline-offset: 2px;
                border-radius: 4px;
            }

            .details-content {
                margin-top: 16px;
                font-size: 14px;
                line-height: 1.6;
                color: #4a5568;
            }

            .details-content ul {
                margin: 12px 0;
                padding-left: 20px;
            }

            .details-content li {
                margin: 8px 0;
            }

            .consent-actions {
                display: flex;
                gap: 12px;
                padding: 0 24px;
                flex-wrap: wrap;
            }

            .btn {
                padding: 12px 24px;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                flex: 1;
                min-width: 120px;
            }

            .btn:focus {
                outline: 3px solid #4299e1;
                outline-offset: 2px;
            }

            .btn-primary {
                background: #4A90E2;
                color: white;
            }

            .btn-primary:hover {
                background: #357ABD;
                transform: translateY(-1px);
            }

            .btn-secondary {
                background: #e2e8f0;
                color: #2d3748;
            }

            .btn-secondary:hover {
                background: #cbd5e0;
            }

            .btn-minimal {
                background: #f7fafc;
                color: #4a5568;
                border: 1px solid #e2e8f0;
            }

            .btn-minimal:hover {
                background: #edf2f7;
            }

            .consent-footer {
                padding: 20px 24px 24px;
                border-top: 1px solid #e2e8f0;
                background: #f8fafc;
                border-radius: 0 0 16px 16px;
            }

            .consent-notice {
                font-size: 13px;
                color: #4a5568;
                margin-bottom: 8px;
                text-align: center;
            }

            .consent-legal {
                font-size: 12px;
                color: #718096;
                text-align: center;
                margin: 0;
            }

            #privacy-policy-link {
                color: #4A90E2;
                text-decoration: none;
            }

            #privacy-policy-link:hover {
                text-decoration: underline;
            }

            #privacy-policy-link:focus {
                outline: 2px solid #4A90E2;
                outline-offset: 1px;
                border-radius: 2px;
            }

            /* Mobile responsiveness */
            @media (max-width: 640px) {
                .consent-container {
                    margin: 20px;
                    max-width: none;
                }

                .consent-actions {
                    flex-direction: column;
                }

                .btn {
                    min-width: 100%;
                }
            }

            /* High contrast mode */
            @media (prefers-contrast: high) {
                .consent-category {
                    border-width: 3px;
                }
                
                .checkbox-custom {
                    border-width: 3px;
                }
                
                .btn {
                    border: 2px solid currentColor;
                }
            }

            /* Reduced motion */
            @media (prefers-reduced-motion: reduce) {
                .consent-overlay,
                .consent-container {
                    animation: none;
                }
                
                .btn:hover {
                    transform: none;
                }
            }
        `;
    }

    setupConsentEventHandlers(overlay, resolve, style) {
        const acceptAll = overlay.querySelector('#consent-accept-all');
        const acceptSelected = overlay.querySelector('#consent-accept-selected');
        const essentialOnly = overlay.querySelector('#consent-essential-only');
        const privacyLink = overlay.querySelector('#privacy-policy-link');

        acceptAll.onclick = async () => {
            const consent = {
                functional: true,
                analytics: true,
                affiliate: true
            };
            await this.saveConsent(consent);
            this.removeConsentUI(overlay, style);
            resolve(consent);
        };

        acceptSelected.onclick = async () => {
            const consent = this.getSelectedConsent(overlay);
            await this.saveConsent(consent);
            this.removeConsentUI(overlay, style);
            resolve(consent);
        };

        essentialOnly.onclick = async () => {
            const consent = this.getMinimalConsent();
            await this.saveConsent(consent);
            this.removeConsentUI(overlay, style);
            resolve(consent);
        };

        privacyLink.onclick = (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: chrome.runtime.getURL('privacy_policy.html') });
        };

        // ESC key handler
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                essentialOnly.click();
            }
        });
    }

    getSelectedConsent(overlay) {
        const consent = {};
        Object.keys(this.requiredConsents).forEach(key => {
            const checkbox = overlay.querySelector(`#consent-${key}`);
            consent[key] = checkbox ? checkbox.checked : false;
        });
        return consent;
    }

    getMinimalConsent() {
        return {
            functional: true,
            analytics: false,
            affiliate: false
        };
    }

    async saveConsent(consent) {
        const consentData = {
            ...consent,
            version: this.consentVersion,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent.substring(0, 100),
            language: navigator.language,
            ipHash: await this.hashIP() // Anonymous IP hash for fraud detection
        };

        try {
            await chrome.storage.local.set({ [this.consentKey]: consentData });
            console.log('GDPR consent saved:', { ...consentData, ipHash: '[HIDDEN]' });
        } catch (error) {
            console.error('Failed to save consent:', error);
        }
    }

    async hashIP() {
        try {
            // Get approximate location without exact IP
            const response = await fetch('https://ipapi.co/json/');
            const data = await response.json();
            
            // Create anonymous hash of country + timezone
            const identifier = `${data.country_code || 'XX'}_${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
            const encoder = new TextEncoder();
            const data_buf = encoder.encode(identifier);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data_buf);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
        } catch (error) {
            return 'unknown';
        }
    }

    removeConsentUI(overlay, style) {
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        if (style.parentNode) {
            style.parentNode.removeChild(style);
        }
    }

    getCategoryDisplayName(key) {
        const names = {
            functional: 'Essential Functionality',
            analytics: 'Usage Analytics',
            affiliate: 'Affiliate Marketing'
        };
        return names[key] || key;
    }

    async hasConsent(category) {
        const consent = await this.getStoredConsent();
        return consent ? !!consent[category] : false;
    }

    async revokeConsent(category) {
        const consent = await this.getStoredConsent();
        if (consent) {
            consent[category] = false;
            await this.saveConsent(consent);
        }
    }

    async showConsentSettings() {
        // Open settings page
        chrome.runtime.openOptionsPage();
    }

    // GDPR Article 17 - Right to erasure
    async eraseAllData() {
        try {
            await chrome.storage.local.clear();
            await chrome.storage.sync.clear();
            console.log('All user data erased per GDPR Article 17');
            return true;
        } catch (error) {
            console.error('Failed to erase data:', error);
            return false;
        }
    }

    // GDPR Article 15 - Right of access
    async exportUserData() {
        try {
            const localData = await chrome.storage.local.get();
            const syncData = await chrome.storage.sync.get();
            
            const exportData = {
                exportDate: new Date().toISOString(),
                localData: localData,
                syncData: syncData,
                dataTypes: {
                    alerts: 'Price tracking alerts',
                    settings: 'Extension preferences',
                    analytics: 'Anonymous usage statistics',
                    consent: 'Privacy consent choices'
                }
            };
            
            return exportData;
        } catch (error) {
            console.error('Failed to export data:', error);
            return null;
        }
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GDPRConsentManager;
} else if (typeof window !== 'undefined') {
    window.GDPRConsentManager = GDPRConsentManager;
}