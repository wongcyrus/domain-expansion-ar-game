/**
 * Hand Tracker for Domain Expansion AR Game
 * Uses MediaPipe Hands to detect gestures and send actions to a configured API
 */

class HandTracker {
    constructor() {
        this.video = document.getElementById('webcam');
        this.canvas = document.getElementById('output-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.vfxCanvas = document.getElementById('vfx-canvas');
        this.domainGame = new DomainExpansionGame();
        
        // --- API Configuration ---
        this.endpointInput = document.getElementById('api-endpoint');
        this.saveBtn = document.getElementById('save-endpoint');
        this.robotIdSelect = document.getElementById('robot-id');
        this.apiStatus = document.getElementById('api-status');
        this.apiDot = document.getElementById('api-dot');
        
        this.apiEndpoint = localStorage.getItem('robot_api_endpoint') || '';
        this.endpointInput.value = this.apiEndpoint;
        this.updateAPIStatus();

        this.saveBtn.addEventListener('click', () => {
            this.apiEndpoint = this.endpointInput.value.trim();
            localStorage.setItem('robot_api_endpoint', this.apiEndpoint);
            this.updateAPIStatus();
            alert('Endpoint saved locally!');
        });

        // --- MediaPipe Setup ---
        this.hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });
        
        this.hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 0, // 0 for faster performance on mobile
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        this.hands.onResults(this.onResults.bind(this));
        
        this.camera = new Camera(this.video, {
            onFrame: async () => {
                if (this.canvas.width !== this.video.videoWidth || this.canvas.height !== this.video.videoHeight) {
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                    this.vfxCanvas.width = this.video.videoWidth;
                    this.vfxCanvas.height = this.video.videoHeight;
                    this.domainGame.initVFX(this.vfxCanvas);
                }
                await this.hands.send({image: this.video});
            },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
        });
        
        // --- UI Elements ---
        this.modeDisplay = document.getElementById('mode-display');
        this.domainDisplay = document.getElementById('domain-display');
        this.instructionsPanel = document.getElementById('instructions-panel');
        this.cooldownSlider = document.getElementById('cooldown-slider');
        this.cooldownLabel = document.getElementById('cooldown-val');
        
        this.cooldownMs = parseInt(this.cooldownSlider.value) * 1000;
        this.lastActionTime = 0;
        this.lastDomain = null;
        this.lastVFXDomain = null;

        this.cooldownSlider.addEventListener('input', () => {
            this.cooldownMs = parseInt(this.cooldownSlider.value) * 1000;
            this.cooldownLabel.textContent = `${this.cooldownSlider.value}s`;
        });

        this.mainContainer = document.getElementById('main-container');
        this.atmosphereOverlay = document.getElementById('atmosphere-overlay');
        this.resetTimer = null;

