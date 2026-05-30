let sync = null;
const p1Video = document.getElementById('p1-video'), p2Video = document.getElementById('p2-video'), p1Waiting = document.getElementById('p1-waiting'), p2Waiting = document.getElementById('p2-waiting');
const p1Score = document.getElementById('p1-score'), p2Score = document.getElementById('p2-score'), p1Domain = document.getElementById('p1-domain'), p2Domain = document.getElementById('p2-domain');
const timerDisplay = document.getElementById('timer-display'), p1TimerSub = document.getElementById('p1-timer-sub'), p2TimerSub = document.getElementById('p2-timer-sub'), startBtn = document.getElementById('start-battle-btn'), audioHint = document.getElementById('audio-status-hint');
const p1Cinema = document.getElementById('p1-cinema'), p2Cinema = document.getElementById('p2-cinema'), resultCinema = document.getElementById('result-cinema'), emergencyUnmute = document.getElementById('emergency-unmute');
const resultOverlay = document.getElementById('match-result-overlay'), winnerText = document.getElementById('winner-text'), winnerSubtext = document.getElementById('winner-subtext'), resScoreP1 = document.getElementById('res-score-p1'), resScoreP2 = document.getElementById('res-score-p2'), closeResultBtn = document.getElementById('close-result-btn'), skipResultBtn = document.getElementById('skip-result-btn');
const winVideos = ['heroacademy.mp4', 'solo-leveling.mp4', 'onepunchman.mp4', '8-gate.mp4', 'escanor.mp4', 'onepunch.mp4', 'onepunch2.mp4', 'demon-slayer-s2.mp4', 'demon-slayer-s1.mp4'], loseVideos = Array.from({length: 9}, (_, i) => `shiba${i+1}.mp4`);

// --- UI CONFIGURATION ---
const netModeSelect = document.getElementById('cfg-net-mode'), valNetMode = document.getElementById('val-net-mode');
const roomCodeDisplay = document.getElementById('room-code-display'), roomCodeVal = document.getElementById('room-code-val');
const baseLayoutSelect = document.getElementById('cfg-base-layout'), inQuadMode = { checked: false }, inDynamicView = document.getElementById('cfg-dynamic-view');
const powerP1 = document.getElementById('power-p1'), powerP2 = document.getElementById('power-p2'), ticker = document.getElementById('battle-ticker'), viewP1 = document.getElementById('p1-view'), viewP2 = document.getElementById('p2-view');
const settingsToggle = document.getElementById('battle-settings-toggle'), settingsPanel = document.getElementById('battle-settings-panel'), saveCfgBtn = document.getElementById('save-battle-cfg');
const inCountdown = document.getElementById('cfg-countdown'), inDifficulty = document.getElementById('cfg-difficulty'), inCount = document.getElementById('cfg-count');
const countdownOverlay = document.getElementById('countdown-overlay'), countdownText = document.getElementById('countdown-text');

// --- STATE MANAGEMENT ---
const urlParams = new URLSearchParams(window.location.search);
let currentNetMode = urlParams.get('net_mode') || 'local';
let currentRoomCode = urlParams.get('room') || 'BTL1';
let p1Time = 0, p2Time = 0, p1Active = false, p2Active = false, p1ScoreVal = 0, p2ScoreVal = 0, isMatchOver = false, winnerTimeoutHandle = null, hasMatchStarted = false, prevMatchActive = false;
let p1TotalActions = 11, p2TotalActions = 11;
let activeCinematicsCount = 0;
let resultTimeoutHandle = null;
let isWinnerLogicActive = false;

// --- DYNAMIC AI COMMENTARY STATE TRACKING ---
let lastP1ScoreVal = 0;
let lastP2ScoreVal = 0;
let spokenTimeTimemarks = new Set();
let lastCustomCommentaryTime = 0;

// --- LAYOUT ENGINE ---
function updateLayout() {
    console.log(`[Battle] updateLayout: count=${activeCinematicsCount}, forceQuad=${inQuadMode.checked}, dynamic=${inDynamicView.checked}, base=${baseLayoutSelect.value}`);
    
    document.body.classList.remove('quad-mode', 'overlay-mode', 'vertical-stack');

    if (inQuadMode && inQuadMode.checked) {
        document.body.classList.add('quad-mode');
    }

    if (baseLayoutSelect && baseLayoutSelect.value === 'vertical-stack') {
        document.body.classList.add('vertical-stack');
    }

    if (inDynamicView && inDynamicView.checked) {
        if (activeCinematicsCount >= 2) {
            document.body.classList.add('quad-mode');
        } else if (activeCinematicsCount === 1) {
            document.body.classList.add('overlay-mode');
        }
    }

    if (document.body.classList.contains('quad-mode')) {
        p1Cinema.style.display = 'block';
        p2Cinema.style.display = 'block';
    } else {
        p1Cinema.style.display = p1Cinema.src.includes('.mp4') ? 'block' : 'none';
        p2Cinema.style.display = p2Cinema.src.includes('.mp4') ? 'block' : 'none';
    }
}

// --- INITIALIZATION ---
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let res = '';
    for (let i = 0; i < 4; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
    return res;
}

async function updateSyncMode() {
    if (sync) sync.close();
    currentNetMode = (netModeSelect && netModeSelect.value) || 'local';
    if (valNetMode) valNetMode.textContent = currentNetMode.toUpperCase();
    if (currentNetMode === 'online') {
        if (roomCodeVal) roomCodeVal.textContent = currentRoomCode;
        if (roomCodeDisplay) roomCodeDisplay.style.display = 'block';
    } else {
        if (roomCodeDisplay) roomCodeDisplay.style.display = 'none';
    }
    
    sync = new BattleModeSync('viewer', currentNetMode, currentRoomCode);
    setupSyncCallbacks();

    // Load serverless config if present to avoid race conditions
    try {
        const response = await fetch('/config.json');
        if (response.ok) {
            const config = await response.json();
            if (config.robotApiEndpoint) {
                localStorage.setItem('robot_api_endpoint', config.robotApiEndpoint);
            }
            if (config.defaultSessionKey) {
                localStorage.setItem('robot_session_key', config.defaultSessionKey);
                localStorage.setItem('openclawSessionId', config.defaultSessionKey);
                localStorage.setItem('openclawActiveSessionId', config.defaultSessionKey);
            }
        }
    } catch (configErr) {
        console.warn('config.json load skipped or failed in updateSyncMode:', configErr);
    }

    // Register active room details with OpenClaw bridge
    const openclawSessionId = getOpenclawActiveSessionId();
    const signalingUrl = sync.signalingUrl || window.location.origin;
    callBridge('/api/register-room', {
        sessionId: openclawSessionId,
        roomCode: currentRoomCode,
        signalingUrl: signalingUrl
    });
}

// --- EVENT LISTENERS ---
if (netModeSelect) netModeSelect.addEventListener('change', updateSyncMode);
if (inDynamicView) inDynamicView.addEventListener('change', () => { updateLayout(); });
if (baseLayoutSelect) baseLayoutSelect.addEventListener('change', updateLayout);

settingsToggle.addEventListener('click', () => { settingsPanel.style.display = (settingsPanel.style.display === 'flex' ? 'none' : 'flex'); });
saveCfgBtn.addEventListener('click', () => { settingsPanel.style.display = 'none'; });
inCountdown.addEventListener('input', () => { document.getElementById('val-countdown').textContent = `${inCountdown.value}s`; });
inDifficulty.addEventListener('input', () => { document.getElementById('val-difficulty').textContent = `${inDifficulty.value}s`; });
inCount.addEventListener('input', () => { document.getElementById('val-count').textContent = inCount.value; });

// --- VIDEO & TIMING DATA ---
const VIDEO_DURATIONS = {
    "domain_chimera_shadow_garden.mp4": 3520, "domain_authentic_love.mp4": 9870, "domain_self_embodiment.mp4": 28180,
    "domain_yuji_itadori.mp4": 18940, "domain_malevolent_shrine.mp4": 25000, "domain_idle_death_gamble.mp4": 15800,
    "domain_unlimited_void.mp4": 7330, "domain_time_cell_moon_palace.mp4": 7800, "technique_hollow_purple.mp4": 22030,
    "technique_reversal_red.mp4": 10580, "technique_lapse_blue.mp4": 24440,
    "heroacademy.mp4": 74660, "solo-leveling.mp4": 65830, "onepunchman.mp4": 53730, "8-gate.mp4": 70400,
    "escanor.mp4": 46180, "onepunch.mp4": 28730, "onepunch2.mp4": 67280, "demon-slayer-s2.mp4": 68000, "demon-slayer-s1.mp4": 77760,
    "shiba1.mp4": 15550, "shiba2.mp4": 64060, "shiba3.mp4": 7610, "shiba4.mp4": 11600, "shiba5.mp4": 7560,
    "shiba6.mp4": 21590, "shiba7.mp4": 16950, "shiba8.mp4": 14720, "shiba9.mp4": 20080
};

