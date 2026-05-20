const express = require('express');
const https = require('https');
const fs = require('fs');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

// Serve static files from the project root
app.use(express.static(path.join(__dirname)));

// HTTPS Configuration
const options = {
    key: fs.readFileSync(path.join(__dirname, 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
};

const server = https.createServer(options, app);
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[Server] Signaling server running on port ${PORT}`);
});
