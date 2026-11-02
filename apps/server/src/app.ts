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
import { TwitchEventSubClient, SubscriptionTransport } from './twitch/eventsub.js';
import { DemoAdapter } from './demo/adapter.js';
import { TokenManager } from './auth/tokens.js';
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
  PublicBroadcasterConfig,
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
  subscriptionTransport?: SubscriptionTransport;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<{
  app: FastifyInstance;
  db: DatabaseRepository;
  hub: RealtimeHub;
  tokenManager: TokenManager;
  engine: () => RaidRitualEngine | null;
  demoEngine: () => RaidRitualEngine | null;
  getDemoChannelKey: () => string;
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
  const tokenManager = new TokenManager(db, config.SESSION_SECRET);

  // Separate live ritual state and simulated demo ritual state
  let activeEngine: RaidRitualEngine | null = null;
  let demoEngine: RaidRitualEngine | null = null;
  let pendingRaid: RaidEvent | null = null;
  let activeTwitchToken: string | null = null;
  let activeBroadcasterId: string | null = null;
  let lastLiveBroadcastState: string = '';
  let lastDemoBroadcastState: string = '';

  // Dedicated demo channel configuration with secure ephemeral capability key
  const DEMO_BROADCASTER_ID = 'demo-channel';
  const DEMO_CHANNEL_KEY = crypto.randomBytes(16).toString('hex');

  // Register demo channel in db
  db.saveConfig({
    ...CHAMPIONSHIP_CONFIG,
    broadcasterId: DEMO_BROADCASTER_ID,
    displayName: 'Demo Broadcaster',
    channelKey: DEMO_CHANNEL_KEY,
    updatedAt: new Date().toISOString(),
  });

  const demoAdapter = new DemoAdapter(() => demoEngine);

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
    hub.broadcastSnapshot(currentConfig.broadcasterId, snapshot);

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

  // Periodic engine tick interval (100ms for live and demo)
  const tickInterval = setInterval(() => {
    const now = Date.now();

    // 1. Tick live broadcaster ritual
    if (activeEngine) {
      activeEngine.tick(now);
      const snapshot = activeEngine.toSnapshot(now);
      const stateKey = `${snapshot.state}-${snapshot.votesA}-${snapshot.votesB}-${Math.round(snapshot.timeRemainingMs / 1000)}`;
      if (stateKey !== lastLiveBroadcastState) {
        lastLiveBroadcastState = stateKey;
        db.saveRitual(snapshot);
        const targetId = activeBroadcasterId || '123456789';
        hub.broadcastSnapshot(targetId, snapshot);
      }

      if (snapshot.state === 'IDLE') {
        activeEngine = null;
        if (pendingRaid) {
          const nextRaid = pendingRaid;
          pendingRaid = null;
          startLiveRaid(nextRaid);
        }
      }
    }

    // 2. Tick demo lab ritual
    if (demoEngine) {
      demoEngine.tick(now);
      const demoSnap = demoEngine.toSnapshot(now);
      const demoStateKey = `${demoSnap.state}-${demoSnap.votesA}-${demoSnap.votesB}-${Math.round(demoSnap.timeRemainingMs / 1000)}`;
      if (demoStateKey !== lastDemoBroadcastState) {
        lastDemoBroadcastState = demoStateKey;
        hub.broadcastSnapshot(DEMO_BROADCASTER_ID, demoSnap);
      }

      if (demoSnap.state === 'IDLE') {
        demoEngine = null;
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
      const targetId = activeBroadcasterId || '123456789';
      hub.broadcastSnapshot(targetId, snapshot);
    }
  };

  const eventSub = new TwitchEventSubClient(
    {
      onRaid: handleIncomingRaid,
      onChatMessage: handleIncomingChat,
    },
    config.TWITCH_EVENTSUB_WS_URL,
    config.TWITCH_CLIENT_ID,
    options.subscriptionTransport
  );

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

    // Validate capability strictly against database
    const broadcasterConfig = db.getConfigByChannelKey(channelKey);
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

  // 4. Broadcaster Configuration
  // Public DTO: returns display context WITHOUT leaking channelKey to unauthenticated callers
  app.get('/api/config', async (_req, reply) => {
    const broadcasterId = activeBroadcasterId || '123456789';
    const currentConfig = db.getConfig(broadcasterId) || CHAMPIONSHIP_CONFIG;
    // Omit channelKey for public unauthenticated access
    const { channelKey: _omittedKey, ...publicConfig }: BroadcasterConfig = currentConfig;
    return reply.send(publicConfig as PublicBroadcasterConfig);
  });

  // Authenticated Private DTO: returns full config including overlay capability
  app.get('/api/config/private', async (req, reply) => {
    const session = await requireBroadcasterAuth(req, reply);
    if (!session) return;

    const currentConfig = db.getConfig(session.broadcasterId) || CHAMPIONSHIP_CONFIG;
    return reply.send(currentConfig);
  });

  // Authenticated Overlay Capability Route
  app.get('/api/overlay-capability', async (req, reply) => {
    const session = await requireBroadcasterAuth(req, reply);
    if (!session) return;

    const currentConfig = db.getConfig(session.broadcasterId) || CHAMPIONSHIP_CONFIG;
    return reply.send({ success: true, channelKey: currentConfig.channelKey });
  });

  // Update Broadcaster Configuration (Protected)
  app.put('/api/config', async (req, reply) => {
    const session = await requireBroadcasterAuth(req, reply);
    if (!session) return;

    const broadcasterId = session.broadcasterId;
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
    const session = await requireBroadcasterAuth(req, reply);
    if (!session) return;

    const broadcasterId = session.broadcasterId;
    const existing = db.getConfig(broadcasterId);
    if (existing) {
      hub.revokeChannelKey(existing.channelKey);
    }
    const newKey = db.rotateChannelKey(broadcasterId);
    return reply.send({ success: true, channelKey: newKey });
  });

  // 5. Current Live Ritual Snapshot
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

  // 6. Broadcaster Controls: Approve, Override, Skip, Clear (Protected - Live ritual only)
  app.post('/api/ritual/:id/approve', async (req, reply) => {
    const session = await requireBroadcasterAuth(req, reply);
    if (!session) return;

    if (!activeEngine) {
      return reply.status(404).send({ error: 'NO_ACTIVE_RITUAL' });
    }

    const success = activeEngine.handleStreamerAction({ action: 'APPROVE' });
    if (!success) {
      return reply.status(400).send({ error: 'CANNOT_APPROVE_IN_CURRENT_STATE' });
    }

    const snap = activeEngine.toSnapshot();
    db.saveRitual(snap);
    hub.broadcastSnapshot(session.broadcasterId, snap);

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
    const session = await requireBroadcasterAuth(req, reply);
    if (!session) return;

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
    hub.broadcastSnapshot(session.broadcasterId, snap);

    return reply.send({ success: true, snapshot: snap });
  });

  app.post('/api/ritual/:id/skip', async (req, reply) => {
    const session = await requireBroadcasterAuth(req, reply);
    if (!session) return;

    if (!activeEngine) {
      return reply.status(404).send({ error: 'NO_ACTIVE_RITUAL' });
    }

    const success = activeEngine.handleStreamerAction({ action: 'SKIP' });
    const snap = activeEngine.toSnapshot();
    db.saveRitual(snap);
    hub.broadcastSnapshot(session.broadcasterId, snap);

    return reply.send({ success, snapshot: snap });
  });

  app.post('/api/ritual/clear', async (req, reply) => {
    const session = await requireBroadcasterAuth(req, reply);
    if (!session) return;

    if (!activeEngine) {
      return reply.send({ success: true, message: 'Already idle' });
    }

    activeEngine.handleStreamerAction({ action: 'CLEAR' });
    const snap = activeEngine.toSnapshot();
    db.saveRitual(snap);
    hub.broadcastSnapshot(session.broadcasterId, snap);

    return reply.send({ success: true, snapshot: snap });
  });

  // 7. Dedicated Demo Lab Endpoints (/api/demo/*)
  // Demo Lab operates on a completely separate simulated ritual namespace (demoEngine & DEMO_BROADCASTER_ID)
  app.get('/api/demo/capability', async () => {
    return { success: true, channelKey: DEMO_CHANNEL_KEY };
  });

  app.get('/api/demo/ritual/current', async () => {
    if (!demoEngine) {
      return { active: false, ritual: null };
    }
    return { active: true, ritual: demoEngine.toSnapshot() };
  });

  const startSimulatedRaidFn = (opts: { speedMultiplier?: number } = {}) => {
    const demoConfig = db.getConfig(DEMO_BROADCASTER_ID) || CHAMPIONSHIP_CONFIG;
    const mult = Math.max(1, opts.speedMultiplier || 1);
    const scaledDurations = {
      landingDurationMs: Math.max(200, Math.round(DEFAULT_DURATIONS.landingDurationMs / mult)),
      contextDurationMs: Math.max(300, Math.round(DEFAULT_DURATIONS.contextDurationMs / mult)),
      votingDurationMs: Math.max(1000, Math.round(DEFAULT_DURATIONS.votingDurationMs / mult)),
      awaitingStreamerDurationMs: Math.max(500, Math.round(DEFAULT_DURATIONS.awaitingStreamerDurationMs / mult)),
      resultDurationMs: Math.max(500, Math.round(DEFAULT_DURATIONS.resultDurationMs / mult)),
      cooldownDurationMs: Math.max(300, Math.round(DEFAULT_DURATIONS.cooldownDurationMs / mult)),
    };

    demoEngine = new RaidRitualEngine({
      id: crypto.randomUUID(),
      raidEvent: {
        ...SAMPLE_SIMULATED_RAID,
        messageId: `sim-raid-msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
      },
      config: demoConfig,
      durations: scaledDurations,
    });

    const snap = demoEngine.toSnapshot();
    hub.broadcastSnapshot(DEMO_BROADCASTER_ID, snap);

    demoAdapter.runScenario({
      speedMultiplier: opts.speedMultiplier || 1,
      onUpdate: () => {
        if (demoEngine) {
          const updated = demoEngine.toSnapshot();
          hub.broadcastSnapshot(DEMO_BROADCASTER_ID, updated);
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
      snapshot: demoEngine?.toSnapshot(),
    });
  });

  app.post('/api/demo/reset', async (_req, reply) => {
    demoAdapter.stop();
    if (demoEngine) {
      demoEngine.handleStreamerAction({ action: 'CLEAR' });
      demoEngine = null;
    }

    hub.broadcastSnapshot(DEMO_BROADCASTER_ID, {
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

  app.post('/api/demo/ritual/:id/approve', async (_req, reply) => {
    if (!demoEngine) {
      return reply.status(404).send({ error: 'NO_ACTIVE_DEMO_RITUAL' });
    }
    const success = demoEngine.handleStreamerAction({ action: 'APPROVE' });
    const snap = demoEngine.toSnapshot();
    hub.broadcastSnapshot(DEMO_BROADCASTER_ID, snap);
    return reply.send({ success, snapshot: snap });
  });

  app.post('/api/demo/ritual/:id/override', async (req, reply) => {
    if (!demoEngine) {
      return reply.status(404).send({ error: 'NO_ACTIVE_DEMO_RITUAL' });
    }
    const rawBody = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const parseAction = StreamerActionSchema.safeParse({ action: 'OVERRIDE', ...rawBody });
    if (!parseAction.success || !parseAction.data.overrideChoice) {
      return reply.status(400).send({ error: 'INVALID_OVERRIDE_CHOICE' });
    }
    const success = demoEngine.handleStreamerAction(parseAction.data);
    const snap = demoEngine.toSnapshot();
    hub.broadcastSnapshot(DEMO_BROADCASTER_ID, snap);
    return reply.send({ success, snapshot: snap });
  });

  app.post('/api/demo/ritual/:id/skip', async (_req, reply) => {
    if (!demoEngine) {
      return reply.status(404).send({ error: 'NO_ACTIVE_DEMO_RITUAL' });
    }
    const success = demoEngine.handleStreamerAction({ action: 'SKIP' });
    const snap = demoEngine.toSnapshot();
    hub.broadcastSnapshot(DEMO_BROADCASTER_ID, snap);
    return reply.send({ success, snapshot: snap });
  });

  app.post('/api/demo/ritual/clear', async (_req, reply) => {
    demoAdapter.stop();
    if (demoEngine) {
      demoEngine.handleStreamerAction({ action: 'CLEAR' });
      const snap = demoEngine.toSnapshot();
      demoEngine = null;
      hub.broadcastSnapshot(DEMO_BROADCASTER_ID, snap);
      return reply.send({ success: true, snapshot: snap });
    }
    return reply.send({ success: true, message: 'Already idle' });
  });

  // 8. Delete Local Data (Protected)
  app.post('/api/data/delete-local', async (req, reply) => {
    const session = await requireBroadcasterAuth(req, reply);
    if (!session) return;

    db.deleteLocalData();
    activeEngine = null;
    demoEngine = null;
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

      // Encrypt and persist tokens with AES-256-GCM authenticated encryption at rest
      tokenManager.saveTokens(
        userProfile.id,
        tokenData.accessToken,
        tokenData.refreshToken,
        tokenData.expiresAt
      );

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
    const session = await requireBroadcasterAuth(req, reply);
    if (!session) return;

    // Securely revoke Twitch token and clear stored encrypted credentials
    await tokenManager.revokeAndClear(session.broadcasterId, oauth);

    activeTwitchToken = null;
    activeBroadcasterId = null;
    eventSub.clearBroadcasterCredentials();
    return reply.send({ success: true, message: 'Twitch connection disconnected.' });
  });

  // Dev login endpoint for automated testing in non-production environments
  if (config.NODE_ENV !== 'production') {
    app.post('/api/auth/dev-login', async (req, reply) => {
      const body = (req.body as { broadcasterId?: string; login?: string; displayName?: string } | undefined) || {};
      const broadcasterId = body.broadcasterId || '123456789';
      const login = body.login || 'robocrafter';
      const displayName = body.displayName || 'RoboCrafterLive';

      // Ensure broadcaster config exists
      const existing = db.getConfig(broadcasterId);
      if (!existing) {
        db.saveConfig({
          ...CHAMPIONSHIP_CONFIG,
          broadcasterId,
          displayName,
          updatedAt: new Date().toISOString(),
        });
      }

      const { sessionToken } = sessionManager.createSession(broadcasterId, login, displayName);

      reply.setCookie('raidrelay_session', sessionToken, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        maxAge: 7 * 24 * 3600,
      });

      return reply.send({ success: true, message: 'Dev session created', broadcasterId, login, displayName });
    });
  }

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
    tokenManager,
    engine: () => activeEngine,
    demoEngine: () => demoEngine,
    getDemoChannelKey: () => DEMO_CHANNEL_KEY,
    startSimulatedRaid: startSimulatedRaidFn,
  };
}
