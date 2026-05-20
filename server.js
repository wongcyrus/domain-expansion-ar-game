const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

// --- Security: White-list static files/folders ---
// Only serve what is necessary for the game
const publicPaths = ['static', 'index.html', 'battle.html', 'player.html', 'favicon.ico'];

publicPaths.forEach(p => {
    app.use(`/${p === 'index.html' ? '' : p}`, express.static(path.join(__dirname, p)));
});

// Explicitly serve root for index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
let server;

// HTTPS Configuration for local use
const keyPath = path.join(__dirname, 'key.pem');
const certPath = path.join(__dirname, 'cert.pem');

if (fs.existsSync(keyPath) && fs.readFileSync(keyPath).length > 0 && !process.env.CLOUD_RUN) {
    console.log('[Server] SSL certificates found, starting in HTTPS mode');
    const options = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
    };
    server = https.createServer(options, app);
} else {
    console.log('[Server] SSL certificates not found or CLOUD_RUN detected, starting in HTTP mode');
    server = http.createServer(app);
}

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

const rooms = new Map(); // roomCode -> Set of socketIds

io.on('connection', (socket) => {
    console.log(`[Server] User connected: ${socket.id}`);

    socket.on('join_room', ({ roomCode, role }) => {
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.role = role;

        if (!rooms.has(roomCode)) {
            rooms.set(roomCode, new Set());
        }
        rooms.get(roomCode).add(socket.id);

        console.log(`[Server] ${socket.id} joined room ${roomCode} as ${role}`);
        
        // Notify others in the room
        socket.to(roomCode).emit('user_joined', { id: socket.id, role });
    });

    socket.on('signal', ({ type, data, to }) => {
        const payload = {
            from: socket.id,
            role: socket.role, // Include role for easy identification
            type,
            data
        };

        if (to) {
            // Unicast to specific user
            io.to(to).emit('signal', payload);
        } else {
            // Broadcast to whole room (excluding sender)
            socket.to(socket.roomCode).emit('signal', payload);
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomCode && rooms.has(socket.roomCode)) {
            rooms.get(socket.roomCode).delete(socket.id);
            if (rooms.get(socket.roomCode).size === 0) {
                rooms.delete(socket.roomCode);
            }
            socket.to(socket.roomCode).emit('user_left', { id: socket.id, role: socket.role });
        }
        console.log(`[Server] User disconnected: ${socket.id}`);
    });
});

server.listen(PORT, () => {
    console.log(`[Server] Signaling server running on port ${PORT}`);
});
