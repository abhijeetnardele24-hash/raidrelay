# RaidRelay — Hackathon Video Demonstration Script

**Target Duration:** 2 minutes 45 seconds (2:45)  
**Tone:** Confident, broadcast-technical, energetic, and truthful.  
**Resolution:** 1080p (1920×1080) at 60 FPS.  
**Audio:** Clear voiceover, zero copyrighted music, subtle studio broadcast ambience.

---

## Shot-by-Shot Storyboard

### [0:00 - 0:25] The Hook: The 90-Second Raid Cliff
- **Visual:** Split screen showing typical Twitch raids today—chaotic alert sirens, bewildered streamer asking *"Uh, who raided? What do you guys want to do?"*, followed by an analytics chart showing 50%+ viewer dropoff within the first 90 seconds.
- **Voiceover:**
  > *"When a Twitch raid hits today, incoming viewers are greeted by loud sirens, awkward inside jokes, and a confused streamer trying to explain what's happening. Within 90 seconds, incoming viewers frequently click away before learning what the channel is doing.*
  >
  > *A raid is not an alert; it is a community handoff. RaidRelay makes that handoff understandable, participatory, and safe in 90 seconds."*

### [0:25 - 0:55] Streamer Setup: The Now Card & Flight Controls
- **Visual:** Screen capture of the Broadcaster Console (`/console`). Streamer types in their live activity: *"Building a tiny robot live"*, their goal: *"Get the obstacle avoidance working before sunset"*, and community norm: *"Constructive critique only"*. Shows unguessable OBS overlay key and one-click copy.
- **Voiceover:**
  > *"It starts before the raid in the Broadcaster Console. The streamer configures their 'Now Card'—their current activity, live stakes, and community norms. When an incoming raid is detected via Twitch EventSub, RaidRelay automatically triggers a synchronized 5-phase ritual."*

### [0:55 - 1:40] The 5-Phase Raid Ritual in Action (OBS 1080p Overlay)
- **Visual:** High-definition capture of the transparent 1920×1080 OBS overlay running on top of live stream footage.
  - **Phase 1: Landing (4s):** Raider and broadcaster community badges collide on screen with live headcount (+142 raiders).
  - **Phase 2: Context (6s):** Now Card expands with activity and stakes.
  - **Phase 3: Choice & Voting (30s):** Option A vs Option B tally meters appear. Camera cuts to Twitch chat with viewers typing `!relay A` and `!relay B`. The tally meters dynamically slide in real time (Option A 65%, Option B 35%).
  - **Phase 4: Result (8s):** Streamer clicks Approve. The merged Relay Card crowns the winning choice with celebratory broadcast animation.
  - **Phase 5: Cooldown:** Overlay smoothly dissolves back to transparent idle.
- **Voiceover:**
  > *"Phase 1: Landing. Both communities collide on screen with custom badges and live viewer headcount.*
  > *Phase 2: Context. The incoming viewers immediately understand what's happening without the streamer stopping the broadcast.*
  > *Phase 3: Choice. Both communities vote together directly in Twitch chat with `!relay A` or `!relay B`. Our deterministic engine enforces a strict one-person-one-vote rule using ephemeral HMAC hashing.*
  > *Phase 4: Result. The winning choice is locked in, and a merged Relay Card celebrates the combined community decision before cleanly fading back to idle."*

### [1:40 - 2:05] Streamer Safety & Panic Controls
- **Visual:** Cut to Broadcaster Console during a simulated raid. Streamer clicks **Override: Option B** (immediately changing the outcome), and then clicks **Panic Clear** (overlay disappears instantly).
- **Voiceover:**
  > *"Safety is paramount. RaidRelay never renders free-form chat on screen—completely eliminating hate-raid text injection. And if anything feels off, the streamer has flight controls: override the vote, skip the ritual, or hit Panic Clear to blank the overlay with sub-microsecond state transition speed and immediate broadcast refresh."*

### [2:05 - 2:30] Built with OpenAI Codex & Verified Pipeline
- **Visual:** Screen recording of terminal running `pnpm verify`. Shows ESLint passing with 0 warnings, TypeScript checking 0 errors, Vitest passing 52 tests, Playwright passing 8 journeys with 0 Axe accessibility violations in tested states, and secret/claims scanners passing. Shows Codex thread `93a16a2b-a2a0-461f-851b-7a1e342fe97f`.
- **Voiceover:**
  > *"RaidRelay was engineered end-to-end using OpenAI Codex in Session 93a16a2b-a2a0-461f-851b-7a1e342fe97f. Codex helped architect the deterministic state machine, diagnose native build conflicts down to root cause, and establish a rigorous 60-test verification gate (52 Vitest + 8 Playwright E2E) with zero Axe accessibility violations in tested states."*

### [2:30 - 2:45] Conclusion & Call to Action
- **Visual:** Hero shot of the RaidRelay landing page and GitHub repository.
- **Voiceover:**
  > *"RaidRelay: The first 90 seconds after a Twitch raid, designed. Fully open-source, internally verified, and ready for TwitchCon 2026."*