        this.init();
    }

    updateAPIStatus() {
        if (this.apiEndpoint) {
            this.apiStatus.textContent = 'Configured';
            this.apiDot.classList.add('active');
        } else {
            this.apiStatus.textContent = 'Not Configured';
            this.apiDot.classList.remove('active');
        }
    }
    
    init() {
        console.log('🚀 Initializing Domain Expansion AR...');
        this.camera.start();
        this.updateInstructions();
        
        const trackingStatus = document.getElementById('tracking-status');
        const trackingDot = document.getElementById('tracking-dot');
        trackingStatus.textContent = 'Active';
        trackingDot.classList.add('active');
    }

    updateInstructions() {
        this.instructionsPanel.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.85em;">
                <div>
                    <strong>— Domains —</strong><br>
                    • 五條悟: 無量空處 (1H)<br>
                    • 兩面宿儺: 伏魔御廚子 (2H)<br>
                    • 真人: 自閉圓頓裹 (2H)<br>
                    • 乙骨憂太: 真贋相愛 (2H Wide)<br>
                    • 秤金次: 坐殺博徒 (2H Stack)<br>
                    • 伏黑惠: 嵌合暗翳庭園 (2H Fists)<br>
                    • 直哉: 時胞月宮殿 (2H L-sign)<br>
                    • 虎杖: 名称不明 (2H Point)
                </div>
                <div>
                    <strong>— Techniques —</strong><br>
                    • 蒼 (Blue): Index Point (1H)<br>
                    • 赫 (Red): Open Palm (1H)<br>
                    • 茈 (Purple): Blue + Red (2H)
                </div>
            </div>
        `;
    }

    onResults(results) {
        try {
            this.ctx.save();
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            
            let stableDomain = null;

            if (results.multiHandLandmarks) {
                let skeletonColor = '#00FF00';
                const currentDomain = this.domainGame.stableDomain;
                if (currentDomain && this.domainGame.domainColors[currentDomain]) {
                    skeletonColor = this.domainGame.domainColors[currentDomain];
                }

                for (const landmarks of results.multiHandLandmarks) {
                    if (typeof drawConnectors === 'function' && typeof HAND_CONNECTIONS !== 'undefined') {
                        drawConnectors(this.ctx, landmarks, HAND_CONNECTIONS, {color: skeletonColor, lineWidth: 5});
                    }
                    if (typeof drawLandmarks === 'function') {
                        drawLandmarks(this.ctx, landmarks, {color: '#FF0000', lineWidth: 2});
                    }
                }
                
                stableDomain = this.domainGame.update(results.multiHandLandmarks);
            } else {
                stableDomain = this.domainGame.update([]);
            }

            this.processDomainExpansion(stableDomain, results.multiHandLandmarks);
            this.domainGame.drawVFX(this.vfxCanvas, stableDomain, results.multiHandLandmarks);

            this.ctx.restore();
        } catch (err) {
            console.error('❌ Error in hand tracking loop:', err);
            this.ctx.restore();
        }
    }

    hexToRgba(hex, opacity) {
        let r = 0, g = 0, b = 0;
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else if (hex.length === 7) {
            r = parseInt(hex.substring(1, 3), 16);
            g = parseInt(hex.substring(3, 5), 16);
            b = parseInt(hex.substring(5, 7), 16);
        }
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }

    processDomainExpansion(stableDomain, landmarks) {
        if (stableDomain) {
            if (this.resetTimer) {
                clearTimeout(this.resetTimer);
                this.resetTimer = null;
            }

            const now = Date.now();
            const displayName = this.domainGame.displayNames[stableDomain] || stableDomain;
            const domainColor = this.domainGame.domainColors[stableDomain];
            
            const actionMap = {
                "Unlimited Void": "domain_unlimited_void",
                "Malevolent Shrine": "domain_malevolent_shrine",
                "Self-Embodiment of Perfection": "domain_self_embodiment",
                "Authentic Mutual Love": "domain_authentic_love",
                "Idle Death Gamble": "domain_idle_death_gamble",
                "Yuji Itadori": "domain_yuji_itadori",
                "Chimera Shadow Garden": "domain_chimera_shadow_garden",
                "Time Cell Moon Palace": "domain_time_cell_moon_palace",
                "Lapse Blue": "lapse_blue",
                "Reversal Red": "reversal_red",
                "Hollow Purple": "hollow_purple"
            };
            const action = actionMap[stableDomain];

            this.domainDisplay.textContent = displayName;
            if (domainColor) this.domainDisplay.style.color = domainColor;
            this.domainDisplay.style.opacity = "1.0";

            if (this.lastVFXDomain !== stableDomain) {
                this.lastVFXDomain = stableDomain;
                
                if (this.mainContainer) {
                    this.mainContainer.classList.remove('shake');
                    void this.mainContainer.offsetWidth;
                    this.mainContainer.classList.add('shake');
                    setTimeout(() => this.mainContainer.classList.remove('shake'), 500);
                }

                if (this.atmosphereOverlay && domainColor) {
                    this.atmosphereOverlay.style.background = this.hexToRgba(domainColor, 0.15);
                }
            }

            // TRIGGER ACTION (COOLDOWN)
            if (now - this.lastActionTime >= this.cooldownMs) {
                if (action && this.apiEndpoint) {
                    this.lastActionTime = now;
                    this.lastDomain = stableDomain;
                    this.triggerRobotAction(this.robotIdSelect.value, action);
                }
            } else {
                const wait = Math.ceil((this.cooldownMs - (now - this.lastActionTime)) / 1000);
                this.domainDisplay.textContent = `${displayName} (Cooldown ${wait}s)`;
                this.domainDisplay.style.opacity = "0.7";
            }
        } else {
            this.domainDisplay.textContent = '';
            if (this.atmosphereOverlay) {
                this.atmosphereOverlay.style.background = 'transparent';
            }
            if (!this.resetTimer) {
                this.resetTimer = setTimeout(() => {
                    this.lastDomain = null;
                    this.lastVFXDomain = null;
                    this.resetTimer = null;
                }, 2000); 
            }
        }
    }

    async triggerRobotAction(robotId, action) {
        console.log(`🤖 Triggering ${action} for ${robotId} via API: ${this.apiEndpoint}`);
        
        try {
            // Adjust endpoint if it doesn't include the robot ID
            let url = this.apiEndpoint;
            if (url.includes('run_action') && !url.endsWith(robotId)) {
                // Try to replace or append robot_id if it follows standard pattern
                if (url.includes('robot_')) {
                    url = url.replace(/robot_\d+/, robotId);
                } else {
                    url = url.endsWith('/') ? url + robotId : url + '/' + robotId;
                }
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: action })
            });
            
            const data = await response.json();
            if (data.success) {
                console.log(`✅ API call successful: ${action}`);
            } else {
                console.warn(`⚠️ API returned failure: ${data.message || 'Unknown error'}`);
            }
        } catch (err) {
            console.error('❌ API call failed:', err);
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.handTracker = new HandTracker();
});
