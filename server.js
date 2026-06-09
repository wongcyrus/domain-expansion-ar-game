const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const os = require('os');
const crypto = require('crypto');

// Detect if running inside AWS Lambda
const isLambda = !!(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);

// Parse ~/.aws/credentials file for default AWS CLI profiles
function loadAwsCliCredentials() {
    try {
        const homeDir = os.homedir();
        const credentialsPath = path.join(homeDir, '.aws', 'credentials');
        if (fs.existsSync(credentialsPath)) {
            const content = fs.readFileSync(credentialsPath, 'utf8');
            const lines = content.split(/\r?\n/);
            const profile = process.env.AWS_PROFILE || 'default';
            
            let inTargetProfile = false;
            let accessKeyId = null;
            let secretAccessKey = null;
            let sessionToken = null;

            for (let line of lines) {
                line = line.trim();
                if (!line || line.startsWith('#') || line.startsWith(';')) {
                    continue;
                }
                
                if (line.startsWith('[') && line.endsWith(']')) {
                    const currentProfile = line.slice(1, -1).trim();
                    inTargetProfile = (currentProfile === profile);
                    continue;
                }

                if (inTargetProfile) {
                    const parts = line.split('=');
                    if (parts.length >= 2) {
                        const key = parts[0].trim().toLowerCase();
                        const val = parts.slice(1).join('=').trim();
                        if (key === 'aws_access_key_id') {
                            accessKeyId = val;
                        } else if (key === 'aws_secret_access_key') {
                            secretAccessKey = val;
                        } else if (key === 'aws_session_token') {
                            sessionToken = val;
                        }
                    }
                }
            }

            if (accessKeyId && secretAccessKey) {
                return { accessKeyId, secretAccessKey, sessionToken, source: `AWS CLI credentials file (~/.aws/credentials [profile: ${profile}])` };
            }
        }
    } catch (err) {
        console.warn("[AWS CLI Credentials] Skipped loading credentials file:", err.message);
    }
    return null;
}

// Resolve AWS Credentials from process.env or fallback to ~/.aws/credentials
function getAwsCredentials() {
    let accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.aws_access_key_id;
    let secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.aws_secret_access_key;
    let sessionToken = process.env.AWS_SESSION_TOKEN || process.env.AWS_SECURITY_TOKEN || process.env.aws_session_token;

    if (accessKeyId && secretAccessKey) {
        return { accessKeyId, secretAccessKey, sessionToken, source: 'environment variables' };
    }

    const cliCreds = loadAwsCliCredentials();
    if (cliCreds) {
        return cliCreds;
    }

    return null;
}

// --- AWS API Gateway Endpoint Detection for local testing ---
let mcpServerUrl = process.env.MCP_SERVER_URL || null;
let awsApiEndpoint = process.env.AWS_API_ENDPOINT || process.env.awsApiEndpoint || process.env.MCP_SERVER_URL || null;
if (!awsApiEndpoint) {
    try {
        const outputJsonPath = path.join(__dirname, '../cdk/output.json');
        if (fs.existsSync(outputJsonPath)) {
            const outputs = JSON.parse(fs.readFileSync(outputJsonPath, 'utf8'));
            const cdkStack = outputs.CdkStack;
            if (cdkStack) {
                const apiKey = Object.keys(cdkStack).find(key => key.includes("DomainExpansionServerlessConstructDomainExpansionRestApiEndpoint"));
                if (apiKey) {
                    awsApiEndpoint = cdkStack[apiKey];
                    console.log(`\x1b[32m[AWS Bridge Proxy] Detected AWS API Endpoint from cdk/output.json: ${awsApiEndpoint}\x1b[0m`);
                }
            }
        }
    } catch (e) {
        console.warn("[AWS Bridge Proxy] Skipped reading cdk/output.json:", e.message);
    }
} else {
    console.log(`\x1b[32m[AWS Bridge Proxy] Using AWS API Endpoint: ${awsApiEndpoint}\x1b[0m`);
}
if (mcpServerUrl) {
    console.log(`\x1b[32m[AWS Bridge Proxy] Using MCP Server URL: ${mcpServerUrl}\x1b[0m`);
}

const resolvedCredentials = getAwsCredentials();

console.log(`[Startup] Runtime environment: ${isLambda ? 'AWS Lambda' : 'Local Server'}`);
if (awsApiEndpoint) {
    console.log(`[Startup] AWS API Bridge configured: ${awsApiEndpoint}`);
} else {
    console.log(`[Startup] AWS API Bridge is currently inactive.`);
}
if (mcpServerUrl) {
    console.log(`[Startup] AWS MCP Server URL configured: ${mcpServerUrl}`);
} else {
    console.log(`[Startup] AWS MCP Server URL is currently inactive.`);
}
console.log(`[Startup] AWS Signature Version 4 signing: ${resolvedCredentials ? `ENABLED (credentials loaded from ${resolvedCredentials.source})` : 'DISABLED (no credentials found in env or CLI credentials file)'}`);

// Helper to calculate SHA256 hash of a string
function sha256(string) {
    return crypto.createHash('sha256').update(string, 'utf8').digest('hex');
}

// Helper to calculate HMAC-SHA256 of a string with a key
function hmac(key, string, encoding) {
    return crypto.createHmac('sha256', key).update(string, 'utf8').digest(encoding);
}

// Get Signature Version 4 Signing Key
function getSignatureKey(key, dateStamp, regionName, serviceName) {
    const kDate = hmac('AWS4' + key, dateStamp);
    const kRegion = hmac(kDate, regionName);
    const kService = hmac(kRegion, serviceName);
    const kSigning = hmac(kService, 'aws4_request');
    return kSigning;
}

