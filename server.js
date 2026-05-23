const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const os = require('os');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- OpenClaw Direct Integration Logic ---
const gameSessions = new Map();

function loadOpenClawConfig() {
    try {
        const home = os.homedir();
        const configPath = path.join(home, '.openclaw', 'openclaw.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const port = config.gateway?.port || 18789;
            const token = config.gateway?.auth?.token || '';
            console.log(`[OpenClaw Config] Loaded successfully. Port: ${port}, Token found: ${!!token}`);
            return { port, token };
        }
    } catch (err) {
        console.warn(`[OpenClaw Config] Failed to load configuration:`, err.message);
    }
    return { port: 18789, token: '' };
}

function registerRoom(sessionId, roomCode, signalingUrl) {
    const current = gameSessions.get(sessionId) || { sessionId, roomCode: "", signalingUrl: "" };
    current.roomCode = roomCode;
    current.signalingUrl = signalingUrl;
    gameSessions.set(sessionId, current);
    console.log(`[Bridge] Registered room: sessionId=${sessionId} -> roomCode=${roomCode}, signalingUrl=${signalingUrl}`);
}

function saveWebcamFrame(sessionId, frameBase64) {
    const current = gameSessions.get(sessionId) || { sessionId, roomCode: "", signalingUrl: "" };
    current.latestWebcamFrame = frameBase64;
    gameSessions.set(sessionId, current);
}

function getWebcamFrame(sessionId) {
    const current = gameSessions.get(sessionId);
    return current ? current.latestWebcamFrame : null;
}

function translateDetail(detail) {
    if (!detail) return '';
    let result = detail;
    
    // Replace technique names with character ownership metadata
    result = result.replace(/Chimera Shadow Garden/gi, '領域展開「嵌合暗翳庭」（伏黑惠）');
    result = result.replace(/Authentic Love/gi, '領域展開「真贋相愛」（乙骨憂太）');
    result = result.replace(/Self-Embodiment of Perfection/gi, '領域展開「自閉円頓裹」（真人）');
    result = result.replace(/Yuji Itadori's Domain/gi, '領域展開「虎杖悠仁之領域」（虎杖悠仁）');
    result = result.replace(/Malevolent Shrine/gi, '領域展開「伏魔御廚子」（兩面宿儺）');
    result = result.replace(/Idle Death Gamble/gi, '領域展開「坐殺博徒」（秤金次）');
    result = result.replace(/Unlimited Void/gi, '領域展開「無量空處」（五條悟）');
    result = result.replace(/Time Cell Moon Palace/gi, '領域展開「時胞月宮殿」（禪院直哉）');
    result = result.replace(/Hollow Purple/gi, '「虛式『茈』」（五條悟）');
    result = result.replace(/Reversal Red/gi, '「術式反轉『赫』」（五條悟）');
    result = result.replace(/Lapse Blue/gi, '「術式順轉『蒼』」（五條悟）');

    // Replace game events
    result = result.replace(/Only (\d+) seconds remaining in the match! The battle is near its end!/gi, '對戰只剩返 $1 秒！戰局即將結束！');
    result = result.replace(/The scores are tied! Both players are neck and neck at (\d+)!/gi, '比分打成平手！雙方依家以 $1 比 $1 叮噹馬頭，勢均力敵！');
    result = result.replace(/(Player 1|Player 2) successfully activated/gi, '$1 成功發動');
    result = result.replace(/(Player 1|Player 2) has taken the lead!/gi, '$1 攞到領先優勢！');
    result = result.replace(/(Player 1|Player 2) scored!/gi, '$1 成功得分！');

    // Replace players
    result = result.replace(/Player 1/gi, 'P1');
    result = result.replace(/Player 2/gi, 'P2');

    return result;
}

async function callOpenClawGateway(sessionId, agentId, promptText) {
    const { port, token } = loadOpenClawConfig();
    const openclawHost = process.env.OPENCLAW_HOST || '127.0.0.1';
    const url = `http://${openclawHost}:${port}/v1/chat/completions`;
    
    // Resolve webcam image if any (bypass for reset commands to match raw web UI text behavior)
    const latestFrame = getWebcamFrame(sessionId);
    
    let contentBlock;
    if (promptText === "/reset") {
        contentBlock = "/reset"; // Clean, plain string - no image, no array wrapper
    } else {
        contentBlock = [{ type: "text", text: promptText }];
        if (latestFrame) {
            contentBlock.push({
                type: "image_url",
                image_url: {
                    url: `data:image/jpeg;base64,${latestFrame}`
                }
            });
        }
    }

    const payload = {
        model: `openclaw/${agentId}`,
        messages: [
            {
                role: "user",
                content: contentBlock
            }
        ],
        user: sessionId
    };

    const headers = {
        'Content-Type': 'application/json',
        'x-openclaw-session-key': `agent:${agentId}:jjk-sorcerer:${sessionId}`
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[OpenClaw Gateway Error] Status: ${response.status}, Details:`, errorText);
            throw new Error(`OpenClaw responded with ${response.status}`);
        }

        const data = await response.json();
        const rawCommentary = data.choices?.[0]?.message?.content || "";
        
        let cleaned = rawCommentary;
        
        // 1. Remove bracketed posture commands if any e.g. [huishou]
        cleaned = cleaned.replace(/\[([a-zA-Z0-9_-]+)\]/g, "");
        
        // 2. Remove markdown syntax formatting characters (stars, underscores, backticks, tildes)
        cleaned = cleaned.replace(/[\*_`~]/g, "");
        
        // 3. Remove all visual emojis and extended pictographics
        cleaned = cleaned.replace(/\p{Extended_Pictographic}/gu, "");
        
        // 4. Remove any double/excessive spaces or newlines
        cleaned = cleaned.replace(/\s+/g, " ");
        
        cleaned = cleaned.trim();
        
        return cleaned || "Incredible intensity! The Jujutsu sorcerers are giving it everything they have!";
    } catch (err) {
        console.error(`[OpenClaw Gateway Fetch Failed]:`, err.message);
        return "Incredible intensity! The Jujutsu sorcerers are giving it everything they have!";
    }
}

