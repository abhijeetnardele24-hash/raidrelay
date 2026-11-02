import { WebSocket } from 'ws';
import { request } from 'undici';
import { config } from '../config.js';
import type { RaidEvent, ChatMessageEvent } from '@raidrelay/contracts';

export type EventSubStatus =
  | 'NOT_CONFIGURED'
  | 'AUTHENTICATING'
  | 'WEBSOCKET_CONNECTING'
  | 'SUBSCRIBING'
  | 'LIVE_READY'
  | 'RECONNECTING'
  | 'DEGRADED'
  | 'DISCONNECTED';

export interface SubscriptionStatusInfo {
  type: string;
  version: string;
  status: 'pending' | 'enabled' | 'failed';
  error?: string;
  createdAt?: string;
}

export interface EventSubCallbacks {
  onRaid: (event: RaidEvent) => void;
  onChatMessage: (event: ChatMessageEvent) => void;
  onStatusChange?: (status: EventSubStatus) => void;
}

export class TwitchEventSubClient {
  private activeWs: WebSocket | null = null;
  private reconnectingWs: WebSocket | null = null;
  private status: EventSubStatus = 'NOT_CONFIGURED';
  private sessionId: string | null = null;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private keepaliveTimeoutSec = 10;
  private reconnectUrl: string | null = null;

  private acceptedSubscriptions = new Map<string, SubscriptionStatusInfo>();
  private activeBroadcasterId: string | null = null;
  private activeAccessToken: string | null = null;

