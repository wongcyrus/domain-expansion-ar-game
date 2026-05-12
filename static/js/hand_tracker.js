/**
 * Hand Tracker for Domain Expansion AR Game
 * Uses MediaPipe Hands to detect gestures and send actions to a configured API
 */

class HandTracker {
    constructor() {
        console.log('[Game] Constructor started.');
        
        // 1. Initialize DOM Elements
        this.video = document.getElementById('webcam');
        this.canvas = document.getElementById('output-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.vfxCanvas = document.getElementById('vfx-canvas');
        this.domainGame = new DomainExpansionGame();
        
        this.endpointInput = document.getElementById('api-endpoint');
        this.languageSelect = document.getElementById('language-select');
        this.saveBtn = document.getElementById('save-settings');
        this.robotIdSelect = document.getElementById('robot-id');
        this.apiStatus = document.getElementById('api-status');
        this.apiDot = document.getElementById('api-dot');
        this.videoModeSelect = document.getElementById('video-playback-mode');
        this.autoOpenPopupCheck = document.getElementById('auto-open-popup');
        this.openPlayerBtn = document.getElementById('open-player-btn');
        this.integratedContainer = document.getElementById('integrated-player-container');
        this.integratedPlayer = document.getElementById('integrated-player');
        this.mainContainer = document.getElementById('main-container');
        this.atmosphereOverlay = document.getElementById('atmosphere-overlay');
        this.cooldownSlider = document.getElementById('cooldown-slider');
        this.cooldownLabel = document.getElementById('cooldown-val');
        this.modeDisplay = document.getElementById('mode-display');
        this.domainDisplay = document.getElementById('domain-display');
        this.instructionsPanel = document.getElementById('instructions-panel');
        this.settingsPanel = document.getElementById('settings-panel');
        this.settingsToggle = document.getElementById('settings-toggle');
        this.closeSettings = document.getElementById('close-settings');

        // 2. Load Persistence
        this.apiEndpoint = localStorage.getItem('robot_api_endpoint') || '';
        this.userLang = localStorage.getItem('user_language') || 'auto';
        this.savedRobotId = localStorage.getItem('robot_id') || 'all'; 
        this.videoMode = localStorage.getItem('video_mode') || 'integrated'; 
        this.autoOpen = localStorage.getItem('auto_open_popup') === 'true';

        // 3. Set Initial Values
        if (this.endpointInput) this.endpointInput.value = this.apiEndpoint;
        if (this.languageSelect) this.languageSelect.value = this.userLang;
        if (this.robotIdSelect) this.robotIdSelect.value = this.savedRobotId;
        if (this.videoModeSelect) this.videoModeSelect.value = this.videoMode;
        if (this.autoOpenPopupCheck) this.autoOpenPopupCheck.checked = this.autoOpen;
        if (this.cooldownSlider && this.cooldownLabel) {
            this.cooldownMs = parseInt(this.cooldownSlider.value) * 1000;
            this.cooldownLabel.textContent = `${this.cooldownSlider.value}s`;
        } else {
            this.cooldownMs = 10000;
        }

        // 4. Attach Event Listeners IMMEDIATELY (Before localization)
        this.attachListeners();

        // 5. Initialize State
        this.playerWindow = null;
        this.isPlayerReady = false;
        this.pendingVideoAction = null;
        this.playPromise = null;
        this.lastActionTime = 0;
        this.lastDomain = null;
        this.lastVFXDomain = null;
        this.resetTimer = null;

        this.localizeUI(); 
        this.updateAPIStatus();
        this.setupMediaPipe();
        this.init();
    }

    attachListeners() {
        if (this.saveBtn) {
            this.saveBtn.addEventListener('click', () => {
                this.apiEndpoint = this.endpointInput.value.trim();
                this.userLang = this.languageSelect.value;
                this.savedRobotId = this.robotIdSelect.value;
                this.videoMode = this.videoModeSelect.value;
                this.autoOpen = this.autoOpenPopupCheck.checked;
                
                localStorage.setItem('robot_api_endpoint', this.apiEndpoint);
                localStorage.setItem('user_language', this.userLang);
                localStorage.setItem('robot_id', this.savedRobotId);
                localStorage.setItem('video_mode', this.videoMode);
                localStorage.setItem('auto_open_popup', this.autoOpen);
                
                this.updateAPIStatus();
                alert('Settings saved locally!');
            });
        }

        if (this.languageSelect) {
            this.languageSelect.addEventListener('change', () => {
                this.userLang = this.languageSelect.value;
                console.log('[Game] Language changed to:', this.userLang);
                this.localizeUI();
            });
        }

        if (this.videoModeSelect) {
            this.videoModeSelect.addEventListener('change', () => {
                this.videoMode = this.videoModeSelect.value;
                console.log('[Game] Video mode changed to:', this.videoMode);
                
                if (this.videoMode !== 'integrated' && this.videoMode !== 'integrated_silent') {
                    if (this.integratedContainer) {
                        this.integratedContainer.classList.add('hidden');
                        this.integratedPlayer.pause();
                    }
                }

                if (this.domainGame.stableDomain) {
                    this.playVideo(this.domainGame.stableDomain);
                }
            });
        }

        if (this.cooldownSlider) {
            this.cooldownSlider.addEventListener('input', () => {
                this.cooldownMs = parseInt(this.cooldownSlider.value) * 1000;
                if (this.cooldownLabel) this.cooldownLabel.textContent = `${this.cooldownSlider.value}s`;
            });
        }

        if (this.settingsToggle) {
            this.settingsToggle.addEventListener('click', () => {
                if (this.settingsPanel) this.settingsPanel.classList.toggle('hidden');
            });
        }

        if (this.closeSettings) {
            this.closeSettings.addEventListener('click', () => {
                if (this.settingsPanel) this.settingsPanel.classList.add('hidden');
            });
        }

        if (this.openPlayerBtn) {
            this.openPlayerBtn.addEventListener('click', () => this.openPopupPlayer());
        }

        window.addEventListener('message', (event) => {
            const data = event.data;
            if (!data || typeof data !== 'object' || !data.type) return;
            if (data.type === 'PLAYER_READY') {
                console.log('📺 Popup Player is ready!');
                this.isPlayerReady = true;
                if (this.pendingVideoAction) {
                    this.playVideo(this.pendingVideoAction);
                    this.pendingVideoAction = null;
                }
            }
        });
    }

    setupMediaPipe() {
        this.hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });
        this.hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 0, 
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
    }

    updateAPIStatus() {
        if (!this.apiStatus || !this.apiDot) return;
        if (this.apiEndpoint) {
            this.apiStatus.textContent = 'Configured';
            this.apiDot.classList.add('active');
        } else {
            this.apiStatus.textContent = 'Not Configured';
            this.apiDot.classList.remove('active');
        }
    }

    setElText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    setOptText(selector, text) {
        const el = document.querySelector(selector);
        if (el) el.textContent = text;
    }

    localizeUI() {
        try {
            let lang = this.userLang;
            if (lang === 'auto') {
                lang = navigator.language || navigator.userLanguage;
            }
            
            const isJP = lang.startsWith('ja');
            const isZH = lang.startsWith('zh');
            
            let finalTitle = '🖐️ Domain Expansion AR';
            let defaultMode = 'Strike a hand sign to expand your domain!';
            let currentLang = 'en';

            // EN Defaults
            this.setElText('label-api-endpoint', '🔗 Robot API Endpoint');
            this.setElText('label-language', '🌐 Language');
            this.setElText('save-settings', '💾 Save Settings');
            this.setElText('label-target-robot', '🤖 Target Robot');
            this.setElText('label-cooldown', '🤖 Cooldown (s)');
            this.setElText('label-video-mode', '🎬 Video Playback');
            this.setOptText('#video-playback-mode option[value="none"]', '🚫 No Video');
            this.setOptText('#video-playback-mode option[value="integrated"]', '🖥️ Integrated (Sound)');
            this.setOptText('#video-playback-mode option[value="integrated_silent"]', '🔇 Integrated (Silent)');
            this.setOptText('#video-playback-mode option[value="popup"]', '🪟 Popup Tab');
            this.setOptText('#robot-id option[value="all"]', '🤖 All Robots');

            if (isJP) {
                finalTitle = '🖐️ 領域展開 AR';
                defaultMode = '印を組んで領域を展開せよ！';
                currentLang = 'ja';
                this.setElText('label-api-endpoint', '🔗 ロボットAPIエンドポイント');
                this.setElText('label-language', '🌐 言語');
                this.setElText('save-settings', '設定を保存');
                this.setElText('label-target-robot', '対象ロボット');
                this.setElText('label-cooldown', 'クールダウン (s)');
                this.setElText('label-video-mode', '🎬 ビデオ再生');
                this.setOptText('#video-playback-mode option[value="none"]', '🚫 ビデオなし');
                this.setOptText('#video-playback-mode option[value="integrated"]', '🖥️ 統合 (音あり)');
                this.setOptText('#video-playback-mode option[value="integrated_silent"]', '🔇 統合 (静音)');
                this.setOptText('#video-playback-mode option[value="popup"]', '🪟 ポップアップ');
                this.setOptText('#robot-id option[value="all"]', '🤖 全てのロボット');
            } else if (isZH) {
                finalTitle = '🖐️ 領域展開 AR';
                defaultMode = '結下手印以展開你的領域！';
                currentLang = 'zh';
                this.setElText('label-api-endpoint', '🔗 機器人API端點');
                this.setElText('label-language', '🌐 語言');
                this.setElText('save-settings', '保存設置');
                this.setElText('label-target-robot', '目標機器人');
                this.setElText('label-cooldown', '冷卻時間 (s)');
                this.setElText('label-video-mode', '🎬 影片播放');
                this.setOptText('#video-playback-mode option[value="none"]', '🚫 不播放影片');
                this.setOptText('#video-playback-mode option[value="integrated"]', '🖥️ 內置 (音效)');
                this.setOptText('#video-playback-mode option[value="integrated_silent"]', '🔇 內置 (靜音)');
                this.setOptText('#video-playback-mode option[value="popup"]', '🪟 彈出視窗');
                this.setOptText('#robot-id option[value="all"]', '🤖 所有機器人');
            }

            if (this.domainGame) this.domainGame.setLanguage(currentLang);
            this.setElText('main-title', finalTitle);
            this.setElText('mode-display', defaultMode);
            document.title = finalTitle;
            this.updateInstructions(); // Refresh instructions with new language
        } catch (e) {
            console.error('[Game] Localization failed:', e);
        }
    }
    
    init() {
        console.log('🚀 Initializing UI components...');
        const startOverlay = document.getElementById('start-overlay');
        if (startOverlay) {
            startOverlay.addEventListener('click', () => {
                startOverlay.style.display = 'none';
                if (this.camera) this.camera.start();
                if (this.integratedPlayer) {
                    this.integratedPlayer.muted = false;
                    this.integratedPlayer.play().then(() => this.integratedPlayer.pause()).catch(e => console.warn('Warm-up failed', e));
                }
            });
        }
        this.updateInstructions();
        this.setElText('tracking-status', 'Active');
        const tDot = document.getElementById('tracking-dot');
        if (tDot) tDot.classList.add('active');
    }

    updateInstructions() {
        if (!this.instructionsPanel) return;
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
            if (this.ctx) {
                this.ctx.save();
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            }
            let stableDomain = null;
            if (results.multiHandLandmarks) {
                let skeletonColor = '#00FF00';
                const currentDomain = this.domainGame.stableDomain;
                if (currentDomain && this.domainGame.domainColors[currentDomain]) skeletonColor = this.domainGame.domainColors[currentDomain];
                for (const landmarks of results.multiHandLandmarks) {
                    if (typeof drawConnectors === 'function' && typeof HAND_CONNECTIONS !== 'undefined') drawConnectors(this.ctx, landmarks, HAND_CONNECTIONS, {color: skeletonColor, lineWidth: 5});
                    if (typeof drawLandmarks === 'function') drawLandmarks(this.ctx, landmarks, {color: '#FF0000', lineWidth: 2});
                }
                stableDomain = this.domainGame.update(results.multiHandLandmarks);
            } else {
                stableDomain = this.domainGame.update([]);
            }
            this.processDomainExpansion(stableDomain, results.multiHandLandmarks);
            this.domainGame.drawVFX(this.vfxCanvas, stableDomain, results.multiHandLandmarks);
            if (this.ctx) this.ctx.restore();
        } catch (err) { console.error('❌ Tracking Error:', err); if (this.ctx) this.ctx.restore(); }
    }

    hexToRgba(hex, opacity) {
        let r = 0, g = 0, b = 0;
        if (hex.length === 4) { r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16); }
        else if (hex.length === 7) { r = parseInt(hex.substring(1, 3), 16); g = parseInt(hex.substring(3, 5), 16); b = parseInt(hex.substring(5, 7), 16); }
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }

    openPopupPlayer() {
        if (!this.playerWindow || this.playerWindow.closed) {
            this.isPlayerReady = false;
            this.playerWindow = window.open('player.html', 'ARGamePlayer', 'width=800,height=450');
        } else {
            this.playerWindow.focus();
            this.playerWindow.postMessage({ type: 'PING' }, '*');
        }
    }

    playVideo(action) {
        const videoMap = {
            "Unlimited Void": "domain_unlimited_void.mp4", "Malevolent Shrine": "domain_malevolent_shrine.mp4",
            "Self-Embodiment of Perfection": "domain_self_embodiment.mp4", "Authentic Mutual Love": "domain_authentic_love.mp4",
            "Idle Death Gamble": "domain_idle_death_gamble.mp4", "Yuji Itadori": "domain_yuji_itadori.mp4",
            "Chimera Shadow Garden": "domain_chimera_shadow_garden.mp4", "Time Cell Moon Palace": "domain_time_cell_moon_palace.mp4",
            "Lapse Blue": "technique_lapse_blue.mp4", "Reversal Red": "technique_reversal_red.mp4", "Hollow Purple": "technique_hollow_purple.mp4"
        };
        const file = videoMap[action];
        if (!file) return;

        let basePath = window.location.pathname;
        if (!basePath.endsWith('/')) basePath = basePath.substring(0, basePath.lastIndexOf('/') + 1);
        const absSrc = `${window.location.origin}${basePath}static/video/${file}`;

        if (this.videoMode === 'integrated' || this.videoMode === 'integrated_silent') {
            if (!this.integratedPlayer) return;
            if (!this.integratedPlayer.src.includes(file)) {
                this.integratedPlayer.src = absSrc;
                this.integratedPlayer.load();
            }
            if (this.integratedContainer) this.integratedContainer.classList.remove('hidden');
            this.integratedPlayer.muted = (this.videoMode === 'integrated_silent');
            this.integratedPlayer.play().catch(e => { if (e.name !== 'AbortError') console.warn('[Game] Play failed:', e); });
        } else {
            if (this.integratedContainer) {
                this.integratedContainer.classList.add('hidden');
                this.integratedPlayer.pause();
            }
            if (this.videoMode === 'popup') {
                if (this.playerWindow && !this.playerWindow.closed && this.isPlayerReady) {
                    this.playerWindow.postMessage({ type: 'PLAY_VIDEO', videoSrc: absSrc }, '*');
                } else if (this.autoOpen) {
                    this.pendingVideoAction = action;
                    this.openPopupPlayer();
                }
            }
        }
    }

    processDomainExpansion(stableDomain, landmarks) {
        if (stableDomain) {
            if (this.resetTimer) { clearTimeout(this.resetTimer); this.resetTimer = null; }
            const now = Date.now();
            const displayName = this.domainGame.displayNames[stableDomain] || stableDomain;
            const domainColor = this.domainGame.domainColors[stableDomain];
            
            this.domainDisplay.textContent = displayName;
            if (domainColor) this.domainDisplay.style.color = domainColor;
            this.domainDisplay.style.opacity = "1.0";

            if (this.lastVFXDomain !== stableDomain) {
                this.lastVFXDomain = stableDomain;
                if (this.mainContainer) { this.mainContainer.classList.remove('shake'); void this.mainContainer.offsetWidth; this.mainContainer.classList.add('shake'); setTimeout(() => this.mainContainer.classList.remove('shake'), 500); }
                if (this.atmosphereOverlay && domainColor) this.atmosphereOverlay.style.background = this.hexToRgba(domainColor, 0.15);
                this.playVideo(stableDomain);
            }
            
            if (now - this.lastActionTime >= this.cooldownMs) {
                if (this.apiEndpoint) {
                    this.lastActionTime = now;
                    const actionMap = {
                        "Unlimited Void": "domain_unlimited_void", "Malevolent Shrine": "domain_malevolent_shrine",
                        "Self-Embodiment of Perfection": "domain_self_embodiment", "Authentic Mutual Love": "domain_authentic_love",
                        "Idle Death Gamble": "domain_idle_death_gamble", "Yuji Itadori": "domain_yuji_itadori",
                        "Chimera Shadow Garden": "domain_chimera_shadow_garden", "Time Cell Moon Palace": "domain_time_cell_moon_palace",
                        "Lapse Blue": "lapse_blue", "Reversal Red": "reversal_red", "Hollow Purple": "hollow_purple"
                    };
                    this.triggerRobotAction(this.savedRobotId, actionMap[stableDomain]);
                }
            } else {
                const wait = Math.ceil((this.cooldownMs - (now - this.lastActionTime)) / 1000);
                this.domainDisplay.textContent = `${displayName} (Cooldown ${wait}s)`;
            }
        } else {
            if (this.domainDisplay) this.domainDisplay.textContent = '';
            if (this.atmosphereOverlay) this.atmosphereOverlay.style.background = 'transparent';
            if (!this.resetTimer && this.lastVFXDomain) {
                this.resetTimer = setTimeout(() => {
                    this.lastVFXDomain = null;
                    if (this.integratedContainer) { this.integratedContainer.classList.add('hidden'); this.integratedPlayer.pause(); }
                    this.resetTimer = null;
                }, 1000);
            }
        }
    }

    async triggerRobotAction(robotId, action) {
        try {
            let url = this.apiEndpoint;
            const parts = url.split('?');
            let base = parts[0].replace(/\/+$/, "");
            const query = parts[1] ? '?' + parts[1] : '';
            const idPattern = /\/(robot_\d+|all)$/;
            if (base.match(idPattern)) base = base.replace(idPattern, '/' + robotId);
            else base = base + '/' + robotId;
            await fetch(base + query, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: action }) });
            console.log(`🤖 Action ${action} for ${robotId} sent.`);
        } catch (err) { console.error('❌ API failed:', err); }
    }
}

window.addEventListener('DOMContentLoaded', () => { window.handTracker = new HandTracker(); });
