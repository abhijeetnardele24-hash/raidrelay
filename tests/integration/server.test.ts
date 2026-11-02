import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../apps/server/src/app.js';
import { EventGuard } from '../../apps/server/src/twitch/guard.js';
import { sessionManager } from '../../apps/server/src/auth/session.js';
import { SAMPLE_SIMULATED_RAID, buildSampleChatMessage } from '@raidrelay/fixtures';

describe('RaidRelay Server API & Integration', () => {
  let app: FastifyInstance;
  let authCookie: string;
  const mockBroadcasterId = '123456789';

  beforeAll(async () => {
    const built = await buildApp({ databasePath: ':memory:' });
    app = built.app;
    await app.ready();

    // Create authenticated broadcaster session for tests
    const { sessionToken } = sessionManager.createSession(mockBroadcasterId, 'robocrafter', 'RoboCrafterLive');
    authCookie = `raidrelay_session=${sessionToken}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health returns valid health and truthful codex session id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.codexSessionId).toBe('93a16a2b-a2a0-461f-851b-7a1e342fe97f');
    expect(body.version).toBe('1.0.0');
    expect(body.sourceMode).toBe('SIMULATED');
    expect(body.eventSubStatus).toBeDefined();
  });

  it('GET /api/meta returns truthful project thesis and evidence boundaries', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/meta',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.project).toBe('RaidRelay');
    expect(body.thesis).toContain('A raid is not an alert; it is a community handoff');
    expect(body.evidenceModes.LIVE_TWITCH).toBeDefined();
    expect(body.evidenceModes.SIMULATED).toBeDefined();
  });

  it('GET /api/config returns default championship configuration', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/config',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.displayName).toBe('RoboCrafterLive');
    expect(body.activity).toBe('Building a tiny robot live');
    expect(body.optionA).toBe('Drive the next test with only the left sensor');
    expect(body.optionB).toBe('Give the robot a 20-second victory dance first');
  });

  it('PUT /api/config rejects unauthenticated caller with HTTP 401', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config',
      payload: {
        activity: 'Hacked activity',
        goal: 'Hacked goal',
        communityNorm: 'Trolling',
        optionA: 'Opt A',
        optionB: 'Opt B',
      },
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('UNAUTHORIZED');
  });

  it('PUT /api/config updates broadcaster configuration when authenticated', async () => {
    const updatePayload = {
      activity: 'Live Generative Art Challenge',
      goal: 'Reach 100 generative frames before sunset',
      communityNorm: 'Positive vibes, open critique',
      optionA: 'Add cyberpunk neon palette',
      optionB: 'Add watercolor pastel palette',
      autoApprove: true,
    };

    const res = await app.inject({
      method: 'PUT',
      url: '/api/config',
      headers: { cookie: authCookie },
      payload: updatePayload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.activity).toBe('Live Generative Art Challenge');
    expect(body.autoApprove).toBe(true);

    // Verify persisted
    const checkRes = await app.inject({ method: 'GET', url: '/api/config' });
    expect(JSON.parse(checkRes.body).activity).toBe('Live Generative Art Challenge');
  });

  it('POST /api/config/rotate-key rotates channel capability key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/config/rotate-key',
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(typeof body.channelKey).toBe('string');
    expect(body.channelKey.length).toBe(32);
  });

  it('POST /api/demo/run triggers simulated raid and updates current snapshot', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/demo/run',
      payload: { speedMultiplier: 10 },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.sourceMode).toBe('SIMULATED');
    expect(body.snapshot.state).toBe('LANDING');

    // GET /api/ritual/current confirms active ritual
    const curRes = await app.inject({ method: 'GET', url: '/api/ritual/current' });
    expect(curRes.statusCode).toBe(200);
    const curBody = JSON.parse(curRes.body);
    expect(curBody.active).toBe(true);
    expect(curBody.ritual.sourceMode).toBe('SIMULATED');
  });

  it('POST /api/ritual/clear clears active ritual back to IDLE with auth or demo bypass', async () => {
    // Demo header bypass for judge demo testing
    const res = await app.inject({
      method: 'POST',
      url: '/api/ritual/clear',
      headers: { 'x-raidrelay-demo-mode': 'true' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.snapshot.state).toBe('CLEARED');
  });

  it('POST /api/demo/reset resets to clean IDLE state', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/demo/reset',
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);

    const cur = await app.inject({ method: 'GET', url: '/api/ritual/current' });
    expect(JSON.parse(cur.body).active).toBe(false);
  });

  it('POST /api/data/delete-local purges data when authenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/data/delete-local',
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });

  it('GET /auth/twitch/callback rejects missing state or state mismatch with HTTP 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/twitch/callback?code=mock_code&state=invalid_state',
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe('CSRF_STATE_MISMATCH');
  });

  it('rejects state-changing requests from untrusted origins (CSRF protection)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/data/delete-local',
      headers: {
        cookie: authCookie,
        origin: 'http://malicious-attacker-site.com',
      },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe('CSRF_REJECTED');
  });
});

describe('EventGuard Deduplication, Freshness & Future Skew', () => {
  it('deduplicates events by messageId and rejects duplicates', async () => {
    const { db } = await buildApp({ databasePath: ':memory:' });
    const guard = new EventGuard(db);

    const raidEvent = { ...SAMPLE_SIMULATED_RAID, messageId: 'unique-msg-id-1234' };

    // First time should pass
    const res1 = guard.validateRaidEvent(raidEvent);
    expect(res1.valid).toBe(true);

    // Duplicate messageId should be rejected
    const res2 = guard.validateRaidEvent(raidEvent);
    expect(res2.valid).toBe(false);
    expect(res2.reason).toContain('Duplicate event rejected');

    db.close();
  });

  it('rejects stale events older than tolerance window', async () => {
    const { db } = await buildApp({ databasePath: ':memory:' });
    const guard = new EventGuard(db, 60000); // 1 minute max age

    const oldDate = new Date(Date.now() - 120000).toISOString(); // 2 minutes old
    const staleChat = buildSampleChatMessage('u999', 'slow_pete', 'SlowPete', '!relay A');
    staleChat.timestamp = oldDate;
    staleChat.messageId = 'stale-msg-456';

    const res = guard.validateChatMessageEvent(staleChat);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Stale message rejected');

    db.close();
  });

  it('rejects future-skewed events dated > 60 seconds into future', async () => {
    const { db } = await buildApp({ databasePath: ':memory:' });
    const guard = new EventGuard(db, 600000, 60000); // 10 min max stale, 60s max future skew

    const futureDate = new Date(Date.now() + 120000).toISOString(); // 2 minutes in the future
    const futureRaid = { ...SAMPLE_SIMULATED_RAID, messageId: 'future-msg-789', timestamp: futureDate };

    const res = guard.validateRaidEvent(futureRaid);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Future-dated event rejected');

    db.close();
  });
});
