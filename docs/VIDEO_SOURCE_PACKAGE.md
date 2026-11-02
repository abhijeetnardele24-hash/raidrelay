# RaidRelay — Video Demonstration Source Package

This document provides the complete video production package, shot list, voiceover script, and YouTube metadata for the RaidRelay demo video.

**Video Target Duration:** 2 minutes 45 seconds (2:45)  
**Resolution:** 1080p (1920×1080) at 60 FPS  
**License/Music:** Zero copyrighted audio (speech-only with royalty-free broadcast room ambience)  

---

## 1. YouTube Metadata

- **Title:** RaidRelay — The First 90 Seconds After a Twitch Raid, Designed (Codex x TwitchCon 2026)
- **Visibility:** Public
- **Category:** Gaming / Science & Technology
- **Description:**
  ```text
  RaidRelay is an open-source broadcast companion that transforms sudden Twitch raid alerts into a synchronized 5-phase community handoff ritual.

  Built for the Codex x TwitchCon Hackathon 2026 using OpenAI Codex (Session ID: 93a16a2b-a2a0-461f-851b-7a1e342fe97f).

  0:00 - The 90-Second Raid Cliff Problem
  0:25 - Broadcaster Console & Now Card Setup
  0:55 - The 5-Phase Raid Ritual on OBS Overlay
  1:40 - Streamer Flight Controls & Panic Clear
  2:05 - Verified Architecture & OpenAI Codex Evidence
  2:30 - Conclusion & Open Source Repository

  GitHub: https://github.com/abhijeetnardele24-hash/raidrelay
  ```

---

## 2. Voiceover & On-Screen Action Script

| Timestamp | Visual Action | Voiceover Script |
| :--- | :--- | :--- |
| **0:00 - 0:25** | Streamer confused by loud siren; viewer dropoff graph. | *"When a Twitch raid hits today, incoming viewers are greeted by loud sirens, confusing inside jokes, and a streamer struggling to explain what's happening. Within 90 seconds, incoming viewers frequently leave before understanding what the channel is doing. A raid is not an alert; it is a community handoff. RaidRelay makes that handoff understandable, participatory, and safe in 90 seconds."* |
| **0:25 - 0:55** | Broadcaster Console (`/console`); typing activity and goal; copy overlay key. | *"It begins before the stream in the Broadcaster Console. The streamer configures their 'Now Card'—current activity, live stakes, and community norms. When an incoming raid is detected via Twitch EventSub, RaidRelay automatically orchestrates a 5-phase ritual."* |
| **0:55 - 1:40** | OBS 1080p Overlay on stream footage; Landing, Context, Voting split with live chat votes (`!relay A` / `!relay B`), streamer Approval, merged Relay Card. | *"Phase 1: Landing. Both communities collide on screen with custom badges and live headcount. Phase 2: Context. Raiders immediately understand the channel's activity. Phase 3: Choice. Both communities vote together in chat with !relay A or !relay B. Our deterministic state machine enforces a strict one-person-one-vote rule using ephemeral HMAC hashing. Phase 4: Result. The streamer approves, and a merged Relay Card celebrates the combined community decision."* |
| **1:40 - 2:05** | Broadcaster Console; Override click; Panic Clear click (overlay blanks instantly). | *"Safety is paramount. RaidRelay never renders free-form chat on screen—eliminating hate-raid text injection. If anything feels off, the streamer has flight controls: override the vote, skip the ritual, or hit Panic Clear with sub-microsecond in-memory state transition speed to blank the screen instantly."* |
| **2:05 - 2:30** | Terminal showing `pnpm verify` passing 60 tests and 0 Axe violations in tested states; Codex Session ID `93a16a2b-a2a0-461f-851b-7a1e342fe97f`. | *"RaidRelay was engineered end-to-end with OpenAI Codex in Session 93a16a2b-a2a0-461f-851b-7a1e342fe97f. Codex helped architect the state machine, solve native compiler conflicts, and establish a 60-test verification pipeline with zero Axe accessibility violations in tested states."* |
| **2:30 - 2:45** | Landing page, GitHub repository link. | *"RaidRelay: The first 90 seconds after a Twitch raid, designed. Open-source, internally verified, and ready for TwitchCon 2026."* |

