const sync = new BattleModeSync('viewer');
const p1Video = document.getElementById('p1-video'), p2Video = document.getElementById('p2-video'), p1Waiting = document.getElementById('p1-waiting'), p2Waiting = document.getElementById('p2-waiting');
const p1Score = document.getElementById('p1-score'), p2Score = document.getElementById('p2-score'), p1Domain = document.getElementById('p1-domain'), p2Domain = document.getElementById('p2-domain');
const timerDisplay = document.getElementById('timer-display'), p1TimerSub = document.getElementById('p1-timer-sub'), p2TimerSub = document.getElementById('p2-timer-sub'), startBtn = document.getElementById('start-battle-btn'), audioHint = document.getElementById('audio-status-hint');
const p1Cinema = document.getElementById('p1-cinema'), p2Cinema = document.getElementById('p2-cinema'), resultCinema = document.getElementById('result-cinema'), emergencyUnmute = document.getElementById('emergency-unmute');
const resultOverlay = document.getElementById('match-result-overlay'), winnerText = document.getElementById('winner-text'), winnerSubtext = document.getElementById('winner-subtext'), resScoreP1 = document.getElementById('res-score-p1'), resScoreP2 = document.getElementById('res-score-p2'), closeResultBtn = document.getElementById('close-result-btn'), skipResultBtn = document.getElementById('skip-result-btn');
const winVideos = ['heroacademy.mp4', 'solo-leveling.mp4', 'onepunchman.mp4', '8-gate.mp4', 'escanor.mp4', 'onepunch.mp4', 'onepunch2.mp4'], loseVideos = Array.from({length: 9}, (_, i) => `shiba${i+1}.mp4`);

// Video Durations in milliseconds based on provided table
const VIDEO_DURATIONS = {
    "domain_chimera_shadow_garden.mp4": 3520,
    "domain_authentic_love.mp4": 9870,
    "domain_self_embodiment.mp4": 28180,
    "domain_yuji_itadori.mp4": 18940,
    "domain_malevolent_shrine.mp4": 25000,
    "domain_idle_death_gamble.mp4": 15800,
    "domain_unlimited_void.mp4": 7330,
    "domain_time_cell_moon_palace.mp4": 7800,
    "technique_hollow_purple.mp4": 22030,
    "technique_reversal_red.mp4": 10580,
    "technique_lapse_blue.mp4": 24440,
    // Win Videos
    "heroacademy.mp4": 74660,
    "solo-leveling.mp4": 65830,
    "onepunchman.mp4": 53730,
    "8-gate.mp4": 70400,
    "escanor.mp4": 46180,
    "onepunch.mp4": 28730,
    "onepunch2.mp4": 67280,
    // Lose Videos
    "shiba1.mp4": 15550,
    "shiba2.mp4": 64060,
    "shiba3.mp4": 7610,
    "shiba4.mp4": 11600,
    "shiba5.mp4": 7560,
    "shiba6.mp4": 21590,
    "shiba7.mp4": 16950,
    "shiba8.mp4": 14720,
    "shiba9.mp4": 20080
};

const powerP1 = document.getElementById('power-p1'), powerP2 = document.getElementById('power-p2'), ticker = document.getElementById('battle-ticker'), viewP1 = document.getElementById('p1-view'), viewP2 = document.getElementById('p2-view');
const settingsToggle = document.getElementById('battle-settings-toggle'), settingsPanel = document.getElementById('battle-settings-panel'), saveCfgBtn = document.getElementById('save-battle-cfg');
const inCountdown = document.getElementById('cfg-countdown'), inDifficulty = document.getElementById('cfg-difficulty'), inCount = document.getElementById('cfg-count');
const inQuadMode = document.getElementById('cfg-quad-mode');
const countdownOverlay = document.getElementById('countdown-overlay'), countdownText = document.getElementById('countdown-text');

