import { request } from 'undici';
import { config } from '../config.js';

export interface TwitchUserToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  obtainedAt: number;
  expiresAt: number;
}

export interface TwitchProfile {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl?: string;
}

export class TwitchOAuthService {
  constructor(
    private clientId = config.TWITCH_CLIENT_ID,
    private clientSecret = config.TWITCH_CLIENT_SECRET,
    private redirectUri = config.TWITCH_REDIRECT_URI
  ) {}

  public getAuthorizationUrl(state: string): string {
    const scopes = ['user:read:chat', 'user:write:chat'].join(' ');
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: scopes,
      state,
      force_verify: 'true',
    });
    return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
  }

  public async exchangeCode(code: string): Promise<TwitchUserToken> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
    });

    const res = await request('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (res.statusCode !== 200) {
      const errBody = await res.body.text();
      throw new Error(`Twitch token exchange failed (${res.statusCode}): ${errBody.substring(0, 100)}`);
    }

    const data = (await res.body.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const now = Date.now();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      obtainedAt: now,
      expiresAt: now + data.expires_in * 1000,
    };
  }

  public async refreshToken(refreshToken: string): Promise<TwitchUserToken> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const res = await request('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (res.statusCode !== 200) {
      const errBody = await res.body.text();
      throw new Error(`Twitch token refresh failed (${res.statusCode}): ${errBody.substring(0, 100)}`);
    }

    const data = (await res.body.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const now = Date.now();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      obtainedAt: now,
      expiresAt: now + data.expires_in * 1000,
    };
  }

  public async validateToken(accessToken: string): Promise<{ valid: boolean; userId?: string; login?: string; scopes?: string[] }> {
    try {
      const res = await request('https://id.twitch.tv/oauth2/validate', {
        method: 'GET',
        headers: {
          Authorization: `OAuth ${accessToken}`,
        },
      });

      if (res.statusCode === 200) {
        const body = (await res.body.json()) as { user_id?: string; login?: string; scopes?: string[] };
        return {
          valid: true,
          userId: body.user_id,
          login: body.login,
          scopes: body.scopes,
        };
      }
      return { valid: false };
    } catch {
      return { valid: false };
    }
  }

  public async revokeToken(token: string): Promise<boolean> {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        token,
      });
      const res = await request('https://id.twitch.tv/oauth2/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      return res.statusCode === 200;
    } catch {
      return false;
    }
  }

  public async fetchUserProfile(accessToken: string): Promise<TwitchProfile> {
    const res = await request('https://api.twitch.tv/helix/users', {
      method: 'GET',
      headers: {
        'Client-ID': this.clientId,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (res.statusCode !== 200) {
      const errBody = await res.body.text();
      throw new Error(`Twitch user profile fetch failed (${res.statusCode}): ${errBody.substring(0, 100)}`);
    }

    const data = (await res.body.json()) as { data: Array<{ id: string; login: string; display_name: string; profile_image_url?: string }> };
    const user = data.data?.[0];
    if (!user) {
      throw new Error('No user returned from Twitch profile query');
    }

    return {
      id: user.id,
      login: user.login,
      displayName: user.display_name,
      profileImageUrl: user.profile_image_url,
    };
  }
}