  private backoffAttempts = 0;
  private readonly maxBackoffMs = 15000;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private callbacks: EventSubCallbacks,
    private wsUrl = config.TWITCH_EVENTSUB_WS_URL,
    private clientId = config.TWITCH_CLIENT_ID
  ) {}

  public getStatus(): EventSubStatus {
    return this.status;
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public getAcceptedSubscriptions(): SubscriptionStatusInfo[] {
    return Array.from(this.acceptedSubscriptions.values());
  }

  public getActiveSubscriptionTypes(): string[] {
    return Array.from(this.acceptedSubscriptions.keys());
  }

  public setBroadcasterCredentials(broadcasterId: string, accessToken: string): void {
    this.activeBroadcasterId = broadcasterId;
    this.activeAccessToken = accessToken;
    if (this.status === 'NOT_CONFIGURED') {
      this.setStatus('DISCONNECTED');
    }
  }

  public clearBroadcasterCredentials(): void {
    this.activeBroadcasterId = null;
    this.activeAccessToken = null;
    this.disconnect();
    this.setStatus('NOT_CONFIGURED');
  }

  public connect(customUrl?: string): void {
    if (!this.activeAccessToken || !this.activeBroadcasterId) {
      this.setStatus('NOT_CONFIGURED');
      return;
    }

    if (this.status === 'LIVE_READY' || this.status === 'WEBSOCKET_CONNECTING' || this.status === 'SUBSCRIBING') {
      return;
    }

    const targetUrl = customUrl || this.reconnectUrl || this.wsUrl;
    const isReconnecting = Boolean(this.reconnectUrl || customUrl);

    this.setStatus(isReconnecting ? 'RECONNECTING' : 'WEBSOCKET_CONNECTING');
    this.reconnectUrl = null;

    try {
      const ws = new WebSocket(targetUrl);

      if (isReconnecting) {
        this.reconnectingWs = ws;
      } else {
        this.activeWs = ws;
      }

      ws.on('open', () => {
        this.backoffAttempts = 0;
      });

      ws.on('message', (data: Buffer | string) => {
        this.handleMessage(data.toString(), ws);
      });

      ws.on('close', (code, _reason) => {
        this.handleSocketClose(ws, code);
      });

      ws.on('error', () => {
        this.handleSocketClose(ws, 1006);
      });
    } catch {
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.clearTimers();
    if (this.activeWs) {
      try {
        this.activeWs.close(1000, 'Client disconnecting');
      } catch {
        // ignore
      }
      this.activeWs = null;
    }
    if (this.reconnectingWs) {
      try {
        this.reconnectingWs.close(1000, 'Superseded');
      } catch {
        // ignore
      }
      this.reconnectingWs = null;
    }
    this.sessionId = null;
    this.acceptedSubscriptions.clear();
    this.setStatus(this.activeAccessToken ? 'DISCONNECTED' : 'NOT_CONFIGURED');
  }

  private handleSocketClose(ws: WebSocket, code: number): void {
    // If the closed socket was an old socket superseded by a reconnect, do not drop live state
    if (this.reconnectingWs && ws === this.activeWs) {
      this.activeWs = null;
      return;
    }

    if (ws === this.reconnectingWs) {
      this.reconnectingWs = null;
      // Reconnect socket failed; fall back to active or reconnect
      if (!this.activeWs) {
        this.setStatus('DISCONNECTED');
        this.scheduleReconnect();
      }
      return;
    }

    this.clearKeepalive();
    this.activeWs = null;
    this.sessionId = null;
    this.acceptedSubscriptions.clear();
    this.setStatus('DISCONNECTED');

    // Normal close code 1000 does not auto-reconnect
    if (code !== 1000 && this.activeAccessToken) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.backoffAttempts += 1;
    // Exponential backoff with jitter: 1s, 2s, 4s, 8s, up to maxBackoffMs
    const baseDelay = Math.min(1000 * Math.pow(2, this.backoffAttempts - 1), this.maxBackoffMs);
    const jitter = Math.floor(Math.random() * 500);
    const delay = baseDelay + jitter;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleMessage(raw: string, socket: WebSocket): void {
    try {
      const msg = JSON.parse(raw);
      const messageType = msg.metadata?.message_type;

      switch (messageType) {
        case 'session_welcome': {
          // If this was a reconnecting socket, promote it to active and cleanly close old socket
          if (socket === this.reconnectingWs) {
            if (this.activeWs) {
              try {
                this.activeWs.close(1000, 'Superseded by reconnect');
              } catch {
                // ignore
              }
            }
            this.activeWs = this.reconnectingWs;
            this.reconnectingWs = null;
          }

          this.sessionId = msg.payload?.session?.id;
          this.keepaliveTimeoutSec = msg.payload?.session?.keepalive_timeout_seconds || 10;
          this.resetKeepalive();

          // Immediately register all required subscriptions
          this.executeSubscriptionRegistration();
          break;
        }

        case 'session_keepalive': {
          this.resetKeepalive();
          break;
        }

        case 'session_reconnect': {
          const newUrl = msg.payload?.session?.reconnect_url;
          if (newUrl) {
            this.reconnectUrl = newUrl;
            this.setStatus('RECONNECTING');
            this.connect(newUrl);
          }
          break;
        }

        case 'notification': {
          this.resetKeepalive();
          const subType = msg.payload?.subscription?.type;
          const event = msg.payload?.event;
          const messageId = msg.metadata?.message_id || `twitch-evt-${Date.now()}`;
          const timestamp = msg.metadata?.message_timestamp || new Date().toISOString();

          if (subType === 'channel.raid' && event) {
            const raidPayload: RaidEvent = {
              fromBroadcasterId: event.from_broadcaster_user_id,
              fromBroadcasterLogin: event.from_broadcaster_user_login,
              fromBroadcasterName: event.from_broadcaster_user_name,
              toBroadcasterId: event.to_broadcaster_user_id,
              toBroadcasterLogin: event.to_broadcaster_user_login,
              toBroadcasterName: event.to_broadcaster_user_name,
              viewers: Number(event.viewers || 0),
              messageId,
              timestamp,
              sourceMode: 'LIVE_TWITCH',
            };
            this.callbacks.onRaid(raidPayload);
          } else if (subType === 'channel.chat.message' && event) {
            const chatPayload: ChatMessageEvent = {
              broadcasterUserId: event.broadcaster_user_id,
              chatterUserId: event.chatter_user_id,
              chatterUserLogin: event.chatter_user_login,
              chatterUserName: event.chatter_user_name,
              messageId: event.message_id || messageId,
              messageText: event.message?.text || '',
              timestamp,
              sourceMode: 'LIVE_TWITCH',
            };
            this.callbacks.onChatMessage(chatPayload);
          }
          break;
        }

        case 'revocation': {
          const subType = msg.payload?.subscription?.type;
          if (subType) {
            this.acceptedSubscriptions.delete(subType);
            this.setStatus('DEGRADED');
          }
          break;
        }
      }
    } catch {
      // Malformed message handling: ignore malformed frames safely
    }
  }

  private async executeSubscriptionRegistration(): Promise<void> {
    if (!this.sessionId || !this.activeAccessToken || !this.activeBroadcasterId) {
      return;
    }

    this.setStatus('SUBSCRIBING');

    const raidSub = await this.createSubscription(
      'channel.raid',
      '1',
      { to_broadcaster_user_id: this.activeBroadcasterId },
      this.activeAccessToken
    );

    const chatSub = await this.createSubscription(
      'channel.chat.message',
      '1',
      { broadcaster_user_id: this.activeBroadcasterId, user_id: this.activeBroadcasterId },
      this.activeAccessToken
    );

    if (raidSub.success && chatSub.success) {
      this.acceptedSubscriptions.set('channel.raid', {
        type: 'channel.raid',
        version: '1',
        status: 'enabled',
        createdAt: new Date().toISOString(),
      });
      this.acceptedSubscriptions.set('channel.chat.message', {
        type: 'channel.chat.message',
        version: '1',
        status: 'enabled',
        createdAt: new Date().toISOString(),
      });
      this.setStatus('LIVE_READY');
    } else {
      if (raidSub.success) {
        this.acceptedSubscriptions.set('channel.raid', {
          type: 'channel.raid',
          version: '1',
          status: 'enabled',
        });
      }
      if (chatSub.success) {
        this.acceptedSubscriptions.set('channel.chat.message', {
          type: 'channel.chat.message',
          version: '1',
          status: 'enabled',
        });
      }
      this.setStatus('DEGRADED');
    }
  }

  private async createSubscription(
    type: string,
    version: string,
    condition: Record<string, string>,
    accessToken: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await request('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
          'Client-ID': this.clientId,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          version,
          condition,
          transport: {
            method: 'websocket',
            session_id: this.sessionId,
          },
        }),
      });

      if (res.statusCode === 200 || res.statusCode === 202) {
        return { success: true };
      }

      const bodyText = await res.body.text();
      return { success: false, error: `HTTP ${res.statusCode}: ${bodyText.substring(0, 100)}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  private resetKeepalive(): void {
    this.clearKeepalive();
    // Watchdog timeout is keepalive_timeout_seconds + 3s tolerance
    const timeoutMs = (this.keepaliveTimeoutSec + 3) * 1000;
    this.keepaliveTimer = setTimeout(() => {
      // Keepalive expired; socket is stale
      if (this.activeWs) {
        try {
          this.activeWs.close(4000, 'Keepalive watchdog timeout');
        } catch {
          // ignore
        }
      }
    }, timeoutMs);
  }

  private clearKeepalive(): void {
    if (this.keepaliveTimer) {
      clearTimeout(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearKeepalive();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(newStatus: EventSubStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      if (this.callbacks.onStatusChange) {
        this.callbacks.onStatusChange(newStatus);
      }
    }
  }
}
