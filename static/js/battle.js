console.log('[Battle] JS version 2.8 loaded');

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

// Ensure robust default for robot session key
if (!localStorage.getItem('robot_session_key')) {
    localStorage.setItem('robot_session_key', 'mcpserver');
}

// Support session key from URL params
const urlSessionId = urlParams.get('session_key') || urlParams.get('session_id') || urlParams.get('sessionId') || urlParams.get('robot_session_key') || urlParams.get('robot_session_id') || urlParams.get('robotSessionId');
if (urlSessionId) {
    localStorage.setItem('robot_session_key', urlSessionId);
}


let p1Time = 0, p2Time = 0, p1Active = false, p2Active = false, p1ScoreVal = 0, p2ScoreVal = 0, isMatchOver = false, winnerTimeoutHandle = null, hasMatchStarted = false, prevMatchActive = false;
let p1TotalActions = 11, p2TotalActions = 11;
let activeCinematicsCount = 0;
let resultTimeoutHandle = null;
let isWinnerLogicActive = false;
let matchHasBeenActive = false;
let lastReceivedMatchStatus = '';
let localMatchState = null;

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
    if (currentNetMode === 'local') {
        setupLocalOfflineCoordinator();
    }


    // Load serverless config if present to avoid race conditions
    try {
        const response = await fetch('/config.json');
        if (response.ok) {
            const config = await response.json();
            if (config.robotApiEndpoint) {
                localStorage.setItem('robot_api_endpoint', config.robotApiEndpoint);
            }
            if (config.defaultSessionKey) {
                if (!localStorage.getItem('robot_session_key')) {
                    localStorage.setItem('robot_session_key', config.defaultSessionKey);
                }
            }
            if (config.isServerless) {
                console.log('[BattleSync] Serverless mode detected. Setting up LocalOfflineCoordinator on Viewer.');
                setupLocalOfflineCoordinator();
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
if (saveCfgBtn) saveCfgBtn.addEventListener('click', () => { settingsPanel.style.display = 'none'; });
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
let activeCommentaryAudio = null;
let isCommentaryPlaying = false;
let commentaryRequestCount = 0;
let commentaryBusyUntil = 0;

const COMMENTARY_END_BUFFER_MS = 600;
const COMMENTARY_SAFETY_TIMEOUT_BUFFER_MS = 5000;
const COMMENTARY_REQUEST_RETRY_BUFFER_MS = 150;

const POLLY_VOICE_BY_LANG = {
    'zh-HK': { voiceId: 'Hiujin', label: 'Hiujin' },
    'zh-TW': { voiceId: 'Zhiyu', label: 'Zhiyu' },
    'en': { voiceId: 'Joanna', label: 'Joanna' },
    'ja': { voiceId: 'Mizuki', label: 'Mizuki' }
};
const SILENT_AUDIO_DATA_URI = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

function getOpenclawActiveSessionId() {
    return localStorage.getItem('openclawActiveSessionId') || localStorage.getItem('robot_session_key') || 'mcpserver';
}

function getOpenclawBaseSessionId() {
    return localStorage.getItem('robot_session_key') || 'mcpserver';
}

function getCommentaryLanguage() {
    return document.getElementById('cfg-commentary-lang')?.value || 'en';
}

function getCommentaryTtsMode() {
    const mode = document.getElementById('cfg-commentary-tts-mode')?.value || localStorage.getItem('cfg-commentary-tts-mode') || 'browser';
    return mode === 'aws' ? 'aws' : 'browser';
}

function getPollyVoiceConfig(language = getCommentaryLanguage()) {
    return POLLY_VOICE_BY_LANG[language] || POLLY_VOICE_BY_LANG.en;
}

function getCommentaryAudioElement() {
    if (!activeCommentaryAudio) {
        activeCommentaryAudio = new Audio();
        activeCommentaryAudio.preload = 'auto';
    }
    return activeCommentaryAudio;
}

function stopCurrentCommentaryAudio() {
    if (!activeCommentaryAudio) {
        return;
    }

    try {
        // Clear all handlers to prevent race conditions with subsequent playback requests
        activeCommentaryAudio.onended = null;
        activeCommentaryAudio.onerror = null;
        activeCommentaryAudio.oncanplay = null;
        activeCommentaryAudio.onplay = null;
        activeCommentaryAudio.onplaying = null;
        activeCommentaryAudio.onloadedmetadata = null;

        activeCommentaryAudio.pause();
        activeCommentaryAudio.removeAttribute('src');
        activeCommentaryAudio.src = '';
        activeCommentaryAudio.load();
    } catch (err) {
        console.warn('[TTS] Failed to stop active AWS commentary audio:', err);
    }
}

function stopCommentaryPlayback() {
    commentarySpeechNonce += 1;
    isCommentaryPlaying = false;
    stopCurrentCommentaryAudio();
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    commentaryBusyUntil = Math.max(commentaryBusyUntil, Date.now() + COMMENTARY_END_BUFFER_MS);
}

function normalizeCommentaryPayload(payload) {
    if (typeof payload === 'string') {
        return {
            text: payload,
            audioUrl: '',
            ttsMode: getCommentaryTtsMode(),
            voiceId: '',
            duration: 0
        };
    }

    const resolvedMode = payload?.ttsMode === 'aws'
        ? 'aws'
        : payload?.ttsMode === 'browser'
            ? 'browser'
            : getCommentaryTtsMode();

    return {
        text: payload?.text || payload?.welcomeMessage || payload?.commentary || '',
        audioUrl: payload?.audioUrl || '',
        ttsMode: resolvedMode,
        voiceId: payload?.voiceId || '',
        duration: Number(payload?.duration || 0)
    };
}

function getCommentaryExpectedDurationMs(payload) {
    const commentary = normalizeCommentaryPayload(payload);
    if (Number.isFinite(commentary.duration) && commentary.duration > 0) {
        return commentary.duration * 1000;
    }
    return estimateCommentaryDurationMs(commentary.text);
}

function reserveCommentaryWindow(payload, extraBufferMs = COMMENTARY_END_BUFFER_MS) {
    const durationMs = getCommentaryExpectedDurationMs(payload);
    const holdUntil = Date.now() + Math.max(0, durationMs) + extraBufferMs;
    commentaryBusyUntil = Math.max(commentaryBusyUntil, holdUntil);
}

function markCommentaryPlaybackStarted(payload) {
    isCommentaryPlaying = true;
    reserveCommentaryWindow(payload);
}

function markCommentaryPlaybackFinished() {
    isCommentaryPlaying = false;
    commentaryBusyUntil = Math.max(commentaryBusyUntil, Date.now() + COMMENTARY_END_BUFFER_MS);
}

function getCommentaryBusyDelayMs(now = Date.now()) {
    return Math.max(0, commentaryBusyUntil - now);
}

function isCommentaryRequestAllowed(now = Date.now()) {
    return commentaryRequestCount === 0 && !isCommentaryPlaying && getCommentaryBusyDelayMs(now) <= 0;
}

function shouldPlayCommentary(endpoint, body) {
    const isCommentatorEnabled = document.getElementById('cfg-enable-commentator')?.checked !== false;
    if (!isCommentatorEnabled) return false;

    const isReset = (body && (body.isReset || body.eventType === 'RESET'));
    const isBattleResult = (endpoint === '/api/battle-result');
    const isGameplay = !isReset && !isBattleResult;

    // 1. Welcome / Game Start message (RESET event)
    if (isReset) {
        const isInitializing = startBtn && startBtn.textContent === '⚙️ INITIALIZING...';
        // Play start welcome message if we are initializing, the match just started, or we are in preparing/countdown phases
        return isInitializing || (hasMatchStarted && !isWinnerLogicActive) || lastReceivedMatchStatus === 'preparing' || lastReceivedMatchStatus === 'counting_down';
    }

    // 2. Battle Result / Game End message (battle-result endpoint)
    if (isBattleResult) {
        // Play end game commentary only when results screen is active
        return isWinnerLogicActive;
    }

    // 3. Mid-game / Action commentary (CAST/PERIODIC/TIME_CRITICAL events)
    if (isGameplay) {
        // Play gameplay comments only during active match, before results screen
        return hasMatchStarted && !isWinnerLogicActive;
    }

    return false;
}

async function requestCommentary(endpoint, body, options = {}) {
    commentaryRequestCount += 1;
    try {
        const response = await callBridge(endpoint, body, options);
        
        // Guard: Check if the current game state allows playing this commentary
        if (!shouldPlayCommentary(endpoint, body)) {
            console.log(`[Commentary] Discarding response for ${endpoint} because the current game state does not allow it.`);
            return null;
        }

        const commentary = normalizeCommentaryPayload(response);
        console.log(`[Commentary] ${endpoint} response handled`, {
            hasResponse: !!response,
            ttsMode: commentary.ttsMode,
            hasAudioUrl: !!commentary.audioUrl,
            durationSeconds: commentary.duration,
            textLength: commentary.text.length,
            autoPlay: options.autoPlay !== false,
            requestCount: commentaryRequestCount
        });
        if (commentary.text) {
            reserveCommentaryWindow(commentary);
            if (options.autoPlay !== false) {
                await displayCommentary(response);
            }
        } else {
            commentaryBusyUntil = Math.max(commentaryBusyUntil, Date.now() + COMMENTARY_END_BUFFER_MS);
        }
        return response;
    } finally {
        commentaryRequestCount = Math.max(0, commentaryRequestCount - 1);
    }
}

async function callBridge(endpoint, body, options = {}) {
    const apiEndpoint = window.location.origin;
    const timeoutMs = options.timeoutMs || 30000;
    // Auto-inject preferred user language, image upload policy, and commentary agent type
    if (body && typeof body === 'object') {
        if (!body.lang) {
            body.lang = localStorage.getItem('user_language') || (navigator.language.startsWith('zh') ? 'zh' : 'en');
        }
        body.agentImagePolicy = document.getElementById('cfg-commentator-image-policy')?.value || localStorage.getItem('agent_image_policy') || 'start_end';
        body.agent_type = document.getElementById('cfg-commentary-engine')?.value || localStorage.getItem('cfg-commentary-engine') || 'openclaw';
        body.ttsMode = body.ttsMode || getCommentaryTtsMode();
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
    return Math.min(30000, estimateMs);
}

function waitForCommentaryDuration(text, durationMs = 0) {
    const explicitDurationMs = Number(durationMs);
    const estimateMs = Number.isFinite(explicitDurationMs) && explicitDurationMs > 0
        ? explicitDurationMs
        : estimateCommentaryDurationMs(text);
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

function displayCommentary(payload) {
    const isCommentatorEnabled = document.getElementById('cfg-enable-commentator')?.checked !== false;
    if (!isCommentatorEnabled) return Promise.resolve();

    const bubble = document.getElementById('commentator-bubble');
    const txtNode = document.getElementById('commentator-text');
    if (!bubble || !txtNode) return Promise.resolve();

    const commentary = normalizeCommentaryPayload(payload);
    if (!commentary.text) {
        return Promise.resolve();
    }

    console.log('[Commentary] Displaying commentary payload', {
        ttsMode: commentary.ttsMode,
        hasAudioUrl: !!commentary.audioUrl,
        durationSeconds: commentary.duration,
        text: commentary.text
    });

    txtNode.textContent = commentary.text;
    bubble.style.display = 'block';

    if (commentaryHideTimeout) clearTimeout(commentaryHideTimeout);
    
    const p = speakCommentary(commentary);

    commentaryHideTimeout = setTimeout(() => {
        bubble.style.display = 'none';
    }, 8000); // Premium visual duration of 8 seconds
    
    return p;
}

function playAwsCommentaryAudio(audioUrl, fallbackText, durationSeconds = 0) {
    const volumeSlider = document.getElementById('cfg-commentator-volume');
    const ttsVolume = volumeSlider ? parseInt(volumeSlider.value) : 100; // 0 to 100
    if (!audioUrl) {
        console.warn('[TTS] AWS mode requested without audioUrl. Falling back to browser TTS.');
        return speakBrowserCommentary(fallbackText, durationSeconds);
    }

    const requestNonce = ++commentarySpeechNonce;
    return new Promise((resolve) => {
        let settled = false;
        let playbackStarted = false;
        let startupTimeoutHandle = null;
        let durationTimeoutHandle = null;
        let blobObjectUrl = null;
        const fallbackDurationMs = Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) > 0
            ? Number(durationSeconds) * 1000
            : estimateCommentaryDurationMs(fallbackText);
        const clearTimers = () => {
            if (startupTimeoutHandle) {
                clearTimeout(startupTimeoutHandle);
                startupTimeoutHandle = null;
            }
            if (durationTimeoutHandle) {
                clearTimeout(durationTimeoutHandle);
                durationTimeoutHandle = null;
            }
            if (blobObjectUrl) {
                URL.revokeObjectURL(blobObjectUrl);
                blobObjectUrl = null;
            }
        };
        const finish = () => {
            if (settled) return;
            settled = true;
            clearTimers();
            resolve();
        };

        const fallbackToBrowser = () => {
            if (requestNonce !== commentarySpeechNonce) {
                finish();
                return;
            }
            console.warn('[TTS] Switching to browser commentary fallback.', {
                requestNonce,
                commentarySpeechNonce,
                fallbackTextLength: fallbackText?.length || 0,
                durationSeconds
            });
            stopCurrentCommentaryAudio();
            speakBrowserCommentary(fallbackText, durationSeconds).then(finish);
        };

        try {
            stopCurrentCommentaryAudio();
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
            const audio = getCommentaryAudioElement();
            audio.volume = Math.max(0, Math.min(1, ttsVolume / 100));
            audio.muted = false;
            console.log('[TTS] Preparing AWS Polly playback', {
                requestNonce,
                audioUrl,
                durationSeconds,
                volume: audio.volume,
                unlocked: isAudioUnlocked,
                readyState: audio.readyState,
                networkState: audio.networkState
            });
            markCommentaryPlaybackStarted({
                text: fallbackText,
                audioUrl,
                ttsMode: 'aws',
                duration: durationSeconds
            });
            startupTimeoutHandle = setTimeout(() => {
                if (!playbackStarted) {
                    console.warn('[TTS] AWS Polly audio did not start in time. Falling back to browser TTS.');
                    markCommentaryPlaybackFinished();
                    fallbackToBrowser();
                }
            }, 4000);

            audio.onended = () => {
                console.log('[TTS] AWS Polly playback ended.', {
                    requestNonce,
                    currentTime: audio.currentTime,
                    duration: audio.duration
                });
                if (requestNonce === commentarySpeechNonce) {
                    stopCurrentCommentaryAudio();
                }
                markCommentaryPlaybackFinished();
                finish();
            };
            audio.onerror = (evt) => {
                const error = audio.error;
                console.warn('[TTS] AWS Polly audio playback failed. Falling back to browser TTS.', {
                    requestNonce,
                    code: error ? error.code : 'unknown',
                    message: error ? error.message : 'No error message',
                    readyState: audio.readyState,
                    networkState: audio.networkState,
                    src: audio.src ? (audio.src.length > 100 ? audio.src.substring(0, 100) + '...' : audio.src) : 'none'
                });
                markCommentaryPlaybackFinished();
                fallbackToBrowser();
            };
            audio.onloadedmetadata = () => {
                console.log('[TTS] AWS Polly metadata loaded.', {
                    requestNonce,
                    duration: audio.duration,
                    readyState: audio.readyState,
                    networkState: audio.networkState
                });
            };
            audio.oncanplay = () => {
                console.log('[TTS] AWS Polly can play.', {
                    requestNonce,
                    readyState: audio.readyState,
                    networkState: audio.networkState
                });
            };
            const handlePlaybackStarted = () => {
                playbackStarted = true;
                console.log('[TTS] AWS Polly playback started.', {
                    requestNonce,
                    currentTime: audio.currentTime,
                    duration: audio.duration,
                    src: audio.currentSrc || audio.src
                });
                if (startupTimeoutHandle) {
                    clearTimeout(startupTimeoutHandle);
                    startupTimeoutHandle = null;
                }
                const effectiveDurationMs = (audio.duration && Number.isFinite(audio.duration) && audio.duration > 0)
                    ? audio.duration * 1000
                    : fallbackDurationMs;

                if (effectiveDurationMs > 0 && !durationTimeoutHandle) {
                    durationTimeoutHandle = setTimeout(() => {
                        if (requestNonce !== commentarySpeechNonce || settled) {
                            return;
                        }
                        console.warn('[TTS] AWS Polly audio exceeded expected duration. Finalizing playback window.', {
                            effectiveDurationMs,
                            duration: audio.duration,
                            fallbackDurationMs
                        });
                        stopCurrentCommentaryAudio();
                        markCommentaryPlaybackFinished();
                        finish();
                    }, effectiveDurationMs + COMMENTARY_SAFETY_TIMEOUT_BUFFER_MS);
                }
            };
            audio.onplay = handlePlaybackStarted;
            audio.onplaying = handlePlaybackStarted;

            console.log('[TTS] Setting AWS Polly source URL', { requestNonce, audioUrl: audioUrl.substring(0, 100) + '...' });
            audio.src = audioUrl;
            audio.load();

            const playPromise = audio.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.then(() => {
                    console.log('[TTS] AWS Polly play() resolved.', {
                        requestNonce,
                        currentTime: audio.currentTime,
                        paused: audio.paused
                    });
                }).catch((err) => {
                    console.warn('[TTS] AWS Polly play() rejected. Falling back to browser TTS.', err);
                    if (requestNonce === commentarySpeechNonce) {
                        markCommentaryPlaybackFinished();
                        fallbackToBrowser();
                    }
                });
            }
        } catch (err) {
            console.warn('[TTS] AWS Polly setup failed. Falling back to browser TTS.', err);
            markCommentaryPlaybackFinished();
            fallbackToBrowser();
        }
    });
}

function speakBrowserCommentary(text, expectedDurationSeconds = 0) {
    const volumeSlider = document.getElementById('cfg-commentator-volume');
    const ttsVolume = volumeSlider ? parseInt(volumeSlider.value) : 100; // 0 to 100
    const expectedDurationMs = Number.isFinite(Number(expectedDurationSeconds)) && Number(expectedDurationSeconds) > 0
        ? Number(expectedDurationSeconds) * 1000
        : 0;
    
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
        const estimateMs = expectedDurationMs || estimateCommentaryDurationMs(sanitizedText);
        console.log(`[TTS] Local audio is muted (Volume 0%). Simulating speaking delay of ${estimateMs}ms for physical device sync.`);
        return waitForCommentaryDuration(sanitizedText, expectedDurationMs);
    }

    if (!window.speechSynthesis) {
        console.warn("[TTS] window.speechSynthesis is not supported in this browser!");
        return waitForCommentaryDuration(sanitizedText, expectedDurationMs);
    }
    console.log(`[TTS] speakCommentary trigger: "${sanitizedText}" | Current setting volume: ${ttsVolume}%`);
    const requestNonce = ++commentarySpeechNonce;
    return new Promise((resolve) => {
        try {
            stopCurrentCommentaryAudio();
            console.log("[TTS] Cancelling existing speech queue...");
            window.speechSynthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(sanitizedText);
            let speechStarted = false;
            let retriedAfterColdStart = false;
            let settled = false;
            markCommentaryPlaybackStarted({ text: sanitizedText, ttsMode: 'browser' });

            const estimatedMs = expectedDurationMs || estimateCommentaryDurationMs(sanitizedText);
            const safetyTimeoutHandle = setTimeout(() => {
                if (!settled) {
                    console.warn('[TTS] Browser SpeechSynthesis exceeded estimated duration. Force-completing playback to prevent game hang.', { estimatedMs });
                    finish();
                }
            }, estimatedMs + 4000);

            const finish = async () => {
                if (settled) return;
                settled = true;
                clearTimeout(safetyTimeoutHandle);
                markCommentaryPlaybackFinished();
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
                            waitForCommentaryDuration(sanitizedText, expectedDurationMs).then(finish);
                        }
                    }, 120);
                    return;
                }
                waitForCommentaryDuration(sanitizedText, expectedDurationMs).then(finish);
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
                    waitForCommentaryDuration(sanitizedText, expectedDurationMs).then(finish);
                }
            }, 100);
        } catch (e) {
            console.warn("[TTS] Speech synthesis failed:", e);
            waitForCommentaryDuration(sanitizedText, expectedDurationMs).then(resolve);
        }
    });
}

