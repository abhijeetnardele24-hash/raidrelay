# RaidRelay — Real-Twitch Video Recording & Verification Checklist

**Project:** RaidRelay  
**Hackathon:** Codex x TwitchCon Hackathon 2026  
**Codex Session ID:** `93a16a2b-a2a0-461f-851b-7a1e342fe97f`  
**Video Requirement:** Maximum 3:00 minute MP4 video uploaded to YouTube with **Public** visibility.

---

## 1. Pre-Flight Setup & Environment Configuration

Before recording, ensure local environment variables are populated in `.env`:

```env
NODE_ENV=development
PORT=4000
HOST=127.0.0.1
APP_BASE_URL=http://localhost:4000
SESSION_SECRET=<YOUR_SECURE_32_CHAR_SESSION_SECRET>
HMAC_VOTER_SALT=<YOUR_SECURE_32_CHAR_HMAC_SALT>
TWITCH_CLIENT_ID=<YOUR_TWITCH_APP_CLIENT_ID>
TWITCH_CLIENT_SECRET=<YOUR_TWITCH_APP_CLIENT_SECRET>
TWITCH_REDIRECT_URI=http://localhost:4000/auth/twitch/callback
RAIDRELAY_CODEX_SESSION_ID=93a16a2b-a2a0-461f-851b-7a1e342fe97f
```

---

## 2. Seven Essential On-Screen Evidence Beats

To qualify for stage-one judging and win the technical implementation criteria, the demo video must clearly record the following beats:

### Beat 1: Broadcaster OAuth Connection
- [ ] Open [`http://localhost:4000/console`](http://localhost:4000/console).
- [ ] Click **"Connect Twitch Account"**.
- [ ] Complete Twitch OAuth consent screen (`user:read:chat`, `user:write:chat`).
- [ ] Redirect back to `/console?connected=true`.
- [ ] Verify broadcaster avatar, display name, and session cookie are active.

### Beat 2: EventSub LIVE_READY & Accepted Subscriptions
- [ ] Inspect console status badge or probe `http://localhost:4000/api/health`.
- [ ] Confirm EventSub WebSocket status transitions to **`LIVE_READY`**.
- [ ] Confirm accepted subscriptions list contains:
  1. `channel.raid` (v1)
  2. `channel.chat.message` (v1)

### Beat 3: OBS Studio 1080p Browser Source
- [ ] Copy private overlay URL from Broadcaster Console (`/overlay/<PRIVATE_CHANNEL_KEY>`).
- [ ] Add Browser Source in OBS Studio at **1920×1080**.
- [ ] Set Custom CSS: `body { background: transparent; overflow: hidden; margin: 0px; }`.
- [ ] Confirm overlay is completely transparent with zero leaked keys or scrollbars.

### Beat 4: Incoming Raid & 5-Phase Ritual Progression
- [ ] Trigger or receive an incoming Twitch raid.
- [ ] **Phase 1: Landing (4s):** Both streamers' avatars and community colors collide with live raider headcount.
- [ ] **Phase 2: Context (6s):** Streamer's pre-configured Now Card displays live activity, stakes, and community norm.
- [ ] **Phase 3: Voting (30s):** Live vote countdown begins.

### Beat 5: Real Twitch Chat Voting
- [ ] In the live Twitch broadcast chat window, type `!relay A` and `!relay B` from real Twitch accounts.
- [ ] Show real-time vote meter update on the 1080p overlay as chat votes are received.
- [ ] Note that arbitrary chat text is ignored, preventing hate-raid attacks.

### Beat 6: Broadcaster Approval & Panic Clear
- [ ] On the Broadcaster Console, click **"Approve Result"** (or **"Override: Option B"**).
- [ ] Show merged **Relay Card** celebrate the joint decision and cleanly fade back to transparent idle.
- [ ] Trigger another raid and immediately click **"Panic Clear"**.
- [ ] Show the overlay blank instantly (0.2 µs mean in-memory state transition).

### Beat 7: OpenAI Codex Identity & Machine Verification
- [ ] Open terminal and show `pnpm verify` passing all 60 tests (52 Vitest + 8 Playwright E2E) with 0 errors and 0 warnings.
- [ ] Show Codex Session ID prominently: **`93a16a2b-a2a0-461f-851b-7a1e342fe97f`**.

---

## 3. YouTube Upload & Submission Finalization

1. Upload recorded video to YouTube.
2. **Title:** `RaidRelay — The First 90 Seconds After a Twitch Raid, Designed (Codex x TwitchCon 2026)`
3. **Visibility:** Set to **Public** (required by Devpost and hackathon rules; never Unlisted or Private).
4. Copy final YouTube watch URL into `docs/DEVPOST_SUBMISSION.md`.
5. Submit Devpost entry before the submission deadline.
