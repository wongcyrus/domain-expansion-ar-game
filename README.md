# Domain Expansion AR Game | 領域展開 AR 遊戲

A standalone AR experience for triggering Domain Expansions and Techniques using hand gestures.
一款用於觸發手勢控制「領域展開」與「術式」的獨立 AR 體驗遊戲。

### 🎮 [Play the Game Now | 立即開始遊戲](https://wongcyrus.github.io/domain-expansion-ar-game/)

[![Domain Expansion Demo](https://img.youtube.com/vi/Tck6WSV_YXQ/0.jpg)](https://www.youtube.com/watch?v=Tck6WSV_YXQ)

## Features | 功能

- **Mini-Game Mode**: Challenge yourself to perform gestures within a time limit and score points!
- **迷你遊戲模式**: 在限時內挑戰完成手勢並獲取分數！
- **No WebSocket Required**: Operates via standalone HTTP API requests.
- **無須 WebSocket**: 透過獨立的 HTTP API 請求運行。
- **Configurable Endpoint**: Save your Robot API URL locally.
- **可配置端點**: 在本地保存您的機器人 API 網址。
- **High-Quality VFX**: Full particle and atmospheric effects included.
- **高畫質視覺效果**: 包含完整的粒子與環境特效。
- **Hand-Centered Interaction**: Techniques follow your hand movements.
- **以手部為中心的互動**: 術式效果會跟隨您的手部動作。
- **Battle Mode (Multi-Monitor)**: Play with a friend on two monitors and a 3rd monitor for the audience view.
- **對戰模式 (多螢幕支援)**: 與朋友在兩個螢幕上對戰，並有第三個螢幕作為觀眾視角。

## Setup | 設定

1. Open `index.html` in a web browser.
2. Enter your Robot API endpoint in the Settings Panel.
3. Enter your encrypted session key.
4. Click "Save Settings".
5. Strike a hand sign to start!

## 🧪 Local Testing & Mobile Development | 本地測試與行動端開發

To test the AR Game on a mobile device via a local network, you must use **HTTPS** for camera access. We provide a convenient script for this:
若要在本地網絡透過行動裝置測試 AR 遊戲，必須使用 **HTTPS** 才能啟用相機。我們提供了一個便捷的腳本：

1. **Start HTTPS Server | 啟動 HTTPS 伺服器**:
   ```bash
   python3 serve_https.py
   ```
2. **Access on Phone | 行動端存取**:
   - Find your PC's local IP (e.g., `192.168.1.x`).
   - Open **`https://<YOUR_IP>:8443`** on your phone.
   - Click "Advanced" -> "Proceed" to bypass the self-signed certificate warning.
   - 在手機上開啟 **`https://<您的IP>:8443`**。
   - 點擊「進階」->「繼續前往」以跳過自我簽署憑證警告。

3. 在網覽器中開啟 `index.html`。
4. 在設置面板中輸入您的機器人 API 端點。
5. 輸入您的加密會話密鑰 (Session Key)。
6. 點擊「保存設置」(Save Settings)。
7. 結下手印即可開始！

## ⚔️ Battle Mode | 對戰模式

The game now supports a professional 3-monitor "Battle Setup" without any backend server.
遊戲現已支援專業的三螢幕「對戰設定」，無須任何後端伺服器：

1.  **Monitor 1 (Player 1)**: Open `index.html?role=player1`.
    **螢幕 1 (玩家 1)**: 開啟 `index.html?role=player1`。
2.  **Monitor 2 (Player 2)**: Open `index.html?role=player2`.
    **螢幕 2 (玩家 2)**: 開啟 `index.html?role=player2`。
3.  **Monitor 3 (Viewer)**: Open `battle.html`.
    **螢幕 3 (觀眾席)**: 開啟 `battle.html`。

### Features | 功能
- **Pure Client-Side**: Uses WebRTC and `BroadcastChannel` for instant local synchronization.
- **純前端運作**: 使用 WebRTC 與 `BroadcastChannel` 實現即時本地同步。
- **Synchronized Match Control**: Start the game for both players simultaneously with a visual countdown.
- **同步比賽控制**: 具備視覺化倒數功能，能同時為兩位玩家啟動遊戲。
- **Cinematic Results**: Celebratory win videos (with sound) play for "Perfect Victories" (Score 10/10).
- **電影級結算**: 「完美勝出」(得分 10/10) 時會播放帶有音效的勝利慶祝影片。
- **Customizable Rules**: Adjust countdown, difficulty, and technique counts via the viewer's settings panel.
- **自定義規則**: 可透過觀眾席設定面板調整倒數、難度及回合手勢數量。

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

This project was developed by the **Higher Diploma in Cloud and Data Centre Administration (IT114115)** program at **HKIIT**. Our curriculum empowers students to master cloud infrastructure, DevOps, and innovative Ai integrations.

本專案由 **HKIIT** 的**雲端系統及數據中心管理高級文憑 (IT114115)** 課程團隊開發。本課程致力於培訓學生掌握雲端架構、DevOps 以及創新的 Ai 技術應用。

🔗 **Explore our program (English): [IT114115 - Higher Diploma in Cloud and Data Centre Administration](https://hkiit.edu.hk/our-programmes?our-programmes=it114115-higher-diploma-in-cloud-and-data-centre-administration)**

🔗 **了解更多課程資訊 (繁體中文): [IT114115 - 雲端系統及數據中心管理高級文憑](https://hkiit.edu.hk/zh-hant/our-programmes?our-programmes=it114115-higher-diploma-in-cloud-and-data-centre-administration)**

---

## Credits | 致謝

Based on the logic and models from:
本專案建基於以下專案的邏輯與模型：

- [Humanoid Robot Simulator](https://github.com/wongcyrus/humanoid-robot-simulator)
- [JJK Domain Expansion (TheAgencyMGE)](https://github.com/TheAgencyMGE/JJKDomainExpansion)
- [Domain Expansion (montasirmoyen)](https://github.com/montasirmoyen/domain-expansion)
