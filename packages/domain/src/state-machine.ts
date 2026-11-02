import type {
  RitualState,
  SourceMode,
  BroadcasterConfig,
  RaidEvent,
  VoteChoice,
  RitualSnapshot,
  StreamerAction,
} from '@raidrelay/contracts';
import { sanitizeText } from './sanitize.js';

export interface RitualDurations {
  landingDurationMs: number;
  contextDurationMs: number;
  votingDurationMs: number;
  awaitingStreamerDurationMs: number;
  resultDurationMs: number;
  cooldownDurationMs: number;
}

export const DEFAULT_DURATIONS: RitualDurations = {
  landingDurationMs: 4000,
  contextDurationMs: 6000,
  votingDurationMs: 45000,
  awaitingStreamerDurationMs: 15000,
  resultDurationMs: 20000,
  cooldownDurationMs: 5000,
};

export interface CreateRitualParams {
  id: string;
  raidEvent: RaidEvent;
  config: BroadcasterConfig;
  durations?: Partial<RitualDurations>;
  now?: number;
}

export class RaidRitualEngine {
  private id: string;
  private twitchMessageId: string | null;
  private sourceMode: SourceMode;
  private state: RitualState = 'IDLE';

  private raiderUserId: string | null;
  private raiderDisplayName: string;
  private viewerCount: number;

  private activity: string;
  private goal: string;
  private communityNorm: string;
  private optionA: string;
  private optionB: string;
  private autoApprove: boolean;

  private votesA = 0;
  private votesB = 0;
  private voters = new Set<string>();

  private selectedOption: 'A' | 'B' | 'SKIP' | 'EXPIRED' | null = null;
  private phaseEnteredAt: number;
  private startedAt: number;
  private completedAt: number | null = null;
  private sequenceNumber = 0;

  private durations: RitualDurations;

  constructor(params: CreateRitualParams) {
    const { id, raidEvent, config, durations, now = Date.now() } = params;

    this.id = id;
    this.twitchMessageId = raidEvent.messageId;
    this.sourceMode = raidEvent.sourceMode;
    this.state = 'LANDING';

    this.raiderUserId = raidEvent.fromBroadcasterId;
    this.raiderDisplayName = sanitizeText(raidEvent.fromBroadcasterName, 50);
    this.viewerCount = raidEvent.viewers;

    this.activity = sanitizeText(config.activity, 80);
    this.goal = sanitizeText(config.goal, 100);
    this.communityNorm = sanitizeText(config.communityNorm, 100);
    this.optionA = sanitizeText(config.optionA, 80);
    this.optionB = sanitizeText(config.optionB, 80);
    this.autoApprove = config.autoApprove;

    this.durations = { ...DEFAULT_DURATIONS, ...durations };
    this.startedAt = now;
    this.phaseEnteredAt = now;
    this.sequenceNumber = 1;
  }

  public getState(): RitualState {
    return this.state;
  }

  public getSourceMode(): SourceMode {
    return this.sourceMode;
  }

  public getId(): string {
    return this.id;
  }

  public getSelectedOption(): 'A' | 'B' | 'SKIP' | 'EXPIRED' | null {
    return this.selectedOption;
  }

  public getVotes(): { votesA: number; votesB: number; totalVotes: number; uniqueVoters: number } {
    return {
      votesA: this.votesA,
      votesB: this.votesB,
      totalVotes: this.votesA + this.votesB,
      uniqueVoters: this.voters.size,
    };
  }

  /**
   * Accepts exactly one vote per unique voter HMAC hash during VOTING state.
   * Returns true if vote was recorded, false if ignored (e.g. duplicate or not in voting state).
   */
  public castVote(voterIdHash: string, choice: VoteChoice): boolean {
    if (this.state !== 'VOTING') {
      return false;
    }
    if (!voterIdHash || typeof voterIdHash !== 'string') {
      return false;
    }
    if (this.voters.has(voterIdHash)) {
      return false; // Invariant: 1 person = 1 vote
    }

    this.voters.add(voterIdHash);
    if (choice === 'A') {
      this.votesA += 1;
    } else if (choice === 'B') {
      this.votesB += 1;
    }
    this.sequenceNumber += 1;
    return true;
  }

