import initSqlJs, { Database } from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { BroadcasterConfig, RitualSnapshot, SourceMode, RitualState, VoteChoice } from '@raidrelay/contracts';
import { CHAMPIONSHIP_CONFIG } from '@raidrelay/fixtures';

export interface EncryptedTokensRecord {
  broadcasterId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  expiresAt: number;
  updatedAt: string;
}

export interface DatabaseRepository {
  getConfig(broadcasterId: string): BroadcasterConfig | null;
  getConfigByChannelKey(channelKey: string): BroadcasterConfig | null;
  saveConfig(config: BroadcasterConfig): void;
  rotateChannelKey(broadcasterId: string): string;
  saveRitual(snapshot: RitualSnapshot): void;
  getRitual(id: string): RitualSnapshot | null;
  recordVote(ritualId: string, voterHash: string, choice: string): boolean;
  hasVoted(ritualId: string, voterHash: string): boolean;
  isEventProcessed(messageId: string): boolean;
  markEventProcessed(messageId: string): void;
  saveEncryptedTokens(
    broadcasterId: string,
    encryptedAccessToken: string,
    encryptedRefreshToken: string,
    expiresAt: number
  ): void;
  getEncryptedTokens(broadcasterId: string): EncryptedTokensRecord | null;
  getLatestEncryptedTokens(): EncryptedTokensRecord | null;
  deleteTokens(broadcasterId: string): void;
  purgeOldEvents(ttlHours?: number): void;
  deleteLocalData(): void;
  close(): void;
}

let dbInstance: Database | null = null;
let dbFilePath: string = '';

