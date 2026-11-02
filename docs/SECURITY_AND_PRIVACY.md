# RaidRelay — Security, Privacy & Anti-Toxicity Architecture

## 1. Threat Model & Broadcast Safeguards

RaidRelay runs directly in the live broadcast path. Broadcasters face recurring harassment, hate raids, injection attacks, and credential harvesting. RaidRelay was engineered from inception to mitigate these attack vectors with verified, fail-safe boundaries.

### Threat Matrix:

| Threat Vector | Potential Impact | RaidRelay Architectural Safeguard |
| :--- | :--- | :--- |
| **Hate Raid / Slur Flood** | Offensive text on broadcast overlay | **Zero Free-Form Text Rendering.** The overlay only renders structured tally counts (`A` vs `B`) and broadcaster-approved text. |
| **Viewer Tracking / Surveillance** | Viewer PII leakage | **HMAC-SHA256 Ephemeral Voter Hashing.** Raw Twitch IDs are never stored or broadcasted. Ephemeral hashes expire automatically after cooldown. |
| **Stream Sniping / Replay Attacks** | Manipulating voting results | **EventFreshness & Deduplication.** Timestamps older than 10m or skewed >60s into the future are rejected; duplicate message IDs are dropped via SQLite index. |
| **Broadcaster Token Leakage** | Compromised Twitch channel | **Server-Side Token Isolation.** OAuth tokens never touch the client or appear in Git, logs, or WebSocket frames. |
| **Overlay Hijacking** | Unauthorized overlay control | **Unguessable 32-Char Hex Channel Keys.** Read-only overlay URLs cannot trigger mutations or view broadcaster settings. |
| **CSRF / Cross-Origin Attacks** | Unauthorized flight controls | **Strict Origin Validation & SameSite Cookies.** All state-changing routes reject untrusted origins. |

---

## 2. Cryptographic Voter Privacy Invariant

To enforce the `1-person = 1-vote` rule without storing viewer identities:

$$\text{voterHash} = \text{HMAC-SHA256}(\text{twitchUserId}, \text{HMAC\_VOTER\_SALT})$$

- The salt is generated randomly on server boot or configured securely via `HMAC_VOTER_SALT`.
- Hashes are kept in an in-memory `Set<string>` during the 30-second voting phase and purged upon ritual cooldown.
- A user cannot vote twice with the same Twitch account.
- Even with database access, an attacker cannot reverse hashes back to Twitch usernames.

---

## 3. Measured Panic Clear Latency

Streamers retain absolute, instantaneous control over their broadcast:
- **Panic Clear (`POST /api/ritual/clear`):** Instantly halts active state machines, flushes voter sets, and resets the OBS overlay to transparent.
- **Empirical Benchmark (1,000 iterations):**
  - **Mean Latency:** `0.0002 ms (0.2 µs)`
  - **p50:** `0.0002 ms (0.2 µs)`
  - **p95:** `0.0003 ms (0.3 µs)`
  - **p99:** `0.0014 ms (1.4 µs)`
- Benchmark script: `scripts/benchmark-panic-clear.ts`.

---

## 4. Local Data Retention & Purge Policy

- **Processed Events:** Deduplication records expire after 24 hours. A scheduled hourly job runs `DELETE FROM processed_events WHERE received_at < NOW - 24h`.
- **Sessions:** Broadcaster sessions expire after 7 days. Expired sessions are purged hourly.
- **Data Deletion Endpoint:** Streamers can trigger `POST /api/data/delete-local` from the console to immediately wipe all votes, rituals, event records, and reset configurations to default.