  /**
   * Applies broadcaster console actions.
   */
  public handleStreamerAction(action: StreamerAction, now = Date.now()): boolean {
    switch (action.action) {
      case 'APPROVE':
        if (this.state === 'AWAITING_STREAMER') {
          this.resolveWinnerAndTransitionToResult(now);
          return true;
        }
        return false;

      case 'OVERRIDE':
        if (this.state === 'VOTING' || this.state === 'AWAITING_STREAMER') {
          if (!action.overrideChoice) return false;
          this.selectedOption = action.overrideChoice;
          this.transitionTo('RESULT', now);
          return true;
        }
        return false;

      case 'SKIP':
        if (this.state !== 'IDLE' && this.state !== 'COOLDOWN' && this.state !== 'RESULT') {
          this.selectedOption = 'SKIP';
          this.transitionTo('SKIPPED', now);
          return true;
        }
        return false;

      case 'CLEAR':
        // Panic button: works from any non-idle state
        if (this.state !== 'IDLE') {
          this.selectedOption = null;
          this.transitionTo('CLEARED', now);
          return true;
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Deterministic server-authoritative timer tick.
   * Progresses state through elapsed phase thresholds.
   */
  public tick(now = Date.now()): void {
    let progressed = true;
    let iterations = 0;

    while (progressed && iterations < 10) {
      progressed = false;
      iterations += 1;
      const elapsedInPhase = now - this.phaseEnteredAt;

      switch (this.state) {
        case 'LANDING':
          if (elapsedInPhase >= this.durations.landingDurationMs) {
            this.transitionTo('CONTEXT', this.phaseEnteredAt + this.durations.landingDurationMs);
            progressed = true;
          }
          break;

        case 'CONTEXT':
          if (elapsedInPhase >= this.durations.contextDurationMs) {
            this.transitionTo('VOTING', this.phaseEnteredAt + this.durations.contextDurationMs);
            progressed = true;
          }
          break;

        case 'VOTING':
          if (elapsedInPhase >= this.durations.votingDurationMs) {
            const transitionTime = this.phaseEnteredAt + this.durations.votingDurationMs;
            if (this.autoApprove) {
              this.resolveWinnerAndTransitionToResult(transitionTime);
            } else {
              this.transitionTo('AWAITING_STREAMER', transitionTime);
            }
            progressed = true;
          }
          break;

        case 'AWAITING_STREAMER':
          if (elapsedInPhase >= this.durations.awaitingStreamerDurationMs) {
            // Safety invariant: If autoApprove is false, no option is committed without streamer consent.
            // On approval timeout, ritual safely expires and fades without publishing a winning option.
            this.selectedOption = 'EXPIRED';
            this.transitionTo('SKIPPED', this.phaseEnteredAt + this.durations.awaitingStreamerDurationMs);
            progressed = true;
          }
          break;

        case 'RESULT':
          if (elapsedInPhase >= this.durations.resultDurationMs) {
            this.completedAt = this.phaseEnteredAt + this.durations.resultDurationMs;
            this.transitionTo('COOLDOWN', this.completedAt);
            progressed = true;
          }
          break;

        case 'SKIPPED':
        case 'CLEARED':
          if (elapsedInPhase >= 2000) {
            this.completedAt = this.phaseEnteredAt + 2000;
            this.transitionTo('COOLDOWN', this.completedAt);
            progressed = true;
          }
          break;

        case 'COOLDOWN':
          if (elapsedInPhase >= this.durations.cooldownDurationMs) {
            this.transitionTo('IDLE', this.phaseEnteredAt + this.durations.cooldownDurationMs);
            progressed = true;
          }
          break;

        case 'IDLE':
          // Terminal idle
          break;
      }
    }
  }

  private resolveWinnerAndTransitionToResult(now: number): void {
    if (this.votesA > this.votesB) {
      this.selectedOption = 'A';
    } else if (this.votesB > this.votesA) {
      this.selectedOption = 'B';
    } else {
      // Deterministic tie-breaker: Option A
      this.selectedOption = 'A';
    }
    this.transitionTo('RESULT', now);
  }

  private transitionTo(newState: RitualState, now: number): void {
    this.state = newState;
    this.phaseEnteredAt = now;
    this.sequenceNumber += 1;
  }

  /**
   * Produces an immutable, schema-compliant snapshot of the current ritual state.
   */
  public toSnapshot(now = Date.now()): RitualSnapshot {
    let timeRemainingMs = 0;
    const elapsed = now - this.phaseEnteredAt;

    switch (this.state) {
      case 'LANDING':
        timeRemainingMs = Math.max(0, this.durations.landingDurationMs - elapsed);
        break;
      case 'CONTEXT':
        timeRemainingMs = Math.max(0, this.durations.contextDurationMs - elapsed);
        break;
      case 'VOTING':
        timeRemainingMs = Math.max(0, this.durations.votingDurationMs - elapsed);
        break;
      case 'AWAITING_STREAMER':
        timeRemainingMs = Math.max(0, this.durations.awaitingStreamerDurationMs - elapsed);
        break;
      case 'RESULT':
        timeRemainingMs = Math.max(0, this.durations.resultDurationMs - elapsed);
        break;
      case 'COOLDOWN':
        timeRemainingMs = Math.max(0, this.durations.cooldownDurationMs - elapsed);
        break;
      default:
        timeRemainingMs = 0;
    }

    return {
      id: this.id,
      twitchMessageId: this.twitchMessageId,
      sourceMode: this.sourceMode,
      state: this.state,
      raiderUserId: this.raiderUserId,
      raiderDisplayName: this.raiderDisplayName,
      viewerCount: this.viewerCount,
      activity: this.activity,
      goal: this.goal,
      communityNorm: this.communityNorm,
      optionA: this.optionA,
      optionB: this.optionB,
      votesA: this.votesA,
      votesB: this.votesB,
      totalVotes: this.votesA + this.votesB,
      selectedOption: this.selectedOption,
      timeRemainingMs,
      startedAt: new Date(this.startedAt).toISOString(),
      completedAt: this.completedAt ? new Date(this.completedAt).toISOString() : null,
      sequenceNumber: this.sequenceNumber,
    };
  }
}
