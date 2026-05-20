const player = document.getElementById('player');
const placeholder = document.getElementById('placeholder');
const overlay = document.getElementById('interaction-overlay');
const debugConn = document.getElementById('debug-conn');
const debugInter = document.getElementById('debug-inter');
const debugLast = document.getElementById('debug-last');

if (window.opener) {
    debugConn.textContent = "LINKED TO GAME";
    debugConn.style.color = "#4A90E2";
}

function notifyReady() {
    if (window.opener) {
        console.log('[Player] Sending PLAYER_READY to parent');
        window.opener.postMessage({ type: 'PLAYER_READY' }, '*');
        debugLast.textContent = "SENT READY";
    } else {
        console.error('[Player] No opener found!');
    }
}

overlay.addEventListener('click', () => {
    overlay.style.display = 'none';
    player.muted = false;
    debugInter.textContent = "READY";
    debugInter.style.color = "#4CAF50";
    console.log('[Player] Interaction enabled');
    notifyReady();
});

window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object' || !data.type) return;

    const { type, videoSrc } = data;
    console.log('[Player] Received:', type, videoSrc || '');
    debugLast.textContent = type;

    if (type === 'PLAY_VIDEO' && videoSrc) {
        placeholder.style.opacity = "0";
        player.style.display = 'block';
        
        // Only reload if source changed
        if (!player.src.includes(videoSrc)) {
            player.src = videoSrc;
            player.load();
        }
        
        player.play().then(() => {
            console.log('[Player] Playback started');
            debugLast.textContent = "PLAYING: " + videoSrc.split('/').pop();
        }).catch(e => {
            console.error('[Player] Play failed:', e);
            debugLast.textContent = "ERROR: " + e.message;
        });
    }
    
    if (type === 'PING') {
        notifyReady();
    }
});

// Ping parent every 2 seconds to maintain connection
setInterval(notifyReady, 2000);
