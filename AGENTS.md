# RaidRelay — Agent & Developer Instructions

> **Thesis:** A raid is not an alert; it is a community handoff. RaidRelay makes that handoff understandable, participatory, and safe in 90 seconds.

## 1. Operating Rules & Commands

- Package manager: `pnpm`
- Language: TypeScript (strict mode)
- Monorepo: `pnpm-workspace.yaml`

### Common Commands

- **Install dependencies:** `pnpm install`
- **Lint:** `pnpm lint`
- **Typecheck:** `pnpm typecheck`
- **Unit & Integration Tests:** `pnpm test`
- **Full Production Build:** `pnpm build`
- **Browser E2E Tests:** `pnpm test:e2e`
- **Secret Scan:** `pnpm test:security`
- **Claims Verification:** `pnpm test:claims`
- **Full Verification Suite:** `pnpm verify`
- **Start Local Server:** `pnpm start`

## 2. Truthfulness & Evidence Contract

- **Modes:**
  - `LIVE_TWITCH`: Strictly reserved for genuine incoming Twitch raid or chat events over an authenticated connection.
  - `SIMULATED`: For Demo Lab, test fixtures, and rehearsed scenarios. Must prominently display `SIMULATED EVENT FEED — NOT TWITCH LIVE`.
- Simulation adapters can never emit `LIVE_TWITCH`.
- Never claim unmeasured retention or conversion; call metrics "observed participation".
- Never claim zero vulnerabilities; report exact scans performed.

## 3. Codex Session Tracking

- Codex Session ID: `93a16a2b-a2a0-461f-851b-7a1e342fe97f`
- Log notable implementation decisions, test diagnoses, and refactorings in `docs/CODEX_BUILD_LOG.md`.

