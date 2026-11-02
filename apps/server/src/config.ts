import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root or server app
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export interface ServerConfig {
  PORT: number;
  HOST: string;
  NODE_ENV: 'development' | 'production' | 'test';
  APP_BASE_URL: string;
  CORS_ALLOWED_ORIGINS: string[];
  SESSION_SECRET: string;
  HMAC_VOTER_SALT: string;
  DATABASE_PATH: string;
  TWITCH_CLIENT_ID: string;
  TWITCH_CLIENT_SECRET: string;
  TWITCH_REDIRECT_URI: string;
  TWITCH_BOT_USER_ID: string;
  TWITCH_EVENTSUB_WS_URL: string;
  CODEX_SESSION_ID: string;
}

const nodeEnv = (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development';
const isProduction = nodeEnv === 'production';

const FORBIDDEN_SAMPLE_SECRETS = [
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
];

let sessionSecret = process.env.SESSION_SECRET;
let hmacVoterSalt = process.env.HMAC_VOTER_SALT;

if (isProduction) {
  if (!sessionSecret || sessionSecret.length < 32 || FORBIDDEN_SAMPLE_SECRETS.includes(sessionSecret)) {
    throw new Error('FATAL: In production, SESSION_SECRET must be set to a secure, unique string with at least 32 characters.');
  }
  if (!hmacVoterSalt || hmacVoterSalt.length < 32 || FORBIDDEN_SAMPLE_SECRETS.includes(hmacVoterSalt)) {
    throw new Error('FATAL: In production, HMAC_VOTER_SALT must be set to a secure, unique string with at least 32 characters.');
  }
} else {
  // In development/test, generate secure ephemeral in-memory random secrets if not explicitly set
  if (!sessionSecret || FORBIDDEN_SAMPLE_SECRETS.includes(sessionSecret)) {
    sessionSecret = crypto.randomBytes(32).toString('hex');
  }
  if (!hmacVoterSalt || FORBIDDEN_SAMPLE_SECRETS.includes(hmacVoterSalt)) {
    hmacVoterSalt = crypto.randomBytes(32).toString('hex');
  }
}

// 1. Explicit project-scoped override takes precedence; unrelated ambient CODEX_SESSION_ID is ignored
let resolvedCodexSessionId = process.env.RAIDRELAY_CODEX_SESSION_ID;

// 2. Otherwise use docs/evidence-index.json as canonical submission authority
if (!resolvedCodexSessionId) {
  try {
    const evidencePath = path.resolve(__dirname, '../../../docs/evidence-index.json');
    if (fs.existsSync(evidencePath)) {
      const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
      if (evidence.codexSessionId) {
        resolvedCodexSessionId = evidence.codexSessionId;
      }
    }
  } catch {
    // fallback
  }
}

// 3. Fallback default
if (!resolvedCodexSessionId) {
  resolvedCodexSessionId = '93a16a2b-a2a0-461f-851b-7a1e342fe97f';
}

export const config: ServerConfig = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  HOST: process.env.HOST || '127.0.0.1',
  NODE_ENV: nodeEnv,
  APP_BASE_URL: process.env.APP_BASE_URL || 'http://localhost:4000',
  CORS_ALLOWED_ORIGINS: (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:4000,http://127.0.0.1:3000,http://127.0.0.1:4000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  SESSION_SECRET: sessionSecret,
  HMAC_VOTER_SALT: hmacVoterSalt,
  DATABASE_PATH: process.env.DATABASE_PATH || path.resolve(__dirname, '../../data/raidrelay.sqlite'),
  TWITCH_CLIENT_ID: process.env.TWITCH_CLIENT_ID || '',
  TWITCH_CLIENT_SECRET: process.env.TWITCH_CLIENT_SECRET || '',
  TWITCH_REDIRECT_URI: process.env.TWITCH_REDIRECT_URI || 'http://localhost:4000/auth/twitch/callback',
  TWITCH_BOT_USER_ID: process.env.TWITCH_BOT_USER_ID || '',
  TWITCH_EVENTSUB_WS_URL: process.env.TWITCH_EVENTSUB_WS_URL || 'wss://eventsub.wss.twitch.tv/ws',
  CODEX_SESSION_ID: resolvedCodexSessionId,
};