// --- CORE MATCH LOGIC ---
// --- CORE MATCH LOGIC & COMMENTATOR BRIDGE ---
let lastPeriodicCommentaryTime = 0;
let commentaryHideTimeout = null;
let pendingCasts = [];
let castTimeoutHandle = null;
let commentarySpeechNonce = 0;
let isSpeechPrimed = false;

function getOpenclawActiveSessionId() {
    return localStorage.getItem('openclawActiveSessionId') || localStorage.getItem('robot_session_key') || localStorage.getItem('openclawSessionId') || 'mcpserver';
}

function getOpenclawBaseSessionId() {
    return localStorage.getItem('robot_session_key') || localStorage.getItem('openclawSessionId') || 'mcpserver';
}

async function callBridge(endpoint, body, options = {}) {
    const apiEndpoint = window.location.origin;
    const timeoutMs = options.timeoutMs || 30000;
    // Auto-inject preferred user language and image upload policy
    if (body && typeof body === 'object') {
        if (!body.lang) {
            body.lang = localStorage.getItem('user_language') || (navigator.language.startsWith('zh') ? 'zh' : 'en');
        }
        body.agentImagePolicy = document.getElementById('cfg-commentator-image-policy')?.value || localStorage.getItem('agent_image_policy') || 'always';
    }
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        const response = await fetch(`${apiEndpoint.replace(/\/$/, '')}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (response.ok) {
            const responseJson = await response.json();
            if (responseJson?.debugPrompt) {
                console.log(`[Bridge Debug Prompt] ${endpoint}`, responseJson.debugPrompt);
            }
            if (responseJson?.debugImageContext) {
                console.log(`[Bridge Debug Images] ${endpoint}`, responseJson.debugImageContext);
            }
            return responseJson;
        }
        console.warn(`[Bridge] Endpoint ${endpoint} returned HTTP ${response.status}`);
    } catch (err) {
        console.warn(`[Bridge] Failed to call bridge endpoint ${endpoint}:`, err);
    }
    return null;
}

function getActionNameFromVideo(videoSrc) {
    if (!videoSrc) return "Unknown Technique";
    const filename = videoSrc.split('/').pop().toLowerCase();
    
    if (filename.includes("chimera_shadow_garden")) return "Chimera Shadow Garden";
    if (filename.includes("authentic_love")) return "Authentic Love";
    if (filename.includes("self_embodiment")) return "Self-Embodiment of Perfection";
    if (filename.includes("yuji_itadori")) return "Yuji Itadori's Domain";
    if (filename.includes("malevolent_shrine")) return "Malevolent Shrine";
    if (filename.includes("idle_death_gamble")) return "Idle Death Gamble";
    if (filename.includes("unlimited_void")) return "Unlimited Void";
    if (filename.includes("time_cell_moon_palace")) return "Time Cell Moon Palace";
    if (filename.includes("hollow_purple")) return "Hollow Purple";
    if (filename.includes("reversal_red")) return "Reversal Red";
    if (filename.includes("lapse_blue")) return "Lapse Blue";
    
    // Fallback parsing
    let name = filename.replace(".mp4", "").replace("domain_", "").replace("technique_", "").replace(/_/g, " ");
    return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function estimateCommentaryDurationMs(text) {
    const normalizedText = (text || "").replace(/\s+/g, " ").trim();
    if (!normalizedText) return 0;
    const isChinese = /[\u4e00-\u9fa5]/.test(normalizedText);
    const estimateMs = isChinese
        ? Math.max(2000, (normalizedText.length * 250) + 500)
        : Math.max(2000, (normalizedText.length * 80) + 800);
    return Math.min(10000, estimateMs);
}

function waitForCommentaryDuration(text) {
    const estimateMs = estimateCommentaryDurationMs(text);
    if (!estimateMs) {
        return Promise.resolve();
    }
    return new Promise((resolve) => setTimeout(resolve, estimateMs));
}

async function primeSpeechSynthesis(force = false) {
    if (!window.speechSynthesis) {
        return;
    }
    if (isSpeechPrimed && !force) {
        return;
    }

    window.speechSynthesis.getVoices();

    await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
        };

        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            finish();
            return;
        }

        const handleVoicesChanged = () => {
            window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
            finish();
        };

        window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged, { once: true });
        setTimeout(() => {
            window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
            finish();
        }, 350);
    });

    await new Promise((resolve) => {
        try {
            window.speechSynthesis.cancel();
            const primer = new SpeechSynthesisUtterance('commentator ready');
            primer.volume = 0;
            primer.rate = 1;
            primer.pitch = 1;
            primer.onend = resolve;
            primer.onerror = resolve;
            setTimeout(() => {
                try {
                    window.speechSynthesis.speak(primer);
                } catch (err) {
                    resolve();
                }
            }, 0);
        } catch (err) {
            resolve();
        }
    });

    isSpeechPrimed = true;
}

function displayCommentary(text) {
    const isCommentatorEnabled = document.getElementById('cfg-enable-commentator')?.checked !== false;
    if (!isCommentatorEnabled) return Promise.resolve();

    const bubble = document.getElementById('commentator-bubble');
    const txtNode = document.getElementById('commentator-text');
    if (!bubble || !txtNode) return Promise.resolve();

    txtNode.textContent = text;
    bubble.style.display = 'block';

    if (commentaryHideTimeout) clearTimeout(commentaryHideTimeout);
    
    const p = speakCommentary(text);

    commentaryHideTimeout = setTimeout(() => {
        bubble.style.display = 'none';
    }, 8000); // Premium visual duration of 8 seconds
    
    return p;
}

function speakCommentary(text) {
    const volumeSlider = document.getElementById('cfg-commentator-volume');
    const ttsVolume = volumeSlider ? parseInt(volumeSlider.value) : 100; // 0 to 100
    
    // Safety sanitization: remove formatting characters and emojis client-side before speaking
    let sanitizedText = text || "";
    sanitizedText = sanitizedText.replace(/[\*_`~]/g, "");
    try {
        sanitizedText = sanitizedText.replace(/\p{Extended_Pictographic}/gu, "");
    } catch (err) {}
    sanitizedText = sanitizedText.replace(/\s+/g, " ").trim();

    if (!sanitizedText) {
        return Promise.resolve();
    }

    if (ttsVolume === 0) {
        const estimateMs = estimateCommentaryDurationMs(sanitizedText);
        console.log(`[TTS] Local audio is muted (Volume 0%). Simulating speaking delay of ${estimateMs}ms for physical device sync.`);
        return waitForCommentaryDuration(sanitizedText);
    }

    if (!window.speechSynthesis) {
        console.warn("[TTS] window.speechSynthesis is not supported in this browser!");
        return Promise.resolve();
    }
    console.log(`[TTS] speakCommentary trigger: "${sanitizedText}" | Current setting volume: ${ttsVolume}%`);
    const requestNonce = ++commentarySpeechNonce;
    return new Promise((resolve) => {
        try {
            console.log("[TTS] Cancelling existing speech queue...");
            window.speechSynthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(sanitizedText);
            let speechStarted = false;
            let retriedAfterColdStart = false;
            let settled = false;

            const finish = async () => {
                if (settled) return;
                settled = true;
                resolve();
            };

            utterance.onstart = () => {
                speechStarted = true;
                isSpeechPrimed = true;
                console.log("[TTS] Speech playback started.");
            };
            
            utterance.onend = () => {
                console.log("[TTS] Speech playback ended successfully.");
                finish();
            };
            utterance.onerror = async (e) => {
                console.warn("[TTS] Speech synthesis error event:", e);
                if (!speechStarted && !retriedAfterColdStart && requestNonce === commentarySpeechNonce) {
                    retriedAfterColdStart = true;
                    console.warn("[TTS] Cold-start speech failure detected. Re-priming speech synthesis and retrying once...");
                    await primeSpeechSynthesis(true);
                    setTimeout(() => {
                        try {
                            if (requestNonce !== commentarySpeechNonce) {
                                finish();
                                return;
                            }
                            window.speechSynthesis.cancel();
                            window.speechSynthesis.speak(utterance);
                        } catch (retryErr) {
                            console.warn("[TTS] Speech synthesis retry failed:", retryErr);
                            waitForCommentaryDuration(sanitizedText).then(finish);
                        }
                    }, 120);
                    return;
                }
                waitForCommentaryDuration(sanitizedText).then(finish);
            };

            const voices = window.speechSynthesis.getVoices();
            console.log(`[TTS] Browser voices loaded: ${voices.length} voices found.`);
            
            // Read commentary language config from the spectator screen
            const targetLang = document.getElementById('cfg-commentary-lang')?.value || 'en';
            let selectedVoice = null;
            
            // Comprehensive list of known female voice names or tags across macOS, iOS, Windows, Android & Chrome
            const femaleKeywords = [
                'sin-ji', 'sinji', 'hiuting', 'hiu-ting', 'szeyin', 'sze-yin', 'tracy', // Cantonese female (Sin-ji, Hiu-ting, Sze-yin, Tracy)
                'ting-ting', 'tingting', 'mei-jia', 'meijia', 'hanhan', 'yating', 'huihui', // Mandarin female
                'zira', 'hazel', 'samantha', 'victoria', 'kathy', 'moira', 'fiona', 'tessa', 'karen', // English female
                'female', 'girl', 'woman', 'siri' // general tags (no single letter 'f' to avoid matching 'Microsoft')
            ];

            // List of known male voice profiles to explicitly deprioritize
            const maleKeywords = [
                'danny', 'kangkang', 'zhiwei', 'george', 'david', 'male', 'man', 'boy', 'guy'
            ];

            const isFemaleVoice = (v) => {
                const nameLower = v.name.toLowerCase();
                return femaleKeywords.some(keyword => nameLower.includes(keyword));
            };

            const isMaleVoice = (v) => {
                const nameLower = v.name.toLowerCase();
                return maleKeywords.some(keyword => nameLower.includes(keyword));
            };

            let langVoices = [];
            if (targetLang === 'zh-HK') {
                langVoices = voices.filter(v => v.lang.includes('zh-HK'))
                    .concat(voices.filter(v => v.lang.includes('zh-TW')))
                    .concat(voices.filter(v => v.lang.startsWith('zh')));
            } else if (targetLang === 'zh-TW') {
                langVoices = voices.filter(v => v.lang.includes('zh-TW'))
                    .concat(voices.filter(v => v.lang.includes('zh-HK')))
                    .concat(voices.filter(v => v.lang.startsWith('zh')));
            } else if (targetLang === 'ja') {
                langVoices = voices.filter(v => v.lang.startsWith('ja'));
            } else {
                langVoices = voices.filter(v => v.lang.startsWith('en'));
            }

            console.log(`[TTS] Language pool filter for "${targetLang}": found ${langVoices.length} matching voices.`);

            // Check if user has explicitly selected a specific voice from the UI selector dropdown
            const userSelectedVoiceName = document.getElementById('cfg-commentary-voice')?.value || 'auto';
            if (userSelectedVoiceName && userSelectedVoiceName !== 'auto') {
                selectedVoice = voices.find(v => v.name === userSelectedVoiceName);
                if (selectedVoice) {
                    console.log(`[TTS] User-selected specific voice overridden: "${selectedVoice.name}"`);
                }
            }

            // Prioritize:
            // 1. Explicitly matched female voice
            // 2. Gender-neutral or unclassified voice (not explicitly male)
            // 3. Fallback to the first available language voice, then system default
            if (!selectedVoice) {
                selectedVoice = langVoices.find(isFemaleVoice) || 
                                langVoices.find(v => !isMaleVoice(v)) || 
                                langVoices[0] || 
                                voices[0];
                if (selectedVoice) {
                    console.log(`[TTS] Selected female/optimized voice: "${selectedVoice.name}" (${selectedVoice.lang})`);
                }
            }
            
            // Robust fallback language code if specific voice object was not found or is still pre-loading in Firefox
            utterance.lang = targetLang;

            if (selectedVoice) {
                utterance.voice = selectedVoice;
                utterance.lang = selectedVoice.lang;
            } else {
                console.log(`[TTS] No matching voice object found. Falling back to default system voice with lang="${utterance.lang}"`);
            }
            
            utterance.rate = 1.1; // Energy rate boost
            utterance.pitch = 1.25; // Raised pitch slightly to sound more youthful, energetic, and feminine (girls voice!)
            utterance.volume = ttsVolume / 100.0; // Apply the slider volume value (between 0.0 and 1.0)
            
            console.log(`[TTS] Configured parameters: rate=${utterance.rate}, pitch=${utterance.pitch}, volume=${utterance.volume}`);

            // Firefox asynchronous cancellation bug fix: Wait 100ms after cancel() before speaking to prevent speech queue freezing
            console.log("[TTS] Preparing asynchronous delayed speak (100ms queue buffer)...");
            setTimeout(() => {
                try {
                    if (requestNonce !== commentarySpeechNonce) {
                        finish();
                        return;
                    }
                    console.log("[TTS] Executing window.speechSynthesis.speak()...");
                    window.speechSynthesis.speak(utterance);
                } catch (e) {
                    console.warn("[TTS] Speech synthesis speak failed:", e);
                    waitForCommentaryDuration(sanitizedText).then(finish);
                }
            }, 100);
        } catch (e) {
            console.warn("[TTS] Speech synthesis failed:", e);
            waitForCommentaryDuration(sanitizedText).then(resolve);
        }
    });
}

