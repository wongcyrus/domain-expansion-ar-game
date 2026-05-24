/**
 * 🔒 JJK Domain Expansion - Cognito Client-Side Authentication Manager
 * Dynamically overlays a high-fidelity JJK Sorcerer Login if hosted on AWS with Cognito.
 * Completely bypassed on GCP/Local hosting with zero breaking changes.
 */

// Override window.fetch to automatically append Cognito bearer tokens to API requests
const originalFetch = window.fetch;
window.fetch = async function(url, options = {}) {
    const token = localStorage.getItem("cognito_id_token");
    if (token && (url.includes("/api/") || url.includes("/ws"))) {
        options.headers = options.headers || {};
        options.headers["Authorization"] = `Bearer ${token}`;
    }
    return originalFetch(url, options);
};

class CognitoAuth {
    constructor() {
        this.config = null;
        this.init();
    }

    async init() {
        try {
            const resp = await originalFetch("/config.json");
            if (resp.ok) {
                this.config = await resp.json();
            }
        } catch (e) {
            console.log("No config.json found or local server mode. Bypassing Cognito authentication.");
        }

        // Only activate Cognito auth if properties are present in S3 config.json
        if (this.config && this.config.cognitoUserPoolClientId && this.config.cognitoRegion) {
            console.log("🔒 Cognito settings detected. Initializing secure player authentication.");
            this.injectStyles();
            this.checkSessionAndShowLogin();
        } else {
            console.log("🔓 Bypassing player identity login (Local / GCP container mode).");
        }
    }

    checkSessionAndShowLogin() {
        const token = localStorage.getItem("cognito_id_token");
        const expiry = localStorage.getItem("cognito_token_expiry");
        const now = Math.floor(Date.now() / 1000);

        if (!token || !expiry || now > parseInt(expiry)) {
            // Unauthenticated or token expired - display JJK Sorcerer Login Overlay
            this.showLoginModal();
        } else {
            console.log(`✅ Welcome back, Sorcerer ${localStorage.getItem("cognito_username") || "player"}!`);
            this.showUserStatus();
        }
    }

    injectStyles() {
        const styleId = "jjk-auth-styles";
        if (document.getElementById(styleId)) return;

        const styles = `
            /* JJK Glassmorphic Auth Modal Styles */
            .jjk-auth-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(8, 5, 15, 0.85);
                backdrop-filter: blur(12px);
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: 'Inter', 'Outfit', sans-serif;
                color: #ffffff;
                animation: fadeIn JJK 0.5s ease;
            }

            .jjk-auth-card {
                background: rgba(18, 11, 31, 0.65);
                border: 2px solid rgba(229, 9, 20, 0.4);
                box-shadow: 0 0 25px rgba(229, 9, 20, 0.25), inset 0 0 15px rgba(138, 43, 226, 0.2);
                border-radius: 16px;
                padding: 40px;
                width: 100%;
                max-width: 420px;
                text-align: center;
                backdrop-filter: blur(8px);
                position: relative;
                transition: transform 0.3s ease, border-color 0.3s ease;
            }

            .jjk-auth-card:hover {
                border-color: rgba(138, 43, 226, 0.8);
                box-shadow: 0 0 30px rgba(138, 43, 226, 0.4);
            }

            .jjk-auth-logo {
                font-size: 2rem;
                font-weight: 800;
                letter-spacing: 2px;
                text-transform: uppercase;
                background: linear-gradient(135deg, #ff3366, #a133ff);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                margin-bottom: 5px;
                text-shadow: 0 0 10px rgba(161, 51, 255, 0.3);
            }

            .jjk-auth-subtitle {
                font-size: 0.9rem;
                color: #b0a5cf;
                margin-bottom: 25px;
                text-transform: uppercase;
                letter-spacing: 1px;
            }

            .jjk-auth-form-group {
                text-align: left;
                margin-bottom: 20px;
            }

            .jjk-auth-label {
                display: block;
                font-size: 0.8rem;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: #e2d9ff;
                margin-bottom: 8px;
                font-weight: 600;
            }

            .jjk-auth-input {
                width: 100%;
                padding: 12px 16px;
                background: rgba(10, 5, 20, 0.8);
                border: 1px solid rgba(138, 43, 226, 0.3);
                border-radius: 8px;
                color: #ffffff;
                font-size: 1rem;
                box-sizing: border-box;
                transition: all 0.3s ease;
            }

            .jjk-auth-input:focus {
                outline: none;
                border-color: #ff3366;
                box-shadow: 0 0 10px rgba(255, 51, 102, 0.4);
            }

            .jjk-auth-error {
                background: rgba(229, 9, 20, 0.15);
                border: 1px solid rgba(229, 9, 20, 0.5);
                color: #ff8888;
                font-size: 0.85rem;
                padding: 10px;
                border-radius: 6px;
                margin-bottom: 20px;
                display: none;
                text-align: left;
                animation: shake 0.3s ease;
            }

            .jjk-auth-btn {
                width: 100%;
                padding: 14px;
                background: linear-gradient(135deg, #e50914, #8a2be2);
                border: none;
                border-radius: 8px;
                color: #ffffff;
                font-size: 1rem;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.3s ease;
                text-transform: uppercase;
                letter-spacing: 1px;
            }

            .jjk-auth-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(229, 9, 20, 0.4);
            }

            .jjk-auth-btn:active {
                transform: translateY(0);
            }

            /* Floating Sorcerer Status Badge */
            .sorcerer-badge {
                position: fixed;
                top: 15px;
                right: 15px;
                background: rgba(20, 10, 35, 0.8);
                backdrop-filter: blur(8px);
                border: 1px solid rgba(138, 43, 226, 0.5);
                border-radius: 30px;
                padding: 8px 16px;
                display: flex;
                align-items: center;
                gap: 10px;
                font-family: sans-serif;
                font-size: 0.85rem;
                z-index: 9999;
                color: #fff;
                box-shadow: 0 0 10px rgba(138, 43, 226, 0.2);
            }

            .sorcerer-badge-orb {
                width: 8px;
                height: 8px;
                background: #00ff66;
                border-radius: 50%;
                box-shadow: 0 0 8px #00ff66;
            }

            .sorcerer-logout {
                color: #ff3366;
                text-decoration: none;
                font-weight: 700;
                cursor: pointer;
                margin-left: 5px;
            }

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-6px); }
                75% { transform: translateX(6px); }
            }
        `;

        const styleEl = document.createElement("style");
        styleEl.id = styleId;
        styleEl.innerHTML = styles;
        document.head.appendChild(styleEl);
    }

