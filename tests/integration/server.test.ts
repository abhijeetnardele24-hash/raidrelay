import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

import { buildApp } from '../../apps/server/src/app.js';
import { EventGuard } from '../../apps/server/src/twitch/guard.js';
import { sessionManager } from '../../apps/server/src/auth/session.js';
import { RealtimeHub } from '../../apps/server/src/realtime/hub.js';
import { CHAMPIONSHIP_CONFIG, SAMPLE_SIMULATED_RAID, buildSampleChatMessage } from '@raidrelay/fixtures';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('RaidRelay Server API & Security Architecture', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let demoChannelKey: string;
  const mockBroadcasterId = '123456789';

  beforeAll(async () => {
    const built = await buildApp({ databasePath: ':memory:' });
    app = built.app;
    demoChannelKey = built.getDemoChannelKey();
    await app.ready();

    // Create authenticated broadcaster session for tests
    const { sessionToken } = sessionManager.createSession(
      mockBroadcasterId,
      'robocrafter',
      'RoboCrafterLive'
    );
    authCookie = `raidrelay_session=${sessionToken}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health returns valid health and matches configured evidence manifest', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');

    // Requirement 6: Verify identity matches configured evidence manifest rather than ambient env var
    const manifestPath = path.resolve(__dirname, '../../docs/evidence-index.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(body.codexSessionId).toBe(manifest.codexSessionId);
    } else {
      expect(typeof body.codexSessionId).toBe('string');
      expect(body.codexSessionId.length).toBeGreaterThan(10);
    }

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

  // Requirement 2: Public configuration DTO must NOT leak overlay capability
  it('GET /api/config returns public display data without channelKey', async () => {
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

    // CRITICAL: Public DTO must not leak the capability key!
    expect(body.channelKey).toBeUndefined();
  });

  // Requirement 2: Private endpoints return channelKey ONLY when authenticated
  it('GET /api/config/private and /api/overlay-capability require authentication and return capability', async () => {
    // Unauthenticated access must fail
    const unauthRes = await app.inject({ method: 'GET', url: '/api/config/private' });
    expect(unauthRes.statusCode).toBe(401);

    const unauthCap = await app.inject({ method: 'GET', url: '/api/overlay-capability' });
    expect(unauthCap.statusCode).toBe(401);

    // Authenticated access succeeds and returns channelKey
    const authRes = await app.inject({
      method: 'GET',
      url: '/api/config/private',
      headers: { cookie: authCookie },
    });
    expect(authRes.statusCode).toBe(200);
    const authBody = JSON.parse(authRes.body);
    expect(authBody.channelKey).toBeDefined();
    expect(typeof authBody.channelKey).toBe('string');
    expect(authBody.channelKey.length).toBeGreaterThanOrEqual(16);

    const authCap = await app.inject({
      method: 'GET',
      url: '/api/overlay-capability',
      headers: { cookie: authCookie },
    });
    expect(authCap.statusCode).toBe(200);
    expect(JSON.parse(authCap.body).channelKey).toBe(authBody.channelKey);
  });

  // Requirement 1: Rigorous regression test proving x-raidrelay-demo-mode CANNOT bypass auth
  it('rejects unauthenticated requests on all protected routes even with x-raidrelay-demo-mode header', async () => {
    const demoBypassHeader = { 'x-raidrelay-demo-mode': 'true' };

    const protectedEndpoints = [
      { method: 'PUT', url: '/api/config', payload: { activity: 'Hacked' } },
      { method: 'POST', url: '/api/config/rotate-key' },
      { method: 'GET', url: '/api/config/private' },
      { method: 'GET', url: '/api/overlay-capability' },
      { method: 'POST', url: '/api/ritual/mock-id/approve' },
      { method: 'POST', url: '/api/ritual/mock-id/override', payload: { overrideChoice: 'A' } },
      { method: 'POST', url: '/api/ritual/mock-id/skip' },
      { method: 'POST', url: '/api/ritual/clear' },
      { method: 'POST', url: '/api/data/delete-local' },
      { method: 'POST', url: '/api/auth/disconnect' },
    ];

    for (const endpoint of protectedEndpoints) {
      const res = await app.inject({
        method: endpoint.method as 'GET' | 'POST' | 'PUT',
        url: endpoint.url,
        headers: demoBypassHeader,
        payload: endpoint.payload,
      });

      // Must strictly return 401 Unauthorized or 403 Forbidden
      expect(
        [401, 403].includes(res.statusCode),
        `Endpoint ${endpoint.method} ${endpoint.url} allowed bypass with status ${res.statusCode}`
      ).toBe(true);
      const resJson = JSON.parse(res.body);
      expect(['UNAUTHORIZED', 'CSRF_REJECTED']).toContain(resJson.error);
    }
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

    const checkRes = await app.inject({ method: 'GET', url: '/api/config' });
    expect(JSON.parse(checkRes.body).activity).toBe('Live Generative Art Challenge');
  });

  it('POST /api/config/rotate-key rotates channel capability key for authenticated broadcaster', async () => {
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

  // Dedicated Demo Lab endpoints
  it('POST /api/demo/run triggers simulated raid in isolated demo namespace', async () => {
    // Demo capability endpoint returns dedicated ephemeral demo key
    const capRes = await app.inject({ method: 'GET', url: '/api/demo/capability' });
    expect(capRes.statusCode).toBe(200);
    expect(JSON.parse(capRes.body).channelKey).toBe(demoChannelKey);

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

    // Demo ritual query returns active demo snapshot
    const curRes = await app.inject({ method: 'GET', url: '/api/demo/ritual/current' });
    expect(curRes.statusCode).toBe(200);
    const curBody = JSON.parse(curRes.body);
    expect(curBody.active).toBe(true);
    expect(curBody.ritual.sourceMode).toBe('SIMULATED');

    // Live ritual route must NOT be affected
    const liveRes = await app.inject({ method: 'GET', url: '/api/ritual/current' });
    expect(JSON.parse(liveRes.body).active).toBe(false);
  });

  it('POST /api/demo/ritual/clear clears demo ritual without requiring broadcaster auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/demo/ritual/clear',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    const cur = await app.inject({ method: 'GET', url: '/api/demo/ritual/current' });
    expect(JSON.parse(cur.body).active).toBe(false);
  });

  it('POST /api/demo/reset resets demo lab to clean IDLE state', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/demo/reset',
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
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

// Requirement 3: Two-broadcaster isolation integration test proving zero cross-channel delivery
describe('Broadcaster Realtime Channel Isolation & Capability Validation', () => {
  let app: FastifyInstance;
  let hub: RealtimeHub;
  let serverPort: number;
  let keyA: string;
  let keyB: string;
  const broadcasterA = 'broadcaster_alice_111';
  const broadcasterB = 'broadcaster_bob_222';

  beforeAll(async () => {
    const built = await buildApp({ databasePath: ':memory:' });
    app = built.app;
    hub = built.hub;

    keyA = 'key_alice_' + 'a'.repeat(22);
    keyB = 'key_bob___' + 'b'.repeat(22);

    // Save configurations for both broadcasters in DB
    built.db.saveConfig({
      ...CHAMPIONSHIP_CONFIG,
      broadcasterId: broadcasterA,
      displayName: 'AliceBroadcasting',
      channelKey: keyA,
      updatedAt: new Date().toISOString(),
    });

    built.db.saveConfig({
      ...CHAMPIONSHIP_CONFIG,
      broadcasterId: broadcasterB,
      displayName: 'BobStreaming',
      channelKey: keyB,
      updatedAt: new Date().toISOString(),
    });

    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    serverPort = typeof addr === 'object' && addr ? addr.port : 4000;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects WebSocket connection with missing or revoked capability key with code 4403', async () => {
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/realtime?channelKey=invalid_key_9999`);
      ws.on('close', (code) => {
        expect(code).toBe(4403);
        resolve();
      });
    });
  });

  it('enforces strict channel isolation: broadcasts to Broadcaster A are never received by Broadcaster B', async () => {
    const receivedA: Record<string, unknown>[] = [];
    const receivedB: Record<string, unknown>[] = [];

    const wsA = new WebSocket(`ws://127.0.0.1:${serverPort}/realtime?channelKey=${keyA}&isOverlay=true`);
    const wsB = new WebSocket(`ws://127.0.0.1:${serverPort}/realtime?channelKey=${keyB}&isOverlay=true`);

    wsA.on('message', (data) => receivedA.push(JSON.parse(data.toString())));
    wsB.on('message', (data) => receivedB.push(JSON.parse(data.toString())));

    await Promise.all([
      new Promise<void>((resolve) => wsA.on('open', () => resolve())),
      new Promise<void>((resolve) => wsB.on('open', () => resolve())),
    ]);

    // Construct mock snapshot targeted to Broadcaster A
    const snapshotA = {
      id: 'ritual-alice-001',
      twitchMessageId: 'msg-1',
      sourceMode: 'LIVE_TWITCH' as const,
      state: 'LANDING' as const,
      raiderUserId: 'raider_9',
      raiderDisplayName: 'FriendlyRaider',
      viewerCount: 250,
      activity: 'Alice Coding',
      goal: 'Finish feature',
      communityNorm: 'Be kind',
      optionA: 'Option 1',
      optionB: 'Option 2',
      votesA: 0,
      votesB: 0,
      totalVotes: 0,
      selectedOption: null,
      timeRemainingMs: 4000,
      startedAt: new Date().toISOString(),
      completedAt: null,
      sequenceNumber: 1,
    };

    // Broadcast explicitly to Broadcaster A
    hub.broadcastSnapshot(broadcasterA, snapshotA);

    // Wait for message delivery
    await new Promise((r) => setTimeout(r, 200));

    wsA.close();
    wsB.close();

    // Client A must have received the snapshot
    const clientAReceivedFromA = receivedA.filter((msg) => msg.data?.id === 'ritual-alice-001');
    expect(clientAReceivedFromA).toHaveLength(1);

    // Client B must have received zero snapshots belonging to Broadcaster A
    const clientBReceivedFromA = receivedB.filter((msg) => msg.data?.id === 'ritual-alice-001');
    expect(clientBReceivedFromA).toHaveLength(0);
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