function addTickerMsg(msg, playerClass) { const el = document.createElement('div'); el.className = `ticker-msg ${playerClass}`; el.textContent = `> ${msg}`; ticker.appendChild(el); ticker.scrollTop = ticker.scrollHeight; if (ticker.children.length > 5) ticker.removeChild(ticker.firstChild); }
function triggerHitEffect(victimID) { const view = (victimID === 'player1') ? viewP1 : viewP2; view.classList.add('hit-shake'); const flash = document.createElement('div'); flash.className = 'hit-flash'; view.appendChild(flash); setTimeout(() => { view.classList.remove('hit-shake'); if (flash.parentNode) view.removeChild(flash); }, 400); }
function updatePowerBar() { const total = p1ScoreVal + p2ScoreVal; if (total === 0) powerP1.style.width = '50%'; else powerP1.style.width = `${(p1ScoreVal / total) * 100}%`; }
settingsToggle.addEventListener('click', () => { settingsPanel.style.display = (settingsPanel.style.display === 'flex' ? 'none' : 'flex'); });
saveCfgBtn.addEventListener('click', () => { settingsPanel.style.display = 'none'; });
inCountdown.addEventListener('input', () => { document.getElementById('val-countdown').textContent = `${inCountdown.value}s`; });
inDifficulty.addEventListener('input', () => { document.getElementById('val-difficulty').textContent = `${inDifficulty.value}s`; });
inCount.addEventListener('input', () => { document.getElementById('val-count').textContent = inCount.value; });

inQuadMode.addEventListener('change', () => {
    if (inQuadMode.checked) { document.body.classList.add('quad-mode'); p1Cinema.style.display = 'block'; p2Cinema.style.display = 'block'; }
    else { document.body.classList.remove('quad-mode'); if(!p1Cinema.src.includes('.mp4')) p1Cinema.style.display = 'none'; if(!p2Cinema.src.includes('.mp4')) p2Cinema.style.display = 'none'; }
});

let p1Time = 0, p2Time = 0, p1Active = false, p2Active = false, p1ScoreVal = 0, p2ScoreVal = 0, isMatchOver = false, winnerTimeoutHandle = null;
let p1TotalActions = 11, p2TotalActions = 11; // Default
let activeCinematicsCount = 0;
let resultTimeoutHandle = null;
let isWinnerLogicActive = false; // Strictest guard

let isAudioUnlocked = false;
async function masterAudioUnlock() {
    if (isAudioUnlocked) return;
    const unlockSrc = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '') + '/static/video/win/heroacademy.mp4';
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
    isMatchOver = false;
    isWinnerLogicActive = false;
    p1Active = false; p2Active = false; p1ScoreVal = 0; p2ScoreVal = 0;
    p1TotalActions = 11; p2TotalActions = 11;
    activeCinematicsCount = 0;
    resultOverlay.style.display = 'none'; emergencyUnmute.style.display = 'none';
    if (skipResultBtn) skipResultBtn.style.display = 'none';
    resultCinema.pause(); resultCinema.style.display = 'none'; resultCinema.src = "";
    [p1Cinema, p2Cinema].forEach(c => { c.pause(); if(!inQuadMode.checked) c.style.display = 'none'; c.src = ""; });
    p1Score.textContent = '0'; p2Score.textContent = '0'; timerDisplay.textContent = '00:00';
    p1TimerSub.textContent = ''; p2TimerSub.textContent = '';
    powerP1.style.width = '50%'; ticker.innerHTML = ''; addTickerMsg('MATCH STARTED', '');
}

