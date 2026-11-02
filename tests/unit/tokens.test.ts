import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokenEncryption, TokenManager } from '../../apps/server/src/auth/tokens.js';
import { initDatabase, DatabaseRepository } from '../../apps/server/src/db/index.js';
import { TwitchOAuthService, TwitchUserToken } from '../../apps/server/src/twitch/oauth.js';

describe('TokenEncryption (AES-256-GCM Authenticated Encryption at Rest)', () => {
  const secret = 'test-token-secret-must-be-at-least-32-chars-long';
  let cryptoEngine: TokenEncryption;

  beforeEach(() => {
    cryptoEngine = new TokenEncryption(secret);
  });

  it('encrypts and decrypts OAuth tokens accurately', () => {
    const rawAccessToken = 'oauth_access_token_super_secret_12345';
    const encrypted = cryptoEngine.encrypt(rawAccessToken);

    // Format must be iv:authTag:ciphertext
    expect(encrypted).not.toBe(rawAccessToken);
    expect(encrypted.split(':')).toHaveLength(3);

    const decrypted = cryptoEngine.decrypt(encrypted);
    expect(decrypted).toBe(rawAccessToken);
  });

  it('rejects tampered ciphertext with cryptographic authentication error (AES-GCM integrity)', () => {
    const raw = 'oauth_refresh_token_xyz_67890';
    const encrypted = cryptoEngine.encrypt(raw);
    const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':');

    // Tamper with the ciphertext
    const tamperedCiphertext =
      ciphertextHex.slice(0, -2) + (ciphertextHex.slice(-2) === 'aa' ? 'bb' : 'aa');
    const tamperedPayload = `${ivHex}:${authTagHex}:${tamperedCiphertext}`;

    expect(() => cryptoEngine.decrypt(tamperedPayload)).toThrow();
  });

  it('rejects tampered authentication tag', () => {
    const raw = 'oauth_token_val';
    const encrypted = cryptoEngine.encrypt(raw);
    const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':');

    const tamperedTag =
      authTagHex.slice(0, -2) + (authTagHex.slice(-2) === '11' ? '22' : '11');
    const tamperedPayload = `${ivHex}:${tamperedTag}:${ciphertextHex}`;

    expect(() => cryptoEngine.decrypt(tamperedPayload)).toThrow();
  });
});

describe('TokenManager Lifecycle & Proactive Refresh', () => {
  let db: DatabaseRepository;
  let tokenManager: TokenManager;
  let mockOAuth: TwitchOAuthService;

  beforeEach(async () => {
    db = await initDatabase(':memory:');
    tokenManager = new TokenManager(db, 'token-manager-test-session-secret-32-chars');
    mockOAuth = new TwitchOAuthService('client_id_test', 'client_secret_test', 'http://localhost/cb');
  });

  it('persists encrypted tokens to database and retrieves decrypted tokens', () => {
    const now = Date.now();
    tokenManager.saveTokens('broadcaster_42', 'access_tok_1', 'refresh_tok_1', now + 3600 * 1000);

    // Verify database row contains encrypted ciphertext, NOT plaintext
    const dbRow = db.getEncryptedTokens('broadcaster_42');
    expect(dbRow).not.toBeNull();
    expect(dbRow?.encryptedAccessToken).not.toContain('access_tok_1');
    expect(dbRow?.encryptedRefreshToken).not.toContain('refresh_tok_1');

    // TokenManager decrypts accurately
    const retrieved = tokenManager.getStoredTokens('broadcaster_42');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.accessToken).toBe('access_tok_1');
    expect(retrieved?.refreshToken).toBe('refresh_tok_1');
  });

  it('returns active access token directly when far from expiry', async () => {
    const futureExpiry = Date.now() + 3600 * 1000;
    tokenManager.saveTokens('broadcaster_42', 'active_access_token', 'refresh_tok', futureExpiry);

    const refreshSpy = vi.spyOn(mockOAuth, 'refreshToken');
    const token = await tokenManager.getValidAccessToken('broadcaster_42', mockOAuth);

    expect(token).toBe('active_access_token');
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('proactively refreshes tokens when within 60 seconds of expiry', async () => {
    const nearExpiry = Date.now() + 30 * 1000; // 30s remaining
    tokenManager.saveTokens('broadcaster_42', 'stale_access_token', 'valid_refresh_token', nearExpiry);

    const refreshedPayload: TwitchUserToken = {
      accessToken: 'new_fresh_access_token_999',
      refreshToken: 'new_fresh_refresh_token_999',
      expiresIn: 3600,
      obtainedAt: Date.now(),
      expiresAt: Date.now() + 3600 * 1000,
    };

    const refreshSpy = vi.spyOn(mockOAuth, 'refreshToken').mockResolvedValue(refreshedPayload);
    let callbackCalledWith: TwitchUserToken | null = null;

    const token = await tokenManager.getValidAccessToken('broadcaster_42', mockOAuth, (t) => {
      callbackCalledWith = t;
    });

    expect(refreshSpy).toHaveBeenCalledWith('valid_refresh_token');
    expect(token).toBe('new_fresh_access_token_999');
    expect(callbackCalledWith).toEqual(refreshedPayload);

    // Verify database was updated with new encrypted tokens
    const stored = tokenManager.getStoredTokens('broadcaster_42');
    expect(stored?.accessToken).toBe('new_fresh_access_token_999');
    expect(stored?.refreshToken).toBe('new_fresh_refresh_token_999');
  });

  it('revokes Twitch token and purges database records on disconnect', async () => {
    tokenManager.saveTokens('broadcaster_42', 'token_to_revoke', 'refresh_val', Date.now() + 100000);

    const revokeSpy = vi.spyOn(mockOAuth, 'revokeToken').mockResolvedValue(true);
    await tokenManager.revokeAndClear('broadcaster_42', mockOAuth);

    expect(revokeSpy).toHaveBeenCalledWith('token_to_revoke');
    expect(tokenManager.getStoredTokens('broadcaster_42')).toBeNull();
    expect(db.getEncryptedTokens('broadcaster_42')).toBeNull();
  });
});

