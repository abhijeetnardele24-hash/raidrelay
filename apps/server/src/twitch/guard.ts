import type { RaidEvent, ChatMessageEvent } from '@raidrelay/contracts';
import { RaidEventSchema, ChatMessageEventSchema } from '@raidrelay/contracts';
import type { DatabaseRepository } from '../db/index.js';

export interface GuardValidationResult<T> {
  valid: boolean;
  data?: T;
  reason?: string;
}

export class EventGuard {
  constructor(
    private db: DatabaseRepository,
    private maxStaleMs = 10 * 60 * 1000, // 10 minutes maximum age
    private maxFutureSkewMs = 60 * 1000 // 60 seconds maximum clock skew into the future
  ) {}

  public validateRaidEvent(raw: unknown): GuardValidationResult<RaidEvent> {
    const parseRes = RaidEventSchema.safeParse(raw);
    if (!parseRes.success) {
      return { valid: false, reason: `Schema error: ${parseRes.error.message}` };
    }

    const event = parseRes.data;

    // 1. Deduplication check
    if (this.db.isEventProcessed(event.messageId)) {
      return { valid: false, reason: `Duplicate event rejected: ${event.messageId}` };
    }

    // 2. Timestamp bounds check (stale or future skew)
    const eventTime = new Date(event.timestamp).getTime();
    const now = Date.now();
    if (now - eventTime > this.maxStaleMs) {
      return { valid: false, reason: `Stale event rejected (age > ${this.maxStaleMs / 1000}s)` };
    }
    if (eventTime - now > this.maxFutureSkewMs) {
      return { valid: false, reason: `Future-dated event rejected (future skew > ${this.maxFutureSkewMs / 1000}s)` };
    }

    // Mark processed
    this.db.markEventProcessed(event.messageId);
    return { valid: true, data: event };
  }

  public validateChatMessageEvent(raw: unknown): GuardValidationResult<ChatMessageEvent> {
    const parseRes = ChatMessageEventSchema.safeParse(raw);
    if (!parseRes.success) {
      return { valid: false, reason: `Schema error: ${parseRes.error.message}` };
    }

    const event = parseRes.data;

    // 1. Deduplication check
    if (this.db.isEventProcessed(event.messageId)) {
      return { valid: false, reason: `Duplicate message rejected: ${event.messageId}` };
    }

    // 2. Timestamp bounds check (stale or future skew)
    const eventTime = new Date(event.timestamp).getTime();
    const now = Date.now();
    if (now - eventTime > this.maxStaleMs) {
      return { valid: false, reason: `Stale message rejected` };
    }
    if (eventTime - now > this.maxFutureSkewMs) {
      return { valid: false, reason: `Future-dated message rejected` };
    }

    // Mark processed
    this.db.markEventProcessed(event.messageId);
    return { valid: true, data: event };
  }
}