function speakCommentary(payload) {
    const commentary = normalizeCommentaryPayload(payload);
    if (!commentary.text) {
        return Promise.resolve();
    }

    console.log('[TTS] speakCommentary dispatch', {
        ttsMode: commentary.ttsMode,
        hasAudioUrl: !!commentary.audioUrl,
        durationSeconds: commentary.duration
    });

    if (commentary.ttsMode === 'aws' && commentary.audioUrl) {
        return playAwsCommentaryAudio(commentary.audioUrl, commentary.text, commentary.duration);
    }
    return speakBrowserCommentary(commentary.text, commentary.duration);
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
let audioUnlockPromise = null;
async function masterAudioUnlock() {
    if (isAudioUnlocked) return;
    if (audioUnlockPromise) {
        return audioUnlockPromise;
    }

    audioUnlockPromise = (async () => {
        try {
            const unlockAudio = getCommentaryAudioElement();
            unlockAudio.pause();
            unlockAudio.src = SILENT_AUDIO_DATA_URI;
            unlockAudio.volume = 0;
            const playPromise = unlockAudio.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                await playPromise;
            }
            unlockAudio.pause();
            unlockAudio.currentTime = 0;
            console.log('[TTS] Master audio unlock succeeded.');
        } catch (e) {
            console.warn('[TTS] Master audio unlock failed.', e);
        }

        await primeSpeechSynthesis();
        isAudioUnlocked = true;
        audioHint.textContent = '🔊 Audio Active';
        audioHint.classList.add('unlocked');
        setTimeout(() => audioHint.style.display = 'none', 3000);
    })();

    try {
        await audioUnlockPromise;
    } finally {
        audioUnlockPromise = null;
    }
}
document.addEventListener('click', masterAudioUnlock, { once: true });
emergencyUnmute.addEventListener('click', (e) => { e.stopPropagation(); resultCinema.muted = false; resultCinema.volume = 1.0; resultCinema.play(); emergencyUnmute.style.display = 'none'; });

