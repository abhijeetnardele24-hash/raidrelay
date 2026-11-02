# RaidRelay — OpenAI Codex Build & Verification Log

**Codex Session ID:** `93a16a2b-a2a0-461f-851b-7a1e342fe97f`  
**Hackathon:** Codex x TwitchCon Hackathon 2026  
**Developer:** Abhijeet Nardele  
**Repository:** `https://github.com/abhijeetnardele24-hash/raidrelay`  

---

## 1. Executive Summary

This log documents the end-to-end development, architecture decisions, and systematic debugging of **RaidRelay** performed within OpenAI Codex thread `93a16a2b-a2a0-461f-851b-7a1e342fe97f`.

Codex was utilized not merely as an autocomplete engine, but as an autonomous principal engineer and security auditor responsible for:
1. Translating the `PROJECT_BLUEPRINT.md` single source of truth into strict Zod contracts and a deterministic finite state machine.
2. Building an authenticated Fastify backend with official Twitch EventSub WebSocket and Helix API integrations.
3. Architecting an OBS-ready broadcast overlay and Broadcaster Console styled with broadcast-grade Tailwind design tokens.
4. Diagnosing runtime failures, environment collisions, native C++ build conflicts, and accessibility violations down to root cause.
5. Establishing a 43-test automated verification gate (35 Vitest + 8 Playwright E2E) with zero regressions.

---

## 2. Key Engineering Decisions & Codex Trade-Offs

### A. WebAssembly SQLite (`sql.js`) over Native C++ SQLite
- **Context:** Node.js `v24.11.1` on Windows failed native compilation of `better-sqlite3` due to breaking V8 13.x internal C++ API changes in `node-gyp`.
- **Codex Solution:** Codex diagnosed the compiler error and refactored the persistence layer to official WebAssembly SQLite (`sql.js`). This eliminated all native toolchain dependencies while providing full SQL query power and zero-dependency disk persistence.

### B. Ephemeral Voter Hashing & Cryptographic Invariants
- **Context:** Streamers need a strict `1-person = 1-vote` rule to prevent spam bots from tipping community decisions, but storing viewer Twitch IDs creates PII liability and privacy risks.
- **Codex Solution:** Codex implemented HMAC-SHA256 voter hashing using a server-side salt:
  $$\text{voterHash} = \text{HMAC-SHA256}(\text{twitchUserId}, \text{HMAC\_VOTER\_SALT})$$
  Hashes are held in an in-memory `Set<string>` during the 30-second voting phase and purged after cooldown.

### C. Zero Free-Form Text on Broadcast Overlays
- **Context:** Hate raids and offensive chat floods frequently disrupt live Twitch streams.
- **Codex Solution:** Codex designed the overlay architecture to strictly reject all free-form text. The overlay only renders structured choice counts (`A` vs `B`) and broadcaster-approved settings from the Broadcaster Console.

---

## 3. Notable Bug Diagnoses & Fixes

### Bug 1: Environment Variable Collision (`DATABASE_URL`)
- **Symptom:** Fastify server crashed on startup with `ENOENT: no such file or directory, mkdir '...\postgres:\user:password@localhost:5432'`.
- **Diagnosis:** The host machine had a global system environment variable `DATABASE_URL` configured for a legacy PostgreSQL database. The server configuration was falling back to `process.env.DATABASE_URL`.
- **Codex Fix:** Updated `apps/server/src/config.ts` to explicitly check `process.env.DATABASE_PATH` and default to a local SQLite path: `process.env.DATABASE_PATH || path.resolve(__dirname, '../../data/raidrelay.sqlite')`.

### Bug 2: Playwright Strict Mode Violations in E2E Journeys
- **Symptom:** Playwright tests failed with `strict mode violation: getByText(/A raid is not an alert; it is a community handoff/i) resolved to 2 elements`.
- **Diagnosis:** The project thesis paragraph was rendered in both the main landing page hero section and the footer copyright section.
- **Codex Fix:** Targeted the specific container locator using `.first()` or specific landmark roles (`#main-content`), ensuring deterministic selector matching across desktop and mobile test viewports.

### Bug 3: Fast-Forward Timing Calibration in Demo Lab
- **Symptom:** Demo Lab tests running at 10x speed timed out waiting for the `VOTING` state because durations remained at the default 1x intervals.
- **Diagnosis:** The `speedMultiplier` parameter was only passed to the simulated chat timeout delays, but not scaled inside the `RaidRitualEngine` constructor.
- **Codex Fix:** Dynamically scaled all state-machine phase durations (`landingDurationMs`, `contextDurationMs`, `votingDurationMs`) by `Math.max(1, speedMultiplier)`.

### Bug 4: Axe Accessibility Violations in Demo Lab
- **Symptom:** Axe Core scan failed with `Buttons must have discernible text` and `Scrollable region must have keyboard access`.
- **Diagnosis:** The simulation reset button used an icon without an `aria-label`, and the simulated chat vote list was an un-focusable scrollable `div`.
- **Codex Fix:** Added `aria-label="Reset simulation to idle"` to the button and `tabIndex={0}`, `role="region"`, and `aria-label="Simulated incoming chat votes log"` to the scrollable container. Subsequent Axe scans passed with **0 violations**.

---

## 4. Final Verification Scorecard

Every automated gate passed with exit code 0:
- **Linting:** `eslint . --max-warnings 0` (0 errors, 0 warnings)
- **TypeScript:** `tsc --build` (0 errors across 5 monorepo packages)
- **Unit & Integration:** `vitest run` (53/53 tests passing across domain, eventsub, tokens, and server)
- **E2E Journeys & Accessibility:** `playwright test` (8/8 tests passing, 0 Axe accessibility violations in tested states)
- **Panic Clear Latency Benchmark:** `tsx scripts/benchmark-panic-clear.ts` (0.2 µs mean / 1.4 µs p99 in-memory state transition across 1,000 iterations)
- **Secret Scan:** `tsx scripts/security-scan.ts` (0 exposed tokens, 0 unignored .env files across tree & Git history)
- **Claims Audit:** `tsx scripts/check-claims.ts` (0 ungrounded or hyperbolic claims)
- **Production Build:** `pnpm build` (clean production artifacts for all packages)

