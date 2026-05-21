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
const baseLayoutSelect = document.getElementById('cfg-base-layout'), inQuadMode = document.getElementById('cfg-quad-mode'), inDynamicView = document.getElementById('cfg-dynamic-view');
const powerP1 = document.getElementById('power-p1'), powerP2 = document.getElementById('power-p2'), ticker = document.getElementById('battle-ticker'), viewP1 = document.getElementById('p1-view'), viewP2 = document.getElementById('p2-view');
const settingsToggle = document.getElementById('battle-settings-toggle'), settingsPanel = document.getElementById('battle-settings-panel'), saveCfgBtn = document.getElementById('save-battle-cfg');
const inCountdown = document.getElementById('cfg-countdown'), inDifficulty = document.getElementById('cfg-difficulty'), inCount = document.getElementById('cfg-count');
const countdownOverlay = document.getElementById('countdown-overlay'), countdownText = document.getElementById('countdown-text');

// --- STATE MANAGEMENT ---
const urlParams = new URLSearchParams(window.location.search);
let currentNetMode = urlParams.get('net_mode') || 'local';
let currentRoomCode = urlParams.get('room') || 'BTL1';
let p1Time = 0, p2Time = 0, p1Active = false, p2Active = false, p1ScoreVal = 0, p2ScoreVal = 0, isMatchOver = false, winnerTimeoutHandle = null, hasMatchStarted = false;
let p1TotalActions = 11, p2TotalActions = 11;
let activeCinematicsCount = 0;
let resultTimeoutHandle = null;
let isWinnerLogicActive = false;

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

function updateSyncMode() {
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
}

// --- EVENT LISTENERS ---
if (netModeSelect) netModeSelect.addEventListener('change', updateSyncMode);
if (inQuadMode) inQuadMode.addEventListener('change', () => { if (inQuadMode.checked) inDynamicView.checked = false; updateLayout(); });
if (inDynamicView) inDynamicView.addEventListener('change', () => { if (inDynamicView.checked) inQuadMode.checked = false; updateLayout(); });
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
function addTickerMsg(msg, playerClass) { const el = document.createElement('div'); el.className = `ticker-msg ${playerClass}`; el.textContent = `> ${msg}`; ticker.appendChild(el); ticker.scrollTop = ticker.scrollHeight; if (ticker.children.length > 5) ticker.removeChild(ticker.firstChild); }
function triggerHitEffect(victimID) { const view = (victimID === 'player1') ? viewP1 : viewP2; view.classList.add('hit-shake'); const flash = document.createElement('div'); flash.className = 'hit-flash'; view.appendChild(flash); setTimeout(() => { view.classList.remove('hit-shake'); if (flash.parentNode) view.removeChild(flash); }, 400); }
function updatePowerBar() { const total = p1ScoreVal + p2ScoreVal; if (total === 0) powerP1.style.width = '50%'; else powerP1.style.width = `${(p1ScoreVal / total) * 100}%`; }

let isAudioUnlocked = false;
async function masterAudioUnlock() {
    if (isAudioUnlocked) return;
    const unlockSrc = getVideoUrl('win/heroacademy.mp4');
    for (const v of [p1Cinema, p2Cinema, resultCinema]) {
        v.muted = false; v.volume = 1.0; v.src = unlockSrc; v.load();
        try { await v.play(); v.pause(); v.currentTime = 0; } catch(e) {}
    }
    isAudioUnlocked = true; audioHint.textContent = '🔊 Audio Active'; audioHint.classList.add('unlocked');
    setTimeout(() => audioHint.style.display = 'none', 3000);
}
document.addEventListener('click', masterAudioUnlock, { once: true });
emergencyUnmute.addEventListener('click', (e) => { e.stopPropagation(); resultCinema.muted = false; resultCinema.volume = 1.0; resultCinema.play(); emergencyUnmute.style.display = 'none'; });