// Custom AWS Signature V4 request signer & fetcher using environment or CLI credentials
async function awsSignedFetch(urlStr, options = {}) {
    const creds = getAwsCredentials();
    const headers = { ...options.headers };

    // If no credentials are found in either environment or CLI profiles, fallback to standard unsigned fetch
    if (!creds) {
        console.log(`[AWS Signature V4] No credentials found in env or CLI credentials file. Sending unsigned ${options.method || 'GET'} request to ${urlStr}`);
        return fetch(urlStr, options);
    }

    const { accessKeyId, secretAccessKey, sessionToken } = creds;

    try {
        const url = new URL(urlStr);
        const method = options.method || 'GET';
        const bodyStr = options.body || '';
        const bodyHash = sha256(bodyStr);

        const amzDate = new Date().toISOString().replace(/[:\-]/g, '').split('.')[0] + 'Z';
        const dateStamp = amzDate.substring(0, 8);

        // Host header must be lowercase
        headers['host'] = url.host;
        headers['x-amz-date'] = amzDate;
        headers['x-amz-content-sha256'] = bodyHash;
        if (sessionToken) {
            headers['x-amz-security-token'] = sessionToken;
        }

        // Determine AWS Region and Service
        let region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
        let service = 'execute-api'; // default for API Gateway REST/HTTP APIs

        // Auto-detect region and service from URL if possible
        const hostParts = url.host.split('.');
        if (hostParts.includes('execute-api')) {
            service = 'execute-api';
            const idx = hostParts.indexOf('execute-api');
            if (hostParts[idx + 1] && hostParts[idx + 1] !== 'amazonaws') {
                region = hostParts[idx + 1];
            }
        } else if (url.host.endsWith('.on.aws')) {
            service = 'lambda';
            // e.g., xxx.lambda-url.us-east-1.on.aws
            const idx = hostParts.indexOf('lambda-url');
            if (idx !== -1 && hostParts[idx + 1]) {
                region = hostParts[idx + 1];
            }
        }

        // Canonical Headers: sorted alphabetically, keys lowercase, values trimmed
        const canonicalHeadersList = Object.keys(headers)
            .map(key => ({ key: key.toLowerCase(), value: String(headers[key]).trim() }))
            .sort((a, b) => a.key.localeCompare(b.key));

        const canonicalHeadersStr = canonicalHeadersList
            .map(item => `${item.key}:${item.value}`)
            .join('\n') + '\n';

        const signedHeadersStr = canonicalHeadersList
            .map(item => item.key)
            .join(';');

        const canonicalUri = url.pathname || '/';

        // Canonical query params must be sorted alphabetically
        const queryParams = [];
        url.searchParams.forEach((value, key) => {
            queryParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
        });
        const canonicalQueryStr = queryParams.sort().join('&');

        const canonicalRequest = [
            method,
            canonicalUri,
            canonicalQueryStr,
            canonicalHeadersStr,
            signedHeadersStr,
            bodyHash
        ].join('\n');

        const credentialScope = [dateStamp, region, service, 'aws4_request'].join('/');
        const stringToSign = [
            'AWS4-HMAC-SHA256',
            amzDate,
            credentialScope,
            sha256(canonicalRequest)
        ].join('\n');

        const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
        const signature = hmac(signingKey, stringToSign, 'hex');

        headers['authorization'] = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`;

        console.log(`[AWS Signature V4] Sending signed ${method} request to ${urlStr}`);
        return fetch(urlStr, {
            ...options,
            headers
        });
    } catch (err) {
        console.warn('[AWS Signature V4] Failed to sign request, falling back to standard fetch:', err.message);
        return fetch(urlStr, options);
    }
}

// Helper to call registered tools on the AWS MCP Server URL using SigV4 signed requests
async function triggerMcpTool(mcpServerUrl, toolName, args) {
    const payload = {
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
                name: toolName,
                arguments: args
            }
        }),
        headers: {
            "content-type": "application/json"
        },
        requestContext: {
            http: {
                method: "POST"
            }
        }
    };
    try {
        console.log(`[AWS Bridge Proxy] Invoking MCP tool "${toolName}" on MCP Server...`);
        const response = await awsSignedFetch(mcpServerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const text = await response.text();
            console.error(`[AWS Bridge Proxy Error] MCP tool "${toolName}" returned status ${response.status}. Body: ${text}`);
            return false;
        }
        const text = await response.text();
        let result = null;
        if (text && text.trim()) {
            try {
                result = JSON.parse(text);
                console.log(`[AWS Bridge Proxy] MCP tool "${toolName}" success:`, JSON.stringify(result));
            } catch (err) {
                console.warn(`[AWS Bridge Proxy Warning] MCP tool "${toolName}" response body was not valid JSON: "${text}"`);
            }
        } else {
            console.log(`[AWS Bridge Proxy] MCP tool "${toolName}" success (empty response with status ${response.status})`);
        }
        return true;
    } catch (err) {
        console.error(`[AWS Bridge Proxy Exception] Failed to call MCP tool "${toolName}":`, err.message);
        return false;
    }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- OpenClaw Direct Integration Logic ---
const gameSessions = new Map();

function loadOpenClawConfig() {
    let port = 18789;
    let token = '';
    // Game-specific dedicated agent defaults strictly to 'domain-commentator'
    let agentId = process.env.OPENCLAW_AGENT_ID || 'domain-commentator';

    try {
        const home = os.homedir();
        const configPath = path.join(home, '.openclaw', 'openclaw.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            port = config.gateway?.port || 18789;
            token = config.gateway?.auth?.token || '';
            
            console.log(`[OpenClaw Config] Loaded successfully. Port: ${port}, Token found: ${!!token}, AgentID: ${agentId}`);
        }
    } catch (err) {
        console.warn(`[OpenClaw Config] Failed to load ~/.openclaw/openclaw.json:`, err.message);
    }

    return { port, token, agentId };
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
        'x-openclaw-session-key': `agent:${agentId}:domain-expansion-ar-game:${sessionId}`
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

app.post('/api/trigger-technique', async (req, res) => {
    const { technique, robotId, role } = req.body;

    if (awsApiEndpoint) {
        try {
            console.log(`[AWS Bridge Proxy] Forwarding trigger-technique request to AWS REST API (monolithic backend)...`);
            const authHeader = req.headers['authorization'];
            const forwardHeaders = { 'Content-Type': 'application/json' };
            if (authHeader) {
                forwardHeaders['Authorization'] = authHeader;
            }
            const response = await awsSignedFetch(`${awsApiEndpoint.replace(/\/$/, '')}/api/trigger-technique`, {
                method: 'POST',
                headers: forwardHeaders,
                body: JSON.stringify(req.body)
            });

            if (response.ok) {
                const data = await response.json();
                return res.json(data);
            } else {
                const errorText = await response.text();
                console.error(`[AWS Bridge Proxy Error] Status: ${response.status} Body: ${errorText}`);
                return res.status(response.status).send(errorText);
            }
        } catch (err) {
            console.error(`[AWS Bridge Proxy Exception]:`, err.message);
            return res.status(500).json({ error: err.message });
        }
    } else if (mcpServerUrl) {
        try {
            console.log(`[AWS Bridge Proxy] Handling trigger-technique directly via MCP Server: technique=${technique}, robotId=${robotId}, role=${role}`);
            
            // 1. Resolve target robots
            let targets = [];
            if (robotId === "all") {
                if (role === "player1") {
                    targets = ["robot_1", "robot_2", "robot_3"];
                } else if (role === "player2") {
                    targets = ["robot_4", "robot_5", "robot_6"];
                } else {
                    targets = ["robot_1"];
                }
            } else {
                targets = [robotId || "robot_1"];
            }

            // Action configurations mapping
            const techniqueToMcpTool = {
                "domain_unlimited_void": "robot_kung_fu",
                "domain_malevolent_shrine": "robot_right_uppercut",
                "domain_self_embodiment": "robot_twist",
                "domain_authentic_love": "robot_wave",
                "domain_idle_death_gamble": "robot_dance_one",
                "domain_yuji_itadori": "robot_left_shot_fast",
                "domain_chimera_shadow_garden": "robot_squat",
                "domain_time_cell_moon_palace": "robot_twist",
                "lapse_blue": "robot_left_shot_fast",
                "reversal_red": "robot_right_shot_fast",
                "hollow_purple": "robot_left_kick"
            };

            const jjkActionMap = {
                "domain_unlimited_void": { stance: "kung_fu", speech: "領域展開、無量空処", language: "ja" },
                "domain_malevolent_shrine": { stance: "right_uppercut", speech: "領域展開、伏魔御厨子", language: "ja" },
                "domain_self_embodiment": { stance: "twist", speech: "領域展開、自閉円頓裹", language: "ja" },
                "domain_authentic_love": { stance: "wave", speech: "領域展開、真贋相愛", language: "ja" },
                "domain_idle_death_gamble": { stance: "dance", speech: "領域展開、坐殺博徒", language: "ja" },
                "domain_yuji_itadori": { stance: "punch", speech: "領域展開", language: "ja" },
                "domain_chimera_shadow_garden": { stance: "squat", speech: "領域展開、嵌合暗翳庭", language: "ja" },
                "domain_time_cell_moon_palace": { stance: "twist", speech: "領域展開、時胞月宮殿", language: "ja" },
                "lapse_blue": { stance: "left_shot_fast", speech: "術式順転、蒼", language: "ja" },
                "reversal_red": { stance: "right_shot_fast", speech: "術式反転、赫", language: "ja" },
                "hollow_purple": { stance: "kick", speech: "虚式、茈", language: "ja" }
            };

            const promises = [];
            for (const target of targets) {
                const mcpToolName = techniqueToMcpTool[technique] || `robot_${technique}`;
                // Trigger physical action
                promises.push(triggerMcpTool(mcpServerUrl, mcpToolName, { robot_id: target }));

                // Trigger speak action if mapped speech exists
                const actionInfo = jjkActionMap[technique];
                if (actionInfo && actionInfo.speech) {
                    promises.push(triggerMcpTool(mcpServerUrl, "robot_speak", {
                        robot_id: target,
                        text: actionInfo.speech,
                        language: actionInfo.language || "ja"
                    }));
                }
            }

            await Promise.all(promises);
            return res.json({ ok: true, message: `Technique ${technique} triggered successfully on targets: ${targets.join(', ')}` });

        } catch (err) {
            console.error(`[AWS Bridge Proxy Direct MCP Exception]:`, err.message);
            return res.status(500).json({ error: err.message });
        }
    } else {
        // No AWS API Endpoint active locally. Return 404 so browser falls back to direct local simulator.
        return res.status(404).json({ error: "AWS Serverless API Endpoint/MCP Server not configured. Falling back to local/direct simulator mode." });
    }
});

app.post('/api/enhance-portrait', (req, res) => {
    const { sessionId, templateId } = req.body;
    const resolvedSessionId = sessionId || "main";
    console.log(`[Bridge-Local] Enhance portrait requested: sessionId=${resolvedSessionId}, templateId=${templateId}`);
    
    const session = gameSessions.get(resolvedSessionId);
    if (!session) {
        return res.status(404).json({ error: "Session not found" });
    }
    
    // Simulate Rekognition validation: fail if webcam snaps are missing
    if (!session.latestWebcamFrameP1 || !session.latestWebcamFrameP2) {
        console.warn(`[Bridge-Local] Snapshots missing for local mock generation. P1 present: ${!!session.latestWebcamFrameP1}, P2 present: ${!!session.latestWebcamFrameP2}`);
        session.enhancedImageUrl = "ERROR: NO_FACE";
        gameSessions.set(resolvedSessionId, session);
        return res.json({
            success: true,
            status: "ERROR: NO_FACE",
            debug: {
                mode: "local-mock",
                sessionFound: true,
                hasSnapshotP1: !!session.latestWebcamFrameP1,
                hasSnapshotP2: !!session.latestWebcamFrameP2,
                templateId: templateId || "random",
            }
        });
    }
    
    session.enhancedImageUrl = "PENDING";
    gameSessions.set(resolvedSessionId, session);
    
    // Simulate background SQS -> Lambda style fusion worker delay (3 seconds)
    setTimeout(() => {
        const resolvedTemplateId = (templateId === "random" || !templateId) 
            ? (Math.random() > 0.5 ? "infinite_clash" : "sendai_clash") 
            : templateId;
            
        // Serve local template file as elegant, zero-dependency offline mock asset
        const localMockUrl = `/static/img/templates/${resolvedTemplateId}.jpg`;
        
        session.enhancedImageUrl = localMockUrl;
        gameSessions.set(resolvedSessionId, session);
        console.log(`[Bridge-Local] Background SQS mock processing completed for session=${resolvedSessionId}. Enhanced URL: ${localMockUrl}`);
    }, 3000);
    
    res.json({
        success: true,
        status: "PENDING",
        debug: {
            mode: "local-mock",
            sessionFound: true,
            hasSnapshotP1: !!session.latestWebcamFrameP1,
            hasSnapshotP2: !!session.latestWebcamFrameP2,
            templateId: templateId || "random",
        }
    });
});

app.get('/api/check-enhancement', (req, res) => {
    const { sessionId } = req.query;
    const resolvedSessionId = sessionId || "main";
    
    const session = gameSessions.get(resolvedSessionId);
    if (!session) {
        return res.json({ success: true, status: "NONE", url: "" });
    }
    
    const enhancedUrl = session.enhancedImageUrl || "";
    let status = "NONE";
    if (enhancedUrl === "PENDING") {
        status = "PENDING";
    } else if (enhancedUrl.startsWith("ERROR:")) {
        status = enhancedUrl;
    } else if (enhancedUrl) {
        status = "COMPLETE";
    }
    
    res.json({
        success: true,
        status: status,
        url: status === "COMPLETE" ? enhancedUrl : "",
        debug: {
            mode: "local-mock",
            sessionFound: true,
            rawEnhancedImageValue: enhancedUrl,
        }
    });
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

app.get('/api/get-snapshot', (req, res) => {
    const { sessionId, role } = req.query;
    const resolvedSessionId = sessionId || "main";
    const session = gameSessions.get(resolvedSessionId);
    if (!session) {
        return res.status(404).json({ error: "Session not found" });
    }
    const frame = (role === 'player1') ? session.latestWebcamFrameP1 : session.latestWebcamFrameP2;
    if (!frame) {
        return res.status(404).json({ error: "Snapshot not found" });
    }
    const cleanFrame = frame.startsWith('data:image/') ? frame : `data:image/jpeg;base64,${frame}`;
    res.json({
        success: true,
        image: cleanFrame
    });
});

function getSystemPrompt(isZh, foulLanguage) {
    if (isZh) {
        let systemPrompt = `你係釘崎野薔薇，特級咒術解說！請遵循你在 IDENTITY.md 與 SOUL.md 中設定的所有核心解說員人設與限制（無 Markdown、無表情符號、口語廣東話）。`;
        if (foulLanguage) {
            systemPrompt += `\n【核心附加指令：粗口垃圾話模式已開啟！】請在解說中加入適量香港廣東話粗口/Swearing或垃圾話（例如「仆街」、「屌你」、「頂你個肺」、「好戇尻」、「廢柴」），令其聽起來極度生動挑釁！`;
        } else {
            systemPrompt += `\n【核心附加指令：粗口關閉】請保持用語文明、健康，絕對不可包含任何粗口、髒話。`;
        }
        return systemPrompt;
    } else {
        let systemPrompt = `You are Nobara Kugisaki, the supreme commentator! Keep your identity and rules defined in IDENTITY.md and SOUL.md.`;
        if (foulLanguage) {
            systemPrompt += `\n[CRITICAL DIRECTIVE: Swearing / Trash-talk mode is active!] Add appropriate street-style roasts or light trash-talk (e.g., "pathetic", "idiot", "trash") to provoke and amuse the players!`;
        } else {
            systemPrompt += `\n[CRITICAL DIRECTIVE: Swearing OFF] Keep your wording polite, wholesomely intense, and PG-rated. No foul language.`;
        }
        return systemPrompt;
    }
}

app.post('/api/live-status', async (req, res) => {
    const { sessionId, eventType, detail, p1Score, p2Score, p1Total, p2Total, lang, foulLanguage, agentImagePolicy, ttsMode } = req.body;
    const resolvedSessionId = sessionId || "main";
    const { agentId } = loadOpenClawConfig();
    const isZh = lang && lang.toLowerCase().startsWith('zh');

    // --- AWS API Proxy Override ---
    if (awsApiEndpoint) {
        try {
            console.log(`[AWS Bridge Proxy] Forwarding live-status request to AWS REST API...`);
            const payload = {
                sessionId: resolvedSessionId,
                roomCode: req.body.roomCode || "BTL1",
                p1Score: p1Score || 0,
                p2Score: p2Score || 0,
                text: detail || "",
                eventType: eventType || "",
                lang: lang || "en",
                foulLanguage: !!foulLanguage,
                isReset: eventType === "RESET",
                agentImagePolicy: agentImagePolicy || "always",
                ttsMode: ttsMode || "browser",
                agent_type: req.body.agent_type || "agentcore_runtime"
            };
            const authHeader = req.headers['authorization'];
            const forwardHeaders = { 'Content-Type': 'application/json' };
            if (authHeader) {
                forwardHeaders['Authorization'] = authHeader;
            }

            const response = await awsSignedFetch(`${awsApiEndpoint.replace(/\/$/, '')}/api/live-status`, {
                method: 'POST',
                headers: forwardHeaders,
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                const data = await response.json();
                const resolvedCommentary = data.welcomeMessage || data.commentary || "";
                console.log(`[AWS Bridge Proxy] Received AWS Commentary: "${resolvedCommentary}" ttsMode=${data.ttsMode || 'browser'} hasAudioUrl=${!!data.audioUrl}`);
                if (eventType === "RESET") {
                    return res.json({
                        ok: true,
                        welcomeMessage: resolvedCommentary,
                        commentary: resolvedCommentary,
                        ttsMode: data.ttsMode || "browser",
                        audioUrl: data.audioUrl || "",
                        voiceId: data.voiceId || "",
                        duration: data.duration || 0,
                        debugPrompt: data.debugPrompt || "",
                        debugImageContext: data.debugImageContext || null
                    });
                } else {
                    return res.json({
                        ok: true,
                        commentary: resolvedCommentary,
                        ttsMode: data.ttsMode || "browser",
                        audioUrl: data.audioUrl || "",
                        voiceId: data.voiceId || "",
                        duration: data.duration || 0,
                        debugPrompt: data.debugPrompt || "",
                        debugImageContext: data.debugImageContext || null
                    });
                }
            } else {
                const errorText = await response.text();
                console.error(`[AWS Bridge Proxy Error] Status: ${response.status} Body: ${errorText}`);
            }
        } catch (err) {
            console.error(`[AWS Bridge Proxy Exception]:`, err.message);
        }
    }

    // 1. Handle New Game Session RESET event
    if (eventType === "RESET") {
        console.log(`[Bridge] Resetting OpenClaw session for sessionId=${resolvedSessionId}`);
        
        const systemPrompt = getSystemPrompt(isZh, foulLanguage);
        
        let openingInstruction = "";
        if (isZh) {
            openingInstruction = `【重要系統指示：請直接以你的「釘崎野薔薇（Kugisaki Nobara）」人設，對玩家 P1、P2 發表最傲嬌、最震撼嘅開局廣東話解說旁白（1至2句）！你必須在第一句明確介紹自己（例如說出「本大小姐係釘崎野薔薇！」或「我係釘崎野薔薇」），否則沒有人知道是你！請注意：對戰尚未開始，玩家正處於準備階段，在你的開場白說完之後才會正式進入對戰倒數。因此，你的解說必須是開戰前的嗆聲、熱身或宣戰，千萬不要說「對戰已經開始」之類的話！如果系統同時提供咗 P1、P2 嘅玩家即時畫面，請先觀察兩位玩家當下清楚可見嘅表情、姿勢、氣勢、服裝或準備狀態，並自然融入至少一兩個具體可見細節去開場挑釁或炒熱氣氛；只可以講肉眼睇到嘅內容，唔好亂作。直接進入角色解說，不要複述或確認本指令！】\n\n【附加指令】：\n${systemPrompt}`;
        } else {
            openingInstruction = `[IMPORTANT DIRECTIVE: Please act immediately in your Kugisaki Nobara persona to deliver an epic, sassy opening welcome commentary (1-2 sentences) to players P1 and P2! You MUST explicitly introduce yourself in the first sentence by name (e.g. "I am Nobara Kugisaki!" or "It's me, Nobara Kugisaki!") so that players know who is talking. NOTE: The match has NOT started yet. The players are in the preparation stage, and the match countdown will begin right after your introduction speech. Frame your welcoming commentary as a pre-match hype/call-to-action before the countdown begins, NOT as if the match is already running. If player webcam snapshots are attached, inspect both players first and weave in one or two specific visible details about their expression, posture, outfit, or readiness to make the opening taunt feel personalized; only mention things clearly visible in the images and do not invent hidden details. Speak only in character!]\n\n[CURRENT MATCH INSTRUCTION]:\n${systemPrompt}`;
        }
        let attachImages = false;
        const resolvedPolicy = agentImagePolicy || "always";
        if (resolvedPolicy === "always" || resolvedPolicy === "start_end") {
            attachImages = true;
        }
        const welcomeMessage = await callOpenClawGateway(resolvedSessionId, agentId, openingInstruction, attachImages);
        return res.json({
            ok: true,
            welcomeMessage,
            commentary: welcomeMessage,
            ttsMode: 'browser',
            duration: 0,
            debugPrompt: openingInstruction,
            debugImageContext: {
                shouldAttachImage: attachImages
            }
        });
    }

    // 2. Handle subsequent live status game updates
    let promptText = "";
    if (isZh) {
        const toneDirective = foulLanguage 
            ? "（粗口垃圾話模式已開啟！請使用廣東話粗口/挑釁詞調侃玩家）" 
            : "（請保持文明，不可使用粗口髒話）";
        if (eventType === "CAST" && detail) {
            promptText = `[對戰更新] ${translateDetail(detail)}。目前完成進度：P1 完成了 ${p1Score} 次，P2 完成了 ${p2Score} 次。${toneDirective} 請立刻提供下一句極簡短的廣東話解說旁白！`;
        } else {
            promptText = `[對戰更新] 目前完成進度：P1 完成了 ${p1Score} 次，P2 完成了 ${p2Score} 次。${toneDirective} 請立刻提供下一句極簡短的廣東話解說旁白！`;
        }
    } else {
        const toneDirective = foulLanguage 
            ? "(Trash-talk mode is active! Feel free to lightly roast the players)" 
            : "(Swearing is OFF. Keep commentary intense but clean)";
        if (eventType === "CAST" && detail) {
            promptText = `[GAME UPDATE] ${detail}. Current Standing: P1 Score = ${p1Score}, P2 Score = ${p2Score}. ${toneDirective} Please provide your next short, high-energy commentary!`;
        } else {
            promptText = `[GAME UPDATE] Current Standing: P1 Score = ${p1Score}, P2 Score = ${p2Score}. ${toneDirective} Please provide your next short, high-energy commentary!`;
        }
    }

    console.log(`[Bridge] Live Status: ${eventType} p1Score=${p1Score}/${p1Total} p2Score=${p2Score}/${p2Total} lang=${lang} foul=${foulLanguage}`);

    let attachImages = false;
    const resolvedPolicy = agentImagePolicy || "always";
    if (resolvedPolicy === "always") {
        attachImages = true;
    }
    const commentary = await callOpenClawGateway(resolvedSessionId, agentId, promptText, attachImages);
    res.json({
        ok: true,
        commentary,
        ttsMode: 'browser',
        duration: 0,
        debugPrompt: promptText,
        debugImageContext: {
            shouldAttachImage: attachImages
        }
    });
});

app.post('/api/battle-result', async (req, res) => {
    const { sessionId, winner, p1Score, p2Score, lang, foulLanguage, agentImagePolicy, ttsMode } = req.body;
    const resolvedSessionId = sessionId || "main";
    const { agentId } = loadOpenClawConfig();

    // --- AWS API Proxy Override ---
    if (awsApiEndpoint) {
        try {
            console.log(`[AWS Bridge Proxy] Forwarding battle-result request to AWS REST API...`);
            const payload = {
                sessionId: resolvedSessionId,
                roomCode: req.body.roomCode || "BTL1",
                p1Score: p1Score || 0,
                p2Score: p2Score || 0,
                text: winner || "DRAW",
                eventType: "BATTLE_RESULT",
                lang: lang || "en",
                foulLanguage: !!foulLanguage,
                isReset: true,
                agentImagePolicy: agentImagePolicy || "always",
                ttsMode: ttsMode || "browser",
                agent_type: req.body.agent_type || "agentcore_runtime"
            };
            const authHeader = req.headers['authorization'];
            const forwardHeaders = { 'Content-Type': 'application/json' };
            if (authHeader) {
                forwardHeaders['Authorization'] = authHeader;
            }

            const response = await awsSignedFetch(`${awsApiEndpoint.replace(/\/$/, '')}/api/battle-result`, {
                method: 'POST',
                headers: forwardHeaders,
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                const data = await response.json();
                console.log(`[AWS Bridge Proxy] Received AWS Battle Result: "${data.commentary}" ttsMode=${data.ttsMode || 'browser'} hasAudioUrl=${!!data.audioUrl}`);
                return res.json({
                    ok: true,
                    commentary: data.commentary,
                    ttsMode: data.ttsMode || "browser",
                    audioUrl: data.audioUrl || "",
                    voiceId: data.voiceId || "",
                    duration: data.duration || 0,
                    debugPrompt: data.debugPrompt || "",
                    debugImageContext: data.debugImageContext || null
                });
            } else {
                const errorText = await response.text();
                console.error(`[AWS Bridge Proxy Error] Status: ${response.status} Body: ${errorText}`);
            }
        } catch (err) {
            console.error(`[AWS Bridge Proxy Exception]:`, err.message);
        }
    }
    
    let promptText = "";
    const isZh = lang && lang.toLowerCase().startsWith('zh');

    if (isZh) {
        promptText = `[SYSTEM UPDATE] 對戰結束！勝者：${winner === 'DRAW' ? '平手' : (winner === 'PLAYER 1' ? 'P1' : 'P2')}。最終比分 - P1 完成了 ${p1Score} 次，P2 完成了 ${p2Score} 次。請用香港廣東話（完全口語，聽起來像極度熱血、宏大的日本動畫粵語配音、主播，充滿張力）提供一句史詩般震撼、精彩的對戰結算和勝利旁白（最長兩短句）。請為勝者喝采，並以「P1」和「P2」稱呼玩家，保持角色風格！請不要使用 markdown 語法 or 表情符號。`;
        if (foulLanguage) {
            promptText += `特別注意（核心要求）：由於玩家開啟了「粗口垃圾話」模式，請在旁白中加入適量香港廣東話粗口/Swearing或極度不禮貌的街頭垃圾話，令其聽起來極度搞笑、熱血，且具有街頭咒術師互相問候挑釁的風味！`;
        } else {
            promptText += `特別注意：請保持旁白用詞文明、熱血、健康，絕對不可包含 any 粗口、髒話 or 人身攻擊字眼，適合全年齡觀眾。`;
        }
    } else {
        promptText = `[SYSTEM UPDATE] The battle is OVER! Winner: ${winner}. Final standing - Player 1 score: ${p1Score}, Player 2 score: ${p2Score}. Please deliver an epic, grand concluding commentary about the battle's climax (maximum 3 short sentences). Honor the winner in character!`;
    }

    console.log(`[Bridge] Battle result: Winner: ${winner}, scores: P1=${p1Score}, P2=${p2Score} lang=${lang} foul=${foulLanguage}`);

    let attachImages = false;
    const resolvedPolicy = agentImagePolicy || "always";
    if (resolvedPolicy === "always" || resolvedPolicy === "start_end") {
        attachImages = true;
    }
    const commentary = await callOpenClawGateway(resolvedSessionId, agentId, promptText, attachImages);
    res.json({
        ok: true,
        commentary,
        ttsMode: 'browser',
        duration: 0,
        debugPrompt: promptText,
        debugImageContext: {
            shouldAttachImage: attachImages
        }
    });
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
const roomsState = new Map(); // roomCode -> MatchState object

function getOrCreateRoomState(roomCode) {
    if (!roomsState.has(roomCode)) {
        roomsState.set(roomCode, {
            roomCode: roomCode,
            sessionId: "",
            matchStatus: "idle", // idle | preparing | counting_down | playing | paused | ended
            countdownTimer: 3,
            gameDifficulty: 8,
            gameCount: 11,
            shuffledActionList: null,
            winner: null,
            p1: { score: 0, timeLeft: 0, currentDomain: null, active: false, finished: false, attempted: 0 },
            p2: { score: 0, timeLeft: 0, currentDomain: null, active: false, finished: false, attempted: 0 },
            lastUpdated: Date.now()
        });
    }
    return roomsState.get(roomCode);
}

function evaluateVictory(state) {
    const p1 = state.p1;
    const p2 = state.p2;

    if (p1.attempted >= state.gameCount) p1.finished = true;
    if (p2.attempted >= state.gameCount) p2.finished = true;

    const normalEnd = p1.finished && p2.finished;
    let earlyWin = false;
    let winner = null;

    const maxP2Score = p2.score + Math.max(0, state.gameCount - p2.attempted);
    const maxP1Score = p1.score + Math.max(0, state.gameCount - p1.attempted);

    if (p1.finished && !p2.finished && p1.score > maxP2Score) {
        earlyWin = true;
        winner = 'PLAYER 1';
    } else if (p2.finished && !p1.finished && p2.score > maxP1Score) {
        earlyWin = true;
        winner = 'PLAYER 2';
    } else if (normalEnd) {
        if (p1.score === p2.score) {
            winner = 'DRAW';
        } else if (p1.score > p2.score) {
            winner = 'PLAYER 1';
        } else {
            winner = 'PLAYER 2';
        }
    }

    if (normalEnd || earlyWin) {
        state.matchStatus = 'ended';
        state.winner = winner;
        return true;
    }
    return false;
}

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

        // Update player connection status in state object
        const state = getOrCreateRoomState(roomCode);
        if (role === 'player1') {
            state.p1.active = true;
        } else if (role === 'player2') {
            state.p2.active = true;
        } else if (role === 'viewer') {
            console.log(`[Server] Viewer connected to room ${roomCode}. Resetting room state to idle.`);
            state.matchStatus = 'idle';
            state.winner = null;
            state.shuffledActionList = null;
            state.p1.score = 0; state.p1.timeLeft = 0; state.p1.currentDomain = null; state.p1.finished = false; state.p1.attempted = 0;
            state.p2.score = 0; state.p2.timeLeft = 0; state.p2.currentDomain = null; state.p2.finished = false; state.p2.attempted = 0;
            state.lastUpdated = Date.now();
        }

        // Notify room of the updated state and the new user
        io.to(roomCode).emit('state_update', state);
        socket.to(roomCode).emit('user_joined', { id: socket.id, role });
    });

    socket.on('signal', ({ type, data, to }) => {
        const payload = {
            from: socket.id,
            role: socket.role,
            type,
            data
        };

        if (to) {
            io.to(to).emit('signal', payload);
        } else {
            socket.to(socket.roomCode).emit('signal', payload);
        }
    });

    // Reactive State: Viewer requests to start pre-match preparation
    socket.on('start_battle_request', ({ difficulty, count, syncedGestureMode, sessionId }) => {
        const roomCode = socket.roomCode;
        if (!roomCode) return;

        const state = getOrCreateRoomState(roomCode);
        state.matchStatus = 'preparing';
        state.gameDifficulty = parseInt(difficulty) || 8;
        state.gameCount = parseInt(count) || 11;
        state.sessionId = sessionId;
        state.winner = null;
        
        state.p1.score = 0;
        state.p1.timeLeft = state.gameDifficulty;
        state.p1.currentDomain = null;
        state.p1.finished = false;
        state.p1.attempted = 0;

        state.p2.score = 0;
        state.p2.timeLeft = state.gameDifficulty;
        state.p2.currentDomain = null;
        state.p2.finished = false;
        state.p2.attempted = 0;

        // Shuffle domain techniques list for synced same gesture mode
        if (syncedGestureMode) {
            const allActions = [
                "Unlimited Void", "Malevolent Shrine", "Self-Embodiment of Perfection", 
                "Authentic Mutual Love", "Idle Death Gamble", "Yuji Itadori", 
                "Chimera Shadow Garden", "Time Cell Moon Palace", "Lapse Blue", 
                "Reversal Red", "Hollow Purple"
            ];
            const shuffled = allActions.sort(() => Math.random() - 0.5);
            state.shuffledActionList = shuffled.slice(0, Math.min(state.gameCount, shuffled.length));
        } else {
            state.shuffledActionList = null;
        }

        state.lastUpdated = Date.now();

        // Broadcast updated state to all connected room sockets
        io.to(roomCode).emit('state_update', state);

        // Safely trigger camera snapshots and overlay cleaning via standard signal bridge
        io.to(roomCode).emit('signal', { type: 'CLOSE_OVERLAYS', data: { isStarting: true } });
        io.to(roomCode).emit('signal', { type: 'CAPTURE_WEBCAM_FRAME', data: { phase: 'START', sessionId: sessionId } });
    });

    // Reactive State: Viewer completes welcome commentary intro
    socket.on('match_welcome_complete', () => {
        const roomCode = socket.roomCode;
        if (!roomCode) return;

        const state = getOrCreateRoomState(roomCode);
        state.matchStatus = 'counting_down';
        state.lastUpdated = Date.now();

        io.to(roomCode).emit('state_update', state);
    });

    // Reactive State: Countdown finishes, start playing
    socket.on('countdown_finished', () => {
        const roomCode = socket.roomCode;
        if (!roomCode) return;

        const state = getOrCreateRoomState(roomCode);
        state.matchStatus = 'playing';
        state.lastUpdated = Date.now();

        io.to(roomCode).emit('state_update', state);

        // Tell player client instances to launch their mini game round
        io.to(roomCode).emit('signal', {
            type: 'START_BATTLE',
            data: {
                difficulty: state.gameDifficulty,
                count: state.gameCount,
                openclawSessionId: state.sessionId,
                actionList: state.shuffledActionList
            }
        });
    });

    // Reactive State: Player ticks down their target timer locally
    socket.on('player_tick', ({ timeLeft }) => {
        const roomCode = socket.roomCode;
        const role = socket.role;
        if (!roomCode || !role) return;

        const state = getOrCreateRoomState(roomCode);
        if (state.matchStatus !== 'playing') {
            console.warn(`[Server] Discarding player_tick because matchStatus is: ${state.matchStatus}`);
            return;
        }
        if (role === 'player1') {
            state.p1.timeLeft = timeLeft;
        } else if (role === 'player2') {
            state.p2.timeLeft = timeLeft;
        }
        state.lastUpdated = Date.now();

        // Emit updated state to room so viewer updates individual timer bars
        io.to(roomCode).emit('state_update', state);
    });

    // Reactive State: Player timeout on an action
    socket.on('player_timeout', () => {
        const roomCode = socket.roomCode;
        const role = socket.role;
        if (!roomCode || !role) return;

        const state = getOrCreateRoomState(roomCode);
        if (state.matchStatus !== 'playing') {
            console.warn(`[Server] Discarding player_timeout because matchStatus is: ${state.matchStatus}`);
            return;
        }
        if (role === 'player1') {
            state.p1.attempted += 1;
            state.p1.timeLeft = state.gameDifficulty;
            state.p1.currentDomain = null;
        } else if (role === 'player2') {
            state.p2.attempted += 1;
            state.p2.timeLeft = state.gameDifficulty;
            state.p2.currentDomain = null;
        }
        state.lastUpdated = Date.now();

        evaluateVictory(state);
        io.to(roomCode).emit('state_update', state);
    });

    // Reactive State: Player submits a successful gesture
    socket.on('submit_gesture_success', ({ score, timeLeft, currentDomain, videoSrc }) => {
        const roomCode = socket.roomCode;
        const role = socket.role;
        if (!roomCode || !role) return;

        const state = getOrCreateRoomState(roomCode);
        if (state.matchStatus !== 'playing') {
            console.warn(`[Server] Discarding submit_gesture_success because matchStatus is: ${state.matchStatus}`);
            return;
        }
        if (role === 'player1') {
            state.p1.score = score;
            state.p1.timeLeft = timeLeft;
            state.p1.currentDomain = currentDomain;
            state.p1.attempted += 1;
        } else if (role === 'player2') {
            state.p2.score = score;
            state.p2.timeLeft = timeLeft;
            state.p2.currentDomain = currentDomain;
            state.p2.attempted += 1;
        }
        state.lastUpdated = Date.now();

        // Pause match while showing technique cinematic
        state.matchStatus = 'paused';

        const won = evaluateVictory(state);
        io.to(roomCode).emit('state_update', state);

        // Trigger cinematic overlay on viewer/players
        io.to(roomCode).emit('signal', { type: 'PLAY_VIDEO_SYNC', data: videoSrc, from: role });

        if (won) {
            // Instantly tell player clients the match is over to freeze hand detection
            io.to(roomCode).emit('signal', { type: 'MATCH_OVER', data: null });
        }
    });

    // Reactive State: Cinematic ends, resume playing
    socket.on('cinematic_finished', () => {
        const roomCode = socket.roomCode;
        if (!roomCode) return;

        const state = getOrCreateRoomState(roomCode);
        if (state.matchStatus === 'paused') {
            state.matchStatus = 'playing';
            state.lastUpdated = Date.now();
            io.to(roomCode).emit('state_update', state);
            io.to(roomCode).emit('signal', { type: 'MATCH_RESUME', data: null });
        }
    });

    // Reactive State: Viewer clears/resets the game session
    socket.on('room_reset_request', () => {
        const roomCode = socket.roomCode;
        if (!roomCode) return;

        const state = getOrCreateRoomState(roomCode);
        state.matchStatus = 'idle';
        state.winner = null;
        state.shuffledActionList = null;
        
        state.p1.score = 0; state.p1.timeLeft = 0; state.p1.currentDomain = null; state.p1.finished = false; state.p1.attempted = 0;
        state.p2.score = 0; state.p2.timeLeft = 0; state.p2.currentDomain = null; state.p2.finished = false; state.p2.attempted = 0;
        state.lastUpdated = Date.now();

        io.to(roomCode).emit('state_update', state);
        io.to(roomCode).emit('signal', { type: 'CLOSE_OVERLAYS', data: { isStarting: false } });
    });

    socket.on('disconnect', () => {
        if (socket.roomCode && rooms.has(socket.roomCode)) {
            rooms.get(socket.roomCode).delete(socket.id);
            if (rooms.get(socket.roomCode).size === 0) {
                rooms.delete(socket.roomCode);
            }
            
            const state = getOrCreateRoomState(socket.roomCode);
            if (socket.role === 'player1') {
                state.p1.active = false;
            } else if (socket.role === 'player2') {
                state.p2.active = false;
            } else if (socket.role === 'viewer') {
                // Self-Healing Viewer Refresh Clean-up: If the Viewer disconnects/refreshes, wipe match state
                state.matchStatus = 'idle';
                state.winner = null;
                state.shuffledActionList = null;
                state.p1.score = 0; state.p1.timeLeft = 0; state.p1.currentDomain = null; state.p1.finished = false; state.p1.attempted = 0;
                state.p2.score = 0; state.p2.timeLeft = 0; state.p2.currentDomain = null; state.p2.finished = false; state.p2.attempted = 0;
                io.to(socket.roomCode).emit('signal', { type: 'CLOSE_OVERLAYS', data: { isStarting: false } });
            }

            io.to(socket.roomCode).emit('state_update', state);
            socket.to(socket.roomCode).emit('user_left', { id: socket.id, role: socket.role });
        }
        console.log(`[Server] User disconnected: ${socket.id}`);
    });
});

if (isLambda) {
    const serverless = require('serverless-http');
    module.exports.handler = serverless(app);
} else {
    server.listen(PORT, () => {
        console.log(`[Server] Signaling server running on port ${PORT}`);
    });
}
