# 🎙️ AI Commentary System Architecture

This document describes the technical implementation and synchronization logic of the **AI Commentary System** in the Domain Expansion AR Game.

---

## 🛠️ Resilient Audio Playback Logic

To ensure a smooth and synchronized experience across all spectator and player devices, the system implements a multi-layered "Wait and Fallback" mechanism for handling external audio (like AWS Polly).

### 1. The Playback Lifecycle
When the game receives a commentary payload with an `audioUrl`:

1.  **Source Loading**: The URL is assigned to the `Audio` element, and `audio.load()` is called to begin background buffering.
2.  **Startup Safety (4s)**: A `startupTimeout` is initiated. If the browser fails to start playing the audio within **4 seconds** (e.g., due to a slow network or server delay), the system automatically triggers a **Fallback to Browser TTS** (local computer voice) to prevent the game flow from stalling.
3.  **Active Playback**: Once the audio successfully starts playing, the browser's `onplay` event is fired.
4.  **Dynamic Duration Detection**: Upon playing, the system reads the **actual audio duration** from the file's metadata. This ensures the wait time is accurate to the millisecond, accounting for the variable length of AI-generated speech.
5.  **Completion Safety (5s Buffer)**: A safety window is calculated as `Actual Duration + 5 Seconds`. If the audio stream gets stuck or the `onended` event fails to fire naturally, this timeout forcefully clears the playback state.
6.  **Natural Completion**: In standard conditions, the system relies on the `onended` event to resolve the playback promise with zero latency, immediately proceeding to the next game state (like a match countdown).

---

## 🔄 Backend Integration Options

The commentary system is backend-agnostic and can receive instructions from multiple sources:

### A. AWS API Gateway Proxy
When the `awsApiEndpoint` is configured, the game server forwards status updates to a dedicated AWS REST API. This path typically returns high-fidelity **AWS Polly** MP3 URLs.

### B. OpenClaw Gateway
In the local OpenClaw path, the game server delegates the "Soul and Persona" logic to a local agent. While currently defaulting to Browser TTS, this path can also be extended to return external audio links.

---

## 🔊 Synchronization & Muting

*   **Simulated Delay**: If the user sets the volume to `0%` (Muted), the system still calculates the estimated speaking time and **simulates the delay**. This ensures that the "Game Start" timing remains identical for everyone, even if one spectator has their sound turned off.
*   **Debouncing**: When multiple events happen simultaneously (e.g., both players score at once), the system bundles the commentary into a single cohesive message rather than overlapping multiple audio tracks.