// --- REST Endpoints for Commentary ---
app.post('/api/register-room', (req, res) => {
    const { sessionId, roomCode, signalingUrl } = req.body;
    const resolvedSessionId = sessionId || "main";
    registerRoom(resolvedSessionId, roomCode, signalingUrl);
    res.json({ ok: true });
});

app.post('/api/live-status', async (req, res) => {
    const { sessionId, eventType, detail, p1Score, p2Score, p1Total, p2Total, lang, foulLanguage } = req.body;
    const resolvedSessionId = sessionId || "main";
    const agentId = process.env.OPENCLAW_AGENT_ID || "main";
    const isZh = lang && lang.toLowerCase().startsWith('zh');

    // 1. Handle New Game Session RESET event
    if (eventType === "RESET") {
        console.log(`[Bridge] Resetting OpenClaw session for sessionId=${resolvedSessionId}`);
        
        // Construct the permanent system instruction prompt for this session
        let systemPrompt = "";
        if (isZh) {
            systemPrompt = `你係一位極之熱血、宏大嘅《咒術迴戰》現場專業廣東話解說員（主播）！
核心回覆規則（請永久記住）：
1. 必須使用香港廣東話（完全口語，聽起來像極度熱血高能量的日本動畫粵語配音、主播，充滿張力，多用粵語口語字如：喇、咗、緊、唔、係、嘢、嚟等）。
2. 必須以「P1」和「P2」稱呼兩位玩家，保持在地遊戲氛圍。
3. 請絕對不要使用 markdown 語法（例如 **粗體**、*斜體*、\`代碼\`、# 標題等），亦不要使用任何表情符號（emoji）。
4. 旁白必須簡短、高能量且充滿張力（通常只有 1 到 2 個短句），唔好長篇大論。
5. 在任何情況下都絕對不要提及任何具體的秒數、倒數或剩餘時間。`;

            if (foulLanguage) {
                systemPrompt += `\n6. 特別注意（核心要求）：由於玩家開啟了「粗口垃圾話」模式，請在旁白中加入適量香港廣東話粗口/Swearing或極度不禮貌的街頭垃圾話（例如「仆街」、「屌你」、「頂你個肺」、「好戇尻」、「廢柴」、「屎樣」等，但不要過於極端），令其聽起來極度搞笑、熱血，且具有街頭咒術師互相問候挑釁的風味！`;
            } else {
                systemPrompt += `\n6. 特別注意：請保持旁白用詞文明、熱血、健康，絕對不可包含任何粗口、髒話或人身攻擊字眼，適合全年齡觀眾。`;
            }
        } else {
            systemPrompt = `You are a professional, high-energy JJK (Jujutsu Kaisen) live battle commentator!
Core reply rules (Please remember them permanently):
1. Act as an intense JJK live commentary voice. Speak 1 or 2 extremely short, intense, and spectacular comments. Be quick and high energy!
2. Refer to players as P1 and P2.
3. Do not use markdown syntax, and do not use emojis under any circumstances.
4. Do not mention any seconds, timing, countdowns, or remaining time under any circumstances.`;
        }
        
        // 1. Send /reset command as its own standalone message to clean the conversation history
        await callOpenClawGateway(resolvedSessionId, agentId, "/reset");
        
        // 2. Send the system prompt rules as a separate message to prime the clean session
        // Capture the high-energy response of systemPrompt to serve as the match's Opening Hype welcomeMessage!
        const welcomeMessage = await callOpenClawGateway(resolvedSessionId, agentId, systemPrompt);
        return res.json({ ok: true, welcomeMessage });
    }

    // 2. Handle subsequent live status game updates
    let promptText = "";
    if (isZh) {
        if (eventType === "CAST" && detail) {
            promptText = `[對戰更新] ${translateDetail(detail)}。目前完成進度：P1 完成了 ${p1Score} 次，P2 完成了 ${p2Score} 次。請立刻提供下一句熱血簡短的廣東話解說旁白！`;
        } else {
            promptText = `[對戰更新] 目前完成進度：P1 完成了 ${p1Score} 次，P2 完成了 ${p2Score} 次。請立刻提供下一句熱血簡短的廣東話解說旁白！`;
        }
    } else {
        if (eventType === "CAST" && detail) {
            promptText = `[GAME UPDATE] ${detail}. Current Standing: P1 Score = ${p1Score}, P2 Score = ${p2Score}. Please provide your next short, high-energy commentary!`;
        } else {
            promptText = `[GAME UPDATE] Current Standing: P1 Score = ${p1Score}, P2 Score = ${p2Score}. Please provide your next short, high-energy commentary!`;
        }
    }

    console.log(`[Bridge] Live Status: ${eventType} p1Score=${p1Score}/${p1Total} p2Score=${p2Score}/${p2Total} lang=${lang} foul=${foulLanguage}`);

    const commentary = await callOpenClawGateway(resolvedSessionId, agentId, promptText);
    res.json({ ok: true, commentary });
});

