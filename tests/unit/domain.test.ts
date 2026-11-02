import { describe, it, expect } from 'vitest';
import {
  RaidRitualEngine,
  DEFAULT_DURATIONS,
  parseVoteCommand,
  escapeHtml,
  sanitizeText,
  hashVoterId,
  signReceipt,
  verifyReceipt,
  generateChannelKey,
} from '@raidrelay/domain';
import { CHAMPIONSHIP_CONFIG, SAMPLE_SIMULATED_RAID } from '@raidrelay/fixtures';

describe('RaidRitualEngine State Machine & Invariants', () => {
  it('initializes in LANDING state with correct raid parameters and sourceMode', () => {
    const engine = new RaidRitualEngine({
      id: 'test-ritual-1',
      raidEvent: SAMPLE_SIMULATED_RAID,
      config: CHAMPIONSHIP_CONFIG,
    });

    expect(engine.getState()).toBe('LANDING');
    expect(engine.getSourceMode()).toBe('SIMULATED');
    expect(engine.getId()).toBe('test-ritual-1');

    const snapshot = engine.toSnapshot();
    expect(snapshot.state).toBe('LANDING');
    expect(snapshot.raiderDisplayName).toBe('ArtisanAlex');
    expect(snapshot.viewerCount).toBe(142);
    expect(snapshot.activity).toBe('Building a tiny robot live');
    expect(snapshot.optionA).toBe('Drive the next test with only the left sensor');
    expect(snapshot.optionB).toBe('Give the robot a 20-second victory dance first');
    expect(snapshot.votesA).toBe(0);
    expect(snapshot.votesB).toBe(0);
    expect(snapshot.selectedOption).toBeNull();
  });

  it('progresses through the entire happy-path lifecycle via deterministic tick()', () => {
    let now = 1000000;
    const durations = {
      landingDurationMs: 1000,
      contextDurationMs: 1000,
      votingDurationMs: 2000,
      awaitingStreamerDurationMs: 1000,
      resultDurationMs: 1000,
      cooldownDurationMs: 1000,
    };

    const engine = new RaidRitualEngine({
      id: 'test-lifecycle-1',
      raidEvent: SAMPLE_SIMULATED_RAID,
      config: CHAMPIONSHIP_CONFIG,
      durations,
      now,
    });

    // LANDING -> CONTEXT
    expect(engine.getState()).toBe('LANDING');
    now += 1000;
    engine.tick(now);
    expect(engine.getState()).toBe('CONTEXT');

    // CONTEXT -> VOTING
    now += 1000;
    engine.tick(now);
    expect(engine.getState()).toBe('VOTING');

    // Cast votes
    expect(engine.castVote('hash_user_1', 'A')).toBe(true);
    expect(engine.castVote('hash_user_2', 'B')).toBe(true);
    expect(engine.castVote('hash_user_3', 'A')).toBe(true);

    // Duplicate vote should be rejected
    expect(engine.castVote('hash_user_1', 'B')).toBe(false);

    expect(engine.getVotes()).toEqual({
      votesA: 2,
      votesB: 1,
      totalVotes: 3,
      uniqueVoters: 3,
    });

    // VOTING -> AWAITING_STREAMER
    now += 2000;
    engine.tick(now);
    expect(engine.getState()).toBe('AWAITING_STREAMER');

    // Streamer approves majority decision (Option A has 2 votes vs 1)
    expect(engine.handleStreamerAction({ action: 'APPROVE' }, now)).toBe(true);
    expect(engine.getState()).toBe('RESULT');
    expect(engine.getSelectedOption()).toBe('A');

    // RESULT -> COOLDOWN
    now += 1000;
    engine.tick(now);
    expect(engine.getState()).toBe('COOLDOWN');

    // COOLDOWN -> IDLE
    now += 1000;
    engine.tick(now);
    expect(engine.getState()).toBe('IDLE');
  });

  it('enforces one-vote-per-user invariant and ignores late votes', () => {
    let now = 2000000;
    const engine = new RaidRitualEngine({
      id: 'test-vote-invariant',
      raidEvent: SAMPLE_SIMULATED_RAID,
      config: CHAMPIONSHIP_CONFIG,
      durations: { ...DEFAULT_DURATIONS, landingDurationMs: 100, contextDurationMs: 100 },
      now,
    });

    // Cannot vote during LANDING
    expect(engine.castVote('voter_1', 'A')).toBe(false);

    // Advance to VOTING
    now += 200;
    engine.tick(now);
    expect(engine.getState()).toBe('VOTING');

    // First vote accepted
    expect(engine.castVote('voter_1', 'A')).toBe(true);
    // Duplicate vote rejected
    expect(engine.castVote('voter_1', 'A')).toBe(false);
    expect(engine.castVote('voter_1', 'B')).toBe(false);

    // Second voter
    expect(engine.castVote('voter_2', 'B')).toBe(true);

    // Override by streamer
    expect(engine.handleStreamerAction({ action: 'OVERRIDE', overrideChoice: 'B' }, now)).toBe(true);
    expect(engine.getState()).toBe('RESULT');
    expect(engine.getSelectedOption()).toBe('B');

    // Cannot vote after voting concluded
    expect(engine.castVote('voter_3', 'A')).toBe(false);
  });

  it('handles panic clear from every active state', () => {
    const statesToTest: Array<'LANDING' | 'CONTEXT' | 'VOTING' | 'AWAITING_STREAMER' | 'RESULT'> = [
      'LANDING',
      'CONTEXT',
      'VOTING',
      'AWAITING_STREAMER',
      'RESULT',
    ];

    for (const targetState of statesToTest) {
      let now = 3000000;
      const engine = new RaidRitualEngine({
        id: `test-clear-${targetState}`,
        raidEvent: SAMPLE_SIMULATED_RAID,
        config: CHAMPIONSHIP_CONFIG,
        durations: {
          landingDurationMs: 100,
          contextDurationMs: 100,
          votingDurationMs: 100,
          awaitingStreamerDurationMs: 100,
          resultDurationMs: 100,
          cooldownDurationMs: 100,
        },
        now,
      });

      if (targetState === 'CONTEXT') {
        now += 100;
        engine.tick(now);
      } else if (targetState === 'VOTING') {
        now += 200;
        engine.tick(now);
      } else if (targetState === 'AWAITING_STREAMER') {
        now += 300;
        engine.tick(now);
      } else if (targetState === 'RESULT') {
        now += 300;
        engine.tick(now);
        engine.handleStreamerAction({ action: 'APPROVE' }, now);
      }

      expect(engine.getState()).toBe(targetState);
      // Trigger panic CLEAR
      expect(engine.handleStreamerAction({ action: 'CLEAR' }, now)).toBe(true);
      expect(engine.getState()).toBe('CLEARED');

      // Ticking moves CLEARED -> COOLDOWN -> IDLE
      now += 2000;
      engine.tick(now);
      expect(engine.getState()).toBe('COOLDOWN');
      now += 100;
      engine.tick(now);
      expect(engine.getState()).toBe('IDLE');
    }
  });

  it('auto-approves when configured without stopping in AWAITING_STREAMER', () => {
    let now = 4000000;
    const engine = new RaidRitualEngine({
      id: 'test-auto-approve',
      raidEvent: SAMPLE_SIMULATED_RAID,
      config: { ...CHAMPIONSHIP_CONFIG, autoApprove: true },
      durations: { landingDurationMs: 100, contextDurationMs: 100, votingDurationMs: 100, cooldownDurationMs: 100, resultDurationMs: 100, awaitingStreamerDurationMs: 100 },
      now,
    });

    now += 200; // Land + Context
    engine.tick(now);
    expect(engine.getState()).toBe('VOTING');
    engine.castVote('v1', 'B');
    engine.castVote('v2', 'B');

    now += 100; // End of voting
    engine.tick(now);

    // Skips awaiting streamer, resolves B as winner directly into RESULT
    expect(engine.getState()).toBe('RESULT');
    expect(engine.getSelectedOption()).toBe('B');
  });

  it('expires without committing result when autoApprove is false and approval times out', () => {
    let now = 6000000;
    const engine = new RaidRitualEngine({
      id: 'test-approval-timeout',
      raidEvent: SAMPLE_SIMULATED_RAID,
      config: { ...CHAMPIONSHIP_CONFIG, autoApprove: false },
      durations: {
        landingDurationMs: 100,
        contextDurationMs: 100,
        votingDurationMs: 100,
        awaitingStreamerDurationMs: 200,
        resultDurationMs: 100,
        cooldownDurationMs: 100,
      },
      now,
    });

    now += 200; // Into voting
    engine.tick(now);
    expect(engine.getState()).toBe('VOTING');
    engine.castVote('v1', 'A');

    now += 100; // Into awaiting streamer
    engine.tick(now);
    expect(engine.getState()).toBe('AWAITING_STREAMER');

    // Streamer does NOT approve; timeout occurs
    now += 200;
    engine.tick(now);

    // Transitions to SKIPPED with EXPIRED selectedOption, not RESULT
    expect(engine.getState()).toBe('SKIPPED');
    expect(engine.getSelectedOption()).toBe('EXPIRED');
  });

  it('breaks ties deterministically in favor of Option A', () => {
    let now = 5000000;
    const engine = new RaidRitualEngine({
      id: 'test-tie-break',
      raidEvent: SAMPLE_SIMULATED_RAID,
      config: CHAMPIONSHIP_CONFIG,
      durations: { landingDurationMs: 10, contextDurationMs: 10, votingDurationMs: 10, awaitingStreamerDurationMs: 10, resultDurationMs: 10, cooldownDurationMs: 10 },
      now,
    });

    now += 20;
    engine.tick(now);
    expect(engine.getState()).toBe('VOTING');

    engine.castVote('user_1', 'A');
    engine.castVote('user_2', 'B');

    now += 10;
    engine.tick(now);
    expect(engine.getState()).toBe('AWAITING_STREAMER');

    engine.handleStreamerAction({ action: 'APPROVE' }, now);
    expect(engine.getState()).toBe('RESULT');
    expect(engine.getSelectedOption()).toBe('A'); // Tie breaker
  });
});

