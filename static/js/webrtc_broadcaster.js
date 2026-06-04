/**
 * WebRTC Broadcaster / Viewer for Domain Expansion Battle Mode
 * Supports two transports:
 * 1. 'local': Uses BroadcastChannel (Same browser, zero server)
 * 2. 'online': Uses Socket.io (Different devices/networks, requires server)
 */

class ServerlessSocket {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.listeners = {};
        this.id = 'client_' + Math.random().toString(36).substring(2, 9);
        this.pingTimer = null;
        this.reconnectTimer = null;
        this.explicitDisconnect = false;
        this.connect();
    }

    connect() {
        this.explicitDisconnect = false;
        console.log(`[ServerlessSocket] Connecting to native WebSocket at: ${this.wsUrl}`);
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
            console.log(`[ServerlessSocket] WebSocket open, assigned id: ${this.id}`);
            this.trigger('connect');
            this.startHeartbeat();
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                const { type, data } = message;
                this.trigger(type, data);
            } catch (err) {
                // If it's a raw string (like connection confirmations), skip JSON warning
                if (event.data !== "Connected." && event.data !== "Disconnected." && event.data !== "OK") {
                    console.warn('[ServerlessSocket] Error parsing message:', err, event.data);
                }
            }
        };

        this.ws.onclose = () => {
            console.log('[ServerlessSocket] WebSocket closed');
            this.stopHeartbeat();
            this.trigger('disconnect');

            if (!this.explicitDisconnect) {
                console.log('[ServerlessSocket] Unexpected disconnect, scheduling reconnect in 3s...');
                if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => {
                    this.connect();
                }, 3000);
            }
        };

        this.ws.onerror = (err) => {
            console.error('[ServerlessSocket] WebSocket error:', err);
        };
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.pingTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ action: 'ping', client_id: this.id }));
            }
        }, 45000); // Keep API Gateway open by pinging every 45 seconds (bypasses 10min idle limit)
    }

    stopHeartbeat() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const payload = {
                action: event,
                client_id: this.id,
                ...data
            };
            this.ws.send(JSON.stringify(payload));
        } else {
            console.warn('[ServerlessSocket] WebSocket is not open, cannot emit event:', event);
        }
    }

    trigger(event, data) {
        const callbacks = this.listeners[event] || [];
        callbacks.forEach(cb => {
            try {
                cb(data);
            } catch (err) {
                console.error(`[ServerlessSocket] Error executing listener for event ${event}:`, err);
            }
        });
    }

    disconnect() {
        this.explicitDisconnect = true;
        this.stopHeartbeat();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
        }
    }
}

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
        this.localPCTargetId = null;
        this.localStream = null;
        this.isClosed = false;
        this.pendingIceCandidates = new Map();
        this.queuedViewerIds = new Set();
        this.playerReadyAnnounceTimer = null;
        this.viewerJoinThrottle = new Map();
        
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

    async initOnline() {
        console.log(`[BattleSync] Initializing ONLINE mode for ${this.role}, Room: ${this.roomCode}`);
        
        let wsUrl = '';
        let serverUrl = window.location.origin;
        const isLocal = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1');
        
        // Try to load serverless config.json
        try {
            const response = await fetch('/config.json');
            if (response.ok) {
                const config = await response.json();
                if (config.webSocketUrl) {
                    wsUrl = config.webSocketUrl;
                    console.log(`[BattleSync] Loaded serverless WebSocket URL from config.json: ${wsUrl}`);
                    
                    // Auto pre-fill localStorage settings if present
                    if (config.robotApiEndpoint) {
                        localStorage.setItem('robot_api_endpoint', config.robotApiEndpoint);
                    }
                    if (config.defaultSessionKey) {
                        localStorage.setItem('robot_session_key', config.defaultSessionKey);
                        localStorage.setItem('openclawSessionId', config.defaultSessionKey);
                    }
                }
            }
        } catch (configErr) {
            console.warn('[BattleSync] config.json load skipped or failed, using normal Socket.io:', configErr);
        }

        if (wsUrl) {
            this.signalingUrl = serverUrl;
            
            // Append Cognito ID token if present for WebSocket custom authentication
            const cognitoToken = localStorage.getItem("cognito_id_token");
            let finalWsUrl = wsUrl;
            if (cognitoToken) {
                const separator = finalWsUrl.includes('?') ? '&' : '?';
                finalWsUrl = `${finalWsUrl}${separator}token=${encodeURIComponent(cognitoToken)}`;
            }
            
            this.socket = new ServerlessSocket(finalWsUrl);
        } else {
            // Ensure io is available (loaded via CDN in HTML)
            if (typeof io === 'undefined') {
                console.error('[BattleSync] Socket.io not found! Falling back to LOCAL mode.');
                this.mode = 'local';
                this.initLocal();
                return;
            }

            const ioServerUrl = isLocal ? 'https://localhost:3443' : window.location.origin;
            this.signalingUrl = ioServerUrl;
            console.log(`[BattleSync] Connecting to Socket.io server: ${ioServerUrl}`);
            
            const socketOptions = {
                secure: true,
                rejectUnauthorized: false
            };

            if (!isLocal) {
                delete socketOptions.rejectUnauthorized;
            }

            this.socket = io(ioServerUrl, socketOptions);
        }

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
        if (type !== 'GAME_STATE' && type !== 'ICE_CANDIDATE' && type !== 'PLAYER_READY') {
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
                    const targetID = from || senderID;
                    const existingPc = this.pcMap.get(targetID);
                    const lastJoinRequest = this.viewerJoinThrottle.get(targetID) || 0;

                    if (this.hasUsablePeerConnection(existingPc)) {
                        break;
                    }

                    if (Date.now() - lastJoinRequest < 5000) {
                        break;
                    }

                    this.viewerJoinThrottle.set(targetID, Date.now());
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
                    this.onCloseOverlays(data);
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
        this.localPCTargetId = null;
        if (this.pcMap) {
            this.pcMap.forEach(pc => pc.close());
            this.pcMap.clear();
        }
        if (this.playerReadyAnnounceTimer) {
            clearInterval(this.playerReadyAnnounceTimer);
            this.playerReadyAnnounceTimer = null;
        }
        this.pendingIceCandidates.clear();
        this.queuedViewerIds.clear();
        this.viewerJoinThrottle.clear();
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

    hasUsablePeerConnection(pc) {
        if (!pc) return false;

        const connectionState = pc.connectionState || '';
        const iceConnectionState = pc.iceConnectionState || '';
        const signalingState = pc.signalingState || '';

        if (signalingState === 'closed') return false;
        if (connectionState && ['connected', 'connecting', 'new'].includes(connectionState)) return true;
        if (iceConnectionState && ['connected', 'completed', 'checking'].includes(iceConnectionState)) return true;

        return false;
    }

    // --- Broadcaster (Player) Logic ---

    async startBroadcasting(stream) {
        this.localStream = stream;
        if (this.playerReadyAnnounceTimer) {
            clearInterval(this.playerReadyAnnounceTimer);
        }

        this.broadcast('PLAYER_READY', null);

        // Keep announcing readiness so late viewer joins or missed first messages do not require manual refreshes.
        this.playerReadyAnnounceTimer = setInterval(() => {
            if (this.isClosed || !this.localStream) return;
            this.broadcast('PLAYER_READY', null);
        }, 3000);

        if (this.queuedViewerIds.size > 0) {
            Array.from(this.queuedViewerIds).forEach((viewerID) => {
                this.handleViewerJoin(viewerID);
            });
        }
    }

    async handleViewerJoin(viewerID) {
        console.log('[BattleSync] Viewer joined, creating offer...');
        if (!this.localStream) {
            this.queuedViewerIds.add(viewerID);
            console.log('[BattleSync] Local stream not ready yet; queuing viewer until broadcast stream is available.');
            return;
        }
        this.queuedViewerIds.delete(viewerID);

        if (this.localPC && this.localPCTargetId === viewerID && this.hasUsablePeerConnection(this.localPC)) {
            console.log('[BattleSync] Viewer connection already active, skipping duplicate offer.');
            return;
        }

        if (this.localPC) {
            try { this.localPC.close(); } catch(e) {}
        }

        this.localPC = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        this.localPCTargetId = viewerID;

        this.localStream.getTracks().forEach(track => {
            this.localPC.addTrack(track, this.localStream);
        });

        this.localPC.onconnectionstatechange = () => {
            if (!this.localPC) return;
            const state = this.localPC.connectionState;
            if (['failed', 'disconnected', 'closed'].includes(state)) {
                this.localPCTargetId = null;
            }
        };

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
            if (this.localPC.signalingState !== 'have-local-offer') {
                console.warn(`[BattleSync] Received answer but signalingState is ${this.localPC.signalingState} (expected 'have-local-offer'). Skipping duplicate answer.`);
                return;
            }
            try {
                await this.localPC.setRemoteDescription(new RTCSessionDescription(answer));
                await this.flushPendingIceCandidates('__broadcaster__', this.localPC);
            } catch (e) {
                console.warn('[BattleSync] Error setting remote description for answer:', e);
            }
        }
    }

    // --- Viewer Logic ---

    async handleOffer(playerID, offer, socketID = null) {
        console.log(`[BattleSync] Received offer from ${playerID}`);
        
        const targetID = socketID || playerID;
        const existingPc = this.pcMap.get(targetID);

        if (this.hasUsablePeerConnection(existingPc)) {
            console.log(`[BattleSync] Viewer already has an active peer connection for ${playerID}, ignoring duplicate offer.`);
            return;
        }

        if (existingPc) {
            try { existingPc.close(); } catch(e) {}
        }

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        this.pcMap.set(targetID, pc);
        this.viewerJoinThrottle.delete(targetID);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.broadcast('ICE_CANDIDATE', event.candidate.toJSON(), targetID);
            }
        };

        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            if (['failed', 'disconnected', 'closed'].includes(state)) {
                if (this.pcMap.get(targetID) === pc) {
                    this.pcMap.delete(targetID);
                }
            }
        };

        pc.ontrack = (event) => {
            console.log(`[BattleSync] Received track from ${playerID}`);
            if (this.onStreamReceived) {
                this.onStreamReceived(playerID, event.streams[0]);
            }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await this.flushPendingIceCandidates(targetID, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.broadcast('ANSWER', answer, targetID);
    }

    async handleIceCandidate(from, candidate, socketID = null) {
        // In online mode, we might map by socketID in pcMap
        const targetID = socketID || from;
        const pcKey = (this.role === 'viewer') ? targetID : '__broadcaster__';
        const pc = (this.role === 'viewer') ? this.pcMap.get(targetID) : this.localPC;
        
        if (!pc || !pc.remoteDescription) {
            if (!this.pendingIceCandidates.has(pcKey)) {
                this.pendingIceCandidates.set(pcKey, []);
            }
            this.pendingIceCandidates.get(pcKey).push(candidate);
            return;
        }

        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.warn('[BattleSync] Error adding ice candidate', e);
        }
    }

    sendState(state) {
        if (this.isPlayer()) {
            this.broadcast('GAME_STATE', state);
        }
    }

    async flushPendingIceCandidates(pcKey, pc) {
        const pendingCandidates = this.pendingIceCandidates.get(pcKey);
        if (!pendingCandidates || !pendingCandidates.length) return;

        this.pendingIceCandidates.delete(pcKey);
        for (const candidate of pendingCandidates) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.warn('[BattleSync] Error replaying queued ICE candidate', e);
            }
        }
    }
}
