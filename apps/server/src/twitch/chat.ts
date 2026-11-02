import { request } from 'undici';
import { config } from '../config.js';

export class TwitchChatService {
  constructor(private clientId = config.TWITCH_CLIENT_ID) {}

  /**
   * Dispatches a single formatted message to Twitch chat via Helix Send Chat Message API.
   * Fails gracefully: errors are logged and returned as false, never crashing the ritual.
   */
  public async sendMessage(
    broadcasterId: string,
    senderId: string,
    message: string,
    accessToken: string
  ): Promise<boolean> {
    if (!accessToken || !broadcasterId || !senderId || !message) {
      return false;
    }

    try {
      const res = await request('https://api.twitch.tv/helix/chat/messages', {
        method: 'POST',
        headers: {
          'Client-ID': this.clientId,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          broadcaster_id: broadcasterId,
          sender_id: senderId,
          message: message.slice(0, 500),
        }),
      });

      if (res.statusCode >= 200 && res.statusCode < 300) {
        return true;
      }
      return false;
    } catch {
      // Isolate network/Helix failures from breaking the ritual engine
      return false;
    }
  }
}

