# RaidRelay — Hackathon Evaluation & Criteria Alignment

**Competition:** Codex x TwitchCon Hackathon 2026  
**Codex Session ID:** `93a16a2b-a2a0-461f-851b-7a1e342fe97f`  

---

## Evaluation Against the 4 Hackathon Criteria

### 1. Technological Implementation
- **Monorepo Architecture:** Clean pnpm monorepo dividing domain logic, Zod contracts, deterministic fixtures, server, and client into modular packages.
- **Twitch Developer Integration:** Implements official Twitch EventSub WebSockets (`channel.raid`, `channel.chat.message`), keepalive watchdog, seamless reconnect URL switching, and Helix chat notifications.
- **Security & Cryptography:** Zero raw chat injection on broadcast screens, HMAC-SHA256 ephemeral voter hashing enforcing `1-person = 1-vote`, tamper-evident receipt signing, CSRF origin protection, and strict CORS.
- **Test Automation:** 58 automated tests passing (14 domain unit tests, 11 EventSub tests, 7 token encryption tests, 18 server integration tests, 8 Playwright browser journeys across desktop and mobile viewports).
- **Accessibility:** 0 Axe Core automated violations across tested states.

### 2. Design & Broadcast Polish
- **Intentional Visual Identity:** Tailored broadcast-control-room aesthetic using warm amber, cyan, and emerald tokens. Avoids generic neon or dashboard templates.
- **Broadcast-Safe 1080p Layout:** Overlay designed strictly for 1920×1080 transparent rendering in OBS Studio, legible across light and dark video streams.
- **Judge Demo Lab:** Interactive split-screen evaluation workspace with a persistent `SIMULATED EVENT FEED — NOT TWITCH LIVE` disclosure banner and 10x fast-forward replay controls.
- **Responsiveness:** Full layout adaptation from 1920px broadcast viewports down to 390px mobile screens with touch-friendly navigation.

### 3. Potential Impact
- **Solves the 90-Second Raid Cliff:** Streamers and community managers frequently report severe viewer drop-off immediately following a raid due to context dissonance and lack of shared orientation.
- **Engages Both Communities:** Gives incoming raiders an immediate voice without requiring streamer interruption, turning passive drop-offs into active participants.
- **Community Safety:** Protects broadcasters against hate raids by completely refusing to display free-form chat text on screen.

### 4. Quality of Idea & Innovation
- **Rethinking the Alert Paradigm:** Moving beyond standard Twitch alert boxes (which merely show a flashing gif and text) to an interactive, synchronous, two-community game ritual.
- **Failsafe Streamer Flight Controls:** Balances viewer participation with broadcaster autonomy through real-time approvals, overrides, skips, and sub-microsecond in-memory panic clears (mean 0.2 µs).