async function startMatch() {
    sync.broadcast('CLOSE_OVERLAYS', null);
    await masterAudioUnlock(); resetViewerState();
    const countdownVal = parseInt(inCountdown.value) || 0;
    if (countdownVal > 0) {
        countdownOverlay.style.display = 'flex';
        for (let i = countdownVal; i > 0; i--) { countdownText.textContent = i; countdownText.style.animation = 'none'; void countdownText.offsetWidth; countdownText.style.animation = 'winner-pop 0.5s'; await new Promise(r => setTimeout(r, 1000)); }
        countdownText.textContent = "GO!"; await new Promise(r => setTimeout(r, 500)); countdownOverlay.style.display = 'none';
    }
    sync.broadcast('START_BATTLE', { difficulty: parseInt(inDifficulty.value), count: parseInt(inCount.value) });
    startBtn.style.background = '#4CAF50'; startBtn.textContent = 'GAME RUNNING';
    setTimeout(() => { startBtn.style.background = '#FF5252'; startBtn.textContent = 'START BATTLE'; }, 3000);
}
startBtn.addEventListener('click', startMatch);

sync.onStreamReceived = (playerID, stream) => {
    console.log(`[Battle] Stream received for ${playerID}`, stream);
    if (playerID === 'player1') { 
        p1Video.srcObject = stream; 
        p1Waiting.style.display = 'none'; 
        p1Video.play().catch(e => console.warn("[Battle] P1 video play failed:", e));
    }
    else if (playerID === 'player2') { 
        p2Video.srcObject = stream; 
        p2Waiting.style.display = 'none'; 
        p2Video.play().catch(e => console.warn("[Battle] P2 video play failed:", e));
    }
};

sync.onPlayVideoSync = (playerID, videoSrc) => {
    if (isMatchOver) return;
    console.log(`[Battle] playing cinematic for ${playerID}: ${videoSrc}`);
    
    // Increment active count
    activeCinematicsCount++;
    
    // Broadcast global match pause (Safe to call multiple times)
    sync.broadcast('MATCH_PAUSE', null);
    addTickerMsg(`MATCH PAUSED FOR CINEMATIC`, '');

    const cinema = (playerID === 'player1') ? p1Cinema : p2Cinema;
    cinema.src = videoSrc; cinema.style.display = 'block'; cinema.load();

    // Safety Fallback based on Table Durations
    const videoFile = videoSrc.split('/').pop();
    const duration = VIDEO_DURATIONS[videoFile] || 15000;
    let hasEnded = false;

    const endLogic = () => {
        if (hasEnded) return;
        hasEnded = true;
        if(!inQuadMode.checked) cinema.style.display = 'none';
        
        // Decrement active count
        activeCinematicsCount--;
        
        // Only resume if all cinematics finished
        if (activeCinematicsCount <= 0) {
            activeCinematicsCount = 0; // Guard
            console.log('[Battle] All cinematics ended, resuming match');
            sync.broadcast('MATCH_RESUME', null);
            addTickerMsg(`MATCH RESUMED`, '');
        }
    };

    cinema.oncanplay = () => {
        cinema.muted = false;
        cinema.volume = 1.0;
        cinema.play().catch(() => { cinema.muted = true; cinema.play(); });
    };
    cinema.onended = endLogic;
    setTimeout(endLogic, duration + 1000); // 1s extra buffer
};

