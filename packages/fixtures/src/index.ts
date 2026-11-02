import type { BroadcasterConfig, RaidEvent, ChatMessageEvent } from '@raidrelay/contracts';

/**
 * Official Hackathon Championship Scenario from Section 6.7 of PROJECT_BLUEPRINT.md
 */
export const CHAMPIONSHIP_CONFIG: BroadcasterConfig = {
  broadcasterId: '123456789',
  displayName: 'RoboCrafterLive',
  activity: 'Building a tiny robot live',
  goal: 'Make it cross the finish line before the stream ends',
  communityNorm: 'Helpful chaos, no spoilers',
  optionA: 'Drive the next test with only the left sensor',
  optionB: 'Give the robot a 20-second victory dance first',
  autoApprove: false,
  channelKey: 'demo-channel-key-12345',
  updatedAt: new Date('2026-11-02T10:00:00Z').toISOString(),
};

/**
 * Simulated incoming raid from ArtisanAlex with 142 incoming viewers
 */
export const SAMPLE_SIMULATED_RAID: RaidEvent = {
  fromBroadcasterId: '987654321',
  fromBroadcasterLogin: 'artisan_alex',
  fromBroadcasterName: 'ArtisanAlex',
  toBroadcasterId: '123456789',
  toBroadcasterLogin: 'robocrafterlive',
  toBroadcasterName: 'RoboCrafterLive',
  viewers: 142,
  messageId: 'msg-raid-simulated-001',
  timestamp: new Date().toISOString(),
  sourceMode: 'SIMULATED',
};

/**
 * Deterministic chat sequence of simulated votes
 */
export const SAMPLE_CHAT_VOTES: Array<{
  userId: string;
  login: string;
  name: string;
  messageText: string;
  expectedChoice: 'A' | 'B' | null;
}> = [
  { userId: 'u101', login: 'pixel_pioneer', name: 'PixelPioneer', messageText: '!relay A', expectedChoice: 'A' },
  { userId: 'u102', login: 'circuit_samurai', name: 'CircuitSamurai', messageText: '!relay B', expectedChoice: 'B' },
  { userId: 'u103', login: 'aero_mechanic', name: 'AeroMechanic', messageText: '!relay a', expectedChoice: 'A' },
  { userId: 'u104', login: 'robo_fanatic', name: 'RoboFanatic', messageText: '!relay A', expectedChoice: 'A' },
  { userId: 'u105', login: 'glitch_witch', name: 'GlitchWitch', messageText: '!relay b', expectedChoice: 'B' },
  { userId: 'u106', login: 'regular_sam', name: 'RegularSam', messageText: '!relay A', expectedChoice: 'A' },
  // Duplicate vote attempt: should be ignored by engine
  { userId: 'u101', login: 'pixel_pioneer', name: 'PixelPioneer', messageText: '!relay B', expectedChoice: 'B' },
  // Non-vote chatter: should be ignored by engine
  { userId: 'u107', login: 'lurker_dan', name: 'LurkerDan', messageText: 'HYPE RAID!! Welcome everyone!', expectedChoice: null },
];

/**
 * Helper to build ChatMessageEvent object
 */
export function buildSampleChatMessage(
  userId: string,
  login: string,
  name: string,
  messageText: string,
  index = 0
): ChatMessageEvent {
  return {
    broadcasterUserId: '123456789',
    chatterUserId: userId,
    chatterUserLogin: login,
    chatterUserName: name,
    messageId: `msg-chat-sim-${Date.now()}-${index}`,
    messageText,
    timestamp: new Date().toISOString(),
    sourceMode: 'SIMULATED',
  };
}