function resetViewerState() {
    console.log('[Battle] resetViewerState');
    if (winnerTimeoutHandle) clearTimeout(winnerTimeoutHandle); winnerTimeoutHandle = null;
    if (resultTimeoutHandle) clearTimeout(resultTimeoutHandle); resultTimeoutHandle = null;
    isMatchOver = false; isWinnerLogicActive = false; hasMatchStarted = false;
    p1Active = false; p2Active = false; p1ScoreVal = 0; p2ScoreVal = 0;
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

async function startMatch() {
    if (!sync) return;
    sync.broadcast('CLOSE_OVERLAYS', null);
    await masterAudioUnlock(); resetViewerState();
    const countdownVal = parseInt(inCountdown.value) || 0;
    if (countdownVal > 0) {
        countdownOverlay.style.display = 'flex';
        for (let i = countdownVal; i > 0; i--) { countdownText.textContent = i; countdownText.style.animation = 'none'; void countdownText.offsetWidth; countdownText.style.animation = 'winner-pop 0.5s'; await new Promise(r => setTimeout(r, 1000)); }
        countdownText.textContent = "GO!"; await new Promise(r => setTimeout(r, 500)); countdownOverlay.style.display = 'none';
    }
    sync.broadcast('START_BATTLE', { difficulty: parseInt(inDifficulty.value), count: parseInt(inCount.value) });
    hasMatchStarted = true;
    startBtn.style.background = '#4CAF50'; startBtn.textContent = 'GAME RUNNING';
    setTimeout(() => { startBtn.style.background = '#FF5252'; startBtn.textContent = 'START BATTLE'; }, 3000);
}
startBtn.addEventListener('click', startMatch);

function getVideoUrl(subPath) {
    const hostname = window.location.hostname;
    const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname);
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || isIp || window.location.protocol === 'file:';
    const GITHUB_PAGES_BASE = "https://wongcyrus.github.io/domain-expansion-ar-game/";
    return isLocal ? `${window.location.origin}${window.location.pathname.replace(/\/[^\/]*$/, '')}/static/video/${subPath}` : `${GITHUB_PAGES_BASE}static/video/${subPath}`;
}

function playGlobalResultVideo(isWin) {
    const folder = isWin ? 'win' : 'lose';
    const video = (isWin ? winVideos : loseVideos)[Math.floor(Math.random() * (isWin ? winVideos : loseVideos).length)];
    const absSrc = getVideoUrl(`${folder}/${video}`);
    closeResultBtn.style.display = 'none';
    if (skipResultBtn) skipResultBtn.style.display = 'block';
    const duration = VIDEO_DURATIONS[video] || 15000;
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
    };
    resultCinema.onended = endResult;
    if (skipResultBtn) skipResultBtn.onclick = endResult;
    resultTimeoutHandle = setTimeout(endResult, duration + 1000);
}

function showWinner() {
    if (isWinnerLogicActive) return;
    isWinnerLogicActive = true; isMatchOver = true; hasMatchStarted = false;
    if (winnerTimeoutHandle) { clearTimeout(winnerTimeoutHandle); winnerTimeoutHandle = null; }
    if (sync) sync.broadcast('MATCH_OVER', null);
    [p1Cinema, p2Cinema].forEach(c => { c.pause(); c.src = ""; c.style.display = 'none'; });
    resScoreP1.textContent = p1ScoreVal; resScoreP2.textContent = p2ScoreVal;
    const maxPossible = Math.max(p1TotalActions, p2TotalActions, 11);
    const PASS_MARK = Math.ceil(maxPossible / 2);
    const winnerScore = Math.max(p1ScoreVal, p2ScoreVal);
    if (p1ScoreVal === p2ScoreVal) { winnerText.textContent = 'DRAW MATCH'; winnerSubtext.textContent = 'EQUAL POWER'; winnerText.style.color = '#FFF'; }
    else if (p1ScoreVal > p2ScoreVal) { winnerText.textContent = 'PLAYER 1 WINS'; winnerText.style.color = '#4A90E2'; winnerSubtext.textContent = (p1ScoreVal >= p1TotalActions) ? 'PERFECT VICTORY' : 'VICTORY'; }
    else { winnerText.textContent = 'PLAYER 2 WINS'; winnerText.style.color = '#FFFF00'; winnerSubtext.textContent = (p2ScoreVal >= p2TotalActions) ? 'PERFECT VICTORY' : 'VICTORY'; }
    resultOverlay.style.display = 'flex';
    playGlobalResultVideo(winnerScore >= PASS_MARK);
    updateLayout();
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
        sync.broadcast('MATCH_PAUSE', null);
        addTickerMsg(`MATCH PAUSED FOR CINEMATIC`, '');
        const cinema = (playerID === 'player1') ? p1Cinema : p2Cinema;
        cinema.src = videoSrc; cinema.style.display = 'block'; cinema.load();
        updateLayout();
        const videoFile = videoSrc.split('/').pop();
        const duration = VIDEO_DURATIONS[videoFile] || 15000;
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
    };
}
closeResultBtn.addEventListener('click', () => { resetViewerState(); if (sync) sync.broadcast('CLOSE_OVERLAYS', null); });
if (netModeSelect) netModeSelect.value = currentNetMode;
updateSyncMode();
updateLayout();