app.post('/api/battle-result', async (req, res) => {
    const { sessionId, winner, p1Score, p2Score, lang, foulLanguage } = req.body;
    const resolvedSessionId = sessionId || "main";
    const agentId = process.env.OPENCLAW_AGENT_ID || "main";

    let promptText = "";
    const isZh = lang && lang.toLowerCase().startsWith('zh');

    if (isZh) {
        promptText = `[SYSTEM UPDATE] 對戰結束！勝者：${winner === 'DRAW' ? '平手' : (winner === 'PLAYER 1' ? 'P1' : 'P2')}。最終比分 - P1 完成了 ${p1Score} 次，P2 完成了 ${p2Score} 次。請用香港廣東話（完全口語，聽起來像極度熱血、宏大的日本動畫粵語配音、主播，充滿張力）提供一句史詩般震撼、精彩的對戰結算和勝利旁白（最長兩短句）。請為勝者喝采，並以「P1」和「P2」稱呼玩家，保持角色風格！請不要使用 markdown 語法或表情符號。`;
        if (foulLanguage) {
            promptText += `特別注意（核心要求）：由於玩家開啟了「粗口垃圾話」模式，請在旁白中加入適量香港廣東話粗口/Swearing或極度不禮貌的街頭垃圾話，令其聽起來極度搞笑、熱血，且具有街頭咒術師互相問候挑釁的風味！`;
        } else {
            promptText += `特別注意：請保持旁白用詞文明、熱血、健康，絕對不可包含任何粗口、髒話或人身攻擊字眼，適合全年齡觀眾。`;
        }
    } else {
        promptText = `[SYSTEM UPDATE] The battle is OVER! Winner: ${winner}. Final standing - Player 1 score: ${p1Score}, Player 2 score: ${p2Score}. Please deliver an epic, grand concluding commentary about the battle's climax (maximum 3 short sentences). Honor the winner in character!`;
    }

    console.log(`[Bridge] Battle result: Winner: ${winner}, scores: P1=${p1Score}, P2=${p2Score} lang=${lang} foul=${foulLanguage}`);

    const commentary = await callOpenClawGateway(resolvedSessionId, agentId, promptText);
    res.json({ ok: true, commentary });
});


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
