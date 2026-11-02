# RaidRelay — Security, Privacy & Anti-Toxicity Policy

## 1. Threat Model & Safeguards

RaidRelay operates directly in the live broadcast path. Streamers are subject to harassment campaigns, hate raids, injection attacks, and credential harvesting. RaidRelay was architected from the first line of code to eliminate these attack vectors.

### Threat Matrix:

| Threat Vector | Potential Impact | RaidRelay Architectural Safeguard |
| :--- | :--- | :--- |
| **Hate Raid / Slur Flood** | Offensive text on broadcast overlay | **Zero Free-Form Text Rendering.** The overlay only renders structured tally counts (`A` vs `B`) and broadcaster-approved text. |
| **Viewer Tracking / Profiling** | PII leakage, user surveillance | **HMAC-SHA256 Voter Hashing.** Raw Twitch IDs are never stored or broadcasted. Ephemeral hashes expire after the ritual. |
| **Stream Sniping / Replay Attacks** | Manipulating voting results | **EventFreshness & Deduplication.** Timestamps older than 10m are rejected; duplicate message IDs are dropped via SQLite index. |
| **Broadcaster Token Leakage** | Compromised Twitch channel | **Server-Side Token Isolation.** OAuth tokens never touch the client or appear in Git, logs, or WebSocket frames. |
| **Overlay Hijacking** | Unauthorized overlay control | **Unguessable 32-Char Hex Channel Keys.** Read-only overlay URLs cannot trigger mutations or view broadcaster settings. |

---

## 2. Cryptographic Voter Privacy Invariant

To enforce the `1-person = 1-vote` invariant without retaining viewer PII:

$$\text{voterHash} = \text{HMAC-SHA256}(\text{twitchUserId}, \text{HMAC\_VOTER\_SALT})$$

- The salt is kept server-side and never exposed.
- Hashes are kept in memory during the 30-second voting phase and then purged upon ritual cooldown.
- A user cannot vote twice with the same Twitch account.
- Even with database access, an attacker cannot reverse hashes back to Twitch usernames.

---

## 3. Emergency Flight Controls

Streamers retain absolute, instantaneous control over their broadcast:
- **Panic Clear (`POST /api/ritual/clear`):** Instantly halts active state machines, flushes voter sets, and resets the OBS overlay to transparent.
- **Manual Override (`POST /api/ritual/:id/override`):** Streamer can override chat votes at any time to select Option A or Option B.
- **Skip Ritual (`POST /api/ritual/:id/skip`):** Streamer can bypass the vote and advance directly to cooldown if desired.

---

## 4. Automated Verification & Continuous Scanning

RaidRelay incorporates two automated pre-commit scanners:
- `pnpm test:security`: Scans the entire repository tree and file contents for exposed Twitch client secrets, bearer tokens, private keys, or unignored `.env` files.
- `pnpm test:claims`: Scans all Markdown and code files to eliminate marketing hyperbole and ensure all factual assertions match machine-readable test evidence.

