import crypto from 'node:crypto';
import { config } from '../config.js';
import type { DatabaseRepository } from '../db/index.js';
import type { TwitchOAuthService, TwitchUserToken } from '../twitch/oauth.js';

export interface DecryptedTokens {
  broadcasterId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class TokenEncryption {
  private key: Buffer;

  constructor(secret = config.SESSION_SECRET) {
    // Derive 256-bit key using scrypt
    this.key = crypto.scryptSync(secret, 'raidrelay-aes256gcm-token-salt-v1', 32);
  }

  public encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12); // Standard 96-bit IV for AES-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${ciphertext}`;
  }

  public decrypt(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted payload format');
    }
    const [ivHex, authTagHex, ciphertextHex] = parts;
    if (!ivHex || !authTagHex || !ciphertextHex) {
      throw new Error('Malformed encrypted token components');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

export class TokenManager {
  private encryption: TokenEncryption;

  constructor(
    private db: DatabaseRepository,
    secret = config.SESSION_SECRET
  ) {
    this.encryption = new TokenEncryption(secret);
  }

  public saveTokens(
    broadcasterId: string,
    accessToken: string,
    refreshToken: string,
    expiresAt: number
  ): void {
    const encAccess = this.encryption.encrypt(accessToken);
    const encRefresh = this.encryption.encrypt(refreshToken);
    this.db.saveEncryptedTokens(broadcasterId, encAccess, encRefresh, expiresAt);
  }

  public getStoredTokens(broadcasterId: string): DecryptedTokens | null {
    const record = this.db.getEncryptedTokens(broadcasterId);
    if (!record) return null;

    try {
      const accessToken = this.encryption.decrypt(record.encryptedAccessToken);
      const refreshToken = this.encryption.decrypt(record.encryptedRefreshToken);
      return {
        broadcasterId,
        accessToken,
        refreshToken,
        expiresAt: record.expiresAt,
      };
    } catch {
      return null;
    }
  }

  public async getValidAccessToken(
    broadcasterId: string,
    oauth: TwitchOAuthService,
    onTokenRefreshed?: (newToken: TwitchUserToken) => void
  ): Promise<string | null> {
    const tokens = this.getStoredTokens(broadcasterId);
    if (!tokens) return null;

    const now = Date.now();
    // Proactively refresh if within 60 seconds of expiry or expired
    if (now >= tokens.expiresAt - 60000) {
      try {
        const refreshed = await oauth.refreshToken(tokens.refreshToken);
        this.saveTokens(
          broadcasterId,
          refreshed.accessToken,
          refreshed.refreshToken,
          refreshed.expiresAt
        );
        if (onTokenRefreshed) {
          onTokenRefreshed(refreshed);
        }
        return refreshed.accessToken;
      } catch {
        return null;
      }
    }

    return tokens.accessToken;
  }

  public async revokeAndClear(
    broadcasterId: string,
    oauth?: TwitchOAuthService
  ): Promise<void> {
    const tokens = this.getStoredTokens(broadcasterId);
    if (tokens && oauth) {
      try {
        await oauth.revokeToken(tokens.accessToken);
      } catch {
        // Continue clearing local state regardless of Twitch revoke response
      }
    }
    this.db.deleteTokens(broadcasterId);
  }
}