describe('Sanitization & Command Parsing', () => {
  it('parses !relay A and !relay B with case-insensitivity and whitespace tolerance', () => {
    expect(parseVoteCommand('!relay A')).toBe('A');
    expect(parseVoteCommand('!relay a')).toBe('A');
    expect(parseVoteCommand('!relay B')).toBe('B');
    expect(parseVoteCommand('!relay b')).toBe('B');
    expect(parseVoteCommand('  !relay   a  ')).toBe('A');
    expect(parseVoteCommand('!RELAY B')).toBe('B');
  });

  it('rejects malformed commands, free-form text, and injections', () => {
    expect(parseVoteCommand('!relay')).toBeNull();
    expect(parseVoteCommand('!relay C')).toBeNull();
    expect(parseVoteCommand('!relay AB')).toBeNull();
    expect(parseVoteCommand('!relay A and also hello')).toBeNull();
    expect(parseVoteCommand('!relay <script>alert(1)</script>')).toBeNull();
    expect(parseVoteCommand('hello world')).toBeNull();
    expect(parseVoteCommand('')).toBeNull();
  });

  it('escapes HTML entities safely', () => {
    const raw = '<script>alert("pwned" & \'xss\')</script>';
    const escaped = escapeHtml(raw);
    expect(escaped).toBe('&lt;script&gt;alert(&quot;pwned&quot; &amp; &#39;xss&#39;)&lt;/script&gt;');
    expect(escaped.includes('<')).toBe(false);
    expect(escaped.includes('>')).toBe(false);
  });

  it('sanitizes and bounds text to max length and removes control characters', () => {
    const dirty = 'Hello\x00\x1F World!   Extra   spaces.   ';
    expect(sanitizeText(dirty, 15)).toBe('Hello World! Ex');
  });
});

