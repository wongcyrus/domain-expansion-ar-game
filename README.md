# Domain Expansion AR Game | 領域展開 AR 遊戲

A standalone AR experience for triggering Domain Expansions and Techniques using hand gestures.
一款用於觸發手勢控制「領域展開」與「術式」的獨立 AR 體驗遊戲。

## Features | 功能

- **No WebSocket Required**: Operates via standalone HTTP API requests.
- **無須 WebSocket**: 透過獨立的 HTTP API 請求運行。
- **Configurable Endpoint**: Save your Robot API URL locally.
- **可配置端點**: 在本地保存您的機器人 API 網址。
- **High-Quality VFX**: Full particle and atmospheric effects included.
- **高畫質視覺效果**: 包含完整的粒子與環境特效。
- **Hand-Centered Interaction**: Techniques follow your hand movements.
- **以手部為中心的互動**: 術式效果會跟隨您的手部動作。

## Setup | 設定

1. Open `index.html` in a web browser.
2. Enter your Robot API endpoint in the Settings Panel.
3. Enter your encrypted session key.
4. Click "Save Settings".
5. Strike a hand sign to start!

1. 在網覽器中開啟 `index.html`。
2. 在設置面板中輸入您的機器人 API 端點。
3. 輸入您的加密會話密鑰 (Session Key)。
4. 點擊「保存設置」(Save Settings)。
5. 結下手印即可開始！

## 🖐️ Hand Gesture Guide | 手勢指南

[![Domain Expansion Demo](https://img.youtube.com/vi/Tck6WSV_YXQ/0.jpg)](https://www.youtube.com/watch?v=Tck6WSV_YXQ)

### 🎮 [Play the Game Now | 立即開始遊戲](https://wongcyrus.github.io/domain-expansion-ar-game/)

### Domain Expansions | 領域展開

| User | Domain Name | Gesture | Robot Behavior | 角色 | 領域名稱 | 手印 | 機器人行為 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Gojo Satoru** | **Unlimited Void** | **(1H)** Crossed fingers | **Ascension**: Rhythmic focus (Twist). | **五條悟** | **無量空處** | **(單手)** 交叉食指與中指 | **升天**: 節奏性扭動。 |
| **Sukuna** | **Malevolent Shrine** | **(2H)** Claw hands | **Desolation**: Sharp strikes (Kung Fu). | **兩面宿儺** | **伏魔御廚子** | **(雙手)** 合十且手指如爪 | **荒蕪**: 尖銳打擊 (功夫)。 |
| **Mahito** | **Self-Embodiment** | **(2H)** Egg shape | **Mutation**: Direct strike (Right Shot). | **真人** | **自閉圓頓裹** | **(雙手)** 拇指小指相觸 | **突變**: 直接打擊 (右衝)。 |
| **Yuta Okkotsu** | **Authentic Love** | **(2H)** Wide apart | **Embrace**: A respectful bow (Bow). | **乙骨憂太** | **真贋相愛** | **(雙手)** 雙手拉開 | **擁抱**: 莊重的鞠躬。 |
| **Hakari Kinji** | **Idle Death Gamble** | **(2H)** Vertical stack | **Jackpot**: Upbeat waving (Wave). | **秤金次** | **坐殺博徒** | **(雙手)** 垂直疊放 | **大獎**: 歡快揮手。 |
| **Megumi Fushiguro** | **Chimera Garden** | **(2H)** Two fists | **Submerge**: Shadow strength (Weightlifting). | **伏黑惠** | **嵌合暗翳庭園** | **(雙手)** 雙拳併攏 | **下沉**: 影之力量 (舉重)。 |
| **Naoya Zenin** | **Time Cell Palace** | **(2H)** L-shape hands | **Projection**: Frame-by-frame strike (Left Shot). | **禪院直哉** | **時胞月宮殿** | **(雙手)** 雙手呈 L 型 | **投射**: 影格打擊 (左衝)。 |
| **Yuji Itadori** | **Unnamed Domain** | **(2H)** Pointing fingers | **Physical Mastery**: Sit-ups (Sit ups). | **虎杖悠仁** | **名稱不明** | **(雙手)** 食指相對 | **肉體巔峰**: 仰臥起坐 (仰臥起坐)。 |

### Techniques | 術式

| Technique | Japanese | Gesture | Robot Behavior | 術式名稱 | 日文 | 手印 | 機器人行為 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Lapse Blue** | 術式順轉「苍」 | **(1H)** Index Point | **Attraction**: Left hand strike. | **「蒼」** | 術式順轉「苍」 | **(單手)** 食指指點 | **吸引**: 左手快速打擊。 |
| **Reversal Red** | 術式反轉「赫」 | **(1H)** Open Palm | **Repulsion**: Right hand upward strike. | **「赫」** | 術式反轉「赫」 | **(單手)** 手掌張開 | **排斥**: 右手向上打擊。 |
| **Hollow Purple** | 虚式「茈」 | **(2H)** Blue + Red | **Total Purge**: 2-hand expansion blast. | **「茈」** | 虚式「茈」 | **(雙手)** 組合手勢 | **肅清**: 雙手擴張衝擊。 |

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

## Credits | 致謝

Based on the logic and models from:
本專案建基於以下專案的邏輯與模型：
- [Humanoid Robot Simulator](https://github.com/wongcyrus/humanoid-robot-simulator)
- [JJK Domain Expansion (TheAgencyMGE)](https://github.com/TheAgencyMGE/JJKDomainExpansion)
- [Domain Expansion (montasirmoyen)](https://github.com/montasirmoyen/domain-expansion)
