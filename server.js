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

function saveWebcamFrame(sessionId, role, frameBase64) {
    const current = gameSessions.get(sessionId) || { sessionId, roomCode: "", signalingUrl: "" };
    if (role === 'player1') {
        current.latestWebcamFrameP1 = frameBase64;
    } else if (role === 'player2') {
        current.latestWebcamFrameP2 = frameBase64;
    } else {
        current.latestWebcamFrame = frameBase64;
    }
    gameSessions.set(sessionId, current);
}

function getWebcamFrame(sessionId) {
    const current = gameSessions.get(sessionId);
    if (!current) return null;
    return current.latestWebcamFrameP1 || current.latestWebcamFrameP2 || current.latestWebcamFrame || null;
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

async function callOpenClawGateway(sessionId, agentId, promptText, attachImages = false) {
    const { port, token } = loadOpenClawConfig();
    const openclawHost = process.env.OPENCLAW_HOST || '127.0.0.1';
    const url = `http://${openclawHost}:${port}/v1/chat/completions`;
    
    // Resolve webcam image if any (bypass for reset commands to match raw web UI text behavior)
    const latestFrame = attachImages ? getWebcamFrame(sessionId) : null;
    const currentSession = gameSessions.get(sessionId);
    const hasImages = !!(latestFrame || (attachImages && currentSession && (currentSession.latestWebcamFrameP1 || currentSession.latestWebcamFrameP2)));
    console.log(`[Bridge] callOpenClawGateway sessionId=${sessionId}, promptText=${promptText}, image attached=${hasImages}`);
    
    let contentBlock;
    if (promptText === "/reset") {
        contentBlock = "/reset"; // Clean, plain string - no image, no array wrapper
    } else {
        contentBlock = [{ type: "text", text: promptText }];
        if (attachImages && currentSession) {
            if (currentSession.latestWebcamFrameP1) {
                contentBlock.push({ type: "text", text: "Here is the Webcam Snapshot of Player 1 (P1):" });
                contentBlock.push({
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${currentSession.latestWebcamFrameP1}`
                    }
                });
            }
            if (currentSession.latestWebcamFrameP2) {
                contentBlock.push({ type: "text", text: "Here is the Webcam Snapshot of Player 2 (P2):" });
                contentBlock.push({
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${currentSession.latestWebcamFrameP2}`
                    }
                });
            }
            // Fallback for single generic frame
            if (!currentSession.latestWebcamFrameP1 && !currentSession.latestWebcamFrameP2 && currentSession.latestWebcamFrame) {
                contentBlock.push({
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${currentSession.latestWebcamFrame}`
                    }
                });
            }
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

app.post('/api/webcam-upload', (req, res) => {
    const { sessionId, role, image } = req.body;
    const resolvedSessionId = sessionId || "main";
    console.log(`[Bridge] Received webcam upload for sessionId=${resolvedSessionId}, role=${role}, image length=${image ? image.length : 0}`);
    if (image) {
        saveWebcamFrame(resolvedSessionId, role, image);
    }
    res.json({ ok: true });
});

app.post('/api/log', (req, res) => {
    const { level, message } = req.body;
    console.log(`[Browser Log] [${level || 'INFO'}] ${message}`);
    res.json({ ok: true });
});

app.get('/api/last-image', (req, res) => {
    const { sessionId } = req.query;
    let targetSessionId = sessionId;
    if (!targetSessionId) {
        const keys = Array.from(gameSessions.keys());
        targetSessionId = keys[keys.length - 1] || "main";
    }
    const frame = getWebcamFrame(targetSessionId);
    if (!frame) {
        return res.send(`<html><body style="background:#111; color:white; font-family:sans-serif; text-align:center; padding-top:50px;"><h2>No image found for session: ${targetSessionId}</h2><p>Available sessions: ${Array.from(gameSessions.keys()).join(', ') || 'None'}</p></body></html>`);
    }
    res.send(`
        <html>
        <head>
            <title>Last Captured Image - ${targetSessionId}</title>
            <meta http-equiv="refresh" content="2">
        </head>
        <body style="background:#111; color:white; font-family:sans-serif; text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; margin:0;">
            <h2>Session: ${targetSessionId}</h2>
            <img src="data:image/jpeg;base64,${frame}" style="border: 4px solid #FFFF00; border-radius: 8px; box-shadow: 0 0 20px rgba(255,255,0,0.3); max-width:90%; max-height:70vh;" />
            <p style="opacity:0.6; font-size:13px; margin-top:15px;">Auto-refreshing every 2 seconds...</p>
        </body>
        </html>
    `);
});

function getSystemPrompt(isZh, foulLanguage) {
    if (isZh) {
        let systemPrompt = `你係一位極之熱血、宏大嘅《咒術迴戰》現場專業廣東話解說員（主播）！
核心回覆規則（請永久記住）：
1. 必須使用香港廣東話（完全口語，聽起來像極度熱血高能量的日本動畫粵語配音、主播，充滿張力，多用粵語口語字如：喇、咗、緊、唔、係、嘢、嚟等）。
2. 必須以「P1」和「P2」稱呼兩位玩家，保持在地遊戲氛圍。
3. 請絕對不要使用 markdown 語法（例如 **粗體**、*斜體*、\`代碼\`、# 標題等），亦不要使用任何表情符號（emoji）。
4. 旁白必須簡短、高能量且充滿張力（通常只有 1 到 2 個短句），唔好長篇大論。
5. 在任何情況下都絕對不要提及 any 具體的秒數、倒數 or 剩餘時間。
6. 實時視覺觀察（極致趣味要求）：你每次都會收到一張來自玩家鏡頭（Webcam）的即時照片。請你務必要「用對眼」去仔細觀察圖片中 P1 或 P2 的表情（如：緊張、偷笑、好亢奮、呆滯）、面部特徵、手勢姿勢（如：準唔標準、手震）、服裝打扮（如：戴眼鏡、著咩色衫）或背景環境（如：房間好亂、光線黑暗），並把這些極度爆笑或生動的真實細節融入你的熱血解說中（例如：「我見到 P1 你戴住副眼鏡、個樣緊張到抽筋，但出招竟然咁準！」或「P2 笑得咁奸，手勢又咁標準，今次真係勝券在握喇！」）。
7. 視覺容錯：如果訊息中沒有附帶圖片，或者圖片是一片漆黑、無法看清，請像往常一樣進行高能文字解說，絕對不要提及「我睇唔到圖片」之類的話，保持解說員的專業風範。`;

        if (foulLanguage) {
            systemPrompt += `\n8. 特別注意（核心要求）：由於玩家開啟了「粗口垃圾話」模式，請在旁白中加入適量香港廣東話粗口/Swearing或極度不禮貌的街頭垃圾話（例如「仆街」、「屌你」、「頂你個肺」、「好戇尻」、「廢柴」、「屎樣」等，但不要過於極端），令其聽起來極度搞笑、熱血，且具有街頭咒術師互相問候挑釁的風味！`;
        } else {
            systemPrompt += `\n8. 特別注意：請保持旁白用詞文明、熱血、健康，絕對不可包含任何粗口、髒話或人身攻擊字眼，適合全年齡觀眾。`;
        }
        return systemPrompt;
    } else {
        return `You are a professional, high-energy JJK (Jujutsu Kaisen) live battle commentator!
Core reply rules (Please remember them permanently):
1. Act as an intense JJK live commentary voice. Speak 1 or 2 extremely short, intense, and spectacular comments. Be quick and high energy!
2. Refer to players as P1 and P2.
3. Do not use markdown syntax, and do not use emojis under any circumstances.
4. Do not mention any seconds, timing, countdowns, or remaining time under any circumstances.
5. Real-Time Webcam Observation (Ultra-Fun Requirement): You will receive a real-time snapshot from the player's webcam. You must actively inspect the active player's facial expressions (e.g. looking terrified, laughing, extremely focused, spacey), appearance (e.g. wearing glasses, cap, clothing color), or background environment (e.g. messy room, dark room), and roast or integrate these funny real-world details directly into your hype commentary! (e.g., "I see P1 looking absolutely petrified behind those glasses, but that Malevolent Shrine is flawless!" or "P2, standard hand sign, but that messy bedroom is a real distraction!").
6. Image Fallback: If no image is attached, or if it is pitch black, just generate the commentary naturally. Do not break character or mention that you cannot see the image.`;
    }
}

app.post('/api/live-status', async (req, res) => {
    const { sessionId, eventType, detail, p1Score, p2Score, p1Total, p2Total, lang, foulLanguage } = req.body;
    const resolvedSessionId = sessionId || "main";
    const agentId = process.env.OPENCLAW_AGENT_ID || "main";
    const isZh = lang && lang.toLowerCase().startsWith('zh');

    // 1. Handle New Game Session RESET event
    if (eventType === "RESET") {
        console.log(`[Bridge] Resetting OpenClaw session for sessionId=${resolvedSessionId}`);
        
        const systemPrompt = getSystemPrompt(isZh, foulLanguage);
        
        // Combine systemPrompt together with a starting user instruction to get a real Opening Hype commentary without losing any rules!
        let openingInstruction = "";
        if (isZh) {
            openingInstruction = `【重要系統指示：請直接以解說員角色，對兩位玩家 P1、P2 發表你最震撼、最熱血嘅開局廣東話解說旁白（1至2句），歡迎佢哋嚟到呢個現場大賽！如果系統有附帶即時照片（Webcam），請立刻用你雙眼觀察照片中玩家的表情、服裝、手勢或背景，並將這些極度生動爆笑的現實細節，直接融入你的開局震撼解說之中！請絕對不要複述、確認、總結規則，亦不要說任何「收到」、「明白」或「我已記住人設」之類的字眼，直接進入開局角色解說！】\n\n【解說員核心規則系統】：\n${systemPrompt}`;
        } else {
            openingInstruction = `[IMPORTANT DIRECTIVE: Please act immediately as the commentator to deliver your most spectacular and high-energy opening welcome commentary (1-2 sentences) to players P1 and P2! If a real-time webcam snapshot is attached, you must actively inspect the player's facial expressions, clothing, posture, or environment, and integrate these funny real-world details directly into your opening welcome commentary! Do NOT acknowledge, rephrase, or summarize these rules, and do NOT say "Received" or "Understood" under any circumstances. Speak only in character!]\n\n[COMMENTATOR CORE RULES]:\n${systemPrompt}`;
        }
        const welcomeMessage = await callOpenClawGateway(resolvedSessionId, agentId, openingInstruction, true);
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

    const commentary = await callOpenClawGateway(resolvedSessionId, agentId, promptText, false);
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
            promptText += `特別注意：請保持旁白用詞文明、熱血、健康，絕對不可包含 any 粗口、髒話 or 人身攻擊字眼，適合全年齡觀眾。`;
        }
    } else {
        promptText = `[SYSTEM UPDATE] The battle is OVER! Winner: ${winner}. Final standing - Player 1 score: ${p1Score}, Player 2 score: ${p2Score}. Please deliver an epic, grand concluding commentary about the battle's climax (maximum 3 short sentences). Honor the winner in character!`;
    }

    console.log(`[Bridge] Battle result: Winner: ${winner}, scores: P1=${p1Score}, P2=${p2Score} lang=${lang} foul=${foulLanguage}`);

    const commentary = await callOpenClawGateway(resolvedSessionId, agentId, promptText, true);
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