describe('Cryptographic Utilities & Voter Privacy', () => {
  const SALT = 'test-secret-salt-1234567890abcdef';

  it('derives consistent voter hash without storing raw Twitch ID', () => {
    const hash1 = hashVoterId('twitch_user_42', SALT);
    const hash2 = hashVoterId('twitch_user_42', SALT);
    const hashOther = hashVoterId('twitch_user_43', SALT);

    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashOther);
  });

  it('generates valid 32-character hex channel keys', () => {
    const key1 = generateChannelKey();
    const key2 = generateChannelKey();
    expect(key1).toHaveLength(32);
    expect(key1).not.toBe(key2);
  });

  it('signs and verifies tamper-evident participation receipts', () => {
    const receiptData = {
      ritualId: '3f044d18-bf11-46bb-8e31-29177a4eb101',
      sourceMode: 'SIMULATED',
      winner: 'A',
      votesA: 12,
      votesB: 8,
      completedAt: '2026-11-02T12:00:00.000Z',
    };

    const signature = signReceipt(receiptData, SALT);
    expect(signature).toHaveLength(64);

    // Valid verification
    expect(verifyReceipt(receiptData, signature, SALT)).toBe(true);

    // Tampered data should fail verification
    const tamperedData = { ...receiptData, votesA: 13 };
    expect(verifyReceipt(tamperedData, signature, SALT)).toBe(false);

    // Invalid signature should fail
    expect(verifyReceipt(receiptData, 'invalid_signature', SALT)).toBe(false);
  });
});