function addTickerMsg(msg, playerClass) { const el = document.createElement('div'); el.className = `ticker-msg ${playerClass}`; el.textContent = `> ${msg}`; ticker.appendChild(el); ticker.scrollTop = ticker.scrollHeight; if (ticker.children.length > 5) ticker.removeChild(ticker.firstChild); }
function triggerHitEffect(victimID) { const view = (victimID === 'player1') ? viewP1 : viewP2; view.classList.add('hit-shake'); const flash = document.createElement('div'); flash.className = 'hit-flash'; view.appendChild(flash); setTimeout(() => { view.classList.remove('hit-shake'); if (flash.parentNode) view.removeChild(flash); }, 400); }
function updatePowerBar() { const total = p1ScoreVal + p2ScoreVal; if (total === 0) powerP1.style.width = '50%'; else powerP1.style.width = `${(p1ScoreVal / total) * 100}%`; }

function logClientDebug(level, scope, message, details = null) {
    const prefix = `[${scope}] ${message}`;
    const normalizedLevel = (level || 'INFO').toUpperCase();
    if (normalizedLevel === 'ERROR') {
        console.error(prefix, details || '');
    } else if (normalizedLevel === 'WARN' || normalizedLevel === 'WARNING') {
        console.warn(prefix, details || '');
    } else {
        console.log(prefix, details || '');
    }

    const serializedDetails = details ? ` | ${JSON.stringify(details)}` : '';
    fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            level: normalizedLevel,
            message: `${prefix}${serializedDetails}`
        })
    }).catch(() => {});
}

let isAudioUnlocked = false;
async function masterAudioUnlock() {
    if (isAudioUnlocked) return;
    const unlockSrc = getVideoUrl('win/heroacademy.mp4');
    for (const v of [p1Cinema, p2Cinema, resultCinema]) {
        v.muted = false; v.volume = 1.0; v.src = unlockSrc; v.load();
        try { await v.play(); v.pause(); v.currentTime = 0; } catch(e) {}
    }
    await primeSpeechSynthesis();
    isAudioUnlocked = true; audioHint.textContent = '🔊 Audio Active'; audioHint.classList.add('unlocked');
    setTimeout(() => audioHint.style.display = 'none', 3000);
}
document.addEventListener('click', masterAudioUnlock, { once: true });
emergencyUnmute.addEventListener('click', (e) => { e.stopPropagation(); resultCinema.muted = false; resultCinema.volume = 1.0; resultCinema.play(); emergencyUnmute.style.display = 'none'; });

function resetViewerState() {
    console.log('[Battle] resetViewerState');
    if (winnerTimeoutHandle) clearTimeout(winnerTimeoutHandle); winnerTimeoutHandle = null;
    if (resultTimeoutHandle) clearTimeout(resultTimeoutHandle); resultTimeoutHandle = null;
    if (commentaryHideTimeout) clearTimeout(commentaryHideTimeout); commentaryHideTimeout = null;
    commentarySpeechNonce += 1;
    const commentaryBubble = document.getElementById('commentator-bubble');
    if (commentaryBubble) commentaryBubble.style.display = 'none';
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    isMatchOver = false; isWinnerLogicActive = false; hasMatchStarted = false;
    p1Active = false; p2Active = false; p1ScoreVal = 0; p2ScoreVal = 0;
    lastP1ScoreVal = 0; lastP2ScoreVal = 0;
    spokenTimeTimemarks.clear();
    lastCustomCommentaryTime = 0; lastPeriodicCommentaryTime = 0; prevMatchActive = false;
    activeCinematicsCount = 0;
    resultOverlay.style.display = 'none'; emergencyUnmute.style.display = 'none';
    if (skipResultBtn) skipResultBtn.style.display = 'none';
    resultCinema.pause(); resultCinema.style.display = 'none'; resultCinema.src = "";
    [p1Cinema, p2Cinema].forEach(c => { c.pause(); c.src = ""; c.style.display = 'none'; });
    p1Score.textContent = '0'; p2Score.textContent = '0'; timerDisplay.textContent = '00:00';
    p1TimerSub.textContent = ''; p2TimerSub.textContent = '';
    powerP1.style.width = '50%'; ticker.innerHTML = ''; addTickerMsg('MATCH STARTED', '');
    updateLayout();
}

