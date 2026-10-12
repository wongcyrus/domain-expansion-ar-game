# Domain Expansion AR Game

Independent React + TypeScript + Vite rewrite of the AR player, battle viewer, popup media player, and share gallery.

## Architecture

- `index.html`: player camera, MediaPipe gesture recognition, VFX, authoritative battle scoring, standalone solo rounds, configurable playback, and throttled robot calls.
- `battle.html`: authoritative room view, WebRTC streams, match controls, configurable rules/layout, score-grace cinematics, event commentary, browser/Polly TTS, the interactive Shizuku Live2D co-host, and results.
- `player.html`: origin-validated popup media surface.
- `share.html`: resolved snapshot images, download, and Web Share/clipboard actions.
- Player, battle, result, and Scroll of Honor UI supports English, Hong Kong
  Traditional Chinese, Taiwan Traditional Chinese, and Japanese.
- `src/core/protocol.ts`: typed Zod wire protocol with runtime validation.
- `src/services/controlTransport.ts`: native WebSocket control transport.
- `src/services/webrtcSession.ts`: isolated WebRTC signaling/session service.
- `dev-server.mjs`: localhost online coordinator with deadline-based match state.

Battle mode is **WebSocket-authoritative only**. It contains no
`BroadcastChannel`, same-browser local coordinator, or Socket.IO fallback.
Multiple tabs can still be used for development, but they communicate through
the WebSocket coordinator exactly like separate devices. The standalone solo
mini-game remains available on the player page and does not emulate a
multiplayer coordinator.

Selecting Player 1 automatically selects robots 1-3; Player 2 selects robots
4-6. Player-role links select the matching group too. The robot selector still
allows an individual robot override, and choosing a player role again restores
its group. Technique requests include the player role so the backend routes
group actions to the correct three robots.

The WebSocket wire format is protocol `2.0`: the client joins with
`{action:"join",roomId,role,clientId}`, wraps authoritative commands in
`{action:"command",envelope}`, and sends WebRTC negotiation with
`{action:"signal",roomId,to?,signalType,payload}`. Server events are validated
envelopes, including `room.snapshot` and `webrtc.*`.

Starting a match enters the authoritative `preparing` phase while START
snapshots and opening commentary are produced. The viewer that issued
`match.start` may send `match.beginCountdown` only after opening TTS playback
finishes; the countdown deadline is created at that point, so gameplay cannot
start underneath the introduction.

## GitHub Pages solo practice

**Live site:** https://wongcyrus.github.io/domain-expansion-ar-game/

Allow camera access and tap **Start round** to practise without signing in or
running a game backend. Multiplayer battles, robot control, snapshots, and AI
commentary are not available in this standalone mode.

The standalone practice site uses a separate entry page and build:

```bash
npm ci
npm run build:practice
```

Publish `dist-practice/`, not the AWS `dist/` directory. The default base path is
`/domain-expansion-ar-game/`; override `PRACTICE_BASE_PATH` for another Pages
repository path or a root/custom-domain deployment.

Practice runs camera recognition, VFX, scoring, timers, and technique/result
videos entirely in the browser. It never loads backend configuration, signs in,
opens game WebSockets/WebRTC peers, or calls robot/snapshot/commentary APIs.
Its settings use `domain-expansion.practice.settings`, separate from AWS settings.
Internet is still needed for MediaPipe's CDN-hosted library/model files.
All practice images, technique/result videos, and legacy VFX are included in
`dist-practice/` and load from the GitHub Pages origin and project path, not AWS.
Changing AWS deployment URLs or removing AWS resources does not affect them.

`.github/workflows/practice-pages.yml` checks the existing game tests and AWS
build, runs static practice browser checks, then publishes only the practice
build to GitHub Pages. Pages must use **GitHub Actions** as its publishing
source. Pushing to this repository's `main` branch triggers deployment; the
workflow also supports manual dispatch. This does not deploy AWS infrastructure,
upload to the AWS website bucket, or invalidate CloudFront. `npm run build` and
the authenticated AWS entry pages retain their existing behavior.

For a static-server smoke test, serve `dist-practice/` under the configured base
path:

```bash
npm run build:practice
node scripts/serve-practice.mjs
```

Open `http://127.0.0.1:4174/domain-expansion-ar-game/`. If you override
`PRACTICE_BASE_PATH`, use the same value for the build and static server.
The camera requires HTTPS, except on localhost. On mobile browsers, allow
camera access and tap Start round; popup playback may require its own tap.

