import { WebSocket } from 'ws';
import type { RitualSnapshot } from '@raidrelay/contracts';

export interface ConnectedClient {
  ws: WebSocket;
  channelKey: string;
  broadcasterId: string;
  isOverlay: boolean;
  connectedAt: number;
}

export class RealtimeHub {
  private clients = new Set<ConnectedClient>();
  private snapshotsByBroadcaster = new Map<string, RitualSnapshot>();
  private lastGlobalSnapshot: RitualSnapshot | null = null;

  public registerClient(
    ws: WebSocket,
    channelKey: string,
    broadcasterId: string,
    isOverlay: boolean
  ): ConnectedClient {
    const client: ConnectedClient = {
      ws,
      channelKey,
      broadcasterId,
      isOverlay,
      connectedAt: Date.now(),
    };
    this.clients.add(client);

    // Send latest active snapshot for this specific broadcaster
    const snapshot = this.snapshotsByBroadcaster.get(broadcasterId) || this.lastGlobalSnapshot;
    if (snapshot) {
      this.sendToClient(client, snapshot);
    }

    ws.on('close', () => {
      this.clients.delete(client);
    });

    ws.on('error', () => {
      this.clients.delete(client);
    });

    return client;
  }

  public broadcastSnapshot(snapshot: RitualSnapshot, targetBroadcasterId?: string): void {
    this.lastGlobalSnapshot = snapshot;
    if (targetBroadcasterId) {
      this.snapshotsByBroadcaster.set(targetBroadcasterId, snapshot);
    }

    const payload = JSON.stringify({ type: 'RITUAL_SNAPSHOT', data: snapshot });

    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        // Enforce channel isolation: send only if client matches broadcasterId or channelKey
        const matches =
          !targetBroadcasterId ||
          client.broadcasterId === targetBroadcasterId ||
          client.channelKey === 'demo-channel-key-12345'; // Demo lab preview capability

        if (matches) {
          try {
            client.ws.send(payload);
          } catch {
            this.clients.delete(client);
          }
        }
      }
    }
  }

  public revokeChannelKey(channelKey: string): void {
    for (const client of this.clients) {
      if (client.channelKey === channelKey) {
        try {
          client.ws.close(4401, 'Overlay capability revoked');
        } catch {
          // ignore
        }
        this.clients.delete(client);
      }
    }
  }

  public getConnectedClientCount(broadcasterId?: string): number {
    if (!broadcasterId) return this.clients.size;
    let count = 0;
    for (const client of this.clients) {
      if (client.broadcasterId === broadcasterId) count += 1;
    }
    return count;
  }

  private sendToClient(client: ConnectedClient, snapshot: RitualSnapshot): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify({ type: 'RITUAL_SNAPSHOT', data: snapshot }));
      } catch {
        this.clients.delete(client);
      }
    }
  }
}
