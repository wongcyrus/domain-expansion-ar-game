# Domain Expansion AR Game | 領域展開 AR 遊戲

A standalone AR experience for triggering Domain Expansions and Techniques using hand gestures.
一款用於觸發手勢控制「領域展開」與「術式」的獨立 AR 體驗遊戲。

### 🎮 [Play the Game Now | 立即開始遊戲](https://wongcyrus.github.io/domain-expansion-ar-game/)

[![Domain Expansion Demo](https://img.youtube.com/vi/Tck6WSV_YXQ/0.jpg)](https://www.youtube.com/watch?v=Tck6WSV_YXQ)

## Features | 功能

- **Mini-Game Mode**: Challenge yourself to perform gestures within a time limit and score points!
- **迷你遊戲模式**: 在限時內挑戰完成手勢並獲取分數！
- **Static Local Battle Mode**: Same-browser battle works with pure client-side tab communication (`BroadcastChannel` + WebRTC), even on a static host.
- **靜態本地對戰模式**: 同一瀏覽器內的對戰可透過純前端分頁通訊（`BroadcastChannel` + WebRTC）運行，即使只是靜態網站託管也可使用。
- **Server-Assisted Advanced Features**: AI commentator, webcam snapshot upload, AI portrait fusion, and internet multiplayer require backend APIs / signaling.
- **伺服器增強功能**: AI 解說、相機快照上傳、AI 人像融合與跨網路多人連線仍然需要後端 API / 信令服務。
- **Configurable Endpoint**: Save your Robot API URL locally.
- **可配置端點**: 在本地保存您的機器人 API 網址。
- **High-Quality VFX**: Full particle and atmospheric effects included.
- **高畫質視覺效果**: 包含完整的粒子與環境特效。
- **Hand-Centered Interaction**: Techniques follow your hand movements.
- **以手部為中心的互動**: 術式效果會跟隨您的手部動作。
- **Battle Mode (Multi-Monitor)**: Play with a friend on two monitors and a 3rd monitor for the audience view.
- **對戰模式 (多螢幕支援)**: 與朋友在兩個螢幕上對戰，並有第三個螢幕作為觀眾視角。

## Setup | 設定

### Quick Start: Static / No-Server Mode | 快速開始：純靜態 / 無伺服器模式

This is the **lowest-friction mode** and intentionally has **fewer features**.
這是**最容易啟動**的模式，但功能會**較少**。

1. Serve the folder on any normal HTTP static host (for example GitHub Pages, S3 static website, `npx serve`, or `python -m http.server`).
2. Open `index.html?role=player1`, `index.html?role=player2`, and `battle.html` in the **same browser**.
3. Use the battle viewer as the single match controller.
4. Strike a hand sign to start.

> **Note | 注意**  
> Static mode works best over normal `http://` or `https://` hosting. Opening files directly with `file://` is not recommended because browser media and cross-tab behavior may be inconsistent.  
> 純靜態模式建議使用一般 `http://` 或 `https://` 網站託管，不建議直接以 `file://` 開啟檔案，否則相機與分頁通訊行為可能不穩定。

### Full Mode: Server / API Enabled | 完整模式：啟用伺服器 / API

1. Open `index.html` in a web browser.
2. Enter your Robot API endpoint in the Settings Panel.
3. Enter your encrypted session key.
4. Click "Save Settings".
5. Strike a hand sign to start.

## Runtime Modes & Feature Matrix | 運行模式與功能矩陣

| Capability | Static Local Mode (same browser) | Server / API Mode |
| :-- | :--: | :--: |
| Two-player local battle | ✅ | ✅ |
| Battle viewer authority | ✅ | ✅ |
| Cross-tab sync (`BroadcastChannel`) | ✅ | ✅ |
| WebRTC local viewer stream | ✅ | ✅ |
| Robot API control | ❌ | ✅ |
| AI commentator text / voice workflow | ❌ | ✅ |
| Webcam snapshot upload for commentator | ❌ | ✅ |
| AI portrait fusion / Scroll of Honor | ❌ | ✅ |
| Online multiplayer across devices | ❌ | ✅ |

In short: **static mode is for local gameplay and testing**, while **server mode unlocks the AI and internet features**.
簡單來說：**靜態模式適合本地遊玩與測試**；**伺服器模式才會啟用 AI 與跨網路功能**。

## 🧪 Local Testing & Mobile Development | 本地測試與行動端開發

To test the AR Game on a mobile device via a local network, you must use **HTTPS** for camera access. The unified Node.js server (`server.js`) natively serves the static web pages and handles WebRTC signaling out-of-the-box on port **`3443`**!
若要在本地網絡透過行動裝置測試 AR 遊戲，必須使用 **HTTPS** 才能啟用相機。一體化的 Node.js 伺服器 (`server.js`) 已原生在埠 **`3443`** 上以 HTTPS 模式託管所有網頁與信令服務，無須再手動使用額外腳本！

1. **Access on Phone | 行動端存取**:
   - Find your PC's local IP (e.g., `192.168.1.x`).
   - Open **`https://<YOUR_IP>:3443`** on your phone.
   - Click "Advanced" -> "Proceed" to bypass the self-signed certificate warning.
   - 在手機上開啟 **`https://<您的IP>:3443`**。
   - 點擊「進階」->「繼續前往」以跳過自我簽署憑證警告。

2. 在網頁瀏覽器中開啟遊戲。
4. 在設置面板中輸入您的機器人 API 端點。
5. 輸入您的加密會話密鑰 (Session Key)。
6. 點擊「保存設置」(Save Settings)。
7. 結下手印即可開始！

## ⚔️ Battle Mode | 對戰模式

The game supports two types of multi-monitor setup for professional battles:
遊戲支援兩種專業對戰設定：

### 1. Local Mode (Same Browser) | 本地模式 (同網覽器)
**No server required.** Uses `BroadcastChannel` for instant local synchronization.
**無須伺服器。** 使用 `BroadcastChannel` 實現本地即時同步。

- **Setup**: Open `index.html?role=player1`, `index.html?role=player2`, and `battle.html` as tabs in the same browser.
- **What still works**: battle flow, score sync, local viewer, pause/resume, synchronized match control.
- **仍可使用功能**：對戰流程、分數同步、本地觀戰畫面、暫停/恢復、同步比賽控制。
- **What is intentionally missing**: AI commentator APIs, webcam upload, AI portrait generation, and internet multiplayer.
- **刻意缺少的功能**：AI 解說 API、相機上傳、AI 人像生成，以及跨網路多人模式。

### 2. Online Mode (Internet) | 線上模式 (網際網路)
**Supports different devices/networks.** Uses a Node.js + Socket.io backend as a signaling switchboard.
**支援跨裝置與跨網絡。** 使用 Node.js + Socket.io 後端作為信令交換機。

- **Setup**:
  1. Start the backend server (see [Docker Setup](#-docker-setup)).
  2. **Open the Viewer (`battle.html`) FIRST**, and select **ONLINE** mode. It will show a **Room Code** (Default: `BTL1`).
  3. **Open the players' screens (`index.html`) SECOND/THIRD**. Go to Settings, select **ONLINE** mode, enter the Room Code, and click **JOIN**.
- **P2P Privacy**: Video streams travel **directly between devices (Peer-to-Peer)** via WebRTC. The server only handles small text signals (scores/triggers) and never sees your camera.

> [!IMPORTANT]
> **Browser Opening Order Rule (Crucial for Battle Sync)**  
> Always load the **Spectator/Battle Viewer (`battle.html`) FIRST**, and then open the **Players (`index.html`) SECOND/THIRD**.  
> This ensures that the room state is cleanly initialized as unstarted (`hasMatchStarted = false`). If player trackers are opened first, lingering previous sessions or early state sync frames can trigger a premature game-start state on load.  
> 
> **瀏覽器開啟順序規則（對戰同步之關鍵）**  
> 務必**先開啟觀戰/仲裁畫面（`battle.html`）**，隨後**再開啟兩位玩家畫面（`index.html`）**。  
> 如此可確保對戰狀態在開始前被完全初始為「未開始」狀態（`hasMatchStarted = false`）。若先開啟玩家畫面，瀏覽器中快取的舊對戰工作階段或初期傳送的狀態封包可能會導致載入時自動判定為開始，因而提早啟動。

## Settings Ownership Rules | 設定歸屬規則

The game has **2 player screens** (`index.html`) and **1 battle viewer** (`battle.html`). The simplest rule is:
遊戲有 **2 個玩家畫面**（`index.html`）以及 **1 個觀戰 / 仲裁畫面**（`battle.html`）。最簡單的規則如下：

- **Player settings belong to one device only**: camera source, player role, local robot/API preferences.
- **玩家設定只屬於單一裝置**：相機來源、玩家角色、本機機器人/API 偏好。
- **Battle settings belong to the whole match**: countdown, scoring/grace window, synced gesture mode, commentator behavior, battle layout.
- **對戰設定屬於整場比賽**：倒數、計分/緩衝視窗、同步手勢模式、AI 解說行為、觀戰版面配置。

### Recommended Ownership | 建議歸屬

| Screen | Owns these settings |
| :-- | :-- |
| `index.html` (Player 1 / Player 2) | camera source, role, local API endpoint/session key, local playback preference |
| `battle.html` (Battle Viewer) | network mode, room code, countdown, difficulty, technique count, score grace, synced gesture mode, commentator language/voice/webcam/image policy, AI portrait controls |

> **Important | 重要**  
> In the current implementation, some values are still persisted with shared `localStorage` keys, so same-browser tabs may still share a few settings. The intended documentation rule is nevertheless: **device settings on player screens, match settings on battle screen**.  
> 目前實作中仍有部分設定透過共用的 `localStorage` key 保存，因此同一瀏覽器分頁之間仍可能共享某些值；但文件上的設計原則仍應視為：**裝置設定放玩家畫面，對戰設定放 battle 畫面**。

---

## 🟢 Native Node.js Setup | 本地 Node.js 啟動

If you do not wish to use Docker, you can run the game server directly using Node.js. In this mode, the server dynamically reads your credentials directly from `~/.openclaw/openclaw.json` natively.

若您不想使用 Docker，也可以直接使用 Node.js 運行遊戲伺服器。在此模式下，伺服器會自動從本地的 `~/.openclaw/openclaw.json` 中動態讀取憑證與埠號。

1. **Install Dependencies | 安裝依賴套件**:
   ```bash
   npm install
   ```
2. **Start the Server | 啟動伺服器**:
   ```bash
   node server.js
   ```
   - The server will dynamically load your OpenClaw configuration and start in HTTPS mode if SSL certificates (`key.pem` and `cert.pem`) are present, or fallback to HTTP.
   - 伺服器會自動載入 OpenClaw 配置，且若本地存在 SSL 憑證 (`key.pem` 與 `cert.pem`)，將自動以 HTTPS 模式啟動，否則將自動降級至 HTTP 啟動。

---

## 🐳 Docker Setup | Docker 設定

To enable Online Multiplayer, you can easily run the signaling server using Docker:
若要啟用線上對戰，您可以使用 Docker 輕鬆運行信令伺服器：

1. **Build & Start | 建構與啟動**:
   ```bash
   docker-compose up --build -d
   ```
2. **Access | 存取**:
   - The server runs on **HTTPS** port **3443** (Required for webcam access).
   - Open **`https://<YOUR_IP>:3443`** in your browsers.
   - 伺服器運行於 **HTTPS** 埠 **3443**（相機存取必備）。

---

## ☁️ Google Cloud Run Deployment | Google Cloud Run 部署

This application is ready for deployment on **Google Cloud Run**.
本應用程式已準備好部署於 **Google Cloud Run**：

1. **Prerequisites | 準備工作**:
   - Install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install).
   - Create a project on Google Cloud Console.

2. **Deploy | 部署**:
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

   > **Note**: The scripts default to the **Hong Kong** region (`asia-east2`). To use a different region, simply edit the `REGION` variable in `deploy.sh` and `undeploy.sh`.
   > **注意**：腳本預設部署於**香港**區域 (`asia-east2`)。若需使用其他區域，請直接修改 `deploy.sh` 與 `undeploy.sh` 中的 `REGION` 變數。

3. **Undeploy | 卸載**:
   ```bash
   chmod +x undeploy.sh
   ./undeploy.sh
   ```

### Public Access Setup | 公共存取設定
If you encounter a **403 Forbidden** error after deployment, you must manually grant public access in the Google Cloud Console:
若部署後遇到 **403 Forbidden** 錯誤，您必須在 Google Cloud 控制台中手動授權公共存取：

1.  Go to the [Cloud Run Console](https://console.cloud.google.com/run).
2.  Select your service (`domain-expansion-ar`).
3.  Click the **"Security"** tab or look for the **"Permissions"** panel.
4.  Click **"ALLOW UNAUTHENTICATED"** (or "Allow public access") at the top.
5.  If this is blocked by policy, see the "Domain Restricted Sharing" note below.

1.  前往 [Cloud Run 控制台](https://console.cloud.google.com/run)。
2.  選擇您的服務 (`domain-expansion-ar`)。
3.  點擊 **「安全性」** 標籤或尋找 **「權限」** 面板。
4.  點擊頂部的 **「允許未經身分驗證」** (或「允許公共存取」)。
5.  若受政策阻擋，請參閱下方的「網域限制共用」說明。

### Important Cloud Run Notes | 重要注意事項
- **SSL Termination**: Cloud Run handles HTTPS automatically at the edge. The container is configured to switch to HTTP internally when deployed there.
- **Session Affinity**: The `--session-affinity` flag is **required** for Socket.io to maintain stable connections between your device and the signaling server.
- **Port**: The application respects the `$PORT` environment variable (defaulting to 8080 on Cloud Run).


---

## 🎙️ JJK AI Commentator & OpenClaw Integration | 咒術 AI 旁白與 OpenClaw 整合

The game supports a **direct, push-based JJK AI Commentator** integrated natively with your local **OpenClaw Gateway**.

遊戲支援與本地 **OpenClaw 網關** 整合的 **直接、基於推送之咒術 AI 旁白** 技術。

> **Requirement | 前提條件**  
> This feature is part of the **server / API-enabled mode**. In pure static local mode, the battle still runs, but commentator API calls, snapshot upload, and portrait generation are unavailable.  
> 此功能屬於**啟用伺服器 / API 的模式**。若使用純靜態本地模式，對戰仍可運作，但解說 API、快照上傳與 AI 人像生成將不可用。

- **Event-Driven Commentary**: Fired instantly on techniques (`/api/live-status`) or end match (`/api/battle-result`) with zero polling.
- **事件驅動旁白**: 在施展術式或對戰結束時即時觸發，完全無須輪詢。
- **Multimodal AI Vision**: Player clients upload compressed camera snapshots on-demand at key checkpoints (match start/end), giving the commentator concurrent visual context of both P1 and P2 synchronously while saving resources.
- **多模態 AI 視覺**: 玩家端在關鍵對局節點（開局與結算）按需上傳壓縮相機快照，讓解說員能同時擁有 P1 與 P2 的現場視覺畫面，同時極大節省運行效能與頻寬。
- **Interactive Battle Controls**: The OpenClaw agent can trigger a battle automatically by outputting a custom `[start_battle]` tag.
- **互動對戰控制**: OpenClaw 代理可以透過在對話中輸出 `[start_battle]` 標籤，自動為玩家發起對戰。

👉 **For deep architectural and technical design details, please refer to [docs/openclaw_integration.md](docs/openclaw_integration.md).**
👉 **若需查看完整的系統架構與深度的技術設計細節，請參閱 [docs/openclaw_integration.md](docs/openclaw_integration.md)。**

---

## 📐 Architecture Design | 架構設計

### System Overview | 系統概覽
```mermaid
graph TD
    subgraph "Online Mode (Different Devices/Networks)"
        P1[Player 1 Device]
        P2[Player 2 Device]
        BV[Battle Viewer / Host]
        NodeServer[Signaling Server<br/>Node.js + Socket.io]
        
        P1 <-->|JSON Signaling| NodeServer
        P2 <-->|JSON Signaling| NodeServer
        BV <-->|JSON Signaling| NodeServer
        
        P1 ====|WebRTC P2P Video + VFX|====> BV
        P2 ====|WebRTC P2P Video + VFX|====> BV
    end

    subgraph "Local Mode (Same Browser Tabs)"
        L_P1[Player 1 Tab]
        L_P2[Player 2 Tab]
        L_BV[Battle Viewer Tab]
        BC[BroadcastChannel API]
        
        L_P1 <--> BC
        L_P2 <--> BC
        L_BV <--> BC
        
        L_P1 ====|WebRTC P2P Video|====> L_BV
        L_P2 ====|WebRTC P2P Video|====> L_BV
    end

    style NodeServer fill:#f9f,stroke:#333,stroke-width:2px
    style BC fill:#bbf,stroke:#333,stroke-width:2px
```

### Dual-Transport Signaling | 雙傳輸信令系統
The game uses a **decoupled signaling architecture** that switches transports dynamically based on your settings:
遊戲採用**解耦信令架構**，根據設定動態切換傳輸方式：

1.  **Transport A: `BroadcastChannel`**: Used for Local mode. It provides zero-latency communication within the same browser context without touching any network infrastructure.
2.  **Transport B: `Socket.io (WebSockets)`**: Used for Online mode. It acts as a "matchmaker" to introduce devices across the internet, allowing them to perform a WebRTC handshake.

### WebRTC P2P Video | WebRTC 點對點影像
The most data-intensive part—the high-definition webcam and VFX stream—uses **WebRTC Peer-to-Peer** technology.
影像傳輸最密集的部（高畫質相機與特效流）採用 **WebRTC P2P** 技術：

- **Low Latency**: Streams bypass the server entirely, flowing directly from Player -> Viewer.
- **Privacy & Cost**: No video data is processed or stored on the server, ensuring privacy and allowing the server to handle hundreds of concurrent matches with minimal CPU usage.

### Score & Logic Sync | 分數與邏輯同步
The "Battle Viewer" acts as the **Match Authority**. Players broadcast their state (score, remaining time, current technique) multiple times per second. The Viewer uses this data to decide early-win conditions and trigger synchronized global cinematic videos.
「觀眾席」充當**比賽仲裁**。玩家每秒多次廣播狀態（分數、剩餘時間、當前術式）。觀眾席根據這些數據判定提前勝出條件，並觸發同步的電影級結算影片。

## 🖐️ Hand Gesture Guide | 手勢指南

### Domain Expansions | 領域展開

| User                 | Domain Name           | Gesture                   | Robot Behavior                                               | 角色         | 領域名稱         | 手印                      | 機器人行為                          |
| :------------------- | :-------------------- | :------------------------ | :----------------------------------------------------------- | :----------- | :--------------- | :------------------------ | :---------------------------------- |
| **Gojo Satoru**      | **Unlimited Void**    | **(1H)** Crossed fingers  | **Ascension**: Rhythmic focus with background image.         | **五條悟**   | **無量空處**     | **(單手)** 交叉食指與中指 | **升天**: 節奏性扭動並顯示背景圖。  |
| **Sukuna**           | **Malevolent Shrine** | **(2H)** Claw hands       | **Desolation**: Sharp strikes with background image.         | **兩面宿儺** | **伏魔御廚子**   | **(雙手)** 合十且手指如爪 | **荒蕪**: 尖銳打擊並顯示背景圖。    |
| **Mahito**           | **Self-Embodiment**   | **(2H)** Egg shape        | **Mutation**: Direct strike with background image.           | **真人**     | **自閉圓頓裹**   | **(雙手)** 拇指小指相觸   | **突變**: 直接打擊並顯示背景圖。    |
| **Yuta Okkotsu**     | **Authentic Love**    | **(2H)** Wide apart       | **Embrace**: Bow with Rika background image.                 | **乙骨憂太** | **真贋相愛**     | **(雙手)** 雙手拉開       | **擁抱**: 鞠躬並顯示里香背景圖。    |
| **Hakari Kinji**     | **Idle Death Gamble** | **(2H)** Vertical stack   | **Jackpot**: Upbeat waving with background image.            | **秤金次**   | **坐殺博徒**     | **(雙手)** 垂直疊放       | **大獎**: 歡快揮手並顯示背景圖。    |
| **Megumi Fushiguro** | **Chimera Garden**    | **(2H)** Two fists        | **Submerge**: Shadow strength with background image.         | **伏黑惠**   | **嵌合暗翳庭園** | **(雙手)** 雙拳併攏       | **下沉**: 影之力量並顯示背景圖。    |
| **Naoya Zenin**      | **Time Cell Palace**  | **(2H)** L-shape hands    | **Projection**: Frame-by-frame strike with background image. | **禪院直哉** | **時胞月宮殿**   | **(雙手)** 雙手呈 L 型    | **投射**: 影格打擊並顯示背景圖。    |
| **Yuji Itadori**     | **Unnamed Domain**    | **(2H)** Pointing fingers | **Physical Mastery**: Sit-ups (Sit ups).                     | **虎杖悠仁** | **名稱不明**     | **(雙手)** 食指相對       | **肉體巔峰**: 仰臥起坐 (仰臥起坐)。 |

### Techniques | 術式

| Technique         | Japanese       | Gesture              | Robot Behavior                           | 術式名稱   | 日文           | 手印                | 機器人行為               |
| :---------------- | :------------- | :------------------- | :--------------------------------------- | :--------- | :------------- | :------------------ | :----------------------- |
| **Lapse Blue**    | 術式順轉「苍」 | **(1H)** Index Point | **Attraction**: Left hand upward strike. | **「蒼」** | 術式順轉「苍」 | **(單手)** 食指指點 | **吸引**: 左手向上打擊。 |
| **Reversal Red**  | 術式反轉「赫」 | **(1H)** Open Palm   | **Repulsion**: Right hand upward strike. | **「赫」** | 術式反轉「赫」 | **(單手)** 手掌張開 | **排斥**: 右手向上打擊。 |
| **Hollow Purple** | 虚式「茈」     | **(2H)** Blue + Red  | **Total Purge**: 2-hand expansion blast. | **「茈」** | 虚式「茈」     | **(雙手)** 組合手勢 | **肅清**: 雙手擴張衝擊。 |

---

## 🛠️ Technology & Hand Tracking | 技術與手勢追蹤

This standalone AR game uses **MediaPipe Hands** by Google for high-fidelity hand tracking without needing a heavy backend.
這款獨立的 AR 遊戲使用 Google 的 **MediaPipe Hands** 技術，實現高精度的手部追蹤，無須繁重的後端處理。

1.  **Landmark Detection | 關鍵點檢測**: Tracks **21 3D landmarks** per hand in real-time.
    即時追蹤每隻手的 **21 個 3D 關鍵點**。
2.  **Geometric Logic | 幾何邏輯**: Analyzes finger extension and inter-hand proximity to identify signature "Domain Expansion" hand signs.
    分析手指伸展度和雙手間的距離，以識別標誌性的「領域展開」手印。
3.  **Cross-Platform | 跨平台**: Optimized for both Desktop and Mobile browsers (Chrome/Safari/iOS/Android).
    針對桌面與行動網覽器（Chrome/Safari/iOS/Android）進行了優化。

---

## ⚖️ Copyright Disclaimer | 版權聲明

This project is a **non-commercial, fan-made application** created for educational purposes. All rights to **"Jujutsu Kaisen"** (characters, logos, terminology) belong to **Gege Akutami**, **Shueisha**, and **MAPPA**. No copyright infringement is intended.
本專案為**非商業性質的愛好者作品**，僅供教學用途。《術式迴戰》的所有權利（包括角色、標誌及相關術語）均歸原作者**芥見下下**、**集英社**及 **MAPPA** 所有。本專案無意侵犯版權。

---

## 🎓 Development Team | 開發團隊

This project was developed by the **Higher Diploma in Cloud and Data Centre Administration (IT114115)** program at **HKIIT**. Our curriculum empowers students to master cloud infrastructure, DevOps, and innovative AI integrations.

本專案由 **HKIIT** 的**雲端系統及數據中心管理高級文憑 (IT114115)** 課程團隊開發。本課程致力於培訓學生掌握雲端架構、DevOps 以及創新的 AI 技術應用。

🔗 **Explore our program (English): [IT114115 - Higher Diploma in Cloud and Data Centre Administration](https://hkiit.edu.hk/our-programmes?our-programmes=it114115-higher-diploma-in-cloud-and-data-centre-administration)**

🔗 **了解更多課程資訊 (繁體中文): [IT114115 - 雲端系統及數據中心管理高級文憑](https://hkiit.edu.hk/zh-hant/our-programmes?our-programmes=it114115-higher-diploma-in-cloud-and-data-centre-administration)**

---

## Credits | 致謝

Based on the logic and models from:
本專案建基於以下專案的邏輯與模型：

- [Humanoid Robot Simulator](https://github.com/wongcyrus/humanoid-robot-simulator)
- [JJK Domain Expansion (TheAgencyMGE)](https://github.com/TheAgencyMGE/JJKDomainExpansion)
- [Domain Expansion (montasirmoyen)](https://github.com/montasirmoyen/domain-expansion)