Integrated videos remain above the result screen, close automatically when they
finish, and always have a Close button. If a browser blocks sound autoplay, the
video retries muted and offers **Enable sound**; if playback is still blocked,
tap **Play video**. Loading/decoding errors show **Retry video** without trapping
the page. Result clips honor the selected video mode, including silent and no
video, and restarting or quitting clears the integrated clip.

`npm run test:e2e:practice` builds the Pages site and exercises solo scoring,
timeouts, restart, popup media, nested asset paths, and absence of backend traffic
using only a static file server.

To run the same browser checks against the published site without starting a
local server:

```bash
PRACTICE_URL=https://wongcyrus.github.io/domain-expansion-ar-game/ \
npx playwright test --config playwright.practice.config.ts
```

## Local development

```bash
npm install
npm run dev
```

Open:

- `https://localhost:5173/battle.html?room=BTL1`
- `https://localhost:5173/?room=BTL1&role=player1`
- `https://localhost:5173/?room=BTL1&role=player2`

The development server automatically reuses `cert.pem` and `key.pem` from the
V1 project when they are available. The local WebSocket URL follows the page
protocol, so HTTPS uses `wss://localhost:5173/control`. It also provides
same-origin local snapshot upload/download endpoints so the embedded Scroll of
Honor can display both player captures without a separate REST server.

Local AI commentary uses Amazon Bedrock through the AWS SDK credential chain.
Sign in with the AWS CLI before starting the server. The defaults match the
deployed commentator, and can be overridden when needed:

```bash
aws sso login --profile your-profile
AWS_PROFILE=your-profile \
BEDROCK_REGION=us-east-1 \
BEDROCK_MODEL_ID=global.moonshotai.kimi-k3 \
COMMENTARY_MAX_TOKENS=1600 \
POLLY_REGION=us-east-1 \
LOCAL_COMMENTARY_LAMBDA=optional-deployed-function-name \
npm run dev
```

The AWS credentials remain in the Node development server and are never sent
to the browser. When AWS TTS is selected, local mode synthesizes Amazon Polly
MP3 audio in memory and returns it directly to the browser; it does not require
an S3 bucket. If direct access to the Polly endpoint is unavailable, local mode
automatically invokes the deployed Domain Expansion backend Lambda and uses
its presigned Polly audio. `LOCAL_COMMENTARY_LAMBDA` avoids automatic Lambda
discovery when supplied. The AWS identity therefore needs
`bedrock:InvokeModel`, `polly:SynthesizeSpeech`, and, for the fallback,
`lambda:ListFunctions` plus `lambda:InvokeFunction`. If both Polly paths fail,
the UI displays the error and falls back to browser speech.

To use different certificates:

```bash
VITE_HTTPS_CERT=/absolute/path/to/cert.pem \
VITE_HTTPS_KEY=/absolute/path/to/key.pem \
npm run dev
```

Do not commit private keys. When no certificate pair is available, the server
falls back to HTTP and prints the resulting URL.

Endpoint and Cognito values may be overridden without editing `config.json`:

```bash
VITE_WEBSOCKET_URL=wss://example.execute-api.region.amazonaws.com/prod \
VITE_API_BASE_URL=https://api.example.com \
VITE_COGNITO_USER_POOL_ID=region_pool \
VITE_COGNITO_USER_POOL_CLIENT_ID=client-id \
VITE_COGNITO_REGION=region \
npm run dev
```

## Deployed backend endpoints

Replace `public/config.json` at deployment time:

```json
{
  "protocolVersion": "2.0",
  "webSocketUrl": "wss://example.execute-api.region.amazonaws.com/prod",
  "apiBaseUrl": "https://example.execute-api.region.amazonaws.com/prod",
  "defaultRoomCode": "BTL1",
  "defaultSessionKey": "mcpserver",
  "cognitoUserPoolId": "region_pool",
  "cognitoUserPoolClientId": "client-id",
  "cognitoRegion": "region"
}
```

The API client explicitly adds a stored Cognito ID token to its own requests. It never patches global `fetch`. Supported surfaces are `/api/register-room`, `/api/trigger-technique`, `/api/live-status`, `/api/battle-result`, `/api/webcam-upload`, and `/api/get-snapshot`.

The production WebSocket coordinator must implement the schemas in `src/core/protocol.ts`. WebRTC media is peer-to-peer; only offers, answers, and ICE candidates use the control socket.

## Validation

```bash
npm test
npm run build
```
