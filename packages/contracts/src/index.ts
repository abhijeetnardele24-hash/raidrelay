import { z } from 'zod';

export const SourceModeSchema = z.enum(['LIVE_TWITCH', 'SIMULATED']);
export type SourceMode = z.infer<typeof SourceModeSchema>;

export const RitualStateSchema = z.enum([
  'IDLE',
  'LANDING',
  'CONTEXT',
  'VOTING',
  'AWAITING_STREAMER',
  'RESULT',
  'COOLDOWN',
  'SKIPPED',
  'CLEARED',
]);
export type RitualState = z.infer<typeof RitualStateSchema>;

export const BroadcasterConfigSchema = z.object({
  broadcasterId: z.string().min(1),
  displayName: z.string().min(1).max(50),
  activity: z.string().min(1).max(80),
  goal: z.string().min(1).max(100),
  communityNorm: z.string().min(1).max(100),
  optionA: z.string().min(1).max(80),
  optionB: z.string().min(1).max(80),
  autoApprove: z.boolean().default(false),
  channelKey: z.string().min(8),
  updatedAt: z.string().datetime(),
});
export type BroadcasterConfig = z.infer<typeof BroadcasterConfigSchema>;

export const PublicBroadcasterConfigSchema = BroadcasterConfigSchema.omit({ channelKey: true });
export type PublicBroadcasterConfig = z.infer<typeof PublicBroadcasterConfigSchema>;

export const UpdateBroadcasterConfigSchema = z.object({
  activity: z.string().min(1).max(80),
  goal: z.string().min(1).max(100),
  communityNorm: z.string().min(1).max(100),
  optionA: z.string().min(1).max(80),
  optionB: z.string().min(1).max(80),
  autoApprove: z.boolean().optional(),
});
export type UpdateBroadcasterConfigInput = z.infer<typeof UpdateBroadcasterConfigSchema>;

export const RaidEventSchema = z.object({
  fromBroadcasterId: z.string().min(1),
  fromBroadcasterLogin: z.string().min(1),
  fromBroadcasterName: z.string().min(1),
  toBroadcasterId: z.string().min(1),
  toBroadcasterLogin: z.string().min(1),
  toBroadcasterName: z.string().min(1),
  viewers: z.number().int().nonnegative(),
  messageId: z.string().min(1),
  timestamp: z.string().datetime(),
  sourceMode: SourceModeSchema,
});
export type RaidEvent = z.infer<typeof RaidEventSchema>;

export const ChatMessageEventSchema = z.object({
  broadcasterUserId: z.string().min(1),
  chatterUserId: z.string().min(1),
  chatterUserLogin: z.string().min(1),
  chatterUserName: z.string().min(1),
  messageId: z.string().min(1),
  messageText: z.string().min(1).max(500),
  timestamp: z.string().datetime(),
  sourceMode: SourceModeSchema,
});
export type ChatMessageEvent = z.infer<typeof ChatMessageEventSchema>;

export const VoteChoiceSchema = z.enum(['A', 'B']);
export type VoteChoice = z.infer<typeof VoteChoiceSchema>;

export const StreamerActionSchema = z.object({
  action: z.enum(['APPROVE', 'OVERRIDE', 'SKIP', 'CLEAR']),
  overrideChoice: VoteChoiceSchema.optional(),
});
export type StreamerAction = z.infer<typeof StreamerActionSchema>;

export const RitualSnapshotSchema = z.object({
  id: z.string().uuid(),
  twitchMessageId: z.string().nullable(),
  sourceMode: SourceModeSchema,
  state: RitualStateSchema,
  raiderUserId: z.string().nullable(),
  raiderDisplayName: z.string(),
  viewerCount: z.number().int().nonnegative(),
  activity: z.string(),
  goal: z.string(),
  communityNorm: z.string(),
  optionA: z.string(),
  optionB: z.string(),
  votesA: z.number().int().nonnegative(),
  votesB: z.number().int().nonnegative(),
  totalVotes: z.number().int().nonnegative(),
  selectedOption: z.enum(['A', 'B', 'SKIP', 'EXPIRED']).nullable(),
  timeRemainingMs: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  sequenceNumber: z.number().int().nonnegative(),
});
export type RitualSnapshot = z.infer<typeof RitualSnapshotSchema>;

export const ParticipationReceiptSchema = z.object({
  ritualId: z.string().uuid(),
  sourceMode: SourceModeSchema,
  raiderDisplayName: z.string(),
  viewerCount: z.number().int().nonnegative(),
  uniqueVoters: z.number().int().nonnegative(),
  winner: z.enum(['A', 'B', 'TIED', 'SKIPPED', 'CLEARED']),
  winnerOptionText: z.string(),
  votesA: z.number().int().nonnegative(),
  votesB: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  hmacSignature: z.string(),
});
export type ParticipationReceipt = z.infer<typeof ParticipationReceiptSchema>;

export const HealthStatusSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  uptime: z.number(),
  timestamp: z.string().datetime(),
  sourceMode: SourceModeSchema,
  twitchConnected: z.boolean(),
  twitchUser: z.string().nullable(),
  eventSubStatus: z.enum(['DISCONNECTED', 'CONNECTING', 'CONNECTED', 'RECONNECTING']),
  subscriptions: z.array(z.string()),
  activeRitualId: z.string().nullable(),
  codexSessionId: z.string(),
});
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