async function waitForSnapshots(sessionId, maxWaitMs = 4500) {
    console.log(`[Battle] Waiting for Player 1 and Player 2 webcam snapshots for session: ${sessionId}...`);
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
        try {
            const [p1Resp, p2Resp] = await Promise.all([
                fetch(`/api/get-snapshot?sessionId=${sessionId}&role=player1`).then(r => r.json()).catch(() => ({})),
                fetch(`/api/get-snapshot?sessionId=${sessionId}&role=player2`).then(r => r.json()).catch(() => ({}))
            ]);
            if (p1Resp && p1Resp.success && p2Resp && p2Resp.success) {
                console.log('[Battle] Both player webcam snapshots successfully uploaded!');
                await new Promise(r => setTimeout(r, 200));
                return true;
            }
        } catch (e) {
            console.warn('[Battle] Error polling snapshots:', e);
        }
        await new Promise(r => setTimeout(r, 300));
    }
    console.log('[Battle] Snapshot wait timed out. Proceeding with available frames.');
    return false;
}

async function startMatch() {
    if (startBtn.disabled) return;
    startBtn.disabled = true;
    const originalText = startBtn.textContent;
    const originalBg = startBtn.style.background;
    startBtn.textContent = '⚙️ INITIALIZING...';
    startBtn.style.background = '#555';
    startBtn.style.cursor = 'not-allowed';

    try {
        if (!sync) {
            startBtn.disabled = false;
            startBtn.textContent = originalText;
            startBtn.style.background = originalBg;
            startBtn.style.cursor = 'pointer';
            return;
        }
        sync.broadcast('CLOSE_OVERLAYS', { isStarting: true });
        await masterAudioUnlock(); resetViewerState();

        // Generate a clean, unique active session ID for this match
        const baseSessionId = getOpenclawBaseSessionId();
        const dynamicSessionId = `${baseSessionId}_${Date.now()}`;
        localStorage.setItem('openclawActiveSessionId', dynamicSessionId);

        // Register the new dynamic room session ID with OpenClaw bridge
        const signalingUrl = sync.signalingUrl || window.location.origin;
        await callBridge('/api/register-room', {
            sessionId: dynamicSessionId,
            roomCode: currentRoomCode,
            signalingUrl: signalingUrl
        });

        // Reset OpenClaw session and prime with the selected system rules once
        const isCommentatorEnabled = document.getElementById('cfg-enable-commentator')?.checked !== false;
        if (isCommentatorEnabled) {
            const isWebcamEnabled = document.getElementById('cfg-commentator-webcam')?.checked !== false;
            if (isWebcamEnabled && sync) {
                // 1. Trigger single-shot start frame webcam capture from Player View
                sync.broadcast('CAPTURE_WEBCAM_FRAME', { phase: 'START', sessionId: dynamicSessionId });
                
                // 2. Wait for player devices to capture and upload both player snapshots with polling (max 4.5s)
                await waitForSnapshots(dynamicSessionId, 4500);
            }

            const commentaryLang = document.getElementById('cfg-commentary-lang')?.value || 'en';
            const isFoulEnabled = document.getElementById('cfg-foul-language')?.checked || false;
            let resp = await callBridge('/api/live-status', {
                sessionId: dynamicSessionId,
                eventType: 'RESET',
                isReset: true,
                p1Score: 0,
                p2Score: 0,
                lang: commentaryLang,
                foulLanguage: isFoulEnabled
            }, { timeoutMs: 60000 });
            let welcomeText = resp?.welcomeMessage || resp?.commentary || "";
            if (!welcomeText) {
                console.warn('[Battle] Initial welcome commentary did not return in time. Retrying once before countdown...');
                resp = await callBridge('/api/live-status', {
                    sessionId: dynamicSessionId,
                    eventType: 'RESET',
                    isReset: true,
                    p1Score: 0,
                    p2Score: 0,
                    lang: commentaryLang,
                    foulLanguage: isFoulEnabled
                }, { timeoutMs: 60000 });
                welcomeText = resp?.welcomeMessage || resp?.commentary || "";
            }
            if (welcomeText) {
                // 3. Wait for the entire welcoming hype commentary to be spoken before countdown
                await displayCommentary(welcomeText);
            } else {
                console.warn('[Battle] Initial welcome commentary still missing; continuing match startup without intro.');
            }
        }

        const countdownVal = parseInt(inCountdown.value) || 0;
        if (countdownVal > 0) {
            countdownOverlay.style.display = 'flex';
            for (let i = countdownVal; i > 0; i--) { countdownText.textContent = i; countdownText.style.animation = 'none'; void countdownText.offsetWidth; countdownText.style.animation = 'winner-pop 0.5s'; await new Promise(r => setTimeout(r, 1000)); }
            countdownText.textContent = "GO!"; await new Promise(r => setTimeout(r, 500)); countdownOverlay.style.display = 'none';
        }
        const syncGestureCheckbox = document.getElementById('cfg-sync-gesture');
        const isSyncedMode = syncGestureCheckbox ? syncGestureCheckbox.checked : false;
        let actionList = null;

        if (isSyncedMode) {
            // Get the exhaustive, complete list of domains and techniques
            const allActions = [
                "Unlimited Void", "Malevolent Shrine", "Self-Embodiment of Perfection", 
                "Authentic Mutual Love", "Idle Death Gamble", "Yuji Itadori", 
                "Chimera Shadow Garden", "Time Cell Moon Palace", "Lapse Blue", 
                "Reversal Red", "Hollow Purple"
            ];
            // Shuffle them once for this match and crop to the round length count
            const shuffled = allActions.sort(() => Math.random() - 0.5);
            actionList = shuffled.slice(0, Math.min(parseInt(inCount.value) || 11, shuffled.length));
            console.log(`[Battle] Generated synchronized technique target list for both players:`, actionList);
        }

        sync.broadcast('START_BATTLE', { 
            difficulty: parseInt(inDifficulty.value), 
            count: parseInt(inCount.value),
            openclawSessionId: dynamicSessionId,
            actionList: actionList // Send synchronized technique list to players
        });
        hasMatchStarted = true;
        startBtn.style.background = '#4CAF50'; startBtn.textContent = 'GAME RUNNING';
        setTimeout(() => { 
            startBtn.disabled = false;
            startBtn.style.background = '#FF5252'; 
            startBtn.textContent = 'START BATTLE'; 
            startBtn.style.cursor = 'pointer';
        }, 3000);
    } catch (err) {
        console.error('[Battle] Failed to start match:', err);
        startBtn.disabled = false;
        startBtn.textContent = 'START BATTLE (FAILED)';
        startBtn.style.background = '#FF5252';
        startBtn.style.cursor = 'pointer';
    }
}
startBtn.addEventListener('click', startMatch);

function getVideoUrl(subPath) {
    const hostname = window.location.hostname;
    const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname);
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || isIp || window.location.protocol === 'file:';
    const GITHUB_PAGES_BASE = "https://wongcyrus.github.io/domain-expansion-ar-game/";
    return isLocal ? `${window.location.origin}${window.location.pathname.replace(/\/[^\/]*$/, '')}/static/video/${subPath}` : `${GITHUB_PAGES_BASE}static/video/${subPath}`;
}

function playGlobalResultVideo(isWin, winnerName) {
    const folder = isWin ? 'win' : 'lose';
    const video = (isWin ? winVideos : loseVideos)[Math.floor(Math.random() * (isWin ? winVideos : loseVideos).length)];
    const absSrc = getVideoUrl(`${folder}/${video}`);
    closeResultBtn.style.display = 'none';
    if (skipResultBtn) skipResultBtn.style.display = 'block';
    const duration = VIDEO_DURATIONS[video] || 15000;
    
    // Dynamic boundary border-color and neon-glow based on the winner!
    if (winnerName === 'PLAYER 1') {
        resultCinema.style.borderColor = '#4A90E2'; // P1 Blue
        resultCinema.style.boxShadow = '0 0 60px rgba(74, 144, 226, 0.8)';
    } else if (winnerName === 'PLAYER 2') {
        resultCinema.style.borderColor = '#FFFF00'; // P2 Yellow
        resultCinema.style.boxShadow = '0 0 60px rgba(255, 255, 0, 0.8)';
    } else {
        resultCinema.style.borderColor = '#FF5252'; // Draw Red
        resultCinema.style.boxShadow = '0 0 60px rgba(255, 82, 82, 0.8)';
    }

    resultCinema.pause(); resultCinema.src = absSrc; resultCinema.style.display = 'block'; resultCinema.load();
    const onCanPlay = () => {
        resultCinema.muted = false; resultCinema.volume = 1.0;
        resultCinema.play().catch(() => { emergencyUnmute.style.display = 'block'; resultCinema.muted = true; resultCinema.play(); });
        resultCinema.removeEventListener('canplay', onCanPlay);
    };
    resultCinema.addEventListener('canplay', onCanPlay);
    let hasEnded = false;
    const endResult = () => {
        if (hasEnded) return; hasEnded = true;
        if (resultTimeoutHandle) clearTimeout(resultTimeoutHandle);
        resultCinema.pause(); resultCinema.style.display = 'none';
        if (skipResultBtn) skipResultBtn.style.display = 'none';
        closeResultBtn.style.display = 'block';
        
        // Load, show, and initialize the central Scroll of Honor only after victory video is finished or skipped!
        initCentralScrollOfHonor();
    };
    resultCinema.onended = endResult;
    if (skipResultBtn) skipResultBtn.onclick = endResult;
    resultTimeoutHandle = setTimeout(endResult, duration + 1000);
}

