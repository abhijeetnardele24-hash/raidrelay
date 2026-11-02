import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import { TwitchEventSubClient, SubscriptionTransport } from '../../apps/server/src/twitch/eventsub.js';
import type { RaidEvent, ChatMessageEvent } from '@raidrelay/contracts';

describe('TwitchEventSubClient Lifecycle & Connection Ladder', () => {
  let wss: WebSocketServer;
  let serverPort: number;
  let serverWs: WebSocket | null = null;
  let client: TwitchEventSubClient;

  let receivedRaids: RaidEvent[] = [];
  let receivedChats: ChatMessageEvent[] = [];
  let statusChanges: string[] = [];
  let subscriptionTransportCalls: Array<{
    type: string;
    version: string;
    condition: Record<string, string>;
    sessionId: string;
    clientId: string;
    accessToken: string;
  }> = [];

  let mockTransportResult: (type: string) => { success: boolean; error?: string } = () => ({
    success: true,
  });

  const mockTransport: SubscriptionTransport = async (params) => {
    subscriptionTransportCalls.push(params);
    return mockTransportResult(params.type);
  };

  beforeEach(async () => {
    receivedRaids = [];
    receivedChats = [];
    statusChanges = [];
    subscriptionTransportCalls = [];
    mockTransportResult = () => ({ success: true });

    // Spin up local mock Twitch EventSub WebSocket server
    await new Promise<void>((resolve) => {
      wss = new WebSocketServer({ port: 0 }, () => {
        const addr = wss.address();
        serverPort = typeof addr === 'object' && addr ? addr.port : 8999;
        resolve();
      });
    });

    wss.on('connection', (ws) => {
      serverWs = ws;
    });

    client = new TwitchEventSubClient(
      {
        onRaid: (r) => receivedRaids.push(r),
        onChatMessage: (c) => receivedChats.push(c),
        onStatusChange: (s) => statusChanges.push(s),
      },
      `ws://127.0.0.1:${serverPort}`,
      'mock_client_id_456',
      mockTransport
    );
  });

  afterEach(async () => {
    client.disconnect();
    if (serverWs) {
      serverWs.close();
      serverWs = null;
    }
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
  });

  it('starts in NOT_CONFIGURED state until credentials are provided', () => {
    expect(client.getStatus()).toBe('NOT_CONFIGURED');

    client.connect();
    expect(client.getStatus()).toBe('NOT_CONFIGURED');
  });

  it('transitions to WEBSOCKET_CONNECTING when credentials exist', () => {
    client.setBroadcasterCredentials('b_123', 'mock_token_abc');
    expect(client.getStatus()).toBe('DISCONNECTED');

    client.connect();
    expect(client.getStatus()).toBe('WEBSOCKET_CONNECTING');
  });

  it('session welcome creates exactly two subscriptions with exact conditions and session ID', async () => {
    client.setBroadcasterCredentials('b_123', 'mock_token_abc');
    client.connect();

    await vi.waitFor(() => expect(serverWs).not.toBeNull());

    serverWs?.send(
      JSON.stringify({
        metadata: {
          message_id: 'msg-welcome-1',
          message_type: 'session_welcome',
          message_timestamp: new Date().toISOString(),
        },
        payload: {
          session: {
            id: 'mock-session-id-999',
            status: 'connected',
            keepalive_timeout_seconds: 10,
          },
        },
      })
    );

    await vi.waitFor(() => expect(client.getSessionId()).toBe('mock-session-id-999'));
    await vi.waitFor(() => expect(subscriptionTransportCalls.length).toBe(2));

    expect(client.getSessionId()).toBe('mock-session-id-999');

    // Verify exact subscription calls
    const raidCall = subscriptionTransportCalls.find((c) => c.type === 'channel.raid');
    expect(raidCall).toBeDefined();
    expect(raidCall?.version).toBe('1');
    expect(raidCall?.sessionId).toBe('mock-session-id-999');
    expect(raidCall?.condition).toEqual({ to_broadcaster_user_id: 'b_123' });
    expect(raidCall?.clientId).toBe('mock_client_id_456');
    expect(raidCall?.accessToken).toBe('mock_token_abc');

    const chatCall = subscriptionTransportCalls.find((c) => c.type === 'channel.chat.message');
    expect(chatCall).toBeDefined();
    expect(chatCall?.version).toBe('1');
    expect(chatCall?.sessionId).toBe('mock-session-id-999');
    expect(chatCall?.condition).toEqual({ broadcaster_user_id: 'b_123', user_id: 'b_123' });
  });

  it('both accepted subscriptions produces LIVE_READY', async () => {
    mockTransportResult = () => ({ success: true });
    client.setBroadcasterCredentials('b_123', 'mock_token_abc');
    client.connect();

    await vi.waitFor(() => expect(serverWs).not.toBeNull());

    serverWs?.send(
      JSON.stringify({
        metadata: {
          message_id: 'msg-welcome-live',
          message_type: 'session_welcome',
          message_timestamp: new Date().toISOString(),
        },
        payload: {
          session: {
            id: 'session-live-ready',
            status: 'connected',
            keepalive_timeout_seconds: 10,
          },
        },
      })
    );

    await vi.waitFor(() => expect(client.getStatus()).toBe('LIVE_READY'));
    expect(client.getStatus()).toBe('LIVE_READY');
    expect(client.getActiveSubscriptionTypes()).toEqual(['channel.raid', 'channel.chat.message']);
  });

  it('one subscription failure produces DEGRADED status with sanitized error', async () => {
    mockTransportResult = (type: string) => {
      if (type === 'channel.chat.message') {
        return { success: false, error: 'HTTP 403: Forbidden scope Bearer [REDACTED]' };
      }
      return { success: true };
    };

    client.setBroadcasterCredentials('b_123', 'mock_token_abc');
    client.connect();

    await vi.waitFor(() => expect(serverWs).not.toBeNull());

    serverWs?.send(
      JSON.stringify({
        metadata: {
          message_id: 'msg-welcome-degraded',
          message_type: 'session_welcome',
          message_timestamp: new Date().toISOString(),
        },
        payload: {
          session: {
            id: 'session-degraded',
            status: 'connected',
            keepalive_timeout_seconds: 10,
          },
        },
      })
    );

    await vi.waitFor(() => expect(client.getStatus()).toBe('DEGRADED'));
    expect(client.getStatus()).toBe('DEGRADED');

    const subs = client.getAcceptedSubscriptions();
    const chatSub = subs.find((s) => s.type === 'channel.chat.message');
    expect(chatSub?.status).toBe('failed');
    expect(chatSub?.error).toContain('HTTP 403');
    expect(chatSub?.error).not.toContain('mock_token_abc'); // Proves token redaction
  });

  it('closing an old superseded socket cannot clear the new active socket, session ID, or status', async () => {
    // Spin up second server to simulate reconnect URL target
    let secondServerWs: WebSocket | null = null;
    let port2 = 0;
    const wss2 = new WebSocketServer({ port: 0 }, () => {
      const addr = wss2.address();
      port2 = typeof addr === 'object' && addr ? addr.port : 9001;
    });
    wss2.on('connection', (ws) => {
      secondServerWs = ws;
    });

    try {
      client.setBroadcasterCredentials('b_123', 'mock_token_abc');
      client.connect();
      await vi.waitFor(() => expect(serverWs).not.toBeNull());

      // 1. Send welcome on socket 1
      serverWs?.send(
        JSON.stringify({
          metadata: { message_type: 'session_welcome', message_id: 'w1' },
          payload: { session: { id: 'session-s1', keepalive_timeout_seconds: 10 } },
        })
      );
      await vi.waitFor(() => expect(client.getStatus()).toBe('LIVE_READY'));
      expect(client.getSessionId()).toBe('session-s1');

      // 2. Socket 1 sends session_reconnect pointing to server 2
      serverWs?.send(
        JSON.stringify({
          metadata: { message_type: 'session_reconnect', message_id: 'r1' },
          payload: { session: { reconnect_url: `ws://127.0.0.1:${port2}` } },
        })
      );

      // Wait for socket 2 to connect to second server
      await vi.waitFor(() => expect(secondServerWs).not.toBeNull());

      // 3. Socket 2 receives session_welcome (promotes socket 2 to active)
      secondServerWs?.send(
        JSON.stringify({
          metadata: { message_type: 'session_welcome', message_id: 'w2' },
          payload: { session: { id: 'session-s2', keepalive_timeout_seconds: 10 } },
        })
      );
      await vi.waitFor(() => expect(client.getSessionId()).toBe('session-s2'));

      // 4. Now simulate old socket 1 closing
      const oldSocket = serverWs;
      serverWs = null;
      oldSocket?.close();

      // Wait a tick for close event to propagate
      await new Promise((r) => setTimeout(r, 100));

      // CRITICAL VERIFICATION:
      // Old socket close MUST NOT have cleared active socket, session ID, or changed status to DISCONNECTED!
      expect(client.getSessionId()).toBe('session-s2');
      expect(client.getStatus()).toBe('LIVE_READY');
    } finally {
      if (secondServerWs) secondServerWs.close();
      await new Promise<void>((r) => wss2.close(() => r()));
    }
  });

  it('prevents duplicate subscription registration during session_reconnect', async () => {
    let secondServerWs: WebSocket | null = null;
    let port2 = 0;
    const wss2 = new WebSocketServer({ port: 0 }, () => {
      const addr = wss2.address();
      port2 = typeof addr === 'object' && addr ? addr.port : 9002;
    });
    wss2.on('connection', (ws) => {
      secondServerWs = ws;
    });

    try {
      client.setBroadcasterCredentials('b_123', 'mock_token_abc');
      client.connect();
      await vi.waitFor(() => expect(serverWs).not.toBeNull());

      // Initial welcome: should create 2 subscriptions
      serverWs?.send(
        JSON.stringify({
          metadata: { message_type: 'session_welcome', message_id: 'w1' },
          payload: { session: { id: 'session-init', keepalive_timeout_seconds: 10 } },
        })
      );
      await vi.waitFor(() => expect(subscriptionTransportCalls.length).toBe(2));
      expect(subscriptionTransportCalls.length).toBe(2);

      // Trigger reconnect
      serverWs?.send(
        JSON.stringify({
          metadata: { message_type: 'session_reconnect', message_id: 'r1' },
          payload: { session: { reconnect_url: `ws://127.0.0.1:${port2}` } },
        })
      );
      await vi.waitFor(() => expect(secondServerWs).not.toBeNull());

      // Reconnect welcome: Twitch transfers subscriptions automatically; must NOT call transport again!
      secondServerWs?.send(
        JSON.stringify({
          metadata: { message_type: 'session_welcome', message_id: 'w2' },
          payload: { session: { id: 'session-reconnected', keepalive_timeout_seconds: 10 } },
        })
      );
      await vi.waitFor(() => expect(client.getSessionId()).toBe('session-reconnected'));

      // Total calls must strictly remain 2 (zero duplicates)
      expect(subscriptionTransportCalls.length).toBe(2);
      expect(client.getStatus()).toBe('LIVE_READY');
    } finally {
      if (secondServerWs) secondServerWs.close();
      await new Promise<void>((r) => wss2.close(() => r()));
    }
  });

  it('revocation removes subscription and transitions status to DEGRADED', async () => {
    client.setBroadcasterCredentials('b_123', 'mock_token_abc');
    client.connect();
    await vi.waitFor(() => expect(serverWs).not.toBeNull());

    serverWs?.send(
      JSON.stringify({
        metadata: { message_type: 'session_welcome', message_id: 'w-rev' },
        payload: { session: { id: 'session-rev', keepalive_timeout_seconds: 10 } },
      })
    );
    await vi.waitFor(() => expect(client.getStatus()).toBe('LIVE_READY'));
    expect(client.getActiveSubscriptionTypes()).toContain('channel.raid');

    // Server sends revocation for channel.raid
    serverWs?.send(
      JSON.stringify({
        metadata: { message_type: 'revocation', message_id: 'msg-rev-1' },
        payload: { subscription: { type: 'channel.raid' } },
      })
    );

    await vi.waitFor(() => expect(client.getStatus()).toBe('DEGRADED'));
    expect(client.getStatus()).toBe('DEGRADED');
    expect(client.getActiveSubscriptionTypes()).not.toContain('channel.raid');
  });

  it('processes incoming live raid notification cleanly', async () => {
    client.setBroadcasterCredentials('b_123', 'mock_token_abc');
    client.connect();
    await vi.waitFor(() => expect(serverWs).not.toBeNull());

    serverWs?.send(
      JSON.stringify({
        metadata: {
          message_id: 'msg-welcome-2',
          message_type: 'session_welcome',
          message_timestamp: new Date().toISOString(),
        },
        payload: { session: { id: 'session-2', keepalive_timeout_seconds: 10 } },
      })
    );

    await vi.waitFor(() => expect(client.getSessionId()).toBe('session-2'));

    serverWs?.send(
      JSON.stringify({
        metadata: {
          message_id: 'raid-msg-001',
          message_type: 'notification',
          message_timestamp: new Date().toISOString(),
        },
        payload: {
          subscription: { type: 'channel.raid' },
          event: {
            from_broadcaster_user_id: 'raider_1',
            from_broadcaster_user_login: 'artisan_alex',
            from_broadcaster_user_name: 'ArtisanAlex',
            to_broadcaster_user_id: 'b_123',
            to_broadcaster_user_login: 'robocrafter',
            to_broadcaster_user_name: 'RoboCrafterLive',
            viewers: 150,
          },
        },
      })
    );

    await vi.waitFor(() => expect(receivedRaids.length).toBe(1));
    expect(receivedRaids[0].fromBroadcasterName).toBe('ArtisanAlex');
    expect(receivedRaids[0].viewers).toBe(150);
    expect(receivedRaids[0].sourceMode).toBe('LIVE_TWITCH');
  });

  it('processes incoming live chat vote notification cleanly', async () => {
    client.setBroadcasterCredentials('b_123', 'mock_token_abc');
    client.connect();
    await vi.waitFor(() => expect(serverWs).not.toBeNull());

    serverWs?.send(
      JSON.stringify({
        metadata: {
          message_id: 'msg-welcome-3',
          message_type: 'session_welcome',
          message_timestamp: new Date().toISOString(),
        },
        payload: { session: { id: 'session-3', keepalive_timeout_seconds: 10 } },
      })
    );

    await vi.waitFor(() => expect(client.getSessionId()).toBe('session-3'));

    serverWs?.send(
      JSON.stringify({
        metadata: {
          message_id: 'chat-msg-001',
          message_type: 'notification',
          message_timestamp: new Date().toISOString(),
        },
        payload: {
          subscription: { type: 'channel.chat.message' },
          event: {
            broadcaster_user_id: 'b_123',
            chatter_user_id: 'viewer_7',
            chatter_user_login: 'circuit_samurai',
            chatter_user_name: 'CircuitSamurai',
            message: { text: '!relay A' },
          },
        },
      })
    );

    await vi.waitFor(() => expect(receivedChats.length).toBe(1));
    expect(receivedChats[0].chatterUserName).toBe('CircuitSamurai');
    expect(receivedChats[0].messageText).toBe('!relay A');
    expect(receivedChats[0].sourceMode).toBe('LIVE_TWITCH');
  });

  it('handles malformed frames safely without crashing or disconnecting', async () => {
    client.setBroadcasterCredentials('b_123', 'mock_token_abc');
    client.connect();
    await vi.waitFor(() => expect(serverWs).not.toBeNull());

    serverWs?.send('NOT_VALID_JSON{:::');
    serverWs?.send(JSON.stringify({ empty: true }));

    expect(client.getStatus()).toBe('WEBSOCKET_CONNECTING');
  });
});