    showLoginModal() {
        const overlayId = "jjk-auth-overlay-container";
        if (document.getElementById(overlayId)) return;

        const overlay = document.createElement("div");
        overlay.id = overlayId;
        overlay.className = "jjk-auth-overlay";

        overlay.innerHTML = `
            <div class="jjk-auth-card">
                <div class="jjk-auth-logo">JJK Sorcerer Auth</div>
                <div class="jjk-auth-subtitle">Domain Expansion Portal</div>
                
                <div id="jjk-error" class="jjk-auth-error"></div>

                <form id="jjk-login-form">
                    <div class="jjk-auth-form-group">
                        <label class="jjk-auth-label">Sorcerer Email</label>
                        <input type="email" id="jjk-email" class="jjk-auth-input" placeholder="e.g. gojo@sorcerer.com" required autocomplete="username">
                    </div>
                    <div class="jjk-auth-form-group">
                        <label class="jjk-auth-label">Cursed Password</label>
                        <input type="password" id="jjk-password" class="jjk-auth-input" placeholder="••••••••" required autocomplete="current-password">
                    </div>
                    <button type="submit" id="jjk-submit-btn" class="jjk-auth-btn">Release Domain</button>
                </form>
            </div>
        `;

        document.body.appendChild(overlay);

        const form = document.getElementById("jjk-login-form");
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            await this.handleLogin();
        });
    }

    async handleLogin() {
        const email = document.getElementById("jjk-email").value.trim();
        const password = document.getElementById("jjk-password").value;
        const errorDiv = document.getElementById("jjk-error");
        const submitBtn = document.getElementById("jjk-submit-btn");

        errorDiv.style.display = "none";
        submitBtn.disabled = true;
        submitBtn.innerText = "Channelling cursed energy...";

        try {
            const targetUrl = `https://cognito-idp.${this.config.cognitoRegion}.amazonaws.com/`;
            const payload = {
                AuthFlow: "USER_PASSWORD_AUTH",
                ClientId: this.config.cognitoUserPoolClientId,
                AuthParameters: {
                    USERNAME: email,
                    PASSWORD: password
                }
            };

            const response = await originalFetch(targetUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-amz-json-1.1",
                    "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth"
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (response.ok && result.AuthenticationResult) {
                const authResult = result.AuthenticationResult;
                const now = Math.floor(Date.now() / 1000);
                const expiry = now + (authResult.ExpiresIn || 3600);

                // Save Cognito tokens in localStorage
                localStorage.setItem("cognito_id_token", authResult.IdToken);
                localStorage.setItem("cognito_access_token", authResult.AccessToken);
                localStorage.setItem("cognito_token_expiry", expiry.toString());
                localStorage.setItem("cognito_username", email.split("@")[0]);

                console.log("🔒 Cognito login succeeded! Session established.");

                // Remove modal
                const overlay = document.getElementById("jjk-auth-overlay-container");
                if (overlay) {
                    overlay.style.opacity = "0";
                    overlay.style.transition = "opacity 0.3s ease";
                    setTimeout(() => overlay.remove(), 300);
                }

                this.showUserStatus();
            } else {
                let errorMsg = result.message || "Failed to authenticate. Sorcerer rejected!";
                if (result.__type && result.__type.includes("NotAuthorizedException")) {
                    errorMsg = "Sorcerer rejected: Invalid email or cursed password.";
                }
                throw new Error(errorMsg);
            }
        } catch (err) {
            console.error("❌ Cognito Auth Failed:", err);
            errorDiv.innerText = err.message;
            errorDiv.style.display = "block";
            submitBtn.disabled = false;
            submitBtn.innerText = "Release Domain";
        }
    }

    showUserStatus() {
        const badgeId = "jjk-sorcerer-badge";
        if (document.getElementById(badgeId)) return;

        const username = localStorage.getItem("cognito_username") || "Sorcerer";

        const badge = document.createElement("div");
        badge.id = badgeId;
        badge.className = "sorcerer-badge";
        badge.innerHTML = `
            <div class="sorcerer-badge-orb"></div>
            <span>${username}</span>
            <span>|</span>
            <span class="sorcerer-logout" onclick="window.cognitoAuth.logout()">Logout</span>
        `;

        document.body.appendChild(badge);
    }

    logout() {
        localStorage.removeItem("cognito_id_token");
        localStorage.removeItem("cognito_access_token");
        localStorage.removeItem("cognito_token_expiry");
        localStorage.removeItem("cognito_username");

        const badge = document.getElementById("jjk-sorcerer-badge");
        if (badge) badge.remove();

        console.log("🔓 Sorcerer logged out.");
        this.showLoginModal();
    }
}

// Instantiate globally so logout can be accessed via onclick attribute
window.addEventListener("DOMContentLoaded", () => {
    window.cognitoAuth = new CognitoAuth();
});