function playGlobalResultVideo(isWin) {
    console.log(`[Battle] playGlobalResultVideo(isWin=${isWin})`);
    const folder = isWin ? 'win' : 'lose';
    const video = (isWin ? winVideos : loseVideos)[Math.floor(Math.random() * (isWin ? winVideos : loseVideos).length)];
    const absSrc = `${window.location.origin}${window.location.pathname.replace(/\/[^\/]*$/, '')}/static/video/${folder}/${video}`;
    console.log(`[Battle] Result video selected: ${absSrc}`);
    
    // Hide lobby button during result video, show skip button
    closeResultBtn.style.display = 'none';
    if (skipResultBtn) skipResultBtn.style.display = 'block';
    
    const duration = VIDEO_DURATIONS[video] || 15000;
    console.log(`[Battle] Video duration: ${duration}ms`);

    resultCinema.pause(); 
    resultCinema.src = absSrc; 
    resultCinema.style.display = 'block'; 
    resultCinema.load();

    const onCanPlay = () => {
        console.log('[Battle] Result video can play, starting playback');
        resultCinema.muted = false; 
        resultCinema.volume = 1.0;
        resultCinema.play().then(() => {
            console.log('[Battle] Result video playback started successfully');
        }).catch(err => { 
            console.warn('[Battle] Result video play failed (muted fallback):', err);
            emergencyUnmute.style.display = 'block'; 
            resultCinema.muted = true; 
            resultCinema.play(); 
        });
        resultCinema.removeEventListener('canplay', onCanPlay);
    };
    resultCinema.addEventListener('canplay', onCanPlay);

    let hasEnded = false;
    const endResult = () => {
        if (hasEnded) return;
        hasEnded = true;
        console.log('[Battle] End result triggered (video finished or skipped)');
        if (resultTimeoutHandle) clearTimeout(resultTimeoutHandle);
        resultCinema.pause();
        resultCinema.style.display = 'none';
        if (skipResultBtn) skipResultBtn.style.display = 'none';
        closeResultBtn.style.display = 'block';
    };

    resultCinema.onended = endResult;
    if (skipResultBtn) skipResultBtn.onclick = endResult;
    resultTimeoutHandle = setTimeout(endResult, duration + 1000);
}

function showWinner() {
    if (isWinnerLogicActive) {
        console.log('[Battle] showWinner aborted: isWinnerLogicActive is true');
        return;
    }
    isWinnerLogicActive = true;
    isMatchOver = true;
    
    console.log('[Battle] showWinner EXECUTION START');
    
    if (winnerTimeoutHandle) { 
        clearTimeout(winnerTimeoutHandle); 
        winnerTimeoutHandle = null; 
    }
    
    // Tell players the match is over immediately
    sync.broadcast('MATCH_OVER', null);

    // Stop all player-specific cinematics
    [p1Cinema, p2Cinema].forEach(c => { 
        c.pause(); 
        if(!inQuadMode.checked) c.style.display = 'none'; 
        c.src = "";
    });

    resScoreP1.textContent = p1ScoreVal; 
    resScoreP2.textContent = p2ScoreVal;
    
    const maxPossible = Math.max(p1TotalActions, p2TotalActions, 11);
    const PASS_MARK = Math.ceil(maxPossible / 2); 
    const winnerScore = Math.max(p1ScoreVal, p2ScoreVal);
    
    console.log(`[Battle] Final Match State - P1: ${p1ScoreVal}, P2: ${p2ScoreVal}, Mark: ${PASS_MARK}`);

    if (p1ScoreVal === p2ScoreVal) { 
        winnerText.textContent = 'DRAW MATCH'; 
        winnerSubtext.textContent = 'EQUAL POWER'; 
        winnerText.style.color = '#FFF'; 
        winnerText.style.textShadow = '0 0 30px #FFF';
    } else if (p1ScoreVal > p2ScoreVal) { 
        winnerText.textContent = 'PLAYER 1 WINS'; 
        winnerText.style.color = '#4A90E2'; 
        winnerText.style.textShadow = '0 0 30px #4A90E2';
        winnerSubtext.textContent = (p1ScoreVal >= p1TotalActions) ? 'PERFECT VICTORY' : 'VICTORY'; 
    } else { 
        winnerText.textContent = 'PLAYER 2 WINS'; 
        winnerText.style.color = '#FFFF00'; 
        winnerText.style.textShadow = '0 0 30px #FFFF00';
        winnerSubtext.textContent = (p2ScoreVal >= p2TotalActions) ? 'PERFECT VICTORY' : 'VICTORY'; 
    }
    
    resultOverlay.style.display = 'flex';
    const isWin = (winnerScore >= PASS_MARK);
    console.log(`[Battle] Triggering Global Result Video (isWin=${isWin})`);
    playGlobalResultVideo(isWin);
}

