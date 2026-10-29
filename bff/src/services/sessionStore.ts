import pg from 'pg';
import { UserInfo } from '../plugins/session.js';

export interface KeycloakTokens {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_at?: number;
}

export interface StoredSession {
  sessionId: string;
  userId: string;
  user: UserInfo;
  tokens: KeycloakTokens;
  lastVerifiedAt: number;
}

// In-memory cache for ultra-fast lookup (< 1ms)
const memorySessions = new Map<string, StoredSession>();

export let pool: pg.Pool | null = null;

export function initDbPool(connectionString?: string): pg.Pool | null {
  const conn = connectionString || process.env.DATABASE_URL;
  if (!conn) {
    console.log('[SessionStore] No DATABASE_URL provided. Running in memory-only mode.');
    return null;
  }
  pool = new pg.Pool({ connectionString: conn });
  
  // Ensure table exists
  pool.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
        session_id VARCHAR(128) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        user_data JSONB NOT NULL,
        tokens JSONB NOT NULL,
        last_verified_at BIGINT DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
  `).catch(err => {
    console.warn('[SessionStore] Database init check warning:', err.message);
  });

  return pool;
}

export async function saveSession(
  sessionId: string,
  user: UserInfo,
  tokens: KeycloakTokens
): Promise<void> {
  const record: StoredSession = {
    sessionId,
    userId: user.id,
    user,
    tokens,
    lastVerifiedAt: Date.now(),
  };

  // 1. RAM Cache
  memorySessions.set(sessionId, record);

  // 2. PostgreSQL persistence
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO user_sessions (session_id, user_id, user_data, tokens, last_verified_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT (session_id) DO UPDATE SET
           user_data = EXCLUDED.user_data,
           tokens = EXCLUDED.tokens,
           last_verified_at = EXCLUDED.last_verified_at,
           updated_at = CURRENT_TIMESTAMP`,
        [sessionId, user.id, JSON.stringify(user), JSON.stringify(tokens), Date.now()]
      );
    } catch (err: any) {
      console.warn('[SessionStore] Warning inserting session in SQL:', err.message);
    }
  }
}

export async function getSession(sessionId: string): Promise<StoredSession | null> {
  if (!sessionId) return null;

  // 1. Check RAM Cache
  const cached = memorySessions.get(sessionId);
  if (cached) return cached;

  // 2. Check Database on cold start / cache miss
  if (pool) {
    try {
      const res = await pool.query(
        `SELECT session_id, user_id, user_data, tokens, last_verified_at 
         FROM user_sessions WHERE session_id = $1`,
        [sessionId]
      );
      if (res.rows && res.rows.length > 0) {
        const row = res.rows[0];
        const record: StoredSession = {
          sessionId: row.session_id,
          userId: row.user_id,
          user: typeof row.user_data === 'string' ? JSON.parse(row.user_data) : row.user_data,
          tokens: typeof row.tokens === 'string' ? JSON.parse(row.tokens) : row.tokens,
          lastVerifiedAt: Number(row.last_verified_at || 0),
        };
        memorySessions.set(sessionId, record);
        return record;
      }
    } catch (err: any) {
      console.warn('[SessionStore] Warning reading session from SQL:', err.message);
    }
  }

  return null;
}

export async function updateSessionTokens(
  sessionId: string,
  tokens: KeycloakTokens
): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;

  session.tokens = tokens;
  memorySessions.set(sessionId, session);

  if (pool) {
    try {
      await pool.query(
        `UPDATE user_sessions SET tokens = $1, updated_at = CURRENT_TIMESTAMP WHERE session_id = $2`,
        [JSON.stringify(tokens), sessionId]
      );
    } catch (err: any) {
      console.warn('[SessionStore] Warning updating tokens in SQL:', err.message);
    }
  }
}

export async function updateLastVerifiedAt(sessionId: string): Promise<void> {
  const now = Date.now();
  const session = memorySessions.get(sessionId);
  if (session) {
    session.lastVerifiedAt = now;
  }

  if (pool) {
    try {
      await pool.query(
        `UPDATE user_sessions SET last_verified_at = $1 WHERE session_id = $2`,
        [now, sessionId]
      );
    } catch {}
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  memorySessions.delete(sessionId);

  if (pool) {
    try {
      await pool.query(`DELETE FROM user_sessions WHERE session_id = $1`, [sessionId]);
    } catch (err: any) {
      console.warn('[SessionStore] Warning deleting session from SQL:', err.message);
    }
  }
}
