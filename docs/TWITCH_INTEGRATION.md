# RaidRelay — Twitch Developer Integration Guide

This document provides complete instructions for connecting RaidRelay to the Twitch Developer Platform.

---

## 1. Twitch Developer Application Setup

1. Log into the [Twitch Developer Console](https://dev.twitch.tv/console).
2. Click **Register Your Application**.
3. Fill out the application details:
   - **Name:** `RaidRelay Broadcast Companion`
   - **OAuth Redirect URLs:** `http://localhost:4000/auth/twitch/callback` (or your production domain)
   - **Category:** `Application Integration` or `Broadcast Utility`
   - **Client Type:** `Confidential`
4. Click **Create**.
5. Copy your **Client ID** and generate a new **Client Secret**.

---

## 2. Environment Configuration

Copy `.env.example` to `.env` in the repository root:

```bash
cp .env.example .env
```

Configure your Twitch credentials:

```ini
PORT=4000
HOST=127.0.0.1
NODE_ENV=production
APP_BASE_URL=http://localhost:4000

# Twitch Developer Credentials
TWITCH_CLIENT_ID=your_twitch_client_id_here
TWITCH_CLIENT_SECRET=your_twitch_client_secret_here
TWITCH_REDIRECT_URI=http://localhost:4000/auth/twitch/callback

# Security & Encryption Salts
SESSION_SECRET=a_random_64_character_hex_string_here
HMAC_VOTER_SALT=another_random_64_character_hex_string_here
```

---

## 3. OAuth 2.0 Authorization Code Flow

RaidRelay implements Twitch OAuth 2.0 with CSRF state protection:

1. **Authorization Request:** Streamer clicks **Connect with Twitch** in the Broadcaster Console (`/console`).
   - Browser navigates to `GET /auth/twitch/start`.
   - Server generates a cryptographically random `state` token, sets an HTTP-only secure cookie, and redirects to:
     ```text
     https://id.twitch.tv/oauth2/authorize?client_id=...&redirect_uri=...&response_type=code&scope=user:read:chat+user:write:chat&state=...
     ```
2. **Callback Handling:** Twitch redirects back to `GET /auth/twitch/callback?code=...&state=...`.
   - Server validates the `state` query parameter against the cookie to reject CSRF attacks.
   - Server exchanges `code` for an OAuth token via `POST https://id.twitch.tv/oauth2/token`.
   - Access tokens are stored in memory/server-side only; they are never exposed to browser clients.

---

## 4. Twitch EventSub WebSocket Protocol

RaidRelay connects to Twitch EventSub via WebSocket (`wss://eventsub.wss.twitch.tv/ws`):

### Lifecycle Management:
1. **Welcome Message:** Upon connection, Twitch emits `session_welcome` containing a unique `session_id`.
2. **Subscription Registration:** Server registers subscriptions via Twitch Helix:
   - `channel.raid` (version: `1`): Triggers when another broadcaster raids the authenticated streamer's channel.
   - `channel.chat.message` (version: `1`): Receives chat messages in real time.
3. **Keepalive Watchdog:** Twitch sends `session_keepalive` frames at specified intervals. If no frame arrives within the timeout window plus 3s tolerance, RaidRelay automatically disconnects and re-establishes the socket.
4. **Reconnect Handling:** If Twitch emits `session_reconnect`, the client seamlessly connects to the new URL without interrupting active state.

---

## 5. EventGuard Security & Deduplication

To prevent duplicate triggers from network replays:
- **Event Freshness:** Timestamps older than 10 minutes are rejected immediately.
- **Message Deduplication:** Every Twitch EventSub message carries a unique `message_id`. RaidRelay verifies `message_id` against the SQLite `processed_events` table before processing.
- **Command Whitelist:** Only strict `!relay A` and `!relay B` messages are recognized. All other messages are ignored, preventing chat flood from impacting server performance.