sync.onStateReceived = (playerID, state) => {
    if (isWinnerLogicActive) {
        // Match is definitely over, just update display
        const { score } = state;
        if (playerID === 'player1') { p1ScoreVal = score; p1Score.textContent = score; }
        else { p2ScoreVal = score; p2Score.textContent = score; }
        return;
    }
    
    const { domain, score, timer, isGameActive, totalActions } = state;
    
    if (playerID === 'player1') {
        const wasActive = p1Active; p1Active = isGameActive;
        if (totalActions !== undefined) p1TotalActions = totalActions;
        
        if (score > p1ScoreVal) { addTickerMsg(`P1 SCORED: ${domain || 'Technique'}`, 'ticker-p1'); triggerHitEffect('player2'); updatePowerBar(); }
        p1ScoreVal = score; p1Score.textContent = score; p1Time = isGameActive ? timer : 0;
        if (domain) { p1Domain.textContent = domain; p1Domain.classList.add('active'); } else { p1Domain.classList.remove('active'); }
        if (isGameActive) p1TimerSub.textContent = `(${timer}s)`;
        else { 
            p1TimerSub.textContent = ''; 
            if (wasActive) {
                addTickerMsg(`P1 FINISHED: ${score}/${p1TotalActions}`, 'ticker-p1');
                console.log(`[Battle] P1 Finished with ${score}`);
            }
        }
    } else if (playerID === 'player2') {
        const wasActive = p2Active; p2Active = isGameActive;
        if (totalActions !== undefined) p2TotalActions = totalActions;
        
        if (score > p2ScoreVal) { addTickerMsg(`P2 SCORED: ${domain || 'Technique'}`, 'ticker-p2'); triggerHitEffect('player1'); updatePowerBar(); }
        p2ScoreVal = score; p2Score.textContent = score; p2Time = isGameActive ? timer : 0;
        if (domain) { p2Domain.textContent = domain; p2Domain.classList.add('active'); } else { p2Domain.classList.remove('active'); }
        if (isGameActive) p2TimerSub.textContent = `(${timer}s)`;
        else { 
            p2TimerSub.textContent = ''; 
            if (wasActive) {
                addTickerMsg(`P2 FINISHED: ${score}/${p2TotalActions}`, 'ticker-p2');
                console.log(`[Battle] P2 Finished with ${score}`);
            }
        }
    }

    // WINNER LOGIC: 
    if (!isWinnerLogicActive) {
        // Condition 1: Both finished
        if (!p1Active && !p2Active && (p1ScoreVal > 0 || p2ScoreVal > 0)) {
            console.log('[Battle] Trigger Condition: Both players inactive');
            if (!winnerTimeoutHandle) winnerTimeoutHandle = setTimeout(showWinner, 500);
        }
        // Condition 2: One finished, and the other has NO chance to win/draw (Score Gap > Remaining targets)
        else if (!p1Active && p2Active && p2TotalActions > 0) {
            if (p1ScoreVal > (p2ScoreVal + p2TotalActions)) { 
                console.log(`[Battle] Trigger Condition: P1 Won Early (${p1ScoreVal} vs P2 max ${p2ScoreVal + p2TotalActions})`);
                if (!winnerTimeoutHandle) winnerTimeoutHandle = setTimeout(showWinner, 500);
            }
        }
        else if (!p2Active && p1Active && p1TotalActions > 0) {
            if (p2ScoreVal > (p1ScoreVal + p1TotalActions)) {
                console.log(`[Battle] Trigger Condition: P2 Won Early (${p2ScoreVal} vs P1 max ${p1ScoreVal + p1TotalActions})`);
                if (!winnerTimeoutHandle) winnerTimeoutHandle = setTimeout(showWinner, 500);
            }
        }
    }

    const activeTime = Math.max(p1Time, p2Time);
    if (p1Active || p2Active) timerDisplay.textContent = activeTime + 's';
    else if (!isWinnerLogicActive) timerDisplay.textContent = '00:00';
};
closeResultBtn.addEventListener('click', () => { 
    console.log('[Battle] Returning to lobby');
    resetViewerState();
    sync.broadcast('CLOSE_OVERLAYS', null);
});
