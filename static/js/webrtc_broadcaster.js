/**
 * WebRTC Broadcaster / Viewer for Domain Expansion Battle Mode
 * Uses BroadcastChannel for local signaling (no backend server required)
 */
class BattleModeSync {
    constructor(role) {
        this.role = role; // 'player1', 'player2', or 'viewer'
        this.channel = new BroadcastChannel('domain_battle_sync');
        this.pcMap = new Map(); // For viewer: Map of playerID -> PeerConnection
        this.localPC = null;    // For broadcaster: Single connection to viewer
        this.isClosed = false;
        
        this.onStreamReceived = null; // Callback for viewer
        this.onStateReceived = null;  // Callback for viewer
        
        this.init();
    }

    init() {
        this.channel.onmessage = (event) => {
            const { type, from, to, data } = event.data;
            
            // If this message isn't for us, ignore it
            if (to && to !== this.role) return;

            // Only log important signaling events, not high-frequency game state
            if (type !== 'GAME_STATE' && type !== 'ICE_CANDIDATE') {
                console.log(`[BattleSync] Received ${type} from ${from}`);
            }

            switch (type) {
                case 'VIEWER_JOIN':
                    if (this.isPlayer()) this.handleViewerJoin(from);
                    break;
                case 'PLAYER_READY':
                    if (this.role === 'viewer') {
                        console.log(`[BattleSync] Player ${from} is ready, requesting stream...`);
                        this.broadcast('VIEWER_JOIN', null, from);
                    }
                    break;
                case 'OFFER':
                    if (this.role === 'viewer') this.handleOffer(from, data);
                    break;
                case 'ANSWER':
                    if (this.isPlayer()) this.handleAnswer(data);
                    break;
                case 'ICE_CANDIDATE':
                    this.handleIceCandidate(from, data);
                    break;
                case 'GAME_STATE':
                    if (this.role === 'viewer' && this.onStateReceived) {
                        this.onStateReceived(from, data);
                    }
                    break;
                case 'START_BATTLE':
                    if (this.isPlayer() && this.onStartBattle) {
                        this.onStartBattle(data);
                    }
                    break;
                case 'CLOSE_OVERLAYS':
                    if (this.isPlayer() && this.onCloseOverlays) {
                        this.onCloseOverlays();
                    }
                    break;
                case 'MATCH_PAUSE':
                    if (this.isPlayer() && this.onMatchPause) {
                        this.onMatchPause();
                    }
                    break;
                case 'MATCH_RESUME':
                    if (this.isPlayer() && this.onMatchResume) {
                        this.onMatchResume();
                    }
                    break;
                case 'PLAY_VIDEO_SYNC':
                    if (this.role === 'viewer' && this.onPlayVideoSync) {
                        this.onPlayVideoSync(from, data);
                    }
                    break;
            }
        };

        if (this.role === 'viewer') {
            // Tell players we are here
            this.broadcast('VIEWER_JOIN', null);
        }
    }

    close() {
        console.log(`[BattleSync] Closing sync for ${this.role}`);
        this.isClosed = true;
        if (this.channel) {
            this.channel.close();
        }
        if (this.localPC) {
            this.localPC.close();
            this.localPC = null;
        }
        if (this.pcMap) {
            this.pcMap.forEach(pc => pc.close());
            this.pcMap.clear();
        }
    }

    isPlayer() {
        return this.role === 'player1' || this.role === 'player2';
    }

    broadcast(type, data, to = null) {
        if (this.isClosed) return;
        try {
            this.channel.postMessage({
                type,
                from: this.role,
                to,
                data
            });
        } catch(e) {
            console.warn('[BattleSync] Broadcast failed:', e);
        }
    }

    // --- Broadcaster (Player) Logic ---

    async startBroadcasting(stream) {
        this.localStream = stream;
        // If viewer is already joined, join them now
        this.broadcast('PLAYER_READY', null);
    }

    async handleViewerJoin(viewerID) {
        console.log('[BattleSync] Viewer joined, creating offer...');
        if (!this.localStream) return;

        if (this.localPC) {
            try { this.localPC.close(); } catch(e) {}
        }

        this.localPC = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        this.localStream.getTracks().forEach(track => {
            this.localPC.addTrack(track, this.localStream);
        });

        this.localPC.onicecandidate = (event) => {
            if (event.candidate) {
                this.broadcast('ICE_CANDIDATE', event.candidate.toJSON(), viewerID);
            }
        };

        const offer = await this.localPC.createOffer();
        await this.localPC.setLocalDescription(offer);
        this.broadcast('OFFER', offer, viewerID);
    }

    async handleAnswer(answer) {
        if (this.localPC) {
            await this.localPC.setRemoteDescription(new RTCSessionDescription(answer));
        }
    }

    // --- Viewer Logic ---

    async handleOffer(playerID, offer) {
        console.log(`[BattleSync] Received offer from ${playerID}`);
        
        if (this.pcMap.has(playerID)) {
            try { this.pcMap.get(playerID).close(); } catch(e) {}
        }

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        this.pcMap.set(playerID, pc);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.broadcast('ICE_CANDIDATE', event.candidate.toJSON(), playerID);
            }
        };

        pc.ontrack = (event) => {
            console.log(`[BattleSync] Received track from ${playerID}`);
            if (this.onStreamReceived) {
                this.onStreamReceived(playerID, event.streams[0]);
            }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.broadcast('ANSWER', answer, playerID);
    }

    handleIceCandidate(from, candidate) {
        const pc = (this.role === 'viewer') ? this.pcMap.get(from) : this.localPC;
        if (pc) {
            pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => {
                console.warn('[BattleSync] Error adding ice candidate', e);
            });
        }
    }

    sendState(state) {
        if (this.isPlayer()) {
            this.broadcast('GAME_STATE', state);
        }
    }
}