async function showWinner() {
    if (isWinnerLogicActive) return;
    isWinnerLogicActive = true; isMatchOver = true; hasMatchStarted = false;
    if (winnerTimeoutHandle) { clearTimeout(winnerTimeoutHandle); winnerTimeoutHandle = null; }
    if (sync) sync.broadcast('MATCH_OVER', null);
    [p1Cinema, p2Cinema].forEach(c => { c.pause(); c.src = ""; c.style.display = 'none'; });
    resScoreP1.textContent = p1ScoreVal; resScoreP2.textContent = p2ScoreVal;
    const maxPossible = Math.max(p1TotalActions, p2TotalActions, 11);
    const PASS_MARK = Math.ceil(maxPossible / 2);
    const winnerScore = Math.max(p1ScoreVal, p2ScoreVal);
    
    let winnerName = 'DRAW';
    if (p1ScoreVal === p2ScoreVal) { winnerText.textContent = 'DRAW MATCH'; winnerSubtext.textContent = 'EQUAL POWER'; winnerText.style.color = '#FFF'; }
    else if (p1ScoreVal > p2ScoreVal) { winnerName = 'PLAYER 1'; winnerText.textContent = 'PLAYER 1 WINS'; winnerText.style.color = '#4A90E2'; winnerSubtext.textContent = (p1ScoreVal >= p1TotalActions) ? 'PERFECT VICTORY' : 'VICTORY'; }
    else { winnerName = 'PLAYER 2'; winnerText.textContent = 'PLAYER 2 WINS'; winnerText.style.color = '#FFFF00'; winnerSubtext.textContent = (p2ScoreVal >= p2TotalActions) ? 'PERFECT VICTORY' : 'VICTORY'; }
    
    resultOverlay.style.display = 'flex';
    playGlobalResultVideo(winnerScore >= PASS_MARK, winnerName);
    updateLayout();

    // Trigger final match comments from the OpenClaw agent
    const isCommentatorEnabled = document.getElementById('cfg-enable-commentator')?.checked !== false;
    if (isCommentatorEnabled) {
        const isWebcamEnabled = document.getElementById('cfg-commentator-webcam')?.checked !== false;
        if (isWebcamEnabled && sync) {
            // 1. Trigger single-shot end frame webcam capture from Player View
            const openclawSessionId = getOpenclawActiveSessionId();
            sync.broadcast('CAPTURE_WEBCAM_FRAME', { phase: 'END', sessionId: openclawSessionId });
            
            // 2. Wait for player device to capture and upload the image (1000ms delay)
            await new Promise(r => setTimeout(r, 1000));
        }

        const openclawSessionId = getOpenclawActiveSessionId();
        const commentaryLang = document.getElementById('cfg-commentary-lang')?.value || 'en';
        const isFoulEnabled = document.getElementById('cfg-foul-language')?.checked || false;
        callBridge('/api/battle-result', {
            sessionId: openclawSessionId,
            winner: winnerName,
            p1Score: p1ScoreVal,
            p2Score: p2ScoreVal,
            p1Total: p1TotalActions,
            p2Total: p2TotalActions,
            lang: commentaryLang,
            foulLanguage: isFoulEnabled
        }).then(res => {
            if (res && res.commentary) {
                displayCommentary(res.commentary);
            }
        });
    }
}

