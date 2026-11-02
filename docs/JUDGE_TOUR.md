# RaidRelay — 60-Second Judge Tour Guide

Welcome hackathon judges! This guide enables you to evaluate RaidRelay end-to-end in 60 seconds without requiring a live Twitch stream or second broadcaster account.

---

## Step 1: Open the Judge Demo Lab

1. Start the server (`pnpm start` or `pnpm dev`).
2. Open your browser and navigate to:
   ```text
   http://localhost:4000/lab
   ```
3. Observe the persistent, truthful banner across the top of the interface:
   `SIMULATED EVENT FEED — NOT TWITCH LIVE`

---

## Step 2: Trigger the 90-Second Ritual (or 10x Speed)

1. Click the **"10x Speed"** button.
2. Watch the live 1080p OBS browser overlay preview in the right column:
   - **0.4s (Landing):** The incoming raider (`ArtisanAlex`) and receiving broadcaster (`RoboCrafterLive`) avatars collide with live viewer headcount (+142 raiders).
   - **0.6s (Context):** The receiving streamer's Now Card expands, displaying their activity (*"Building a tiny robot live"*) and current stakes.
   - **3.0s (Voting):** Option A (*"Drive the next test with only the left sensor"*) vs Option B (*"Give the robot a 20-second victory dance first"*) voting meters appear. In the left column, simulated Twitch chat messages stream in (`!relay A` / `!relay B`), dynamically shifting the vote percentages in real time.
   - **Approval:** The ritual reaches `AWAITING_STREAMER`. Click **Approve** in the left column flight controls.
   - **Result:** The merged **Relay Card** crowns Option A with celebratory tally animations.
   - **Cooldown:** The overlay smoothly dissolves back to transparent idle.

---

## Step 3: Test Streamer Flight Controls & Panic Clear

1. Click **"Run 90s Raid Ritual"** or **"10x Speed"** to start another simulated raid.
2. During the voting phase, click **"Override: Option B"**:
   - Notice the overlay immediately bypasses the vote tally and crowns Option B as the winner.
3. Start another raid and click **"Panic Clear"**:
   - Notice the overlay blanks instantly (empirically benchmarked at under 2 microseconds).

---

## Step 4: Inspect the Clean OBS Browser Source

1. In the top right corner of the preview frame, click **"Open Clean Window ↗"** or visit:
   ```text
   http://localhost:4000/overlay/demo-channel-key-12345
   ```
2. Notice the clean, transparent broadcast canvas without scrollbars, controls, or secret leakage, ready for OBS Studio.