function resetViewerState(isStarting = false) {
    console.log('[Battle] resetViewerState');
    if (winnerTimeoutHandle) clearTimeout(winnerTimeoutHandle); winnerTimeoutHandle = null;
    if (resultTimeoutHandle) clearTimeout(resultTimeoutHandle); resultTimeoutHandle = null;
    if (commentaryHideTimeout) clearTimeout(commentaryHideTimeout); commentaryHideTimeout = null;
    if (castTimeoutHandle) clearTimeout(castTimeoutHandle); castTimeoutHandle = null;
    stopCommentaryPlayback();
    const commentaryBubble = document.getElementById('commentator-bubble');
    if (commentaryBubble) commentaryBubble.style.display = 'none';
    isMatchOver = false; isWinnerLogicActive = false; hasMatchStarted = false;
    matchHasBeenActive = false;
    localStorage.removeItem('openclawActiveSessionId');
    p1Active = false; p2Active = false; p1ScoreVal = 0; p2ScoreVal = 0;
    lastP1ScoreVal = 0; lastP2ScoreVal = 0;
    pendingCasts = [];
    spokenTimeTimemarks.clear();
    lastCustomCommentaryTime = 0; lastPeriodicCommentaryTime = 0; prevMatchActive = false;
    commentaryRequestCount = 0;
    isCommentaryPlaying = false;
    commentaryBusyUntil = 0;
    activeCinematicsCount = 0;
    resultOverlay.style.display = 'none'; emergencyUnmute.style.display = 'none';
    if (skipResultBtn) skipResultBtn.style.display = 'none';
    resultCinema.pause(); resultCinema.style.display = 'none'; resultCinema.src = "";
    [p1Cinema, p2Cinema].forEach(c => { c.pause(); c.src = ""; c.style.display = 'none'; });
    p1Score.textContent = '0'; p2Score.textContent = '0'; timerDisplay.textContent = '00:00';
    p1TimerSub.textContent = ''; p2TimerSub.textContent = '';
    powerP1.style.width = '50%'; ticker.innerHTML = ''; 
    if (isStarting) {
        addTickerMsg('MATCH STARTED', '');
    } else {
        addTickerMsg('READY FOR BATTLE', '');
    }
    updateLayout();
    if (startBtn && !isStarting) {
        startBtn.textContent = 'START BATTLE';
        startBtn.style.background = '#FF5252';
        startBtn.disabled = false;
        startBtn.style.cursor = 'pointer';
    }
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

function endMatch() {
    console.log('[Battle] Manually ending match...');
    if (sync) {
        try {
            sync.emitStateAction('room_reset_request', {});
        } catch (err) {
            console.error('[Battle] Failed to emit room_reset_request:', err);
        }
    } else {
        resetViewerState();
    }
}

async function startMatch() {
    if (hasMatchStarted || (lastReceivedMatchStatus && lastReceivedMatchStatus !== 'idle')) {
        endMatch();
        return;
    }
    if (startBtn && startBtn.disabled) return;

    // Unlock master audio before initiating play
    try {
        await masterAudioUnlock();
    } catch (audioErr) {
        console.warn('[Battle] Master audio unlock warning:', audioErr);
    }

    const difficultyVal = parseInt(inDifficulty.value) || 8;
    const countVal = parseInt(inCount.value) || 11;
    const syncGestureCheckbox = document.getElementById('cfg-sync-gesture');
    const isSyncedMode = syncGestureCheckbox ? syncGestureCheckbox.checked : false;

    // Generate a clean, unique active session ID for this match
    const baseSessionId = getOpenclawBaseSessionId();
    const dynamicSessionId = `${baseSessionId}_${Date.now()}`;
    localStorage.setItem('openclawActiveSessionId', dynamicSessionId);

    if (sync) {
        sync.emitStateAction('start_battle_request', {
            difficulty: difficultyVal,
            count: countVal,
            syncedGestureMode: isSyncedMode,
            sessionId: dynamicSessionId
        });
    }
}
startBtn.addEventListener('click', startMatch);

function schedulePendingCastCommentary(delayMs) {
    if (castTimeoutHandle) {
        clearTimeout(castTimeoutHandle);
    }
    castTimeoutHandle = setTimeout(flushPendingCastCommentary, delayMs);
}

async function flushPendingCastCommentary() {
    castTimeoutHandle = null;
    if (pendingCasts.length === 0) {
        return;
    }

    if (!isCommentaryRequestAllowed()) {
        schedulePendingCastCommentary(Math.max(300, getCommentaryBusyDelayMs() + COMMENTARY_REQUEST_RETRY_BUFFER_MS));
        return;
    }

    const currentCasts = [...pendingCasts];
    pendingCasts = [];

    let detail = "";
    if (currentCasts.length === 1) {
        const cast = currentCasts[0];
        detail = `${cast.playerID === 'player1' ? 'Player 1' : 'Player 2'} successfully activated ${cast.actionName}`;
    } else {
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

    await requestCommentary('/api/live-status', {
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
    });
}

function getVideoUrl(subPath) {
    const urlParams = new URLSearchParams(window.location.search);
    const forceLocal = urlParams.get('local_video') === 'true';
    const hostname = window.location.hostname;
    const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname);
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || isIp || window.location.protocol === 'file:' || forceLocal;
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

async function showWinner(forcedWinner = null) {
    let winnerName = forcedWinner;
    if (!winnerName) {
        if (p1ScoreVal === p2ScoreVal) winnerName = 'DRAW';
        else if (p1ScoreVal > p2ScoreVal) winnerName = 'PLAYER 1';
        else winnerName = 'PLAYER 2';
    }

    if (isWinnerLogicActive) return;
    isWinnerLogicActive = true; isMatchOver = true; hasMatchStarted = false;
    if (startBtn) {
        startBtn.textContent = 'START BATTLE';
        startBtn.style.background = '#FF5252';
        startBtn.disabled = false;
        startBtn.style.cursor = 'pointer';
    }
    if (winnerTimeoutHandle) { clearTimeout(winnerTimeoutHandle); winnerTimeoutHandle = null; }
    [p1Cinema, p2Cinema].forEach(c => { c.pause(); c.src = ""; c.style.display = 'none'; });
    resScoreP1.textContent = p1ScoreVal; resScoreP2.textContent = p2ScoreVal;
    const maxPossible = Math.max(p1TotalActions, p2TotalActions, 11);
    const PASS_MARK = Math.ceil(maxPossible / 2);
    const winnerScore = Math.max(p1ScoreVal, p2ScoreVal);
    
    if (winnerName === 'DRAW') { 
        winnerText.textContent = 'DRAW MATCH'; 
        winnerSubtext.textContent = 'EQUAL POWER'; 
        winnerText.style.color = '#FFF'; 
    } else if (winnerName === 'PLAYER 1') { 
        winnerText.textContent = 'PLAYER 1 WINS'; 
        winnerText.style.color = '#4A90E2'; 
        winnerSubtext.textContent = (p1ScoreVal >= p1TotalActions) ? 'PERFECT VICTORY' : 'VICTORY'; 
    } else { 
        winnerText.textContent = 'PLAYER 2 WINS'; 
        winnerText.style.color = '#FFFF00'; 
        winnerSubtext.textContent = (p2ScoreVal >= p2TotalActions) ? 'PERFECT VICTORY' : 'VICTORY'; 
    }
    
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
        requestCommentary('/api/battle-result', {
            sessionId: openclawSessionId,
            winner: winnerName,
            p1Score: p1ScoreVal,
            p2Score: p2ScoreVal,
            p1Total: p1TotalActions,
            p2Total: p2TotalActions,
            lang: commentaryLang,
            foulLanguage: isFoulEnabled
        });
    }
}

function setupLocalOfflineCoordinator() {
    if (!sync) return;
    
    // Initialize localMatchState
    localMatchState = {
        roomCode: currentRoomCode || 'local',
        sessionId: "",
        matchStatus: "idle", // idle | preparing | counting_down | playing | paused | ended
        countdownTimer: 3,
        gameDifficulty: 8,
        gameCount: 11,
        shuffledActionList: null,
        winner: null,
        p1: { score: 0, timeLeft: 0, currentDomain: null, active: true, finished: false, attempted: 0 },
        p2: { score: 0, timeLeft: 0, currentDomain: null, active: true, finished: false, attempted: 0 },
        lastUpdated: Date.now()
    };

    function evaluateVictoryLocal(state) {
        const p1 = state.p1;
        const p2 = state.p2;

        if (p1.attempted >= state.gameCount) p1.finished = true;
        if (p2.attempted >= state.gameCount) p2.finished = true;

        const normalEnd = p1.finished && p2.finished;
        let earlyWin = false;
        let winner = null;

        const maxP2Score = p2.score + Math.max(0, state.gameCount - p2.attempted);
        const maxP1Score = p1.score + Math.max(0, state.gameCount - p1.attempted);

        if (p1.finished && !p2.finished && p1.score > maxP2Score) {
            earlyWin = true;
            winner = 'PLAYER 1';
        } else if (p2.finished && !p1.finished && p2.score > maxP1Score) {
            earlyWin = true;
            winner = 'PLAYER 2';
        } else if (normalEnd) {
            if (p1.score === p2.score) {
                winner = 'DRAW';
            } else if (p1.score > p2.score) {
                winner = 'PLAYER 1';
            } else {
                winner = 'PLAYER 2';
            }
        }

        if (normalEnd || earlyWin) {
            state.matchStatus = 'ended';
            state.winner = winner;
            return true;
        }
        return false;
    }

    sync.onLocalStateAction = (event, payload, senderID) => {
        console.log(`[OfflineCoordinator] Received action: ${event}`, payload, `from ${senderID}`);
        
        let role = senderID; 
        if (role !== 'player1' && role !== 'player2') {
            role = (senderID === 'viewer' || senderID === sync.role) ? 'viewer' : 'player1';
        }

        const state = localMatchState;

        switch (event) {
            case 'start_battle_request': {
                const { difficulty, count, syncedGestureMode, sessionId } = payload;
                state.matchStatus = 'preparing';
                state.gameDifficulty = parseInt(difficulty) || 8;
                state.gameCount = parseInt(count) || 11;
                state.sessionId = sessionId;
                state.winner = null;
                
                state.p1.score = 0;
                state.p1.timeLeft = state.gameDifficulty;
                state.p1.currentDomain = null;
                state.p1.finished = false;
                state.p1.attempted = 0;

                state.p2.score = 0;
                state.p2.timeLeft = state.gameDifficulty;
                state.p2.currentDomain = null;
                state.p2.finished = false;
                state.p2.attempted = 0;

                if (syncedGestureMode) {
                    const allActions = [
                        "Unlimited Void", "Malevolent Shrine", "Self-Embodiment of Perfection", 
                        "Authentic Mutual Love", "Idle Death Gamble", "Yuji Itadori", 
                        "Chimera Shadow Garden", "Time Cell Moon Palace", "Lapse Blue", 
                        "Reversal Red", "Hollow Purple"
                    ];
                    const shuffled = allActions.sort(() => Math.random() - 0.5);
                    state.shuffledActionList = shuffled.slice(0, Math.min(state.gameCount, shuffled.length));
                } else {
                    state.shuffledActionList = null;
                }

                state.lastUpdated = Date.now();
                sync.broadcast('STATE_UPDATE_LOCAL', state);

                sync.broadcast('CLOSE_OVERLAYS', { isStarting: true });
                sync.broadcast('CAPTURE_WEBCAM_FRAME', { phase: 'START', sessionId: sessionId });
                break;
            }

            case 'match_welcome_complete': {
                if (state.matchStatus !== 'preparing') {
                    console.warn(`[OfflineCoordinator] Discarding match_welcome_complete because matchStatus is: ${state.matchStatus}`);
                    break;
                }
                state.matchStatus = 'counting_down';
                state.lastUpdated = Date.now();
                sync.broadcast('STATE_UPDATE_LOCAL', state);
                break;
            }

            case 'countdown_finished': {
                if (state.matchStatus !== 'counting_down') {
                    console.warn(`[OfflineCoordinator] Discarding countdown_finished because matchStatus is: ${state.matchStatus}`);
                    break;
                }
                state.matchStatus = 'playing';
                state.lastUpdated = Date.now();
                sync.broadcast('STATE_UPDATE_LOCAL', state);

                sync.broadcast('START_BATTLE', {
                    difficulty: state.gameDifficulty,
                    count: state.gameCount,
                    openclawSessionId: state.sessionId,
                    actionList: state.shuffledActionList
                });
                break;
            }

            case 'player_tick': {
                if (state.matchStatus !== 'playing') {
                    console.warn(`[OfflineCoordinator] Discarding player_tick because matchStatus is: ${state.matchStatus}`);
                    break;
                }
                const { timeLeft } = payload;
                if (role === 'player1') {
                    state.p1.timeLeft = timeLeft;
                } else if (role === 'player2') {
                    state.p2.timeLeft = timeLeft;
                }
                state.lastUpdated = Date.now();
                sync.broadcast('STATE_UPDATE_LOCAL', state);
                break;
            }

            case 'player_timeout': {
                if (state.matchStatus !== 'playing') {
                    console.warn(`[OfflineCoordinator] Discarding player_timeout because matchStatus is: ${state.matchStatus}`);
                    break;
                }
                if (role === 'player1') {
                    state.p1.attempted += 1;
                    state.p1.timeLeft = state.gameDifficulty;
                    state.p1.currentDomain = null;
                } else if (role === 'player2') {
                    state.p2.attempted += 1;
                    state.p2.timeLeft = state.gameDifficulty;
                    state.p2.currentDomain = null;
                }
                state.lastUpdated = Date.now();
                evaluateVictoryLocal(state);
                sync.broadcast('STATE_UPDATE_LOCAL', state);
                break;
            }

            case 'submit_gesture_success': {
                if (state.matchStatus !== 'playing') {
                    console.warn(`[OfflineCoordinator] Discarding submit_gesture_success because matchStatus is: ${state.matchStatus}`);
                    break;
                }
                const { score, timeLeft, currentDomain, videoSrc } = payload;
                if (role === 'player1') {
                    state.p1.score = score;
                    state.p1.timeLeft = timeLeft;
                    state.p1.currentDomain = currentDomain;
                    state.p1.attempted += 1;
                } else if (role === 'player2') {
                    state.p2.score = score;
                    state.p2.timeLeft = timeLeft;
                    state.p2.currentDomain = currentDomain;
                    state.p2.attempted += 1;
                }
                state.lastUpdated = Date.now();
                state.matchStatus = 'paused';

                const won = evaluateVictoryLocal(state);
                sync.broadcast('STATE_UPDATE_LOCAL', state);

                sync.broadcast('PLAY_VIDEO_SYNC', videoSrc, senderID);

                if (sync.role === 'viewer' && sync.onPlayVideoSync) {
                    sync.onPlayVideoSync(senderID, videoSrc);
                }

                if (won) {
                    sync.broadcast('MATCH_OVER', null);
                }
                break;
            }

            case 'cinematic_finished': {
                if (state.matchStatus === 'paused') {
                    state.matchStatus = 'playing';
                    state.lastUpdated = Date.now();
                    sync.broadcast('STATE_UPDATE_LOCAL', state);
                    sync.broadcast('MATCH_RESUME', null);
                }
                break;
            }

            case 'room_reset_request': {
                state.matchStatus = 'idle';
                state.winner = null;
                state.shuffledActionList = null;
                state.p1.score = 0; state.p1.timeLeft = 0; state.p1.currentDomain = null; state.p1.finished = false; state.p1.attempted = 0;
                state.p2.score = 0; state.p2.timeLeft = 0; state.p2.currentDomain = null; state.p2.finished = false; state.p2.attempted = 0;
                state.lastUpdated = Date.now();
                
                sync.broadcast('STATE_UPDATE_LOCAL', state);
                sync.broadcast('CLOSE_OVERLAYS', { isStarting: false });
                break;
            }
        }

        if (sync.onStateUpdateReceived) {
            sync.onStateUpdateReceived(state);
        }
    };

    sync.onUserJoined = (id, role) => {
        console.log(`[OfflineCoordinator] User joined: ${role} (${id})`);
        if (localMatchState) {
            console.log(`[OfflineCoordinator] Syncing current state to newly joined user ${id}:`, localMatchState);
            sync.broadcast('STATE_UPDATE_LOCAL', localMatchState, id);
        }
    };

    // Broadcast the initial 'idle' state to all clients on setup so everyone is synced
    sync.broadcast('STATE_UPDATE_LOCAL', localMatchState);
    if (sync.onStateUpdateReceived) {
        sync.onStateUpdateReceived(localMatchState);
    }
}

async function handlePreparingEntrance(state) {
    if (startBtn) {
        startBtn.textContent = 'STOP / RESET';
        startBtn.style.background = '#FF5252';
        startBtn.disabled = false;
        startBtn.style.cursor = 'pointer';
    }
    try {
        resetViewerState(true);
        localStorage.setItem('openclawActiveSessionId', state.sessionId);

        // Safe registration with bridge
        try {
            const signalingUrl = sync.signalingUrl || window.location.origin;
            await callBridge('/api/register-room', {
                sessionId: state.sessionId,
                roomCode: currentRoomCode,
                signalingUrl: signalingUrl
            });
        } catch (regErr) {
            console.warn('[Battle] OpenClaw room registration failed, but proceeding anyway:', regErr);
        }

        const isCommentatorEnabled = document.getElementById('cfg-enable-commentator')?.checked !== false;
        if (isCommentatorEnabled) {
            const isWebcamEnabled = document.getElementById('cfg-commentator-webcam')?.checked !== false;
            if (isWebcamEnabled && sync) {
                try {
                    // Trigger single-shot start frame webcam capture from Player View
                    sync.broadcast('CAPTURE_WEBCAM_FRAME', { phase: 'START', sessionId: state.sessionId });
                    await waitForSnapshots(state.sessionId, 3000);
                } catch (snapErr) {
                    console.warn('[Battle] Optional snapshot polling failed, proceeding:', snapErr);
                }
            }

            // Trigger introductory welcome commentary
            const commentaryLang = document.getElementById('cfg-commentary-lang')?.value || 'en';
            const isFoulEnabled = document.getElementById('cfg-foul-language')?.checked || false;
            
            console.log("[Battle] Requesting welcome intro commentary...");
            await requestCommentary('/api/live-status', {
                sessionId: state.sessionId,
                eventType: 'RESET',
                isReset: true,
                p1Score: 0,
                p2Score: 0,
                lang: commentaryLang,
                foulLanguage: isFoulEnabled
            }, { timeoutMs: 45000 });
        }
    } catch (err) {
        console.error('[Battle] Error in preparing entrance side-effects:', err);
    } finally {
        console.log("[Battle] Preparing completed, emitting match_welcome_complete");
        sync.emitStateAction('match_welcome_complete', {});
    }
}

async function handleCountingDownEntrance(state) {
    if (startBtn) {
        startBtn.textContent = 'STOP / RESET';
        startBtn.style.background = '#FF5252';
        startBtn.disabled = false;
        startBtn.style.cursor = 'pointer';
    }
    try {
        const countdownVal = parseInt(inCountdown.value) || 0;
        if (countdownVal > 0) {
            countdownOverlay.style.display = 'flex';
            for (let i = countdownVal; i > 0; i--) {
                countdownText.textContent = i;
                countdownText.style.animation = 'none';
                void countdownText.offsetWidth;
                countdownText.style.animation = 'winner-pop 0.5s';
                await new Promise(r => setTimeout(r, 1000));
            }
            countdownText.textContent = "GO!";
            await new Promise(r => setTimeout(r, 500));
            countdownOverlay.style.display = 'none';
        }
    } catch (err) {
        console.error('[Battle] Error in counting_down entrance side-effects:', err);
    } finally {
        console.log("[Battle] Countdown completed, emitting countdown_finished");
        sync.emitStateAction('countdown_finished', {});
    }
}

function handlePlayingEntrance(state) {
    hasMatchStarted = true;
    if (startBtn) {
        startBtn.style.background = '#FF5252';
        startBtn.textContent = 'END BATTLE';
        startBtn.disabled = false;
        startBtn.style.cursor = 'pointer';
    }
    const now = Date.now();
    lastCustomCommentaryTime = now;
    lastPeriodicCommentaryTime = now;
    prevMatchActive = true;
}

async function handleEndedEntrance(state) {
    isMatchOver = true;
    hasMatchStarted = false;
    showWinner(state.winner);
}

function handleIdleEntrance(state) {
    resetViewerState();
}

function renderMatchState(state) {
    if (!state) return;

    p1ScoreVal = state.p1.score;
    p1Score.textContent = p1ScoreVal;
    if (resScoreP1) resScoreP1.textContent = p1ScoreVal;

    p2ScoreVal = state.p2.score;
    p2Score.textContent = p2ScoreVal;
    if (resScoreP2) resScoreP2.textContent = p2ScoreVal;

    p1TotalActions = state.gameCount;
    p2TotalActions = state.gameCount;

    const isGameplayRunning = state.matchStatus === 'playing' || state.matchStatus === 'paused';
    p1Active = state.p1.active && isGameplayRunning && !state.p1.finished;
    p2Active = state.p2.active && isGameplayRunning && !state.p2.finished;

    p1Time = p1Active ? state.p1.timeLeft : 0;
    p2Time = p2Active ? state.p2.timeLeft : 0;

    if (state.p1.currentDomain) {
        p1Domain.textContent = state.p1.currentDomain;
        p1Domain.classList.add('active');
    } else {
        p1Domain.textContent = 'WAITING';
        p1Domain.classList.remove('active');
    }

    if (state.p2.currentDomain) {
        p2Domain.textContent = state.p2.currentDomain;
        p2Domain.classList.add('active');
    } else {
        p2Domain.textContent = 'WAITING';
        p2Domain.classList.remove('active');
    }

    if (p1Active) {
        p1TimerSub.textContent = `(${p1Time}s)`;
    } else {
        p1TimerSub.textContent = '';
        if (state.p1.finished) {
            p1TimerSub.textContent = 'FINISHED';
        }
    }

    if (p2Active) {
        p2TimerSub.textContent = `(${p2Time}s)`;
    } else {
        p2TimerSub.textContent = '';
        if (state.p2.finished) {
            p2TimerSub.textContent = 'FINISHED';
        }
    }

    const activeTime = Math.max(p1Time, p2Time);
    if (isGameplayRunning && (p1Active || p2Active)) {
        if (p1Active && p2Active) {
            timerDisplay.innerHTML = `<span style="color: #4A90E2;">P1: ${p1Time}s</span> <span style="color: white; font-size: 0.8em; margin: 0 10px;">|</span> <span style="color: #FFFF00;">P2: ${p2Time}s</span>`;
        } else if (p1Active) {
            timerDisplay.innerHTML = `<span style="color: #4A90E2;">P1: ${p1Time}s</span>`;
        } else if (p2Active) {
            timerDisplay.innerHTML = `<span style="color: #FFFF00;">P2: ${p2Time}s</span>`;
        }
    } else if (state.matchStatus === 'ended') {
        timerDisplay.textContent = '00:00';
    } else if (state.matchStatus === 'counting_down') {
        timerDisplay.textContent = 'GET READY';
    } else {
        timerDisplay.textContent = '00:00';
    }

    updatePowerBar();

    const isMatchActive = isGameplayRunning && (p1Active || p2Active);
    const now = Date.now();

    if (isMatchActive && !prevMatchActive) {
        lastCustomCommentaryTime = now;
        lastPeriodicCommentaryTime = now;
    }
    prevMatchActive = isMatchActive;

    const minInterphraseDuration = 4500;
    const canSpeak = isCommentaryRequestAllowed(now) && (now - lastCustomCommentaryTime > minInterphraseDuration);

    let triggerTimeCritical = false;
    let eventTypeToSend = 'PERIODIC';
    let detailToSend = '';

    if (isMatchActive && (activeTime === 10 || activeTime === 5 || activeTime === 3) && !spokenTimeTimemarks.has(activeTime)) {
        spokenTimeTimemarks.add(activeTime);
        eventTypeToSend = 'TIME_CRITICAL';
        detailToSend = `Only ${activeTime} seconds remaining in the match! The battle is near its end!`;
        triggerTimeCritical = true;
    }

    const isCommentatorEnabled = document.getElementById('cfg-enable-commentator')?.checked !== false;
    if (isMatchActive && triggerTimeCritical && canSpeak && isCommentatorEnabled) {
        lastCustomCommentaryTime = now;
        lastPeriodicCommentaryTime = now;
        const openclawSessionId = getOpenclawActiveSessionId();
        const commentaryLang = document.getElementById('cfg-commentary-lang')?.value || 'en';
        const isFoulEnabled = document.getElementById('cfg-foul-language')?.checked || false;
        requestCommentary('/api/live-status', {
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
        });
    }
    else if (isMatchActive && (now - lastPeriodicCommentaryTime > 35000) && canSpeak && isCommentatorEnabled) {
        lastPeriodicCommentaryTime = now;
        lastCustomCommentaryTime = now;
        const openclawSessionId = getOpenclawActiveSessionId();
        const commentaryLang = document.getElementById('cfg-commentary-lang')?.value || 'en';
        const isFoulEnabled = document.getElementById('cfg-foul-language')?.checked || false;
        requestCommentary('/api/live-status', {
            sessionId: openclawSessionId,
            eventType: 'PERIODIC',
            p1Score: p1ScoreVal,
            p2Score: p2ScoreVal,
            p1Total: p1TotalActions,
            p2Total: p2TotalActions,
            timeLeft: activeTime,
            lang: commentaryLang,
            foulLanguage: isFoulEnabled
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
        if (lastReceivedMatchStatus !== 'playing' && lastReceivedMatchStatus !== 'paused') {
            console.warn(`[Battle] Ignoring PLAY_VIDEO_SYNC for ${playerID} because current matchStatus is: ${lastReceivedMatchStatus}`);
            return;
        }
        activeCinematicsCount++;
        
        const actionName = getActionNameFromVideo(videoSrc);
        addTickerMsg(`${playerID === 'player1' ? 'PLAYER 1' : 'PLAYER 2'} ACTIVATED ${actionName.toUpperCase()}`, playerID === 'player1' ? 'ticker-p1' : 'ticker-p2');

        const cinema = (playerID === 'player1') ? p1Cinema : p2Cinema;
        cinema.src = videoSrc; cinema.style.display = 'block'; cinema.load();
        updateLayout();
        const videoFile = videoSrc.split('/').pop();
        const duration = VIDEO_DURATIONS[videoFile] || 15000;
        
        lastCustomCommentaryTime = Date.now();
        lastPeriodicCommentaryTime = Date.now();
        const isCommentatorEnabled = document.getElementById('cfg-enable-commentator')?.checked !== false;
        if (isCommentatorEnabled) {
            pendingCasts.push({ playerID, actionName, videoSrc });

            const graceSlider = document.getElementById('cfg-score-grace');
            const graceSeconds = graceSlider ? parseFloat(graceSlider.value) : 1.0;
            const delayMs = graceSeconds > 0 ? (graceSeconds * 1000) : 50;
            schedulePendingCastCommentary(delayMs);
        }

        let hasEnded = false;
        const endLogic = () => {
            if (hasEnded) return; hasEnded = true;
            cinema.pause(); cinema.src = "";
            activeCinematicsCount--;
            updateLayout();
            if (activeCinematicsCount <= 0) { 
                activeCinematicsCount = 0; 
                sync.emitStateAction('cinematic_finished', {}); 
                addTickerMsg(`MATCH RESUMED`, ''); 
            }
        };
        cinema.oncanplay = () => { cinema.muted = false; cinema.volume = 1.0; cinema.play().catch(() => { cinema.muted = true; cinema.play(); }); };
        cinema.onended = endLogic;
        setTimeout(endLogic, duration + 1000);
    };

    sync.onStateUpdateReceived = (state) => {
        if (!state) return;
        console.log('[BattleSync] MatchState update received:', state);

        const newStatus = state.matchStatus;
        if (newStatus !== lastReceivedMatchStatus) {
            console.log(`[Battle] State transitioned: ${lastReceivedMatchStatus} -> ${newStatus}`);
            lastReceivedMatchStatus = newStatus;
            
            if (newStatus === 'preparing') {
                handlePreparingEntrance(state);
            } else if (newStatus === 'counting_down') {
                handleCountingDownEntrance(state);
            } else if (newStatus === 'playing') {
                handlePlayingEntrance(state);
            } else if (newStatus === 'ended') {
                handleEndedEntrance(state);
            } else if (newStatus === 'idle') {
                handleIdleEntrance(state);
            }
        }

        renderMatchState(state);
    };
}

closeResultBtn.addEventListener('click', () => {
    if (sync) {
        sync.emitStateAction('room_reset_request', {});
    } else {
        resetViewerState();
    }
});
if (netModeSelect) netModeSelect.value = currentNetMode;
updateSyncMode();
updateLayout();

// Hook up Commentator UI toggle settings and localStorage persistence
const enableCommentatorCheckbox = document.getElementById('cfg-enable-commentator');
const commentatorVolumeSlider = document.getElementById('cfg-commentator-volume');
const commentatorVolumeVal = document.getElementById('val-commentator-volume');
const commentatorWebcamCheckbox = document.getElementById('cfg-commentator-webcam');
const commentatorImagePolicySelector = document.getElementById('cfg-commentator-image-policy');
const commentaryTtsModeSelector = document.getElementById('cfg-commentary-tts-mode');

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
    if (activeCommentaryAudio) {
        activeCommentaryAudio.volume = Math.max(0, Math.min(1, intVal / 100));
    }
    
    if (intVal === 0 && getCommentaryTtsMode() !== 'aws') {
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
            stopCommentaryPlayback();
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
    const resolvedPolicy = ['always', 'start_end', 'never'].includes(savedPolicy) ? savedPolicy : 'start_end';
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
const quickLangSelector = document.getElementById('quick-lang-select');
const commentaryVoiceHint = document.getElementById('cfg-commentary-voice-hint');

function updateVoiceSelectorOptions() {
    if (!commentaryVoiceSelector) return;
    if (getCommentaryTtsMode() === 'aws') {
        const pollyVoice = getPollyVoiceConfig();
        commentaryVoiceSelector.innerHTML = `<option value="aws:${pollyVoice.voiceId}">☁️ AWS Polly Girl Voice — ${pollyVoice.label}</option>`;
        commentaryVoiceSelector.value = `aws:${pollyVoice.voiceId}`;
        commentaryVoiceSelector.disabled = true;
        commentaryVoiceSelector.style.opacity = '0.7';
        commentaryVoiceSelector.title = `AWS Polly mode uses the female voice ${pollyVoice.voiceId}`;
        if (commentaryVoiceHint) {
            commentaryVoiceHint.textContent = `AWS Polly mode uses female voice ${pollyVoice.voiceId} for ${getCommentaryLanguage()}.`;
        }
        return;
    }
    if (!window.speechSynthesis) return;
    
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

    commentaryVoiceSelector.disabled = false;
    commentaryVoiceSelector.style.opacity = '1';
    commentaryVoiceSelector.title = 'Choose a browser-installed voice';
    if (commentaryVoiceHint) {
        commentaryVoiceHint.textContent = 'Browser TTS mode uses voices installed in this browser or OS.';
    }
}

const UI_LOCALIZATIONS = {
    'zh-HK': {
        'audio-status-hint': '🔇 聲音解鎖 (隨便點擊畫面)',
        'start-battle-btn': '🔥 領域展開！開始對決 🔥',
        'battle-settings-toggle': '⚙️ 戰局設定',
        'title-match-config': '⚔️ 戰局配對設定',
        'label-net-mode': '網絡連線模式',
        'net-mode-local': '本地對決 (同一個瀏覽器)',
        'net-mode-online': '網上對戰 (互聯網連線)',
        'label-room-code': '房間號碼',
        'title-view-config': '👁️ 畫面顯示設定',
        'label-base-layout': '基礎鏡頭排版',
        'layout-side-by-side': '左右並排 (經典版)',
        'layout-vertical-stack': '上下雙層',
        'label-dynamic-view': '🔄 智能切換 (動態排版)',
        'title-ai-commentator': '🎙️ AI 旁白解說',
        'label-commentary-engine': '解說代理引擎',
        'label-commentary-lang': '解說及 UI 語言',
        'label-tts-mode': '語音合成 (TTS) 模式',
        'label-specific-voice': '選擇解說配音員',
        'opt-voice-auto': '✨ 智能選擇 (優化女聲)',
        'label-foul-language': '🤬 垃圾話 / 瘋狂粗口挑釁模式',
        'label-enable-commentator': '📺 啟動實時 AI 旁白',
        'label-commentator-volume': '🔊 AI 語音音量',
        'label-commentator-webcam': '📷 擷取玩家鏡頭畫面',
        'label-image-policy': 'AI 玩家快照傳送設定',
        'policy-always': '📸 隨時傳送雙方鏡頭影像',
        'policy-start-end': '🎬 僅於對決開始及結束時傳送',
        'policy-never': '🚫 永不傳送玩家影像',
        'label-enable-ai-portrait': '✨ AI 領域生圖融合技術 (Bedrock)',
        'title-game-rules': '📜 咒術對決法則',
        'label-countdown': '對決倒數時間',
        'label-difficulty': '術式反應限時',
        'label-count': '對決技術次數',
        'label-score-grace': '⏳ 評分寬限 (快照快門緩衝)',
        'label-sync-gesture': '👥 協同模式 (雙方顯示相同手勢)',
        'btn-reset-defaults': '🔄 重設所有設定至預設值',
        'p1-waiting': '⏳ 正在等待 1 號術師加入...',
        'p2-waiting': '⏳ 正在等待 2 號術師加入...',
        'label-scroll-title': '📜 領域展影 - 榮譽卷軸',
        'template-random': '🔮 隨機領域風格',
        'template-cyberpunk': '🌌 數碼龐克領域',
        'template-ink-wash': '🎨 水墨禪意領域',
        'template-neon-glow': '⚡ 霓虹極光領域',
        'btn-activate-ai': '✨ 啟動 AI 領域融合生圖 ✨',
        'ai-status-text': '點擊按鈕，使用 Bedrock Nova Canvas 生成專屬嘅咒術大戰藝術畫卷！',
        'ai-result-title': '手機掃描下載榮譽卷軸！',
        'ai-result-desc': '即刻將你專屬嘅 AI 領域融合大戰畫卷保存到手機，發送比朋友啦！',
        'close-result-btn': '🔙 返回大堂',
        'label-commentator-bubble-header': '🎙️ 實時 AI 旁白解說員',
        'commentator-text-waiting': '正在等待術師展開對決... 準備好未啊？',
        'emergency-unmute': '🔊 開啟聲音解說',
        'skip-result-btn': '跳過動畫 ⏭️',
        'winner-subtext-victory': '🏆 拔除成功 / 勝利',
        'winner-subtext-draw': '🤝 勢均力敵 / 平手',
        'draw-match': 'DRAW MATCH',
        'equal-power': 'EQUAL POWER',
        'p1-wins': 'PLAYER 1 WINS',
        'p2-wins': 'PLAYER 2 WINS',
        'perfect-victory': 'PERFECT VICTORY',
        'victory': 'VICTORY',
        'stop-reset': '停止 / 重設 戰局',
        'end-battle': '強制結束對決',
        'waiting-domain': '伺機待發',
        'finished-state': '已完成',
        'get-ready': '準備展開'
    },
    'zh-TW': {
        'audio-status-hint': '🔇 聲音解鎖 (隨意點擊畫面)',
        'start-battle-btn': '🔥 領域展開！開始對決 🔥',
        'battle-settings-toggle': '⚙️ 戰局設定',
        'title-match-config': '⚔️ 戰局配對設定',
        'label-net-mode': '網路連線模式',
        'net-mode-local': '本地對決 (同一個瀏覽器)',
        'net-mode-online': '網上對戰 (網際網路連線)',
        'label-room-code': '房間號碼',
        'title-view-config': '👁️ 畫面顯示設定',
        'label-base-layout': '基礎鏡頭版面',
        'layout-side-by-side': '左右並排 (經典版)',
        'layout-vertical-stack': '上下雙層',
        'label-dynamic-view': '🔄 智慧切換 (動態版面)',
        'title-ai-commentator': '🎙️ AI 旁白解說',
        'label-commentary-engine': '解說代理引擎',
        'label-commentary-lang': '解說及 UI 語言',
        'label-tts-mode': '語音合成 (TTS) 模式',
        'label-specific-voice': '選擇解說配音員',
        'opt-voice-auto': '✨ 智慧選擇 (優化女聲)',
        'label-foul-language': '🤬 垃圾話 / 瘋狂粗口挑釁模式',
        'label-enable-commentator': '📺 啟動實時 AI 旁白',
        'label-commentator-volume': '🔊 AI 語音音量',
        'label-commentator-webcam': '📷 擷取玩家鏡頭畫面',
        'label-image-policy': 'AI 玩家快照傳送設定',
        'policy-always': '📸 隨時傳送雙方鏡頭影像',
        'policy-start-end': '🎬 僅於對決開始及結束時傳送',
        'policy-never': '🚫 永不傳送玩家影像',
        'label-enable-ai-portrait': '✨ AI 領域生圖融合技術 (Bedrock)',
        'title-game-rules': '📜 咒術對決法則',
        'label-countdown': '對決倒數時間',
        'label-difficulty': '術式反應限時',
        'label-count': '對決技術次數',
        'label-score-grace': '⏳ 評分寬限 (快照快門緩衝)',
        'label-sync-gesture': '👥 協同模式 (雙方顯示相同手勢)',
        'btn-reset-defaults': '🔄 重設所有設定至預設值',
        'p1-waiting': '⏳ 正在等待 1 號術師加入...',
        'p2-waiting': '⏳ 正在等待 2 號術師加入...',
        'label-scroll-title': '📜 領域展影 - 榮譽卷軸',
        'template-random': '🔮 隨機領域風格',
        'template-cyberpunk': '🌌 數碼龐克領域',
        'template-ink-wash': '🎨 水墨禪意領域',
        'template-neon-glow': '⚡ 霓虹極光領域',
        'btn-activate-ai': '✨ 啟動 AI 領域融合生圖 ✨',
        'ai-status-text': '點擊按鈕，使用 Bedrock Nova Canvas 生成專屬的咒術大戰藝術畫卷！',
        'ai-result-title': '手機掃描下載榮譽卷軸！',
        'ai-result-desc': '即刻將你專屬的 AI 領域融合大戰畫卷保存到手機，發送給朋友吧！',
        'close-result-btn': '🔙 返回大廳',
        'label-commentator-bubble-header': '🎙️ 實時 AI 旁白解說員',
        'commentator-text-waiting': '正在等待術師展開對決... 準備好了嗎？',
        'emergency-unmute': '🔊 開啟聲音解說',
        'skip-result-btn': '跳過動畫 ⏭️',
        'winner-subtext-victory': '🏆 拔除成功 / 勝利',
        'winner-subtext-draw': '🤝 勢均力敵 / 平手',
        'draw-match': 'DRAW MATCH',
        'equal-power': 'EQUAL POWER',
        'p1-wins': 'PLAYER 1 WINS',
        'p2-wins': 'PLAYER 2 WINS',
        'perfect-victory': 'PERFECT VICTORY',
        'victory': 'VICTORY',
        'stop-reset': '停止 / 重設 戰局',
        'end-battle': '強制結束對決',
        'waiting-domain': '伺機待發',
        'finished-state': '已完成',
        'get-ready': '準備展開'
    },
    'ja': {
        'audio-status-hint': '🔇 音声アンロック (画面をクリック)',
        'start-battle-btn': '🔥 領域展開！バトル開始 🔥',
        'battle-settings-toggle': '⚙️ 対戦設定',
        'title-match-config': '⚔️ マッチング設定',
        'label-net-mode': 'ネットワークモード',
        'net-mode-local': 'ローカル対戦 (同一ブラウザ)',
        'net-mode-online': 'オンライン対戦 (インターネット)',
        'label-room-code': 'ルームコード',
        'title-view-config': '👁️ 画面レイアウト設定',
        'label-base-layout': 'ベースカメラ配置',
        'layout-side-by-side': '左右並列 (クラシック)',
        'layout-vertical-stack': '上下２分割',
        'label-dynamic-view': '🔄 インテリジェント切り替え (自動配置)',
        'title-ai-commentator': '🎙️ AI 実況・解説',
        'label-commentary-engine': '解説エージェントエンジン',
        'label-commentary-lang': '実況 & UI 言語',
        'label-tts-mode': '音声合成 (TTS) モード',
        'label-specific-voice': '実況声優の選択',
        'opt-voice-auto': '✨ 自動最適化 (女性ボイス)',
        'label-foul-language': '🤬 煽り・暴言・トラッシュトークモード',
        'label-enable-commentator': '📺 実況コメンテーターを有効化',
        'label-commentator-volume': '🔊 コメンテーターTTS音量',
        'label-commentator-webcam': '📷 プレイヤーのウェブカメラ撮影',
        'label-image-policy': 'AIスナップショット送信ルール',
        'policy-always': '📸 常に両プレイヤーの画像を送信',
        'policy-start-end': '🎬 対戦開始・終了時のみ送信',
        'policy-never': '🚫 画像を送信しない',
        'label-enable-ai-portrait': '✨ AI 領域生画融合技術 (Bedrock)',
        'title-game-rules': '📜 呪術バトルの掟',
        'label-countdown': 'カウントダウン時間',
        'label-difficulty': '術式発動制限時間',
        'label-count': '対決ラウンド数',
        'label-score-grace': '⏳ 判定猶予 (シャッターバッファ)',
        'label-sync-gesture': '👥 シンクロモード (同一手勢表示)',
        'btn-reset-defaults': '🔄 すべての設定をデフォルトに戻す',
        'p1-waiting': '⏳ プレイヤー１の参戦を待機中...',
        'p2-waiting': '⏳ プレイヤー２の参戦を待機中...',
        'label-scroll-title': '📜 領域展影 - 栄誉のスクロール',
        'template-random': '🔮 ランダム領域スタイル',
        'template-cyberpunk': '🌌 サイバーパンク領域',
        'template-ink-wash': '🎨 水墨画・禅領域',
        'template-neon-glow': '⚡ ネオンオーロラ領域',
        'btn-activate-ai': '✨ AI 領域融合生成を起動 ✨',
        'ai-status-text': 'ボタンをクリックして、Bedrock Nova Canvasでオリジナル呪術対戦スクロールを生成しよう！',
        'ai-result-title': 'QRコードで栄誉スクロールをダウンロード！',
        'ai-result-desc': 'あなただけの特別なAI領域融合アートワークをスマホに保存して、みんなにシェアしよう！',
        'close-result-btn': '🔙 ロビーに戻る',
        'label-commentator-bubble-header': '🎙️ ライブ AI 実況員',
        'commentator-text-waiting': '呪術戦の始まりを待っているぞ… 準備はいいか？',
        'emergency-unmute': '🔊 音声実況をオンにする',
        'skip-result-btn': '演出をスキップ ⏭️',
        'winner-subtext-victory': '🏆 祓ったぞ！勝利',
        'winner-subtext-draw': '🤝 引き分け',
        'draw-match': '引き分け',
        'equal-power': '互角の闘い',
        'p1-wins': 'プレイヤー 1 の勝利',
        'p2-wins': 'プレイヤー 2 の勝利',
        'perfect-victory': '完全勝利',
        'victory': '勝利',
        'stop-reset': '一時停止 / リセット',
        'end-battle': '強制終了',
        'waiting-domain': '待機中',
        'finished-state': '完了',
        'get-ready': '位置につけ'
    },
    'en': {
        'audio-status-hint': '🔇 Audio Locked (Click anywhere)',
        'start-battle-btn': 'START BATTLE',
        'battle-settings-toggle': '⚙️ Match Settings',
        'title-match-config': 'MATCH CONFIG',
        'label-net-mode': 'NETWORK MODE',
        'net-mode-local': 'LOCAL (Same Browser)',
        'net-mode-online': 'ONLINE (Internet)',
        'label-room-code': 'ROOM CODE',
        'title-view-config': 'VIEW CONFIG',
        'label-base-layout': 'BASE CAMERA LAYOUT',
        'layout-side-by-side': 'Side-by-Side (Classic)',
        'layout-vertical-stack': 'Vertical Stack',
        'label-dynamic-view': '🔄 AUTO OVERLAY/QUAD',
        'title-ai-commentator': '🎙️ AI COMMENTATOR',
        'label-commentary-engine': 'COMMENTARY AGENT / ENGINE',
        'label-commentary-lang': 'COMMENTARY LANGUAGE',
        'label-tts-mode': 'TTS MODE',
        'label-specific-voice': 'SELECT SPECIFIC VOICE',
        'opt-voice-auto': '✨ Auto-Select (Optimized Female)',
        'label-foul-language': '🤬 TRASH TALK / FOUL LANGUAGE',
        'label-enable-commentator': '📺 ENABLE COMMENTATOR',
        'label-commentator-volume': '🔊 COMMENTATOR TTS VOLUME',
        'label-commentator-webcam': '📷 CAPTURE WEBCAM SNAPSHOTS',
        'label-image-policy': 'AI SNAPSHOT SEND MODE',
        'policy-always': '📸 Always send both players\' images',
        'policy-start-end': '🎬 Send only at match start & end',
        'policy-never': '🚫 Never send player images',
        'label-enable-ai-portrait': '✨ AI DOMAIN PORTRAIT FUSION',
        'title-game-rules': 'GAME RULES',
        'label-countdown': 'COUNTDOWN',
        'label-difficulty': 'DIFFICULTY',
        'label-count': 'TECHNIQUES',
        'label-score-grace': '⏳ SCORE GRACE (BUFFER) WINDOW',
        'label-sync-gesture': '👥 SYNCED SAME GESTURE MODE',
        'btn-reset-defaults': '🔄 RESET ALL DEFAULTS',
        'p1-waiting': 'WAITING FOR PLAYER 1...',
        'p2-waiting': 'WAITING FOR PLAYER 2...',
        'label-scroll-title': '📜 Scroll of Honor (領域展影)',
        'template-random': '🔮 RANDOM STYLE',
        'template-cyberpunk': '🌌 CYBERPUNK DE',
        'template-ink-wash': '🎨 INK SHADOW',
        'template-neon-glow': '⚡ NEON FORCE',
        'btn-activate-ai': '✨ Activate AI Domain Enhancement',
        'ai-status-text': 'Click to fuse and stylize player portraits using Bedrock Nova Canvas!',
        'ai-result-title': 'Scan to Download Scroll!',
        'ai-result-desc': 'Take your custom stylized battle scroll on your mobile device instantly!',
        'close-result-btn': 'BACK TO LOBBY',
        'label-commentator-bubble-header': '🎙️ LIVE COMMENTATOR',
        'commentator-text-waiting': 'Waiting for sorcery battle...',
        'emergency-unmute': '🔊 UNMUTE SOUND',
        'skip-result-btn': 'SKIP CINEMATIC ⏭️',
        'winner-subtext-victory': 'VICTORY',
        'winner-subtext-draw': 'DRAW',
        'draw-match': 'DRAW MATCH',
        'equal-power': 'EQUAL POWER',
        'p1-wins': 'PLAYER 1 WINS',
        'p2-wins': 'PLAYER 2 WINS',
        'perfect-victory': 'PERFECT VICTORY',
        'victory': 'VICTORY',
        'stop-reset': 'STOP / RESET',
        'end-battle': 'END BATTLE',
        'waiting-domain': 'WAITING',
        'finished-state': 'FINISHED',
        'get-ready': 'GET READY'
    }
};

function translateUI(lang) {
    const translation = UI_LOCALIZATIONS[lang] || UI_LOCALIZATIONS['en'];
    for (const [id, text] of Object.entries(translation)) {
        const elem = document.getElementById(id);
        if (elem) {
            if (id.startsWith('net-mode-') || id.startsWith('layout-') || id.startsWith('policy-') || id.startsWith('template-')) {
                // Handled below specifically
            } else if (elem.tagName === 'INPUT' && elem.type === 'button') {
                elem.value = text;
            } else {
                if (text.includes('<') || text.includes('&')) {
                    elem.innerHTML = text;
                } else {
                    elem.textContent = text;
                }
            }
        }
    }

    const netModeSelect = document.getElementById('cfg-net-mode');
    if (netModeSelect) {
        const localOpt = netModeSelect.querySelector('option[value="local"]');
        if (localOpt) localOpt.textContent = translation['net-mode-local'] || 'LOCAL (Same Browser)';
        const onlineOpt = netModeSelect.querySelector('option[value="online"]');
        if (onlineOpt) onlineOpt.textContent = translation['net-mode-online'] || 'ONLINE (Internet)';
    }

    const baseLayoutSelect = document.getElementById('cfg-base-layout');
    if (baseLayoutSelect) {
        const sideOpt = baseLayoutSelect.querySelector('option[value="side-by-side"]');
        if (sideOpt) sideOpt.textContent = translation['layout-side-by-side'] || 'Side-by-Side (Classic)';
        const vertOpt = baseLayoutSelect.querySelector('option[value="vertical-stack"]');
        if (vertOpt) vertOpt.textContent = translation['layout-vertical-stack'] || 'Vertical Stack';
    }

    const imgPolicySelect = document.getElementById('cfg-commentator-image-policy');
    if (imgPolicySelect) {
        const alwaysOpt = imgPolicySelect.querySelector('option[value="always"]');
        if (alwaysOpt) alwaysOpt.textContent = translation['policy-always'] || 'Always send both players\' images';
        const startOpt = imgPolicySelect.querySelector('option[value="start_end"]');
        if (startOpt) startOpt.textContent = translation['policy-start-end'] || 'Send only at match start & end';
        const neverOpt = imgPolicySelect.querySelector('option[value="never"]');
        if (neverOpt) neverOpt.textContent = translation['policy-never'] || 'Never send player images';
    }

    const aiTemplateSelect = document.getElementById('cfg-ai-template');
    if (aiTemplateSelect) {
        const randOpt = aiTemplateSelect.querySelector('option[value="random"]');
        if (randOpt) randOpt.textContent = translation['template-random'] || 'RANDOM STYLE';
        const cyberOpt = aiTemplateSelect.querySelector('option[value="cyberpunk"]');
        if (cyberOpt) cyberOpt.textContent = translation['template-cyberpunk'] || 'CYBERPUNK DE';
        const inkOpt = aiTemplateSelect.querySelector('option[value="ink-wash"]');
        if (inkOpt) inkOpt.textContent = translation['template-ink-wash'] || 'INK SHADOW';
        const neonOpt = aiTemplateSelect.querySelector('option[value="neon-glow"]');
        if (neonOpt) neonOpt.textContent = translation['template-neon-glow'] || 'NEON FORCE';
    }

    // Dynamic state-based elements
    if (startBtn) {
        if (startBtn.textContent === 'START BATTLE' || startBtn.textContent === '🔥 領域展開！開始對決 🔥' || startBtn.textContent === '🔥 領域展開！バトル開始 🔥') {
            startBtn.textContent = translation['start-battle-btn'] || 'START BATTLE';
        } else if (startBtn.textContent === 'STOP / RESET' || startBtn.textContent === '停止 / 重設 戰局' || startBtn.textContent === '一時停止 / リセット') {
            startBtn.textContent = translation['stop-reset'] || 'STOP / RESET';
        } else if (startBtn.textContent === 'END BATTLE' || startBtn.textContent === '強制結束對決' || startBtn.textContent === '強制終了') {
            startBtn.textContent = translation['end-battle'] || 'END BATTLE';
        }
    }

    // Commentator text default
    const commentaryText = document.getElementById('commentator-text');
    if (commentaryText && (commentaryText.textContent === 'Waiting for sorcery battle...' || commentaryText.textContent === '正在等待術師展開對決... 準備好未啊？' || commentaryText.textContent === '正在等待術師展開對決... 準備好了嗎？' || commentaryText.textContent === '呪術戦の始まりを待っているぞ… 準備はいいか？')) {
        commentaryText.textContent = translation['commentator-text-waiting'] || 'Waiting for sorcery battle...';
    }
}

if (commentaryLangSelector) {
    const savedLang = localStorage.getItem('cfg-commentary-lang') || localStorage.getItem('user_language') || 'zh-HK';
    commentaryLangSelector.value = savedLang;
    if (quickLangSelector) {
        quickLangSelector.value = savedLang;
    }
    if (!localStorage.getItem('user_language')) {
        localStorage.setItem('user_language', savedLang);
    }
    if (!localStorage.getItem('cfg-commentary-lang')) {
        localStorage.setItem('cfg-commentary-lang', savedLang);
    }

    // Initial translation call
    translateUI(savedLang);

    commentaryLangSelector.addEventListener('change', () => {
        const val = commentaryLangSelector.value;
        if (quickLangSelector) quickLangSelector.value = val;
        localStorage.setItem('cfg-commentary-lang', val);
        localStorage.setItem('user_language', val);
        updateVoiceSelectorOptions();
        translateUI(val);
    });

    if (quickLangSelector) {
        quickLangSelector.addEventListener('change', () => {
            const val = quickLangSelector.value;
            commentaryLangSelector.value = val;
            localStorage.setItem('cfg-commentary-lang', val);
            localStorage.setItem('user_language', val);
            updateVoiceSelectorOptions();
            translateUI(val);
        });
    }
}

if (commentaryVoiceSelector) {
    commentaryVoiceSelector.addEventListener('change', () => {
        if (getCommentaryTtsMode() === 'browser') {
            localStorage.setItem('cfg-commentary-voice', commentaryVoiceSelector.value);
        }
    });
}

if (commentaryTtsModeSelector) {
    const savedTtsMode = localStorage.getItem('cfg-commentary-tts-mode');
    commentaryTtsModeSelector.value = savedTtsMode !== null ? (savedTtsMode === 'browser' ? 'browser' : 'aws') : (currentNetMode === 'local' ? 'browser' : 'aws');
    commentaryTtsModeSelector.addEventListener('change', () => {
        const nextMode = commentaryTtsModeSelector.value === 'aws' ? 'aws' : 'browser';
        localStorage.setItem('cfg-commentary-tts-mode', nextMode);
        stopCommentaryPlayback();
        updateVoiceSelectorOptions();
    });
}

const commentaryEngineSelector = document.getElementById('cfg-commentary-engine');
if (commentaryEngineSelector) {
    const savedEngine = localStorage.getItem('cfg-commentary-engine') || 'openclaw';
    commentaryEngineSelector.value = savedEngine;
    commentaryEngineSelector.addEventListener('change', () => {
        localStorage.setItem('cfg-commentary-engine', commentaryEngineSelector.value);
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
} else {
    updateVoiceSelectorOptions();
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

// Add Reset to Defaults logic
const btnResetDefaults = document.getElementById('btn-reset-defaults');
if (btnResetDefaults) {
    btnResetDefaults.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to reset all match settings to default? This will clear all local customizations.')) {
            return;
        }
        
        console.log('[Battle] Resetting all settings to default...');
        
        // 1. Clear relevant localStorage keys
        const keysToClear = [
            'cfg-commentary-engine',
            'user_language',
            'cfg-commentary-lang',
            'cfg-commentary-tts-mode',
            'cfg-commentary-voice',
            'cfg-enable-commentator',
            'cfg-commentator-volume',
            'cfg-commentator-webcam',
            'agent_image_policy',
            'cfg-enable-ai-portrait',
            'cfg-score-grace',
            'cfg-sync-gesture',
            'robot_session_key',
            'openclawActiveSessionId'
        ];
        keysToClear.forEach(key => localStorage.removeItem(key));
        
        // 2. Reset DOM element states to default
        
        // Network Mode & Room
        if (netModeSelect) {
            netModeSelect.value = 'local';
        }
        
        // Base Layout
        if (baseLayoutSelect) {
            baseLayoutSelect.value = 'side-by-side';
        }
        
        // Dynamic View
        if (inDynamicView) {
            inDynamicView.checked = true;
        }
        
        // Commentator Engine
        if (commentaryEngineSelector) {
            commentaryEngineSelector.value = 'openclaw';
        }
        
        // Language Select
        if (commentaryLangSelector) {
            commentaryLangSelector.value = 'zh-HK';
        }
        
        // TTS Mode
        if (commentaryTtsModeSelector) {
            commentaryTtsModeSelector.value = (currentNetMode === 'local') ? 'browser' : 'aws';
        }
        
        // Specific Voice
        if (commentaryVoiceSelector) {
            commentaryVoiceSelector.value = 'auto';
        }
        
        // Trash Talk / Foul Language
        const foulLanguageCheckbox = document.getElementById('cfg-foul-language');
        if (foulLanguageCheckbox) {
            foulLanguageCheckbox.checked = false;
        }
        
        // Enable Commentator
        if (enableCommentatorCheckbox) {
            enableCommentatorCheckbox.checked = true;
        }
        
        // Capture Webcam Snapshots
        if (commentatorWebcamCheckbox) {
            commentatorWebcamCheckbox.checked = true;
        }
        
        // Snapshot Send Mode
        if (commentatorImagePolicySelector) {
            commentatorImagePolicySelector.value = 'start_end';
        }
        
        // AI Domain Portrait Fusion
        if (enableAiPortraitCheckbox) {
            enableAiPortraitCheckbox.checked = true;
        }
        
        // Score Grace Window
        if (scoreGraceSlider) {
            scoreGraceSlider.value = '1.0';
            if (valScoreGrace) {
                valScoreGrace.textContent = '1.0s';
            }
        }
        
        // Synced Same Gesture Mode
        if (syncGestureCheckbox) {
            syncGestureCheckbox.checked = false;
        }
        
        // Match Rules Ranges
        if (inCountdown) {
            inCountdown.value = '3';
            const valCountdown = document.getElementById('val-countdown');
            if (valCountdown) valCountdown.textContent = '3s';
        }
        if (inDifficulty) {
            inDifficulty.value = '5';
            const valDifficulty = document.getElementById('val-difficulty');
            if (valDifficulty) valDifficulty.textContent = '5s';
        }
        if (inCount) {
            inCount.value = '11';
            const valCount = document.getElementById('val-count');
            if (valCount) valCount.textContent = '11';
        }

        // Initialize default session keys in localStorage so that other components work properly
        localStorage.setItem('robot_session_key', 'mcpserver');
        
        // 3. Trigger functional updates in real-time
        updateLayout();
        updateAllVolumeControls('100');
        syncCommentatorImagePolicyUi();
        updateVoiceSelectorOptions();
        await updateSyncMode();
        
        alert('All match settings have been reset to factory defaults! 🔮');
    });
}

function initCentralScrollOfHonor() {
    const p1Preview = document.getElementById('p1-captured-preview');
    const p2Preview = document.getElementById('p2-captured-preview');
    const btnActivateAi = document.getElementById('btn-activate-ai');
    const cfgAiTemplate = document.getElementById('cfg-ai-template');
    const triggerContainer = document.getElementById('ai-trigger-container');
    const aiStatusText = document.getElementById('ai-status-text');
    const progressBarContainer = document.getElementById('ai-progress-bar-container');
    const progressBar = document.getElementById('ai-progress-bar');
    const resultPanel = document.getElementById('ai-result-panel');
    const qrcodeImg = document.getElementById('ai-qrcode-img');
    const shortUrlLabel = document.getElementById('ai-short-url-label');
    const resultTitle = document.getElementById('ai-result-title');
    const resultDesc = document.getElementById('ai-result-desc');

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
    const shareUrl = `${window.location.origin}/share.html?sessionId=${encodeURIComponent(sessionId)}`;
    const qrcodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shareUrl)}`;

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

    fetch('/config.json')
        .then((response) => response.ok ? response.json() : {})
        .then((config) => {
            if (!config || !config.isServerless) return;

            if (triggerContainer) triggerContainer.style.display = 'none';
            if (progressBarContainer) progressBarContainer.style.display = 'none';
            if (resultPanel) resultPanel.style.display = 'flex';
            if (qrcodeImg) qrcodeImg.src = qrcodeApiUrl;
            if (resultTitle) resultTitle.textContent = 'Scan to Get Player Images';
            if (resultDesc) resultDesc.textContent = 'AWS portrait generation is disabled here. Open the player image page on your phone to download the original Player 1 and Player 2 captures.';
            if (shortUrlLabel) {
                shortUrlLabel.innerHTML = `<a href="${shareUrl}" target="_blank" style="color: #FFFF00; text-decoration: underline; font-weight: bold;">${shareUrl}</a>`;
            }
            if (aiStatusText) {
                aiStatusText.textContent = 'AWS mode: AI portrait generation is disabled. Scan the QR code or open the link to get the original player images.';
            }
        })
        .catch((error) => {
            logClientDebug('WARN', 'Central AI Portrait', 'config.json lookup failed for serverless portrait mode', { error: error.message });
        });

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
            if (resultPanel) resultPanel.style.display = 'flex';
            if (qrcodeImg) qrcodeImg.src = qrcodeApiUrl;
            if (shortUrlLabel) {
                shortUrlLabel.innerHTML = `<a href="${shareUrl}" target="_blank" style="color: #FFFF00; text-decoration: underline; font-weight: bold;">${shareUrl}</a><div style="margin-top: 6px; color: rgba(255,255,255,0.65); font-size: 10px;">Scan now to recover the original player captures even if AI fusion never finishes.</div>`;
            }
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

                if (result.status && result.status.startsWith('ERROR:')) {
                    if (progressBarContainer) progressBarContainer.style.display = 'none';
                    btnActivateAi.disabled = false;
                    btnActivateAi.style.opacity = '1';
                    btnActivateAi.style.display = 'block';

                    const err = result.status.replace('ERROR:', '').trim();
                    if (err === 'AWS_IMAGE_GENERATION_DISABLED') {
                        if (aiStatusText) aiStatusText.textContent = 'ℹ️ AWS AI portrait generation is disabled. Scan the QR code to open the share page and download the original player captures.';
                    } else {
                        if (aiStatusText) aiStatusText.textContent = `❌ Style fusion unavailable. Error: ${err}`;
                    }
                    return;
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
                            } else if (err === 'AWS_IMAGE_GENERATION_DISABLED') {
                                if (aiStatusText) aiStatusText.textContent = 'ℹ️ AWS AI portrait generation is disabled. Scan the QR code to open the share page and download the original player captures.';
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