function setupSyncCallbacks() {
    if (!sync) return;
    sync.onStreamReceived = (playerID, stream) => {
        if (playerID === 'player1') { p1Video.srcObject = stream; p1Waiting.style.display = 'none'; p1Video.play().catch(() => {}); }
        else if (playerID === 'player2') { p2Video.srcObject = stream; p2Waiting.style.display = 'none'; p2Video.play().catch(() => {}); }
    };
    sync.onPlayVideoSync = (playerID, videoSrc) => {
        if (isMatchOver) return;
        activeCinematicsCount++;
        
        // Read dynamic score grace window from UI configuration slider
        const graceSlider = document.getElementById('cfg-score-grace');
        const graceSeconds = graceSlider ? parseFloat(graceSlider.value) : 1.0;

        if (graceSeconds <= 0.0) {
            // Immediate pause
            sync.broadcast('MATCH_PAUSE', null);
            console.log(`[BattleSync] Immediate pause broadcasted to players.`);
        } else {
            // Delayed pause - allows the other player to score within the grace period!
            console.log(`[BattleSync] Cinematic started. Scheduling delayed MATCH_PAUSE after grace window of ${graceSeconds}s...`);
            setTimeout(() => {
                if (isMatchOver) return;
                // Only broadcast pause if this cinematic (or any cinematic) is still active and needs freezing!
                if (activeCinematicsCount > 0) {
                    console.log(`[BattleSync] Grace period of ${graceSeconds}s elapsed. Freezing players.`);
                    sync.broadcast('MATCH_PAUSE', null);
                }
            }, graceSeconds * 1000);
        }
        
        // Premium dynamic ticker update for cast actions
        const actionName = getActionNameFromVideo(videoSrc);
        addTickerMsg(`${playerID === 'player1' ? 'PLAYER 1' : 'PLAYER 2'} ACTIVATED ${actionName.toUpperCase()}`, playerID === 'player1' ? 'ticker-p1' : 'ticker-p2');

        const cinema = (playerID === 'player1') ? p1Cinema : p2Cinema;
        cinema.src = videoSrc; cinema.style.display = 'block'; cinema.load();
        updateLayout();
        const videoFile = videoSrc.split('/').pop();
        const duration = VIDEO_DURATIONS[videoFile] || 15000;
        
        // Report cast event to OpenClaw bridge
        lastCustomCommentaryTime = Date.now();
        lastPeriodicCommentaryTime = Date.now();
        const isCommentatorEnabled = document.getElementById('cfg-enable-commentator')?.checked !== false;
        if (isCommentatorEnabled) {
            // Push this cast to pending casts
            pendingCasts.push({ playerID, actionName, videoSrc });

            // Clear existing timeout so we debounce and aggregate near-simultaneous scores
            if (castTimeoutHandle) {
                clearTimeout(castTimeoutHandle);
            }

            // Wait slightly for the grace window (or a minimum fallback delay of 50ms) to see if the other player also scores
            const delayMs = graceSeconds > 0 ? (graceSeconds * 1000) : 50;

            castTimeoutHandle = setTimeout(() => {
                const currentCasts = [...pendingCasts];
                pendingCasts = [];
                castTimeoutHandle = null;

                if (currentCasts.length === 0) return;

                let detail = "";
                if (currentCasts.length === 1) {
                    const cast = currentCasts[0];
                    detail = `${cast.playerID === 'player1' ? 'Player 1' : 'Player 2'} successfully activated ${cast.actionName}`;
                } else {
                    // Both players scored within the grace period!
                    const p1Cast = currentCasts.find(c => c.playerID === 'player1');
                    const p2Cast = currentCasts.find(c => c.playerID === 'player2');
                    if (p1Cast && p2Cast) {
                        detail = `Incredible! Both Player 1 (who cast ${p1Cast.actionName}) and Player 2 (who cast ${p2Cast.actionName}) successfully activated their techniques at the exact same time!`;
                    } else {
                        detail = `Multiple techniques activated simultaneously: ` + currentCasts.map(c => `${c.playerID === 'player1' ? 'Player 1' : 'Player 2'} (${c.actionName})`).join(', ');
                    }
                }

                const openclawSessionId = getOpenclawActiveSessionId();
                const commentaryLang = document.getElementById('cfg-commentary-lang')?.value || 'en';
                const isFoulEnabled = document.getElementById('cfg-foul-language')?.checked || false;

                callBridge('/api/live-status', {
                    sessionId: openclawSessionId,
                    eventType: 'CAST',
                    detail: detail,
                    p1Score: p1ScoreVal,
                    p2Score: p2ScoreVal,
                    p1Total: p1TotalActions,
                    p2Total: p2TotalActions,
                    timeLeft: Math.max(p1Time, p2Time),
                    lang: commentaryLang,
                    foulLanguage: isFoulEnabled
                }).then(res => {
                    if (res && res.commentary) {
                        displayCommentary(res.commentary);
                    }
                });
            }, delayMs);
        }

        let hasEnded = false;
        const endLogic = () => {
            if (hasEnded) return; hasEnded = true;
            cinema.pause(); cinema.src = "";
            activeCinematicsCount--;
            updateLayout();
            if (activeCinematicsCount <= 0) { activeCinematicsCount = 0; sync.broadcast('MATCH_RESUME', null); addTickerMsg(`MATCH RESUMED`, ''); }
        };
        cinema.oncanplay = () => { cinema.muted = false; cinema.volume = 1.0; cinema.play().catch(() => { cinema.muted = true; cinema.play(); }); };
        cinema.onended = endLogic;
        setTimeout(endLogic, duration + 1000);
    };
    sync.onStateReceived = (playerID, state) => {
        const { domain, score, timer, isGameActive, totalActions } = state;
        if (isGameActive) {
            hasMatchStarted = true;
        }

        if (playerID === 'player1') {
            p1ScoreVal = score; p1Score.textContent = score; if (resScoreP1) resScoreP1.textContent = score;
            p1Time = isGameActive ? timer : 0; if (totalActions !== undefined) p1TotalActions = totalActions;
            if (domain) { p1Domain.textContent = domain; p1Domain.classList.add('active'); } else { p1Domain.classList.remove('active'); }
            if (isGameActive) p1TimerSub.textContent = `(${timer}s)`;
            else { p1TimerSub.textContent = ''; if (p1Active) addTickerMsg(`P1 FINISHED: ${score}/${p1TotalActions}`, 'ticker-p1'); }
            p1Active = isGameActive;
        } else if (playerID === 'player2') {
            p2ScoreVal = score; p2Score.textContent = score; if (resScoreP2) resScoreP2.textContent = score;
            p2Time = isGameActive ? timer : 0; if (totalActions !== undefined) p2TotalActions = totalActions;
            if (domain) { p2Domain.textContent = domain; p2Domain.classList.add('active'); } else { p2Domain.classList.remove('active'); }
            if (isGameActive) p2TimerSub.textContent = `(${timer}s)`;
            else { p2TimerSub.textContent = ''; if (p2Active) addTickerMsg(`P2 FINISHED: ${score}/${p2TotalActions}`, 'ticker-p2'); }
            p2Active = isGameActive;
        }
        if (!isWinnerLogicActive && hasMatchStarted) {
            updatePowerBar();
            if (!p1Active && !p2Active && (p1ScoreVal > 0 || p2ScoreVal > 0)) { if (!winnerTimeoutHandle) winnerTimeoutHandle = setTimeout(showWinner, 500); }
            else if (!p1Active && p2Active && p2TotalActions > 0 && p1ScoreVal > (p2ScoreVal + p2TotalActions)) { if (!winnerTimeoutHandle) winnerTimeoutHandle = setTimeout(showWinner, 500); }
            else if (!p2Active && p1Active && p1TotalActions > 0 && p2ScoreVal > (p1ScoreVal + p1TotalActions)) { if (!winnerTimeoutHandle) winnerTimeoutHandle = setTimeout(showWinner, 500); }
        }
        const activeTime = Math.max(p1Time, p2Time);
        if (p1Active || p2Active) timerDisplay.textContent = activeTime + 's';
        else if (!isWinnerLogicActive) timerDisplay.textContent = '00:00';

        const isMatchActive = p1Active || p2Active;
        const now = Date.now();
        
        // Initialize commentator timers when the match round actually goes active
        // to prevent immediate, repetitive fallback commentary trigger
        if (isMatchActive && !prevMatchActive) {
            lastCustomCommentaryTime = now;
            lastPeriodicCommentaryTime = now;
        }
        prevMatchActive = isMatchActive;

        const minInterphraseDuration = 4500; // Cooling buffer to allow current speech to finish
        const canSpeak = (now - lastCustomCommentaryTime > minInterphraseDuration);

        let triggerTimeCritical = false;
        let eventTypeToSend = 'PERIODIC';
        let detailToSend = '';

        // Handle critical final timemark alerts
        if (isMatchActive && (activeTime === 10 || activeTime === 5 || activeTime === 3) && !spokenTimeTimemarks.has(activeTime)) {
            spokenTimeTimemarks.add(activeTime);
            eventTypeToSend = 'TIME_CRITICAL';
            detailToSend = `Only ${activeTime} seconds remaining in the match! The battle is near its end!`;
            triggerTimeCritical = true;
        }

        // Trigger dynamic, reactive commentary (Lead Changes, Scores, Ties, Timemarks)
        const isCommentatorEnabled = document.getElementById('cfg-enable-commentator')?.checked !== false;
        if (isMatchActive && triggerTimeCritical && canSpeak && isCommentatorEnabled) {
            lastCustomCommentaryTime = now;
            lastPeriodicCommentaryTime = now;
            const openclawSessionId = getOpenclawActiveSessionId();
            const commentaryLang = document.getElementById('cfg-commentary-lang')?.value || 'en';
            const isFoulEnabled = document.getElementById('cfg-foul-language')?.checked || false;
            callBridge('/api/live-status', {
                sessionId: openclawSessionId,
                eventType: eventTypeToSend,
                detail: detailToSend,
                p1Score: p1ScoreVal,
                p2Score: p2ScoreVal,
                p1Total: p1TotalActions,
                p2Total: p2TotalActions,
                timeLeft: activeTime,
                lang: commentaryLang,
                foulLanguage: isFoulEnabled
            }).then(res => {
                if (res && res.commentary) {
                    displayCommentary(res.commentary);
                }
            });
        }
        // Fallback periodic commentary if nothing exciting has happened for 35 seconds
        else if (isMatchActive && (now - lastPeriodicCommentaryTime > 35000) && canSpeak && isCommentatorEnabled) {
            lastPeriodicCommentaryTime = now;
            lastCustomCommentaryTime = now;
            const openclawSessionId = getOpenclawActiveSessionId();
            const commentaryLang = document.getElementById('cfg-commentary-lang')?.value || 'en';
            const isFoulEnabled = document.getElementById('cfg-foul-language')?.checked || false;
            callBridge('/api/live-status', {
                sessionId: openclawSessionId,
                eventType: 'PERIODIC',
                p1Score: p1ScoreVal,
                p2Score: p2ScoreVal,
                p1Total: p1TotalActions,
                p2Total: p2TotalActions,
                timeLeft: activeTime,
                lang: commentaryLang,
                foulLanguage: isFoulEnabled
            }).then(res => {
                if (res && res.commentary) {
                    displayCommentary(res.commentary);
                }
            });
        }
    };
}
closeResultBtn.addEventListener('click', () => { resetViewerState(); if (sync) sync.broadcast('CLOSE_OVERLAYS', null); });
if (netModeSelect) netModeSelect.value = currentNetMode;
updateSyncMode();
updateLayout();

// Hook up Commentator UI toggle settings and localStorage persistence
const enableCommentatorCheckbox = document.getElementById('cfg-enable-commentator');
const commentatorVolumeSlider = document.getElementById('cfg-commentator-volume');
const commentatorVolumeVal = document.getElementById('val-commentator-volume');
const commentatorWebcamCheckbox = document.getElementById('cfg-commentator-webcam');
const commentatorImagePolicySelector = document.getElementById('cfg-commentator-image-policy');

// Always accessible quick controls & inline commentator bubble controls
const quickVolumeSlider = document.getElementById('quick-volume-slider');
const quickVolumeVal = document.getElementById('quick-volume-val');
const quickMuteBtn = document.getElementById('quick-mute-btn');

const bubbleVolumeSlider = document.getElementById('bubble-volume-slider');
const bubbleVolumeVal = document.getElementById('bubble-volume-val');
const bubbleMuteBtn = document.getElementById('bubble-mute-btn');

let preMuteVolume = '100'; // Keep track of previous volume level before mute

function updateAllVolumeControls(val) {
    const intVal = parseInt(val) || 0;
    
    // 1. Update Sidebar Controls
    if (commentatorVolumeSlider) {
        commentatorVolumeSlider.value = val;
    }
    if (commentatorVolumeVal) {
        commentatorVolumeVal.textContent = val + '%';
    }
    
    // 2. Update Always-Visible Quick Controls
    if (quickVolumeSlider) {
        quickVolumeSlider.value = val;
    }
    if (quickVolumeVal) {
        quickVolumeVal.textContent = val + '%';
    }
    if (quickMuteBtn) {
        quickMuteBtn.textContent = intVal === 0 ? '🔇' : '🔊';
    }
    
    // 3. Update Inline Commentator Bubble Controls
    if (bubbleVolumeSlider) {
        bubbleVolumeSlider.value = val;
    }
    if (bubbleVolumeVal) {
        bubbleVolumeVal.textContent = val + '%';
    }
    if (bubbleMuteBtn) {
        bubbleMuteBtn.textContent = intVal === 0 ? '🔇' : '🔊';
    }
    
    localStorage.setItem('cfg-commentator-volume', val);
    
    if (intVal === 0) {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    }
}

