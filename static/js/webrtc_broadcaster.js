/**
 * WebRTC Broadcaster / Viewer for Domain Expansion Battle Mode
 * Supports two transports:
 * 1. 'local': Uses BroadcastChannel (Same browser, zero server)
 * 2. 'online': Uses Socket.io (Different devices/networks, requires server)
 */
class BattleModeSync {
    constructor(role, mode = 'local', roomCode = 'LOCAL') {
        this.role = role; // 'player1', 'player2', or 'viewer'
        this.mode = mode; // 'local' or 'online'
        this.roomCode = roomCode;
        
        this.channel = null; // For local
        this.socket = null;  // For online
        this.socketId = null;

        this.pcMap = new Map(); // For viewer: Map of playerID -> PeerConnection
        this.localPC = null;    // For broadcaster: Single connection to viewer
        this.localStream = null;
        this.isClosed = false;
        
        this.onStreamReceived = null; // Callback for viewer
        this.onStateReceived = null;  // Callback for viewer
        this.onStartBattle = null;    // Callback for player
        this.onCloseOverlays = null;  // Callback for player
        this.onMatchOver = null;      // Callback for player
        this.onMatchPause = null;     // Callback for player
        this.onMatchResume = null;    // Callback for player
        this.onPlayVideoSync = null;  // Callback for viewer
        this.onViewerJoin = null;     // Callback for player
        this.onCaptureWebcamFrame = null; // Callback for player to take a snapshot
        
        this.init();
    }

    init() {
        if (this.mode === 'online') {
            this.initOnline();
        } else {
            this.initLocal();
        }
    }

    initLocal() {
        console.log(`[BattleSync] Initializing LOCAL mode for ${this.role}`);
        this.channel = new BroadcastChannel('domain_battle_sync');
        this.channel.onmessage = (event) => {
            const { type, from, to, data } = event.data;
            this.handleIncomingMessage(from, to, type, data);
        };

        if (this.role === 'viewer') {
            this.broadcast('VIEWER_JOIN', null);
        }
    }

    initOnline() {
        console.log(`[BattleSync] Initializing ONLINE mode for ${this.role}, Room: ${this.roomCode}`);
        
        // Ensure io is available (loaded via CDN in HTML)
        if (typeof io === 'undefined') {
            console.error('[BattleSync] Socket.io not found! Falling back to LOCAL mode.');
            this.mode = 'local';
            this.initLocal();
            return;
        }

        // Connect to server
        const isLocal = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1');
        const serverUrl = isLocal 
            ? 'https://localhost:3443' 
            : window.location.origin;

        this.signalingUrl = serverUrl;
        console.log(`[BattleSync] Connecting to server: ${serverUrl}`);
        
        const socketOptions = {
            secure: true,
            rejectUnauthorized: false
        };

        // If not local, we likely don't need port 3443 and might not need rejectUnauthorized
        if (!isLocal) {
            delete socketOptions.rejectUnauthorized;
        }

        this.socket = io(serverUrl, socketOptions);

        this.socket.on('connect', () => {
            this.socketId = this.socket.id;
            console.log(`[BattleSync] Connected to server as ${this.socketId}`);
            this.socket.emit('join_room', { roomCode: this.roomCode, role: this.role });
            
            if (this.role === 'viewer') {
                this.broadcast('VIEWER_JOIN', null);
            }
        });

        this.socket.on('signal', ({ from, role, type, data }) => {
            this.handleIncomingMessage(from, null, type, data, role);
        });

        this.socket.on('user_joined', ({ id, role }) => {
            console.log(`[BattleSync] User joined: ${role} (${id})`);
            // If a player joins and we are the viewer, request their stream
            if (this.role === 'viewer' && (role === 'player1' || role === 'player2')) {
                this.broadcast('VIEWER_JOIN', null, id);
            }
        });
    }

    handleIncomingMessage(from, to, type, data, role = null) {
        if (this.isClosed) return;

        // Determine effective sender ID (Role preferred for viewer logic)
        const senderID = (this.mode === 'online' && role) ? role : from;
        const senderSocketId = (this.mode === 'online') ? from : null;

        // If this message has a specific destination and it's not us, ignore it
        if (to && to !== this.role && to !== this.socketId) return;

        // Only log important signaling events
        if (type !== 'GAME_STATE' && type !== 'ICE_CANDIDATE') {
            console.log(`[BattleSync] Received ${type} from ${senderID} (${from})`);
        }

        switch (type) {
            case 'VIEWER_JOIN':
                if (this.isPlayer()) {
                    this.handleViewerJoin(from); // from is viewer's socket ID or role
                    if (this.onViewerJoin) this.onViewerJoin(senderID);
                }
                break;
            case 'PLAYER_READY':
                if (this.role === 'viewer') {
                    console.log(`[BattleSync] Player ${senderID} is ready, requesting stream...`);
                    this.broadcast('VIEWER_JOIN', null, from);
                }
                break;
            case 'OFFER':
                if (this.role === 'viewer') this.handleOffer(senderID, data, from);
                break;
            case 'ANSWER':
                if (this.isPlayer()) this.handleAnswer(data);
                break;
            case 'ICE_CANDIDATE':
                this.handleIceCandidate(senderID, data, from);
                break;
            case 'GAME_STATE':
                if (this.role === 'viewer' && this.onStateReceived) {
                    this.onStateReceived(senderID, data);
                }
                break;
            case 'START_BATTLE':
                if (this.isPlayer() && this.onStartBattle) {
                    this.onStartBattle(data);
                }
                break;
            case 'CAPTURE_WEBCAM_FRAME':
                if (this.isPlayer() && this.onCaptureWebcamFrame) {
                    this.onCaptureWebcamFrame(data);
                }
                break;
            case 'CLOSE_OVERLAYS':
                if (this.isPlayer() && this.onCloseOverlays) {
                    this.onCloseOverlays();
                }
                break;
            case 'MATCH_OVER':
                console.log('[BattleSync] Match over signal received');
                if (this.isPlayer() && this.onMatchOver) {
                    this.onMatchOver();
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
                    this.onPlayVideoSync(senderID, data);
                }
                break;
        }
    }

    close() {
        console.log(`[BattleSync] Closing sync for ${this.role}`);
        this.isClosed = true;
        if (this.channel) {
            this.channel.close();
        }
        if (this.socket) {
            this.socket.disconnect();
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

        if (this.mode === 'online' && this.socket) {
            this.socket.emit('signal', { type, data, to });
        } else if (this.channel) {
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
    }

    // --- Broadcaster (Player) Logic ---

    async startBroadcasting(stream) {
        this.localStream = stream;
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

    async handleOffer(playerID, offer, socketID = null) {
        console.log(`[BattleSync] Received offer from ${playerID}`);
        
        const targetID = socketID || playerID;

        if (this.pcMap.has(targetID)) {
            try { this.pcMap.get(targetID).close(); } catch(e) {}
        }

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        this.pcMap.set(targetID, pc);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.broadcast('ICE_CANDIDATE', event.candidate.toJSON(), targetID);
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
        this.broadcast('ANSWER', answer, targetID);
    }

    handleIceCandidate(from, candidate, socketID = null) {
        // In online mode, we might map by socketID in pcMap
        const targetID = socketID || from;
        const pc = (this.role === 'viewer') ? this.pcMap.get(targetID) : this.localPC;
        
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
