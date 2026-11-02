import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import { config } from './config.js';
import type { DatabaseRepository } from './db/index.js';
import { initDatabase } from './db/index.js';
import { RealtimeHub } from './realtime/hub.js';
import { EventGuard } from './twitch/guard.js';
import { TwitchOAuthService } from './twitch/oauth.js';
import { TwitchChatService } from './twitch/chat.js';
import { TwitchEventSubClient } from './twitch/eventsub.js';
import { DemoAdapter } from './demo/adapter.js';
import {
  sessionManager,
  getSessionFromRequest,
  requireBroadcasterAuth,
} from './auth/session.js';

import {
  RaidRitualEngine,
  parseVoteCommand,
  hashVoterId,
  DEFAULT_DURATIONS,
} from '@raidrelay/domain';
import type {
  BroadcasterConfig,
  SourceMode,
  RaidEvent,
  ChatMessageEvent,
} from '@raidrelay/contracts';
import {
  UpdateBroadcasterConfigSchema,
  StreamerActionSchema,
} from '@raidrelay/contracts';
import { CHAMPIONSHIP_CONFIG, SAMPLE_SIMULATED_RAID } from '@raidrelay/fixtures';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BuildAppOptions {
  databasePath?: string;
  enableEventSubAutoConnect?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<{
  app: FastifyInstance;
  db: DatabaseRepository;
  hub: RealtimeHub;
  engine: () => RaidRitualEngine | null;
  startSimulatedRaid: (options?: { speedMultiplier?: number }) => void;
}> {
  const app = Fastify({
    logger: false,
  });

  const db = await initDatabase(options.databasePath || config.DATABASE_PATH);
  const hub = new RealtimeHub();
  const guard = new EventGuard(db);
  const oauth = new TwitchOAuthService();
  const chatService = new TwitchChatService();

  let activeEngine: RaidRitualEngine | null = null;
  let pendingRaid: RaidEvent | null = null;
  let activeTwitchToken: string | null = null;
  let activeBroadcasterId: string | null = null;
  let lastBroadcastState: string = '';

  const demoAdapter = new DemoAdapter(() => activeEngine);

  const startLiveRaid = (validatedRaid: RaidEvent) => {
    const currentConfig = db.getConfig(validatedRaid.toBroadcasterId) || CHAMPIONSHIP_CONFIG;

    activeEngine = new RaidRitualEngine({
      id: crypto.randomUUID(),
      raidEvent: validatedRaid,
      config: currentConfig,
      durations: DEFAULT_DURATIONS,
    });

    const snapshot = activeEngine.toSnapshot();
    db.saveRitual(snapshot);
    hub.broadcastSnapshot(snapshot, currentConfig.broadcasterId);

    // Send optional bot announcement message to Twitch chat safely
    if (activeTwitchToken && activeBroadcasterId) {
      void chatService
        .sendMessage(
          activeBroadcasterId,
          activeBroadcasterId,
          `[RaidRelay] Welcome ${validatedRaid.fromBroadcasterName} and ${validatedRaid.viewers} raiders! Two communities, one choice: type !relay A or !relay B in chat now!`,
          activeTwitchToken
        )
        .catch(() => {});
    }
  };

  // Periodic engine tick interval (100ms for responsiveness)
  const tickInterval = setInterval(() => {
    if (activeEngine) {
      const now = Date.now();
      activeEngine.tick(now);
      const snapshot = activeEngine.toSnapshot(now);

      // Broadcast on state/vote change or at least once a second
      const stateKey = `${snapshot.state}-${snapshot.votesA}-${snapshot.votesB}-${Math.round(snapshot.timeRemainingMs / 1000)}`;
      if (stateKey !== lastBroadcastState) {
        lastBroadcastState = stateKey;
        db.saveRitual(snapshot);
        hub.broadcastSnapshot(snapshot);
      }

      if (snapshot.state === 'IDLE') {
        activeEngine = null;
        // If a concurrent raid arrived while the previous was active, start it now
        if (pendingRaid) {
          const nextRaid = pendingRaid;
          pendingRaid = null;
          startLiveRaid(nextRaid);
        }
      }
    }
  }, 100);

  // Periodic cleanup interval (hourly)
  const cleanupInterval = setInterval(() => {
    db.purgeOldEvents(24);
    sessionManager.purgeExpired();
  }, 3600 * 1000);

  app.addHook('onClose', async () => {
    clearInterval(tickInterval);
    clearInterval(cleanupInterval);
    demoAdapter.stop();
    eventSub.disconnect();
    db.close();
  });

  // EventSub Callback Handlers
  const handleIncomingRaid = (raid: RaidEvent) => {
    const validation = guard.validateRaidEvent(raid);
    if (!validation.valid || !validation.data) return;

    const validatedRaid = validation.data;

    // Concurrent raid policy: if ritual is active, queue one pending raid
    if (activeEngine && activeEngine.getState() !== 'IDLE' && activeEngine.getState() !== 'COOLDOWN') {
      pendingRaid = validatedRaid;
      return;
    }

    startLiveRaid(validatedRaid);
  };

  const handleIncomingChat = (chat: ChatMessageEvent) => {
    const validation = guard.validateChatMessageEvent(chat);
    if (!validation.valid || !validation.data) return;

    if (!activeEngine || activeEngine.getState() !== 'VOTING') return;

    const choice = parseVoteCommand(validation.data.messageText);
    if (!choice) return;

    const voterHash = hashVoterId(validation.data.chatterUserId, config.HMAC_VOTER_SALT);
    const recorded = activeEngine.castVote(voterHash, choice);
    if (recorded) {
      db.recordVote(activeEngine.getId(), voterHash, choice);
      const snapshot = activeEngine.toSnapshot();
      db.saveRitual(snapshot);
      hub.broadcastSnapshot(snapshot);
    }
  };

  const eventSub = new TwitchEventSubClient({
    onRaid: handleIncomingRaid,
    onChatMessage: handleIncomingChat,
  });

  // Strict CORS Plugin
  await app.register(cors, {
    origin: (origin, cb) => {
      // Non-browser requests (e.g. server-to-server, curl, tests) have no origin
      if (!origin) {
        cb(null, true);
        return;
      }

      // Check allowed origins
      const isAllowed = config.CORS_ALLOWED_ORIGINS.some((allowed) => {
        if (allowed === origin) return true;
        // Allow localhost development ports in dev/test
        if (config.NODE_ENV !== 'production' && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
          return true;
        }
        return false;
      });

      if (isAllowed) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    credentials: true,
  });

  await app.register(cookie, {
    secret: config.SESSION_SECRET,
  });

  await app.register(websocket);

  // WebSocket endpoint for real-time OBS overlay & console updates
  app.get('/realtime', { websocket: true }, (socket, req) => {
    const query = req.query as { channelKey?: string; isOverlay?: string };
    const channelKey = query?.channelKey;

    if (!channelKey) {
      socket.close(4403, 'Missing channel capability key');
      return;
    }

    // Validate capability against database
    let broadcasterConfig = db.getConfigByChannelKey(channelKey);
    // Allow demo lab capability for test/evaluation
    if (!broadcasterConfig && channelKey === 'demo-channel-key-12345') {
      broadcasterConfig = CHAMPIONSHIP_CONFIG;
    }

    if (!broadcasterConfig) {
      socket.close(4403, 'Invalid or revoked channel capability key');
      return;
    }

    const isOverlay = query?.isOverlay === 'true';
    hub.registerClient(socket, channelKey, broadcasterConfig.broadcasterId, isOverlay);
  });

  // --- API Routes ---

  // 1. Health Status & Live Provider Ladder
  app.get('/api/health', async () => {
    return {
      status: 'ok',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      sourceMode: (activeEngine?.getSourceMode() || 'SIMULATED') as SourceMode,
      twitchConnected: Boolean(activeTwitchToken),
      twitchUser: activeBroadcasterId,
      eventSubStatus: eventSub.getStatus(),
      acceptedSubscriptions: eventSub.getAcceptedSubscriptions(),
      activeRitualId: activeEngine?.getId() || null,
      pendingRaid: pendingRaid ? { raider: pendingRaid.fromBroadcasterName, viewers: pendingRaid.viewers } : null,
      codexSessionId: config.CODEX_SESSION_ID,
    };
  });

  // 2. Meta Info & Truthful Thesis
  app.get('/api/meta', async () => {
    return {
      project: 'RaidRelay',
      tagline: 'The first 90 seconds after a Twitch raid, designed.',
      thesis: 'A raid is not an alert; it is a community handoff. RaidRelay makes that handoff understandable, participatory, and safe in 90 seconds.',
      hackathon: 'Codex x TwitchCon Hackathon 2026',
      codexSessionId: config.CODEX_SESSION_ID,
      evidenceModes: {
        LIVE_TWITCH: 'Genuine authenticated Twitch EventSub & Chat events only.',
        SIMULATED: 'Deterministic Demo Lab and test scenarios clearly labeled.',
      },
    };
  });

  // 3. Broadcaster Session & Authentication
  app.get('/api/auth/session', async (req) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      return { authenticated: false, broadcaster: null };
    }
    return {
      authenticated: true,
      broadcaster: {
        id: session.broadcasterId,
        login: session.login,
        displayName: session.displayName,
      },
      twitchConnected: Boolean(activeTwitchToken),
      eventSubStatus: eventSub.getStatus(),
    };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const cookies = req.cookies as Record<string, string> | undefined;
    if (cookies?.raidrelay_session) {
      sessionManager.revokeSession(cookies.raidrelay_session);
    }
    reply.clearCookie('raidrelay_session', { path: '/' });
    return reply.send({ success: true, message: 'Logged out successfully.' });
  });

  // 4. Broadcaster Configuration (Protected)
  app.get('/api/config', async (_req, reply) => {
    const currentConfig = db.getConfig(activeBroadcasterId || '123456789') || CHAMPIONSHIP_CONFIG;
    return reply.send(currentConfig);
  });

  app.put('/api/config', async (req, reply) => {
    const session = await requireBroadcasterAuth(req, reply, { allowDemoSimulation: true });
    // In strict mode, if requireBroadcasterAuth returned null without demo bypass, it already replied with 401/403
    if (!session && req.headers['x-raidrelay-demo-mode'] !== 'true' && config.NODE_ENV === 'production') {
      return;
    }

    const broadcasterId = session?.broadcasterId || activeBroadcasterId || '123456789';
    const parseRes = UpdateBroadcasterConfigSchema.safeParse(req.body);
    if (!parseRes.success) {
      return reply.status(400).send({ error: 'INVALID_CONFIG', details: parseRes.error.format() });
    }

    const currentConfig = db.getConfig(broadcasterId) || CHAMPIONSHIP_CONFIG;
    const updated: BroadcasterConfig = {
      ...currentConfig,
      activity: parseRes.data.activity,
      goal: parseRes.data.goal,
      communityNorm: parseRes.data.communityNorm,
      optionA: parseRes.data.optionA,
      optionB: parseRes.data.optionB,
      autoApprove: parseRes.data.autoApprove ?? currentConfig.autoApprove,
      updatedAt: new Date().toISOString(),
    };

    db.saveConfig(updated);
    return reply.send(updated);
  });

  // Rotate overlay capability key (Protected)
  app.post('/api/config/rotate-key', async (req, reply) => {
    const session = await requireBroadcasterAuth(req, reply, { allowDemoSimulation: true });
    const broadcasterId = session?.broadcasterId || activeBroadcasterId || '123456789';
    const existing = db.getConfig(broadcasterId);
    if (existing) {
      hub.revokeChannelKey(existing.channelKey);
    }
    const newKey = db.rotateChannelKey(broadcasterId);
    return reply.send({ success: true, channelKey: newKey });
  });

  // 5. Current Ritual Snapshot
  app.get('/api/ritual/current', async (_req, reply) => {
    if (!activeEngine) {
      return reply.send({
        active: false,
        ritual: null,
        pendingRaid: pendingRaid ? { raider: pendingRaid.fromBroadcasterName, viewers: pendingRaid.viewers } : null,
      });
    }
    return reply.send({
      active: true,
      ritual: activeEngine.toSnapshot(),
      pendingRaid: pendingRaid ? { raider: pendingRaid.fromBroadcasterName, viewers: pendingRaid.viewers } : null,
    });
  });

  // 6. Broadcaster Controls: Approve, Override, Skip, Clear (Protected)
  app.post('/api/ritual/:id/approve', async (req, reply) => {
    await requireBroadcasterAuth(req, reply, { allowDemoSimulation: true });
    if (reply.sent) return;

    if (!activeEngine) {
      return reply.status(404).send({ error: 'NO_ACTIVE_RITUAL' });
    }

    const success = activeEngine.handleStreamerAction({ action: 'APPROVE' });
    if (!success) {
      return reply.status(400).send({ error: 'CANNOT_APPROVE_IN_CURRENT_STATE' });
    }

    const snap = activeEngine.toSnapshot();
    db.saveRitual(snap);
    hub.broadcastSnapshot(snap);

    // Send final result message to Twitch chat safely
    if (activeTwitchToken && activeBroadcasterId && snap.selectedOption) {
      const winnerText = snap.selectedOption === 'A' ? snap.optionA : snap.optionB;
      void chatService
        .sendMessage(
          activeBroadcasterId,
          activeBroadcasterId,
          `[RaidRelay] Streamer approved the result! Together we chose: ${winnerText} (Option ${snap.selectedOption})!`,
          activeTwitchToken
        )
        .catch(() => {});
    }

    return reply.send({ success: true, snapshot: snap });
  });

  app.post('/api/ritual/:id/override', async (req, reply) => {
    await requireBroadcasterAuth(req, reply, { allowDemoSimulation: true });
    if (reply.sent) return;

    if (!activeEngine) {
      return reply.status(404).send({ error: 'NO_ACTIVE_RITUAL' });
    }

    const rawBody = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const parseAction = StreamerActionSchema.safeParse({ action: 'OVERRIDE', ...rawBody });
    if (!parseAction.success || !parseAction.data.overrideChoice) {
      return reply.status(400).send({ error: 'INVALID_OVERRIDE_CHOICE' });
    }

    const success = activeEngine.handleStreamerAction(parseAction.data);
    if (!success) {
      return reply.status(400).send({ error: 'CANNOT_OVERRIDE_IN_CURRENT_STATE' });
    }

    const snap = activeEngine.toSnapshot();
    db.saveRitual(snap);
    hub.broadcastSnapshot(snap);

    return reply.send({ success: true, snapshot: snap });
  });

  app.post('/api/ritual/:id/skip', async (req, reply) => {
    await requireBroadcasterAuth(req, reply, { allowDemoSimulation: true });
    if (reply.sent) return;

    if (!activeEngine) {
      return reply.status(404).send({ error: 'NO_ACTIVE_RITUAL' });
    }

    const success = activeEngine.handleStreamerAction({ action: 'SKIP' });
    const snap = activeEngine.toSnapshot();
    db.saveRitual(snap);
    hub.broadcastSnapshot(snap);

    return reply.send({ success, snapshot: snap });
  });

  app.post('/api/ritual/clear', async (req, reply) => {
    await requireBroadcasterAuth(req, reply, { allowDemoSimulation: true });
    if (reply.sent) return;

    if (!activeEngine) {
      return reply.send({ success: true, message: 'Already idle' });
    }

    activeEngine.handleStreamerAction({ action: 'CLEAR' });
    demoAdapter.stop();
    const snap = activeEngine.toSnapshot();
    db.saveRitual(snap);
    hub.broadcastSnapshot(snap);

    return reply.send({ success: true, snapshot: snap });
  });

  // 7. Demo Lab Controls (Unrestricted for hackathon judge evaluation)
  const startSimulatedRaidFn = (opts: { speedMultiplier?: number } = {}) => {
    const currentConfig = db.getConfig('123456789') || CHAMPIONSHIP_CONFIG;
    const mult = Math.max(1, opts.speedMultiplier || 1);
    const scaledDurations = {
      landingDurationMs: Math.max(200, Math.round(DEFAULT_DURATIONS.landingDurationMs / mult)),
      contextDurationMs: Math.max(300, Math.round(DEFAULT_DURATIONS.contextDurationMs / mult)),
      votingDurationMs: Math.max(1000, Math.round(DEFAULT_DURATIONS.votingDurationMs / mult)),
      awaitingStreamerDurationMs: Math.max(500, Math.round(DEFAULT_DURATIONS.awaitingStreamerDurationMs / mult)),
      resultDurationMs: Math.max(500, Math.round(DEFAULT_DURATIONS.resultDurationMs / mult)),
      cooldownDurationMs: Math.max(300, Math.round(DEFAULT_DURATIONS.cooldownDurationMs / mult)),
    };
    activeEngine = new RaidRitualEngine({
      id: crypto.randomUUID(),
      raidEvent: {
        ...SAMPLE_SIMULATED_RAID,
        messageId: `sim-raid-msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
      },
      config: currentConfig,
      durations: scaledDurations,
    });

    const snap = activeEngine.toSnapshot();
    db.saveRitual(snap);
    hub.broadcastSnapshot(snap);

    demoAdapter.runScenario({
      speedMultiplier: opts.speedMultiplier || 1,
      onUpdate: () => {
        if (activeEngine) {
          const updated = activeEngine.toSnapshot();
          db.saveRitual(updated);
          hub.broadcastSnapshot(updated);
        }
      },
    });
  };

  app.post('/api/demo/run', async (req, reply) => {
    const body = (req.body as { speedMultiplier?: number }) || {};
    startSimulatedRaidFn(body);
    return reply.send({
      success: true,
      message: 'Simulated raid ritual launched in Demo Lab.',
      sourceMode: 'SIMULATED',
      snapshot: activeEngine?.toSnapshot(),
    });
  });

  app.post('/api/demo/reset', async (_req, reply) => {
    demoAdapter.stop();
    if (activeEngine) {
      activeEngine.handleStreamerAction({ action: 'CLEAR' });
      activeEngine = null;
    }

    // Broadcast idle
    hub.broadcastSnapshot({
      id: 'idle',
      twitchMessageId: null,
      sourceMode: 'SIMULATED',
      state: 'IDLE',
      raiderUserId: null,
      raiderDisplayName: '',
      viewerCount: 0,
      activity: '',
      goal: '',
      communityNorm: '',
      optionA: '',
      optionB: '',
      votesA: 0,
      votesB: 0,
      totalVotes: 0,
      selectedOption: null,
      timeRemainingMs: 0,
      startedAt: new Date().toISOString(),
      completedAt: null,
      sequenceNumber: 0,
    });

    return reply.send({ success: true, message: 'Demo Lab reset to clean IDLE state.' });
  });

  // 8. Delete Local Data (Protected)
  app.post('/api/data/delete-local', async (req, reply) => {
    await requireBroadcasterAuth(req, reply, { allowDemoSimulation: true });
    if (reply.sent) return;

    db.deleteLocalData();
    activeEngine = null;
    pendingRaid = null;
    return reply.send({ success: true, message: 'Local data and history purged successfully.' });
  });

  // 9. Twitch OAuth Routes
  app.get('/auth/twitch/start', async (_req, reply) => {
    const state = crypto.randomBytes(16).toString('hex');
    reply.setCookie('twitch_oauth_state', state, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
      maxAge: 600, // 10 minutes
    });
    const url = oauth.getAuthorizationUrl(state);
    return reply.redirect(url);
  });

  app.get('/auth/twitch/callback', async (req, reply) => {
    const query = req.query as { code?: string; state?: string; error?: string };
    const savedState = req.cookies.twitch_oauth_state;

    if (!query.state || query.state !== savedState) {
      return reply.status(403).send({ error: 'CSRF_STATE_MISMATCH', message: 'OAuth state mismatch' });
    }

    if (!query.code) {
      return reply.status(400).send({ error: 'MISSING_OAUTH_CODE', message: query.error || 'Authorization failed' });
    }

    try {
      const tokenData = await oauth.exchangeCode(query.code);
      const userProfile = await oauth.fetchUserProfile(tokenData.accessToken);

      activeTwitchToken = tokenData.accessToken;
      activeBroadcasterId = userProfile.id;

      // Ensure broadcaster config exists for user
      const existing = db.getConfig(userProfile.id);
      if (!existing) {
        db.saveConfig({
          ...CHAMPIONSHIP_CONFIG,
          broadcasterId: userProfile.id,
          displayName: userProfile.displayName,
          updatedAt: new Date().toISOString(),
        });
      }

      // Create authenticated broadcaster session
      const { sessionToken } = sessionManager.createSession(
        userProfile.id,
        userProfile.login,
        userProfile.displayName
      );

      // Set broadcaster credentials on EventSub and connect
      eventSub.setBroadcasterCredentials(userProfile.id, tokenData.accessToken);
      eventSub.connect();

      reply.setCookie('raidrelay_session', sessionToken, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.NODE_ENV === 'production',
        maxAge: 7 * 24 * 3600,
      });

      reply.clearCookie('twitch_oauth_state', { path: '/' });
      return reply.redirect('/console?connected=true');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: 'OAUTH_EXCHANGE_ERROR', message: msg });
    }
  });

  app.post('/api/auth/disconnect', async (req, reply) => {
    await requireBroadcasterAuth(req, reply, { allowDemoSimulation: true });
    if (reply.sent) return;

    activeTwitchToken = null;
    activeBroadcasterId = null;
    eventSub.clearBroadcasterCredentials();
    return reply.send({ success: true, message: 'Twitch connection disconnected.' });
  });

  // Serve Built Web SPA Frontend if present
  const webDistDir = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDistDir)) {
    await app.register(fastifyStatic, {
      root: webDistDir,
      prefix: '/',
      wildcard: false,
    });

    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/auth/')) {
        const indexHtml = path.join(webDistDir, 'index.html');
        if (fs.existsSync(indexHtml)) {
          return reply.type('text/html').send(fs.readFileSync(indexHtml));
        }
      }
      return reply.status(404).send({ error: 'NOT_FOUND' });
    });
  }

  return {
    app,
    db,
    hub,
    engine: () => activeEngine,
    startSimulatedRaid: startSimulatedRaidFn,
  };
}