if (enableCommentatorCheckbox) {
    const saved = localStorage.getItem('cfg-enable-commentator');
    if (saved !== null) {
        enableCommentatorCheckbox.checked = saved === 'true';
    }
    enableCommentatorCheckbox.addEventListener('change', () => {
        localStorage.setItem('cfg-enable-commentator', enableCommentatorCheckbox.checked);
        if (!enableCommentatorCheckbox.checked) {
            const bubble = document.getElementById('commentator-bubble');
            if (bubble) bubble.style.display = 'none';
            if (window.speechSynthesis) window.speechSynthesis.cancel();
        }
    });
}

function syncCommentatorImagePolicyUi() {
    if (!commentatorImagePolicySelector) return;
    const isWebcamEnabled = commentatorWebcamCheckbox?.checked !== false;
    commentatorImagePolicySelector.disabled = !isWebcamEnabled;
    commentatorImagePolicySelector.style.opacity = isWebcamEnabled ? '1' : '0.5';
    commentatorImagePolicySelector.title = isWebcamEnabled
        ? 'Choose when both player snapshots are sent to the AI commentator'
        : 'Enable webcam snapshots to send player images to the AI commentator';
}

if (commentatorImagePolicySelector) {
    const savedPolicy = localStorage.getItem('agent_image_policy');
    const resolvedPolicy = ['always', 'start_end', 'never'].includes(savedPolicy) ? savedPolicy : 'always';
    commentatorImagePolicySelector.value = resolvedPolicy;
    localStorage.setItem('agent_image_policy', resolvedPolicy);
    commentatorImagePolicySelector.addEventListener('change', () => {
        localStorage.setItem('agent_image_policy', commentatorImagePolicySelector.value);
    });
}

if (commentatorWebcamCheckbox) {
    const savedWebcam = localStorage.getItem('cfg-commentator-webcam');
    if (savedWebcam !== null) {
        commentatorWebcamCheckbox.checked = savedWebcam === 'true';
    }
    commentatorWebcamCheckbox.addEventListener('change', () => {
        localStorage.setItem('cfg-commentator-webcam', commentatorWebcamCheckbox.checked);
        syncCommentatorImagePolicyUi();
    });
    syncCommentatorImagePolicyUi();
}

// Initial Volume State Load
const savedVolume = localStorage.getItem('cfg-commentator-volume') || '100';
updateAllVolumeControls(savedVolume);

// Attach Inputs & Change listeners for perfect synchronization in real time
if (commentatorVolumeSlider) {
    commentatorVolumeSlider.addEventListener('input', () => {
        updateAllVolumeControls(commentatorVolumeSlider.value);
    });
}

if (quickVolumeSlider) {
    quickVolumeSlider.addEventListener('input', () => {
        updateAllVolumeControls(quickVolumeSlider.value);
    });
}

if (quickMuteBtn) {
    quickMuteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentVal = parseInt(localStorage.getItem('cfg-commentator-volume') || '100');
        if (currentVal > 0) {
            preMuteVolume = String(currentVal);
            updateAllVolumeControls('0');
        } else {
            updateAllVolumeControls(preMuteVolume || '100');
        }
    });
}

if (bubbleVolumeSlider) {
    bubbleVolumeSlider.addEventListener('input', () => {
        updateAllVolumeControls(bubbleVolumeSlider.value);
    });
}

if (bubbleMuteBtn) {
    bubbleMuteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentVal = parseInt(localStorage.getItem('cfg-commentator-volume') || '100');
        if (currentVal > 0) {
            preMuteVolume = String(currentVal);
            updateAllVolumeControls('0');
        } else {
            updateAllVolumeControls(preMuteVolume || '100');
        }
    });
}

// Pre-load and cache SpeechSynthesis voices to guarantee compatibility with Firefox & Chrome
const commentaryVoiceSelector = document.getElementById('cfg-commentary-voice');
const commentaryLangSelector = document.getElementById('cfg-commentary-lang');

function updateVoiceSelectorOptions() {
    if (!commentaryVoiceSelector || !window.speechSynthesis) return;
    
    const targetLang = commentaryLangSelector?.value || 'en';
    const voices = window.speechSynthesis.getVoices();
    
    // Filter voices matching the language pool rules
    let langVoices = [];
    if (targetLang === 'zh-HK') {
        langVoices = voices.filter(v => v.lang.includes('zh-HK'))
            .concat(voices.filter(v => v.lang.includes('zh-TW')))
            .concat(voices.filter(v => v.lang.startsWith('zh')));
    } else if (targetLang === 'zh-TW') {
        langVoices = voices.filter(v => v.lang.includes('zh-TW'))
            .concat(voices.filter(v => v.lang.includes('zh-HK')))
            .concat(voices.filter(v => v.lang.startsWith('zh')));
    } else if (targetLang === 'ja') {
        langVoices = voices.filter(v => v.lang.startsWith('ja'));
    } else {
        langVoices = voices.filter(v => v.lang.startsWith('en'));
    }

    // Deduplicate voices just in case (by name)
    const uniqueVoices = [];
    const seen = new Set();
    for (const v of langVoices) {
        if (!seen.has(v.name)) {
            seen.add(v.name);
            uniqueVoices.push(v);
        }
    }

    // Keep track of currently selected option before we wipe options
    const previousSelection = commentaryVoiceSelector.value;

    // Clear previous options except the first "Auto-Select" one
    commentaryVoiceSelector.innerHTML = '<option value="auto">✨ Auto-Select (Optimized Female)</option>';

    uniqueVoices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name; // Use voice name as identifier
        
        let displayName = v.name;
        // Add female emoji helper if it is a female profile
        const isFemale = v.name.toLowerCase().includes('tracy') || 
                         v.name.toLowerCase().includes('hiuting') || 
                         v.name.toLowerCase().includes('sin-ji') || 
                         v.name.toLowerCase().includes('samantha') ||
                         v.name.toLowerCase().includes('zira') ||
                         v.name.toLowerCase().includes('victoria');
        if (isFemale) {
            displayName = `🙋‍♀️ ${displayName}`;
        } else if (v.name.toLowerCase().includes('danny') || v.name.toLowerCase().includes('george')) {
            displayName = `🙋‍♂️ ${displayName}`;
        }
        
        opt.textContent = displayName;
        commentaryVoiceSelector.appendChild(opt);
    });

    // Try to restore previous selection, or load from localStorage, otherwise default to "auto"
    const savedVoice = localStorage.getItem('cfg-commentary-voice') || 'auto';
    if (uniqueVoices.some(v => v.name === previousSelection)) {
        commentaryVoiceSelector.value = previousSelection;
    } else if (uniqueVoices.some(v => v.name === savedVoice)) {
        commentaryVoiceSelector.value = savedVoice;
    } else {
        commentaryVoiceSelector.value = 'auto';
    }
}

if (commentaryLangSelector) {
    commentaryLangSelector.addEventListener('change', () => {
        updateVoiceSelectorOptions();
    });
}

if (commentaryVoiceSelector) {
    commentaryVoiceSelector.addEventListener('change', () => {
        localStorage.setItem('cfg-commentary-voice', commentaryVoiceSelector.value);
    });
}

if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.getVoices();
            updateVoiceSelectorOptions();
        };
    }
    // Fire it once on direct DOM ready in case browser loaded voices synchronously
    setTimeout(() => {
        updateVoiceSelectorOptions();
    }, 500);
}

// Score Grace Window Configuration Load & Listeners
const scoreGraceSlider = document.getElementById('cfg-score-grace');
const valScoreGrace = document.getElementById('val-score-grace');

if (scoreGraceSlider && valScoreGrace) {
    // Load saved value or default to 1.0s
    const savedGrace = localStorage.getItem('cfg-score-grace') || '1.0';
    scoreGraceSlider.value = savedGrace;
    valScoreGrace.textContent = parseFloat(savedGrace).toFixed(1) + 's';

    scoreGraceSlider.addEventListener('input', () => {
        valScoreGrace.textContent = parseFloat(scoreGraceSlider.value).toFixed(1) + 's';
        localStorage.setItem('cfg-score-grace', scoreGraceSlider.value);
    });

    window.addEventListener('storage', (e) => {
        if (e.key === 'cfg-score-grace' && e.newValue !== null) {
            scoreGraceSlider.value = e.newValue;
            valScoreGrace.textContent = parseFloat(e.newValue).toFixed(1) + 's';
        }
    });
}

// Synced Same Gesture Configuration Load & Listeners
const syncGestureCheckbox = document.getElementById('cfg-sync-gesture');
if (syncGestureCheckbox) {
    const savedSync = localStorage.getItem('cfg-sync-gesture');
    if (savedSync !== null) {
        syncGestureCheckbox.checked = savedSync === 'true';
    }
    syncGestureCheckbox.addEventListener('change', () => {
        localStorage.setItem('cfg-sync-gesture', syncGestureCheckbox.checked);
    });
}

// AI Domain Portrait Configuration Load & Listeners
const enableAiPortraitCheckbox = document.getElementById('cfg-enable-ai-portrait');
if (enableAiPortraitCheckbox) {
    const savedAi = localStorage.getItem('cfg-enable-ai-portrait');
    if (savedAi !== null) {
        enableAiPortraitCheckbox.checked = savedAi === 'true';
    }
    enableAiPortraitCheckbox.addEventListener('change', () => {
        localStorage.setItem('cfg-enable-ai-portrait', enableAiPortraitCheckbox.checked);
    });
}

