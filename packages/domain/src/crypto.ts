import crypto from 'node:crypto';

/**
 * Derives an ephemeral pseudonym for a Twitch user ID to guarantee one-person-one-vote
 * without storing raw Twitch user IDs persistently in analytics/logs.
 */
export function hashVoterId(voterUserId: string, salt: string): string {
  if (!voterUserId || !salt) {
    throw new Error('voterUserId and salt are required for voter hashing');
  }
  return crypto.createHmac('sha256', salt).update(voterUserId.trim()).digest('hex');
}

/**
 * Signs an immutable participation receipt payload using HMAC-SHA256 with key canonicalization.
 */
export function signReceipt(data: Record<string, unknown>, secretKey: string): string {
  const canonicalString = canonicalizeJson(data);
  return crypto.createHmac('sha256', secretKey).update(canonicalString).digest('hex');
}

/**
 * Constant-time verification of HMAC signature on receipt.
 */
export function verifyReceipt(data: Record<string, unknown>, signature: string, secretKey: string): boolean {
  if (!signature || typeof signature !== 'string') return false;
  const expected = signReceipt(data, secretKey);
  const expectedBuf = Buffer.from(expected, 'utf-8');
  const actualBuf = Buffer.from(signature, 'utf-8');
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Generates an unguessable 32-character hexadecimal channel access key for the OBS overlay.
 */
export function generateChannelKey(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Deterministically sorts object keys for tamper-evident canonical signatures.
 */
function canonicalizeJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalizeJson).join(',')}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalizeJson((obj as Record<string, unknown>)[key])}`);
  return `{${entries.join(',')}}`;
}

