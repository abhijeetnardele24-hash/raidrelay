import { SAMPLE_CHAT_VOTES } from '@raidrelay/fixtures';
import type { RaidRitualEngine } from '@raidrelay/domain';
import { parseVoteCommand, hashVoterId } from '@raidrelay/domain';
import { config } from '../config.js';

export interface DemoRunOptions {
  speedMultiplier?: number; // 1 = real-time, 10 = fast-forward, Infinity = instant
  onUpdate?: () => void;
}

export class DemoAdapter {
  private activeTimeouts: NodeJS.Timeout[] = [];
  private isRunning = false;

  constructor(private getEngine: () => RaidRitualEngine | null) {}

  public isSimulationRunning(): boolean {
    return this.isRunning;
  }

  public runScenario(options: DemoRunOptions = {}): void {
    this.stop();
    this.isRunning = true;

    const engine = this.getEngine();
    if (!engine) {
      this.isRunning = false;
      return;
    }

    const { speedMultiplier = 1, onUpdate } = options;

    if (speedMultiplier === Infinity) {
      // Instant execution for tests
      this.executeInstant(engine, onUpdate);
      this.isRunning = false;
      return;
    }

    // Schedule chat votes during VOTING state
    // Landing (4s) + Context (6s) = 10s until VOTING starts
    const votingStartTimeMs = (4000 + 6000) / speedMultiplier;

    SAMPLE_CHAT_VOTES.forEach((v, index) => {
      const voteDelay = votingStartTimeMs + ((index + 1) * 2000) / speedMultiplier;
      const timer = setTimeout(() => {
        const currentEngine = this.getEngine();
        if (currentEngine && currentEngine.getState() === 'VOTING') {
          const choice = parseVoteCommand(v.messageText);
          if (choice) {
            const voterHash = hashVoterId(v.userId, config.HMAC_VOTER_SALT);
            currentEngine.castVote(voterHash, choice);
            if (onUpdate) onUpdate();
          }
        }
      }, voteDelay);
      this.activeTimeouts.push(timer);
    });
  }

  public stop(): void {
    this.activeTimeouts.forEach((t) => clearTimeout(t));
    this.activeTimeouts = [];
    this.isRunning = false;
  }

  private executeInstant(engine: RaidRitualEngine, onUpdate?: () => void): void {
    // Advance into voting
    let now = Date.now();
    engine.tick(now + 10000); // Into voting

    SAMPLE_CHAT_VOTES.forEach((v) => {
      const choice = parseVoteCommand(v.messageText);
      if (choice) {
        const voterHash = hashVoterId(v.userId, config.HMAC_VOTER_SALT);
        engine.castVote(voterHash, choice);
      }
    });

    if (onUpdate) onUpdate();
  }
}