export async function initDatabase(sqlitePath: string): Promise<DatabaseRepository> {
  const SQL = await initSqlJs();
  dbFilePath = sqlitePath;

  const dbDir = path.dirname(sqlitePath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (fs.existsSync(sqlitePath)) {
    const fileBuffer = fs.readFileSync(sqlitePath);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  // Initialize schema
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS broadcaster_config (
      broadcaster_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      activity TEXT NOT NULL,
      goal TEXT NOT NULL,
      community_norm TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      auto_approve INTEGER NOT NULL DEFAULT 0,
      channel_key TEXT NOT NULL UNIQUE,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rituals (
      id TEXT PRIMARY KEY,
      twitch_message_id TEXT,
      source_mode TEXT NOT NULL,
      state TEXT NOT NULL,
      raider_user_id TEXT,
      raider_display_name TEXT NOT NULL,
      viewer_count INTEGER NOT NULL,
      activity TEXT NOT NULL,
      goal TEXT NOT NULL,
      community_norm TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      votes_a INTEGER NOT NULL DEFAULT 0,
      votes_b INTEGER NOT NULL DEFAULT 0,
      total_votes INTEGER NOT NULL DEFAULT 0,
      selected_option TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      sequence_number INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS votes (
      ritual_id TEXT NOT NULL,
      voter_hash TEXT NOT NULL,
      choice TEXT NOT NULL,
      received_at TEXT NOT NULL,
      PRIMARY KEY (ritual_id, voter_hash)
    );

    CREATE TABLE IF NOT EXISTS processed_events (
      message_id TEXT PRIMARY KEY,
      received_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS broadcaster_tokens (
      broadcaster_id TEXT PRIMARY KEY,
      encrypted_access_token TEXT NOT NULL,
      encrypted_refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  persistToDisk();

  // Seed default championship config if table is empty
  const res = dbInstance.exec('SELECT COUNT(*) as count FROM broadcaster_config');
  const count = res[0]?.values[0]?.[0] as number;
  if (!count) {
    repo.saveConfig(CHAMPIONSHIP_CONFIG);
  }

  return repo;
}

function persistToDisk(): void {
  if (dbInstance && dbFilePath && !dbFilePath.includes(':memory:')) {
    try {
      const data = dbInstance.export();
      fs.writeFileSync(dbFilePath, Buffer.from(data));
    } catch {
      // Ignore disk write errors in ephemeral environments
    }
  }
}

const repo: DatabaseRepository = {
  getConfig(broadcasterId: string): BroadcasterConfig | null {
    if (!dbInstance) return null;
    const stmt = dbInstance.prepare('SELECT * FROM broadcaster_config WHERE broadcaster_id = :id');
    stmt.bind({ ':id': broadcasterId });
    if (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      stmt.free();
      return {
        broadcasterId: row.broadcaster_id as string,
        displayName: row.display_name as string,
        activity: row.activity as string,
        goal: row.goal as string,
        communityNorm: row.community_norm as string,
        optionA: row.option_a as string,
        optionB: row.option_b as string,
        autoApprove: Boolean(row.auto_approve),
        channelKey: row.channel_key as string,
        updatedAt: row.updated_at as string,
      };
    }
    stmt.free();
    return null;
  },

  getConfigByChannelKey(channelKey: string): BroadcasterConfig | null {
    if (!dbInstance) return null;
    const stmt = dbInstance.prepare('SELECT * FROM broadcaster_config WHERE channel_key = :key');
    stmt.bind({ ':key': channelKey });
    if (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      stmt.free();
      return {
        broadcasterId: row.broadcaster_id as string,
        displayName: row.display_name as string,
        activity: row.activity as string,
        goal: row.goal as string,
        communityNorm: row.community_norm as string,
        optionA: row.option_a as string,
        optionB: row.option_b as string,
        autoApprove: Boolean(row.auto_approve),
        channelKey: row.channel_key as string,
        updatedAt: row.updated_at as string,
      };
    }
    stmt.free();
    return null;
  },

  saveConfig(c: BroadcasterConfig): void {
    if (!dbInstance) return;
    dbInstance.run(
      `INSERT INTO broadcaster_config (
        broadcaster_id, display_name, activity, goal, community_norm, option_a, option_b, auto_approve, channel_key, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(broadcaster_id) DO UPDATE SET
        display_name = excluded.display_name,
        activity = excluded.activity,
        goal = excluded.goal,
        community_norm = excluded.community_norm,
        option_a = excluded.option_a,
        option_b = excluded.option_b,
        auto_approve = excluded.auto_approve,
        channel_key = excluded.channel_key,
        updated_at = excluded.updated_at`,
      [
        c.broadcasterId,
        c.displayName,
        c.activity,
        c.goal,
        c.communityNorm,
        c.optionA,
        c.optionB,
        c.autoApprove ? 1 : 0,
        c.channelKey,
        c.updatedAt,
      ]
    );
    persistToDisk();
  },

  rotateChannelKey(broadcasterId: string): string {
    const newKey = crypto.randomBytes(16).toString('hex');
    if (!dbInstance) return newKey;
    dbInstance.run(
      'UPDATE broadcaster_config SET channel_key = ?, updated_at = ? WHERE broadcaster_id = ?',
      [newKey, new Date().toISOString(), broadcasterId]
    );
    persistToDisk();
    return newKey;
  },

  saveRitual(s: RitualSnapshot): void {
    if (!dbInstance) return;
    dbInstance.run(
      `INSERT INTO rituals (
        id, twitch_message_id, source_mode, state, raider_user_id, raider_display_name, viewer_count,
        activity, goal, community_norm, option_a, option_b, votes_a, votes_b, total_votes,
        selected_option, started_at, completed_at, sequence_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        state = excluded.state,
        votes_a = excluded.votes_a,
        votes_b = excluded.votes_b,
        total_votes = excluded.total_votes,
        selected_option = excluded.selected_option,
        completed_at = excluded.completed_at,
        sequence_number = excluded.sequence_number`,
      [
        s.id,
        s.twitchMessageId,
        s.sourceMode,
        s.state,
        s.raiderUserId,
        s.raiderDisplayName,
        s.viewerCount,
        s.activity,
        s.goal,
        s.communityNorm,
        s.optionA,
        s.optionB,
        s.votesA,
        s.votesB,
        s.totalVotes,
        s.selectedOption,
        s.startedAt,
        s.completedAt,
        s.sequenceNumber,
      ]
    );
    persistToDisk();
  },

  getRitual(id: string): RitualSnapshot | null {
    if (!dbInstance) return null;
    const stmt = dbInstance.prepare('SELECT * FROM rituals WHERE id = :id');
    stmt.bind({ ':id': id });
    if (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      stmt.free();
      return {
        id: row.id as string,
        twitchMessageId: (row.twitch_message_id as string) || null,
        sourceMode: row.source_mode as SourceMode,
        state: row.state as RitualState,
        raiderUserId: (row.raider_user_id as string) || null,
        raiderDisplayName: row.raider_display_name as string,
        viewerCount: Number(row.viewer_count),
        activity: row.activity as string,
        goal: row.goal as string,
        communityNorm: row.community_norm as string,
        optionA: row.option_a as string,
        optionB: row.option_b as string,
        votesA: Number(row.votes_a),
        votesB: Number(row.votes_b),
        totalVotes: Number(row.total_votes),
        selectedOption: (row.selected_option as VoteChoice | 'SKIP' | 'EXPIRED' | null) || null,
        timeRemainingMs: 0,
        startedAt: row.started_at as string,
        completedAt: (row.completed_at as string) || null,
        sequenceNumber: Number(row.sequence_number),
      };
    }
    stmt.free();
    return null;
  },

  recordVote(ritualId: string, voterHash: string, choice: string): boolean {
    if (!dbInstance) return false;
    try {
      dbInstance.run(
        'INSERT INTO votes (ritual_id, voter_hash, choice, received_at) VALUES (?, ?, ?, ?)',
        [ritualId, voterHash, choice, new Date().toISOString()]
      );
      persistToDisk();
      return true;
    } catch {
      return false; // Duplicate vote rejected by unique constraint
    }
  },

  hasVoted(ritualId: string, voterHash: string): boolean {
    if (!dbInstance) return false;
    const stmt = dbInstance.prepare('SELECT 1 FROM votes WHERE ritual_id = :rId AND voter_hash = :vHash');
    stmt.bind({ ':rId': ritualId, ':vHash': voterHash });
    const exists = stmt.step();
    stmt.free();
    return exists;
  },

  isEventProcessed(messageId: string): boolean {
    if (!dbInstance) return false;
    const stmt = dbInstance.prepare('SELECT 1 FROM processed_events WHERE message_id = :mId');
    stmt.bind({ ':mId': messageId });
    const exists = stmt.step();
    stmt.free();
    return exists;
  },

  markEventProcessed(messageId: string): void {
    if (!dbInstance) return;
    dbInstance.run(
      'INSERT OR IGNORE INTO processed_events (message_id, received_at) VALUES (?, ?)',
      [messageId, new Date().toISOString()]
    );
    persistToDisk();
  },

  saveEncryptedTokens(
    broadcasterId: string,
    encryptedAccessToken: string,
    encryptedRefreshToken: string,
    expiresAt: number
  ): void {
    if (!dbInstance) return;
    dbInstance.run(
      `INSERT INTO broadcaster_tokens (broadcaster_id, encrypted_access_token, encrypted_refresh_token, expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(broadcaster_id) DO UPDATE SET
         encrypted_access_token = excluded.encrypted_access_token,
         encrypted_refresh_token = excluded.encrypted_refresh_token,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`,
      [broadcasterId, encryptedAccessToken, encryptedRefreshToken, expiresAt, new Date().toISOString()]
    );
    persistToDisk();
  },

  getEncryptedTokens(broadcasterId: string): EncryptedTokensRecord | null {
    if (!dbInstance) return null;
    const stmt = dbInstance.prepare('SELECT * FROM broadcaster_tokens WHERE broadcaster_id = :id');
    stmt.bind({ ':id': broadcasterId });
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return {
        broadcasterId: row.broadcaster_id as string,
        encryptedAccessToken: row.encrypted_access_token as string,
        encryptedRefreshToken: row.encrypted_refresh_token as string,
        expiresAt: row.expires_at as number,
        updatedAt: row.updated_at as string,
      };
    }
    stmt.free();
    return null;
  },

  getLatestEncryptedTokens(): EncryptedTokensRecord | null {
    if (!dbInstance) return null;
    const stmt = dbInstance.prepare('SELECT * FROM broadcaster_tokens ORDER BY updated_at DESC, rowid DESC LIMIT 1');
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return {
        broadcasterId: row.broadcaster_id as string,
        encryptedAccessToken: row.encrypted_access_token as string,
        encryptedRefreshToken: row.encrypted_refresh_token as string,
        expiresAt: row.expires_at as number,
        updatedAt: row.updated_at as string,
      };
    }
    stmt.free();
    return null;
  },

  deleteTokens(broadcasterId: string): void {
    if (!dbInstance) return;
    dbInstance.run('DELETE FROM broadcaster_tokens WHERE broadcaster_id = ?', [broadcasterId]);
    persistToDisk();
  },

  purgeOldEvents(ttlHours = 24): void {
    if (!dbInstance) return;
    const cutoff = new Date(Date.now() - ttlHours * 3600 * 1000).toISOString();
    dbInstance.run('DELETE FROM processed_events WHERE received_at < ?', [cutoff]);
    persistToDisk();
  },

  deleteLocalData(): void {
    if (!dbInstance) return;
    dbInstance.run('DELETE FROM votes');
    dbInstance.run('DELETE FROM rituals');
    dbInstance.run('DELETE FROM processed_events');
    dbInstance.run('DELETE FROM broadcaster_tokens');
    dbInstance.run('DELETE FROM broadcaster_config');
    dbInstance.run(
      `INSERT INTO broadcaster_config (
        broadcaster_id, display_name, activity, goal, community_norm, option_a, option_b, auto_approve, channel_key, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        CHAMPIONSHIP_CONFIG.broadcasterId,
        CHAMPIONSHIP_CONFIG.displayName,
        CHAMPIONSHIP_CONFIG.activity,
        CHAMPIONSHIP_CONFIG.goal,
        CHAMPIONSHIP_CONFIG.communityNorm,
        CHAMPIONSHIP_CONFIG.optionA,
        CHAMPIONSHIP_CONFIG.optionB,
        CHAMPIONSHIP_CONFIG.autoApprove ? 1 : 0,
        CHAMPIONSHIP_CONFIG.channelKey,
        new Date().toISOString(),
      ]
    );
    persistToDisk();
  },

  close(): void {
    persistToDisk();
    if (dbInstance) {
      dbInstance.close();
      dbInstance = null;
    }
  },
};
