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
        this.sessionKeyInput = document.getElementById('session-key-input');
        this.languageSelect = document.getElementById('language-select');
        this.saveBtn = document.getElementById('save-settings');
        this.robotIdSelect = document.getElementById('robot-id');
        this.apiStatus = document.getElementById('api-status');
        this.apiDot = document.getElementById('api-dot');
        this.lastResp = document.getElementById('last-resp');
        this.videoModeSelect = document.getElementById('video-playback-mode');
        this.autoOpenPopupCheck = document.getElementById('auto-open-popup');
        this.openPlayerBtn = document.getElementById('open-player-btn');
        this.integratedContainer = document.getElementById('integrated-player-container');
        this.integratedPlayer = document.getElementById('integrated-player');
        this.mainContainer = document.getElementById('main-container');
        this.atmosphereOverlay = document.getElementById('atmosphere-overlay');
        this.cooldownSlider = document.getElementById('cooldown-slider');
        this.cooldownLabel = document.getElementById('cooldown-val');
        this.disableApiCheck = document.getElementById('disable-api-check');
        
        // Mini-Game UI
        this.gameHud = document.getElementById('game-hud');
        this.gameTargetName = document.getElementById('game-target-name');
        this.gameScoreEl = document.getElementById('game-score');
        this.gameTimerEl = document.getElementById('game-timer');
        this.startGameBtn = document.getElementById('start-game-btn');
        this.stopGameBtn = document.getElementById('stop-game-btn');
        this.gameToggleBtn = document.getElementById('game-toggle-btn');
        this.gameDifficultySlider = document.getElementById('game-difficulty-slider');
        this.gameDifficultyLabel = document.getElementById('game-difficulty-val');
        
        // Mini-Game Result UI
        this.gameOverOverlay = document.getElementById('game-over-overlay');
        this.finalScoreVal = document.getElementById('final-score-val');
        this.restartGameBtn = document.getElementById('restart-game-btn');
        this.exitGameBtn = document.getElementById('exit-game-btn');
        this.successFeedback = document.getElementById('success-feedback');

        this.modeDisplay = document.getElementById('mode-display');
        this.domainDisplay = document.getElementById('domain-display');
        this.instructionsPanel = document.getElementById('instructions-panel');
        this.settingsPanel = document.getElementById('settings-panel');
        this.settingsToggle = document.getElementById('settings-toggle');
        this.closeSettings = document.getElementById('close-settings');

        // 2. Load Persistence
        this.apiEndpoint = localStorage.getItem('robot_api_endpoint') || '';
        this.sessionKey = localStorage.getItem('robot_session_key') || '';
        this.userLang = localStorage.getItem('user_language') || 'zh'; 
        this.savedRobotId = localStorage.getItem('robot_id') || 'all'; 
        this.videoMode = localStorage.getItem('video_mode') || 'integrated'; 
        this.autoOpen = localStorage.getItem('auto_open_popup') === 'true';
        this.disableApi = localStorage.getItem('disable_robot_api') === 'true';
        this.gameDifficulty = parseInt(localStorage.getItem('game_difficulty') || '8');

        // 3. Set Initial Values
        if (this.endpointInput) this.endpointInput.value = this.apiEndpoint;
        if (this.sessionKeyInput) this.sessionKeyInput.value = this.sessionKey;
        if (this.languageSelect) this.languageSelect.value = this.userLang;
        if (this.robotIdSelect) this.robotIdSelect.value = this.savedRobotId;
        if (this.videoModeSelect) this.videoModeSelect.value = this.videoMode;
        if (this.autoOpenPopupCheck) this.autoOpenPopupCheck.checked = this.autoOpen;
        if (this.disableApiCheck) this.disableApiCheck.checked = this.disableApi;
        if (this.gameDifficultySlider) {
            this.gameDifficultySlider.value = this.gameDifficulty;
            if (this.gameDifficultyLabel) this.gameDifficultyLabel.textContent = `${this.gameDifficulty}s`;
        }
        if (this.cooldownSlider && this.cooldownLabel) {
            this.cooldownMs = parseInt(this.cooldownSlider.value) * 1000;
            this.cooldownLabel.textContent = `${this.cooldownSlider.value}s`;
        } else {
            this.cooldownMs = 10000;
        }

        // 4. Mini-Game State
        this.isGameActive = false;
        this.gameScore = 0;
        this.gameTimeLeft = 0;
        this.gameTarget = null;
        this.gameActionList = [];
        this.gameTimerInterval = null;
        this.gameActionInterval = null;

        // Result Videos
        this.loseVideos = Array.from({length: 9}, (_, i) => `shiba${i+1}.mp4`);
        this.winVideos = ['heroacademy.mp4', 'solo-leveling.mp4', 'onepunchman.mp4'];

        // Result UI Elements
        this.resultVideoContainer = document.getElementById('result-video-container');
        this.resultVideoPlayer = document.getElementById('result-video');

        // 5. Attach Event Listeners IMMEDIATELY
        this.attachListeners();

        if (this.resultVideoPlayer) {
            this.resultVideoPlayer.addEventListener('ended', () => {
                if (this.resultVideoContainer) this.resultVideoContainer.style.display = 'none';
            });
        }

        // 6. Initialize State
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
                this.sessionKey = this.sessionKeyInput.value.trim();
                this.userLang = this.languageSelect.value;
                this.savedRobotId = this.robotIdSelect.value;
                this.videoMode = this.videoModeSelect.value;
                this.autoOpen = this.autoOpenPopupCheck.checked;
                this.disableApi = this.disableApiCheck.checked;
                
                localStorage.setItem('robot_api_endpoint', this.apiEndpoint);
                localStorage.setItem('robot_session_key', this.sessionKey);
                localStorage.setItem('user_language', this.userLang);
                localStorage.setItem('robot_id', this.savedRobotId);
                localStorage.setItem('video_mode', this.videoMode);
                localStorage.setItem('auto_open_popup', this.autoOpen);
                localStorage.setItem('disable_robot_api', this.disableApi);
                
                this.updateAPIStatus();
                alert('Settings saved locally!');
            });
        }

        if (this.disableApiCheck) {
            this.disableApiCheck.addEventListener('change', () => {
                this.disableApi = this.disableApiCheck.checked;
                localStorage.setItem('disable_robot_api', this.disableApi);
                this.updateAPIStatus();
            });
        }

        if (this.languageSelect) {
            this.languageSelect.addEventListener('change', () => {
                this.userLang = this.languageSelect.value;
                this.localizeUI();
            });
        }

        if (this.robotIdSelect) {
            this.robotIdSelect.addEventListener('change', () => {
                this.savedRobotId = this.robotIdSelect.value;
                console.log('[Game] Target robot changed to:', this.savedRobotId);
            });
        }

        if (this.videoModeSelect) {
            this.videoModeSelect.addEventListener('change', () => {
                this.videoMode = this.videoModeSelect.value;
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

        if (this.gameDifficultySlider) {
            this.gameDifficultySlider.addEventListener('input', () => {
                this.gameDifficulty = parseInt(this.gameDifficultySlider.value);
                if (this.gameDifficultyLabel) this.gameDifficultyLabel.textContent = `${this.gameDifficulty}s`;
                localStorage.setItem('game_difficulty', this.gameDifficulty);
            });
        }

        if (this.startGameBtn) {
            this.startGameBtn.addEventListener('click', () => {
                if (this.settingsPanel) this.settingsPanel.classList.add('hidden');
                this.startMiniGame();
            });
        }

        if (this.stopGameBtn) {
            this.stopGameBtn.addEventListener('click', () => {
                this.stopMiniGame('Game Stopped');
            });
        }

        if (this.restartGameBtn) {
            this.restartGameBtn.addEventListener('click', () => {
                this.gameOverOverlay.classList.add('hidden');
                if (this.resultVideoPlayer) this.resultVideoPlayer.pause();
                if (this.resultVideoContainer) this.resultVideoContainer.style.display = 'none';
                this.startMiniGame();
            });
        }

        if (this.exitGameBtn) {
            this.exitGameBtn.addEventListener('click', () => {
                this.gameOverOverlay.classList.add('hidden');
                if (this.resultVideoPlayer) this.resultVideoPlayer.pause();
                if (this.resultVideoContainer) this.resultVideoContainer.style.display = 'none';
            });
        }

        if (this.gameToggleBtn) {
            this.gameToggleBtn.addEventListener('click', () => {
                if (this.isGameActive) {
                    this.stopMiniGame('Game Stopped', true);
                } else {
                    if (this.settingsPanel) this.settingsPanel.classList.add('hidden');
                    this.startMiniGame();
                }
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

        const qrContainer = document.getElementById('qr-container');
        const demoQrContainer = document.getElementById('demo-qr-container');
        const statusPanel = document.getElementById('status-panel-container');
        const restoreBtn = document.getElementById('left-panel-restore-btn');
        
        if (qrContainer && demoQrContainer && statusPanel && restoreBtn) {
            const hideButtons = document.querySelectorAll('.left-panel-hide');
            hideButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Don't trigger the cycle
                    qrContainer.classList.add('hidden');
                    demoQrContainer.classList.add('hidden');
                    statusPanel.classList.add('hidden');
                    restoreBtn.classList.remove('hidden');
                });
            });

            restoreBtn.addEventListener('click', () => {
                restoreBtn.classList.add('hidden');
                // Show default (Demo QR)
                demoQrContainer.classList.remove('hidden');
            });

            // Cycle: Repo QR -> Demo QR -> Status Panel -> Repo QR
            qrContainer.addEventListener('click', () => {
                qrContainer.classList.add('hidden');
                demoQrContainer.classList.remove('hidden');
            });
            demoQrContainer.addEventListener('click', () => {
                demoQrContainer.classList.add('hidden');
                statusPanel.classList.remove('hidden');
            });
            statusPanel.addEventListener('click', () => {
                statusPanel.classList.add('hidden');
                qrContainer.classList.remove('hidden');
            });
        }

        // Right Panel Logic
        const instructionsPanel = document.getElementById('instructions-panel');
        const closeInstructions = document.getElementById('close-instructions');
        const restoreInstructions = document.getElementById('right-panel-restore-btn');

        if (instructionsPanel && closeInstructions && restoreInstructions) {
            closeInstructions.addEventListener('click', () => {
                instructionsPanel.classList.add('hidden');
                restoreInstructions.classList.remove('hidden');
            });
            restoreInstructions.addEventListener('click', () => {
                restoreInstructions.classList.add('hidden');
                instructionsPanel.classList.remove('hidden');
            });
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
        if (this.apiEndpoint && this.sessionKey) {
            this.apiStatus.textContent = 'Configured';
            this.apiDot.classList.add('active');
        } else {
            this.apiStatus.textContent = 'Incomplete';
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
            if (lang === 'auto') lang = navigator.language || navigator.userLanguage;
            
            const isJP = lang.startsWith('ja');
            const isZH = lang.startsWith('zh');
            
            let finalTitle = '領域展開 AR'; // Default to ZH
            let defaultMode = '結下手印以展開你的領域！';
            let currentLang = 'zh';

            if (isJP) {
                finalTitle = '領域展開 AR';
                defaultMode = '印を組んで領域を展開せよ！';
                currentLang = 'ja';
                this.setElText('label-api-endpoint', '🔗 ロボットAPIエンドポイント');
                this.setElText('label-session-key', '🔑 セッションキー');
                this.setElText('label-language', '🌐 言語');
                this.setElText('save-settings', '設定を保存');
                this.setElText('label-target-robot', '対象ロボット');
                this.setElText('label-cooldown', 'クールダウン (s)');
                this.setElText('label-disable-api', '🚫 ロボットAPIを無効にする');
                this.setElText('label-video-mode', '🎬 ビデオ再生');
                this.setElText('label-game-difficulty', '⏱️ アクションごとの時間 (s)');
                this.setElText('start-game-btn', 'ラウンド開始');
                this.setElText('stop-game-btn', 'ゲーム終了');
                this.setElText('label-score', 'スコア');
                this.setElText('label-timer', '残り時間');
                this.setElText('game-target-label', 'ターゲット');
                this.setElText('game-over-title', 'ゲーム終了');
                this.setElText('label-final-score', '最終スコア');
                this.setElText('restart-game-btn', 'もう一度プレイ');
                this.setElText('exit-game-btn', '閉じる');
                this.setElText('qr-label', 'ソースコード');
                this.setElText('demo-qr-label', 'デモを再生');
                this.setOptText('#video-playback-mode option[value="none"]', '🚫 ビデオなし');
                this.setOptText('#video-playback-mode option[value="integrated"]', '🖥️ 統合 (音あり)');
                this.setOptText('#video-playback-mode option[value="integrated_silent"]', '🔇 統合 (静音)');
                this.setOptText('#video-playback-mode option[value="popup"]', '🪟 ポップアップ');
                this.setOptText('#robot-id option[value="all"]', '🤖 全てのロボット');
            } else if (isZH) {
                finalTitle = '領域展開 AR';
                defaultMode = '結下手印以展開你的領域！';
                currentLang = 'zh';
                this.setElText('label-api-endpoint', '🔗 機器人API端點');
                this.setElText('label-session-key', '🔑 會話密鑰');
                this.setElText('label-language', '🌐 語言');
                this.setElText('save-settings', '保存設置');
                this.setElText('label-target-robot', '目標機器人');
                this.setElText('label-cooldown', '冷卻時間 (s)');
                this.setElText('label-disable-api', '🚫 禁用機器人 API');
                this.setElText('label-video-mode', '🎬 影片播放');
                this.setElText('label-game-difficulty', '⏱️ 每個動作限時 (s)');
                this.setElText('start-game-btn', '開始回合');
                this.setElText('stop-game-btn', '退出遊戲');
                this.setElText('label-score', '分數');
                this.setElText('label-timer', '剩餘時間');
                this.setElText('game-target-label', '目標動作');
                this.setElText('game-over-title', '遊戲結束');
                this.setElText('label-final-score', '最終分數');
                this.setElText('restart-game-btn', '再玩一次');
                this.setElText('exit-game-btn', '關閉');
                this.setElText('qr-label', '獲取源代碼');
                this.setElText('demo-qr-label', '播放演示');
                this.setOptText('#video-playback-mode option[value="none"]', '🚫 不播放影片');
                this.setOptText('#video-playback-mode option[value="integrated"]', '🖥️ 內置 (音效)');
                this.setOptText('#video-playback-mode option[value="integrated_silent"]', '🔇 內置 (靜音)');
                this.setOptText('#video-playback-mode option[value="popup"]', '🪟 彈出視窗');
                this.setOptText('#robot-id option[value="all"]', '🤖 所有機器人');
            } else {
                finalTitle = 'Domain Expansion AR';
                defaultMode = 'Strike a hand sign to expand your domain!';
                currentLang = 'en';
                this.setElText('label-api-endpoint', '🔗 Robot API Endpoint');
                this.setElText('label-session-key', '🔑 Session Key');
                this.setElText('label-language', '🌐 Language');
                this.setElText('save-settings', '💾 Save Settings');
                this.setElText('label-target-robot', '🤖 Target Robot');
                this.setElText('label-cooldown', '🤖 Cooldown (s)');
                this.setElText('label-disable-api', '🚫 Disable Robot API');
                this.setElText('label-video-mode', '🎬 Video Playback');
                this.setElText('label-game-difficulty', '⏱️ Time per Action (s)');
                this.setElText('start-game-btn', 'Start Round');
                this.setElText('stop-game-btn', 'Quit Game');
                this.setElText('label-score', 'Score');
                this.setElText('label-timer', 'Time Left');
                this.setElText('game-target-label', 'Target Action');
                this.setElText('game-over-title', 'Game Over');
                this.setElText('label-final-score', 'Final Score');
                this.setElText('restart-game-btn', 'Play Again');
                this.setElText('exit-game-btn', 'Close');
                this.setElText('qr-label', 'GET SOURCE CODE');
                this.setElText('demo-qr-label', 'PLAY DEMO');
                this.setOptText('#video-playback-mode option[value="none"]', '🚫 No Video');
                this.setOptText('#video-playback-mode option[value="integrated"]', '🖥️ Integrated (Sound)');
                this.setOptText('#video-playback-mode option[value="integrated_silent"]', '🔇 Integrated (Silent)');
                this.setOptText('#video-playback-mode option[value="popup"]', '🪟 Popup Tab');
                this.setOptText('#robot-id option[value="all"]', '🤖 All Robots');
            }

            if (this.domainGame) this.domainGame.setLanguage(currentLang);
            this.setElText('main-title', finalTitle);
            this.setElText('mode-display', defaultMode);
            document.title = finalTitle;
            this.updateInstructions(); 
        } catch (e) { console.error('[Game] Localization failed:', e); }
    }
    
    init() {
        console.log('🚀 Initializing UI components...');
        const startOverlay = document.getElementById('start-overlay');
        if (startOverlay) {
            const startAction = () => {
                console.log('✅ Start overlay clicked/touched');
                startOverlay.style.display = 'none';
                if (this.camera) this.camera.start();
                if (this.integratedPlayer) {
                    this.integratedPlayer.muted = false;
                    this.integratedPlayer.play()
                        .then(() => {
                            this.integratedPlayer.pause();
                            console.log('🎬 Video enabled with sound.');
                        })
                        .catch(e => console.warn('Warm-up failed', e));
                }
            };
            
            // Multi-event support for mobile/desktop reliability
            startOverlay.addEventListener('click', startAction);
            startOverlay.addEventListener('touchstart', (e) => {
                e.preventDefault();
                startAction();
            }, { passive: false });
        }
        this.updateInstructions();
        this.setElText('tracking-status', 'Active');
        const tDot = document.getElementById('tracking-dot');
        if (tDot) tDot.classList.add('active');
    }

    updateInstructions() {
        const content = document.getElementById('instructions-content');
        if (!content) return;
        content.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.85em; justify-items: end; text-align: right;">
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
            this.playerWindow = window.open('player.html', 'ARGamePlayer');
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
            
            // Check Mini-Game Match
            if (this.isGameActive && stableDomain === this.gameTarget) {
                console.log('[MiniGame] Success:', stableDomain);
                this.gameScore++;
                this.gameTarget = null; // Prevent double scoring
                clearInterval(this.gameTimerInterval);
                
                this.playSuccessSound();

                // Show visual feedback for success
                if (this.successFeedback) {
                    this.successFeedback.classList.remove('hidden');
                    // Force reflow for animation restart
                    void this.successFeedback.offsetWidth;
                    setTimeout(() => { if(this.successFeedback) this.successFeedback.classList.add('hidden'); }, 1000);
                }

                if (this.gameHud) {
                    this.gameHud.style.borderColor = '#4CAF50';
                    setTimeout(() => { if(this.gameHud) this.gameHud.style.borderColor = '#FFFF00'; }, 500);
                }
                
                setTimeout(() => this.nextGameAction(), 800); // Small pause after success
            }

            this.domainDisplay.textContent = displayName;
            if (domainColor) this.domainDisplay.style.color = domainColor;
            this.domainDisplay.style.opacity = "1.0";

            if (this.lastVFXDomain !== stableDomain) {
                this.lastVFXDomain = stableDomain;
                if (this.mainContainer) { this.mainContainer.classList.remove('shake'); void this.mainContainer.offsetWidth; this.mainContainer.classList.add('shake'); setTimeout(() => this.mainContainer.classList.remove('shake'), 500); }
                
                // Skip atmosphere for minor techniques to focus on orbs
                const isMinorTech = (stableDomain === "Lapse Blue" || stableDomain === "Reversal Red" || stableDomain === "Hollow Purple");
                if (this.atmosphereOverlay && domainColor && !isMinorTech) {
                    this.atmosphereOverlay.style.background = this.hexToRgba(domainColor, 0.15);
                } else if (this.atmosphereOverlay) {
                    this.atmosphereOverlay.style.background = 'transparent';
                }
                
                this.playVideo(stableDomain);
            }
            
            if (now - this.lastActionTime >= this.cooldownMs) {
                if (this.apiEndpoint && this.sessionKey) {
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
            if (this.atmosphereOverlay) { this.atmosphereOverlay.style.background = 'transparent'; }
            if (!this.resetTimer && this.lastVFXDomain) {
                this.resetTimer = setTimeout(() => {
                    this.lastVFXDomain = null;
                    if (this.integratedContainer) { this.integratedContainer.classList.add('hidden'); this.integratedPlayer.pause(); }
                    this.resetTimer = null;
                }, 1000);
            }
        }
    }

    // --- Mini-Game Logic ---
    startMiniGame() {
        console.log('[MiniGame] Starting new round...');
        this.isGameActive = true;
        this.gameScore = 0;
        
        // Prepare action list (Shuffle)
        const allActions = Object.keys(this.domainGame.displayNamesMap['en']);
        this.gameActionList = allActions.sort(() => Math.random() - 0.5);
        
        if (this.gameHud) this.gameHud.classList.remove('hidden');
        if (this.startGameBtn) this.startGameBtn.classList.add('hidden');
        if (this.stopGameBtn) this.stopGameBtn.classList.remove('hidden');
        
        // Update main HUD button
        if (this.gameToggleBtn) {
            this.gameToggleBtn.textContent = '⏹️';
            this.gameToggleBtn.style.background = '#FF5252';
            this.gameToggleBtn.style.color = '#FFF';
        }

        // --- Optimization: Preload Result Videos ---
        this.preloadResultVideos();

        this.updateGameHUD();
        this.nextGameAction();
    }

    preloadResultVideos() {
        // Preload one win and two lose videos randomly
        const folder = window.location.pathname.replace(/\/[^\/]*$/, '');
        const toPreload = [
            `static/video/win/${this.winVideos[Math.floor(Math.random() * this.winVideos.length)]}`,
            `static/video/lose/${this.loseVideos[Math.floor(Math.random() * this.loseVideos.length)]}`,
            `static/video/lose/${this.loseVideos[Math.floor(Math.random() * this.loseVideos.length)]}`
        ];

        toPreload.forEach(path => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'video';
            link.href = `${window.location.origin}${folder}/${path}`;
            document.head.appendChild(link);
            console.log(`[Game] Preloading: ${path}`);
        });
    }

    stopMiniGame(reason = 'Game Over', manualStop = false) {
        this.isGameActive = false;
        clearInterval(this.gameTimerInterval);
        clearTimeout(this.gameActionInterval);
        
        const finalScore = this.gameScore;
        const total = Object.keys(this.domainGame.displayNamesMap['en']).length;
        const isWin = !manualStop && (finalScore === total);
        const finalReason = isWin ? (this.userLang === 'zh' ? '完美祓除！' : 'PERFECT!') : reason;

        // Show Custom UI instead of alert
        if (this.gameOverOverlay) {
            this.gameOverOverlay.classList.remove('hidden');
            if (this.finalScoreVal) this.finalScoreVal.textContent = `${finalScore} / ${total}`;
            const titleEl = document.getElementById('game-over-title');
            if (titleEl) {
                titleEl.textContent = finalReason;
                titleEl.style.color = isWin ? '#4CAF50' : '#FF5252';
            }
        }

        if (isWin) this.playSuccessSound();
        else this.playGameOverSound();
        
        // Play Result Video
        this.playResultVideo(isWin);
        
        if (this.gameHud) this.gameHud.classList.add('hidden');
        if (this.startGameBtn) this.startGameBtn.classList.remove('hidden');
        if (this.stopGameBtn) this.stopGameBtn.classList.add('hidden');
        if (this.gameTargetName) this.gameTargetName.textContent = '---';

        // Reset main HUD button
        if (this.gameToggleBtn) {
            this.gameToggleBtn.textContent = '🎮';
            this.gameToggleBtn.style.background = '#FFFF00';
            this.gameToggleBtn.style.color = '#000';
        }

        this.gameTarget = null;
    }

    playResultVideo(isWin) {
        const folder = isWin ? 'win' : 'lose';
        const videoList = isWin ? this.winVideos : this.loseVideos;
        
        if (videoList.length === 0) {
            console.warn(`[Game] No videos found for ${folder}`);
            if (this.resultVideoContainer) this.resultVideoContainer.style.display = 'none';
            return;
        }

        const randomVideo = videoList[Math.floor(Math.random() * videoList.length)];
        let basePath = window.location.pathname;
        if (!basePath.endsWith('/')) basePath = basePath.substring(0, basePath.lastIndexOf('/') + 1);
        const absSrc = `${window.location.origin}${basePath}static/video/${folder}/${randomVideo}`;

        console.log(`[Game] Playing ${folder} video in result panel: ${randomVideo}`);

        // Stop any background technique/domain video
        if (this.integratedPlayer) {
            this.integratedPlayer.pause();
            if (this.integratedContainer) this.integratedContainer.classList.add('hidden');
        }

        if (this.resultVideoPlayer && this.resultVideoContainer) {
            this.resultVideoPlayer.src = absSrc;
            this.resultVideoPlayer.muted = false;
            this.resultVideoContainer.style.display = 'block';
            this.resultVideoPlayer.play().catch(e => console.warn('[Game] Result panel play failed:', e));
        }
    }

    nextGameAction() {
        if (!this.isGameActive) return;
        
        if (this.gameActionList.length === 0) {
            this.stopMiniGame('Round Complete', false); // Not manual stop, logic will check score
            return;
        }

        this.gameTarget = this.gameActionList.pop();
        this.gameTimeLeft = this.gameDifficulty;
        this.updateGameHUD();

        // Timer Interval
        clearInterval(this.gameTimerInterval);
        this.gameTimerInterval = setInterval(() => {
            this.gameTimeLeft--;
            this.updateGameHUD();
            if (this.gameTimeLeft <= 0) {
                clearInterval(this.gameTimerInterval);
                this.nextGameAction(); // Move to next even if failed
            }
        }, 1000);
    }

    updateGameHUD() {
        if (this.gameTargetName) {
            const lang = this.domainGame.lang || 'zh';
            const displayName = this.domainGame.displayNamesMap[lang][this.gameTarget] || this.gameTarget || '---';
            this.gameTargetName.textContent = displayName;
        }
        if (this.gameScoreEl) this.gameScoreEl.textContent = this.gameScore;
        if (this.gameTimerEl) this.gameTimerEl.textContent = `${this.gameTimeLeft}s`;
    }

    // --- Audio Synthesis ---
    playSuccessSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1); // A5
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } catch (e) { console.warn('Audio failed', e); }
    }

    playGameOverSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
            osc.frequency.linearRampToValueAtTime(110, ctx.currentTime + 0.5); // A2
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.5);
        } catch (e) { console.warn('Audio failed', e); }
    }

    async triggerRobotAction(robotId, action) {
        if (this.disableApi) {
            console.log('[API] Robot API is disabled. Skipping call.');
            if (this.lastResp) this.lastResp.textContent = 'DISABLED';
            return;
        }
        try {
            let url = this.apiEndpoint.trim();
            const parts = url.split('?');
            let base = parts[0].replace(/\/+$/, "");
            const query = parts[1] ? '?' + parts[1] : '';
            if (!base.includes('/run_action')) base = base + '/run_action';
            const idPattern = /\/(robot_\d+|all)$/;
            if (base.match(idPattern)) base = base.replace(idPattern, '/' + robotId);
            else base = base + '/' + robotId;
            
            // Clean session key
            const cleanKey = this.sessionKey.trim().replace(/^"|"$/g, '');
            const finalUrl = `${base}${query}${query ? '&' : '?'}session_key=${encodeURIComponent(cleanKey)}`;
            
            console.log(`[API] URL: ${finalUrl}`);
            const response = await fetch(finalUrl, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ action: action }) 
            });
            if (this.lastResp) this.lastResp.textContent = `${response.status} ${response.status === 200 ? 'OK' : 'ERR'}`;
        } catch (err) { 
            console.error('❌ API failed:', err); 
            if (this.lastResp) this.lastResp.textContent = 'NET ERR';
        }
    }
}

window.addEventListener('DOMContentLoaded', () => { window.handTracker = new HandTracker(); });