function initCentralScrollOfHonor() {
    const p1Preview = document.getElementById('p1-captured-preview');
    const p2Preview = document.getElementById('p2-captured-preview');
    const btnActivateAi = document.getElementById('btn-activate-ai');
    const cfgAiTemplate = document.getElementById('cfg-ai-template');
    const aiStatusText = document.getElementById('ai-status-text');
    const progressBarContainer = document.getElementById('ai-progress-bar-container');
    const progressBar = document.getElementById('ai-progress-bar');
    const resultPanel = document.getElementById('ai-result-panel');
    const qrcodeImg = document.getElementById('ai-qrcode-img');
    const shortUrlLabel = document.getElementById('ai-short-url-label');

    const isAiPortraitEnabled = document.getElementById('cfg-enable-ai-portrait')?.checked !== false;
    const centralWidget = document.getElementById('central-scroll-of-honor');
    if (centralWidget) {
        if (isAiPortraitEnabled) {
            centralWidget.style.display = 'flex';
        } else {
            centralWidget.style.display = 'none';
            return; // Exit early since AI fusion is disabled
        }
    }

    const sessionId = getOpenclawActiveSessionId();

    // Reset visual panels
    if (btnActivateAi) {
        btnActivateAi.style.display = 'block';
        btnActivateAi.disabled = false;
        btnActivateAi.style.opacity = '1';
    }
    if (progressBarContainer) progressBarContainer.style.display = 'none';
    if (progressBar) progressBar.style.width = '0%';
    if (resultPanel) resultPanel.style.display = 'none';
    if (aiStatusText) aiStatusText.textContent = 'Click to fuse and stylize player portraits using Bedrock Nova Canvas!';

    // Load preview images from get-snapshot API
    const loadPreviewImage = async (imgElement, roleName) => {
        if (!imgElement) return;
        imgElement.src = ''; // Clear first
        try {
            const snapUrl = `/api/get-snapshot?sessionId=${encodeURIComponent(sessionId)}&role=${roleName}&t=${Date.now()}`;
            logClientDebug('INFO', 'Central AI Portrait', 'Loading preview image', { sessionId, roleName, snapUrl });
            const response = await fetch(snapUrl);
            if (response.ok) {
                const data = await response.json();
                logClientDebug('INFO', 'Central AI Portrait', 'Preview image response received', { roleName, response: data });
                if (data && data.image) {
                    imgElement.src = data.image;
                }
            }
        } catch (e) {
            logClientDebug('ERROR', 'Central AI Portrait', `Failed to load preview for ${roleName}`, { error: e.message });
        }
    };

    loadPreviewImage(p1Preview, 'player1');
    loadPreviewImage(p2Preview, 'player2');

    // Click handler for activating central AI Style Fusion
    if (btnActivateAi && !btnActivateAi.hasEventListener) {
        btnActivateAi.hasEventListener = true;
        btnActivateAi.addEventListener('click', async () => {
            btnActivateAi.disabled = true;
            btnActivateAi.style.opacity = '0.5';

            if (progressBarContainer) progressBarContainer.style.display = 'block';
            if (progressBar) progressBar.style.width = '10%';
            if (aiStatusText) aiStatusText.textContent = 'Initiating central style fusion sequence...';

            const templateId = cfgAiTemplate ? cfgAiTemplate.value : 'random';
            const enhanceUrl = `/api/enhance-portrait`;
            logClientDebug('INFO', 'Central AI Portrait', 'Invoking trigger API', { enhanceUrl, sessionId, templateId });

            try {
                const response = await fetch(enhanceUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, templateId })
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const result = await response.json();
                logClientDebug('INFO', 'Central AI Portrait', 'Trigger response received', result);

                const shareUrl = `${window.location.origin}/share.html?sessionId=${encodeURIComponent(sessionId)}`;
                const qrcodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shareUrl)}`;

                if (resultPanel) resultPanel.style.display = 'flex';
                if (qrcodeImg) qrcodeImg.src = qrcodeApiUrl;
                if (shortUrlLabel) {
                    shortUrlLabel.innerHTML = `<a href="${shareUrl}" target="_blank" style="color: #FFFF00; text-decoration: underline; font-weight: bold;">${shareUrl}</a><div style="margin-top: 6px; color: rgba(255,255,255,0.65); font-size: 10px;">Scan now to open the live share page while the portrait is still generating.</div>`;
                }

                if (progressBar) progressBar.style.width = '30%';
                if (aiStatusText) aiStatusText.textContent = 'Style fusion enqueued. QR is ready now - the share page will show a loading state until the final portrait is finished.';
                btnActivateAi.style.display = 'none';

                let pollCount = 0;
                const maxPolls = 30; // Max 1 min

                const intervalId = setInterval(async () => {
                    pollCount++;
                    const visualProgress = Math.min(90, 30 + (pollCount * 2));
                    if (progressBar) progressBar.style.width = `${visualProgress}%`;

                    try {
                        const checkUrl = `/api/check-enhancement?sessionId=${encodeURIComponent(sessionId)}&t=${Date.now()}`;
                        logClientDebug('INFO', 'Central AI Portrait', 'Polling enhancement status', { pollCount, checkUrl });
                        const checkResp = await fetch(checkUrl);
                        if (!checkResp.ok) throw new Error(`HTTP ${checkResp.status}`);

                        const checkResult = await checkResp.json();
                        logClientDebug('INFO', 'Central AI Portrait', 'Poll response received', checkResult);

                        if (checkResult.status === 'COMPLETE' && checkResult.url) {
                            clearInterval(intervalId);
                            if (progressBar) progressBar.style.width = '100%';
                            if (aiStatusText) aiStatusText.textContent = 'Style fusion successfully completed!';
                            if (shortUrlLabel) {
                                shortUrlLabel.innerHTML = `<a href="${shareUrl}" target="_blank" style="color: #FFFF00; text-decoration: underline; font-weight: bold;">${shareUrl}</a>`;
                            }
                        } else if (checkResult.status && checkResult.status.startsWith('ERROR:')) {
                            clearInterval(intervalId);
                            if (progressBarContainer) progressBarContainer.style.display = 'none';
                            btnActivateAi.disabled = false;
                            btnActivateAi.style.opacity = '1';
                            btnActivateAi.style.display = 'block';

                            const err = checkResult.status.replace('ERROR:', '').trim();
                            if (err === 'NO_FACE') {
                                if (aiStatusText) aiStatusText.textContent = '❌ No faces detected by Rekognition. Try holding JJK hand signs closer!';
                            } else if (err === 'SNAPSHOTS_MISSING') {
                                if (aiStatusText) aiStatusText.textContent = '❌ Player snapshots were missing in the portrait worker. Check preview loads and upload logs.';
                            } else if (err === 'QUEUE_SEND_FAILED') {
                                if (aiStatusText) aiStatusText.textContent = '❌ Portrait queue failed to start. Check the returned debug details.';
                            } else if (err === 'BEDROCK_LEGACY_MODEL' || err === 'BEDROCK_MODEL_UNAVAILABLE') {
                                if (aiStatusText) aiStatusText.textContent = '❌ Bedrock image model is unavailable for this AWS account right now. Switch to an active model or re-enable Nova Canvas access.';
                            } else if (err === 'BEDROCK_ACCESS_DENIED') {
                                if (aiStatusText) aiStatusText.textContent = '❌ AWS denied Bedrock image generation. Check Lambda Bedrock permissions.';
                            } else {
                                if (aiStatusText) aiStatusText.textContent = `❌ Style fusion failed. Error: ${err}`;
                            }
                        }
                    } catch (pollErr) {
                        logClientDebug('ERROR', 'Central AI Portrait', 'Poll request failed', { error: pollErr.message });
                    }

                    if (pollCount >= maxPolls) {
                        clearInterval(intervalId);
                        if (progressBarContainer) progressBarContainer.style.display = 'none';
                        btnActivateAi.disabled = false;
                        btnActivateAi.style.opacity = '1';
                        btnActivateAi.style.display = 'block';
                        if (aiStatusText) aiStatusText.textContent = '❌ Generation timed out. Please try again!';
                        logClientDebug('WARN', 'Central AI Portrait', 'Generation timed out', { sessionId, templateId, maxPolls });
                    }
                }, 2000);

            } catch (err) {
                logClientDebug('ERROR', 'Central AI Portrait', 'Trigger failed', { error: err.message });
                if (progressBarContainer) progressBarContainer.style.display = 'none';
                btnActivateAi.disabled = false;
                btnActivateAi.style.opacity = '1';
                btnActivateAi.style.display = 'block';
                if (aiStatusText) aiStatusText.textContent = `❌ Connection failed: ${err.message}`;
            }
        });
    }
}
