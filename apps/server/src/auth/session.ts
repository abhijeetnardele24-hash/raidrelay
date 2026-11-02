import crypto from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';

export interface BroadcasterSession {
  sessionId: string;
  tokenHash: string;
  broadcasterId: string;
  login: string;
  displayName: string;
  createdAt: number;
  expiresAt: number;
}

export class SessionManager {
  private sessions = new Map<string, BroadcasterSession>();
  private readonly ttlMs: number;

  constructor(ttlDays = 7) {
    this.ttlMs = ttlDays * 24 * 60 * 60 * 1000;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  public createSession(broadcasterId: string, login: string, displayName: string): { sessionToken: string; session: BroadcasterSession } {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(sessionToken);
    const now = Date.now();

    const session: BroadcasterSession = {
      sessionId: crypto.randomUUID(),
      tokenHash,
      broadcasterId,
      login,
      displayName,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };

    this.sessions.set(tokenHash, session);
    return { sessionToken, session };
  }

  public validateSession(sessionToken?: string): BroadcasterSession | null {
    if (!sessionToken || typeof sessionToken !== 'string') return null;

    const tokenHash = this.hashToken(sessionToken);
    const session = this.sessions.get(tokenHash);

    if (!session) return null;

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(tokenHash);
      return null;
    }

    return session;
  }

  public revokeSession(sessionToken?: string): void {
    if (!sessionToken || typeof sessionToken !== 'string') return;
    const tokenHash = this.hashToken(sessionToken);
    this.sessions.delete(tokenHash);
  }

  public revokeAllForBroadcaster(broadcasterId: string): void {
    for (const [hash, session] of this.sessions.entries()) {
      if (session.broadcasterId === broadcasterId) {
        this.sessions.delete(hash);
      }
    }
  }

  public purgeExpired(): void {
    const now = Date.now();
    for (const [hash, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(hash);
      }
    }
  }
}

export const sessionManager = new SessionManager();

export function getSessionFromRequest(req: FastifyRequest): BroadcasterSession | null {
  const cookies = req.cookies as Record<string, string> | undefined;
  const sessionToken = cookies?.raidrelay_session || (req.headers['x-broadcaster-session'] as string | undefined);
  return sessionManager.validateSession(sessionToken);
}

export function validateCsrf(req: FastifyRequest): boolean {
  // Only state-changing methods need CSRF validation
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return true;
  }

  const origin = req.headers.origin;
  if (!origin) {
    // If origin is missing, check referer or allow server-to-server in development/test
    if (config.NODE_ENV !== 'production') return true;
    const referer = req.headers.referer;
    if (!referer) return false;
    try {
      const refOrigin = new URL(referer).origin;
      return config.CORS_ALLOWED_ORIGINS.includes(refOrigin) || refOrigin === config.APP_BASE_URL;
    } catch {
      return false;
    }
  }

  // Exact match or development localhost match
  const matches = config.CORS_ALLOWED_ORIGINS.includes(origin) || origin === config.APP_BASE_URL;
  if (matches) return true;

  if (config.NODE_ENV !== 'production' && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
    return true;
  }

  return false;
}

export async function requireBroadcasterAuth(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<BroadcasterSession | null> {
  // CSRF validation on state-changing methods
  if (!validateCsrf(req)) {
    reply.status(403).send({ error: 'CSRF_REJECTED', message: 'State-changing request origin is not trusted.' });
    return null;
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Authentication required. Please connect your Twitch broadcaster account.',
    });
    return null;
  }

  return session;
}

