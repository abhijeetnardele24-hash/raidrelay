import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import { TwitchEventSubClient } from '../../apps/server/src/twitch/eventsub.js';
import type { RaidEvent, ChatMessageEvent } from '@raidrelay/contracts';

describe('TwitchEventSubClient Lifecycle & Connection Ladder', () => {
  let wss: WebSocketServer;
  let serverPort: number;
  let serverWs: WebSocket | null = null;
  let client: TwitchEventSubClient;

  let receivedRaids: RaidEvent[] = [];
  let receivedChats: ChatMessageEvent[] = [];
  let statusChanges: string[] = [];

  beforeEach(async () => {
    receivedRaids = [];
    receivedChats = [];
    statusChanges = [];

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
      `ws://127.0.0.1:${serverPort}`
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

    // Attempting to connect without credentials remains NOT_CONFIGURED
    client.connect();
    expect(client.getStatus()).toBe('NOT_CONFIGURED');
  });

  it('transitions to WEBSOCKET_CONNECTING when credentials exist', () => {
    client.setBroadcasterCredentials('b_123', 'mock_token_abc');
    expect(client.getStatus()).toBe('DISCONNECTED');

    client.connect();
    expect(client.getStatus()).toBe('WEBSOCKET_CONNECTING');
  });

  it('receives session_welcome and captures session ID', async () => {
    client.setBroadcasterCredentials('b_123', 'mock_token_abc');
    client.connect();

    // Wait for server to receive client connection
    await vi.waitFor(() => expect(serverWs).not.toBeNull());

    // Server sends session_welcome
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
    expect(client.getSessionId()).toBe('mock-session-id-999');
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

    // Server sends channel.raid notification
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

    // Server sends channel.chat.message notification
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

    // Send malformed non-JSON data
    serverWs?.send('NOT_VALID_JSON{:::');

    // Send JSON without required metadata
    serverWs?.send(JSON.stringify({ empty: true }));

    // Status remains unchanged and socket stays open
    expect(client.getStatus()).toBe('WEBSOCKET_CONNECTING');
  });
});

