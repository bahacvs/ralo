import path from 'path';
import pg from 'pg';
import { runMigrations, assertMigrationsApplied, fromPgClient, type MigrationClient } from './migrate.js';

// One interface over the production Postgres pool (Supabase) and PGlite, an in-process Postgres
// used for local development (file-backed) and tests (in memory). Both run the same migrations.

export interface Queryable {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Database extends Queryable {
  readonly kind: 'postgres' | 'pglite';
  /**
   * Runs fn in one transaction with the RLS request scope set:
   * 'global' for player, admin and background work, 'club:<uuid>' for club panel requests.
   */
  tx<T>(fn: (q: Queryable) => Promise<T>, scope?: string): Promise<T>;
  migrate(log?: (message: string) => void): Promise<void>;
  close(): Promise<void>;
}

// int8 (counts, sums) as numbers; values stay far below 2^53.
pg.types.setTypeParser(20, value => Number(value));
// numeric as numbers (ratings, coordinates cast to numeric).
pg.types.setTypeParser(1700, value => Number(value));

const SCOPE_PATTERN = /^(global|club:[0-9a-f-]{36})$/;

function assertScope(scope: string) {
  if (!SCOPE_PATTERN.test(scope)) {
    throw new Error(`Invalid request scope "${scope}"`);
  }
}

class PostgresDatabase implements Database {
  readonly kind = 'postgres' as const;

  constructor(private pool: pg.Pool) {}

  async query<T = any>(sql: string, params: unknown[] = []) {
    const result = await this.pool.query(sql, params);
    return { rows: result.rows as T[] };
  }

  async tx<T>(fn: (q: Queryable) => Promise<T>, scope = 'global'): Promise<T> {
    assertScope(scope);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.scope', $1, true)`, [scope]);
      const result = await fn({
        query: async <R = any>(sql: string, params: unknown[] = []) => ({ rows: (await client.query(sql, params)).rows as R[] })
      });
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async migrate(log?: (message: string) => void) {
    const client = await this.pool.connect();
    try {
      // The least-privilege runtime role (ralo_app) cannot change the schema; it only checks nothing is pending
      const { rows } = await client.query(
        `SELECT to_regnamespace('app') IS NULL OR has_schema_privilege('app', 'CREATE') AS can_migrate`
      );
      if (rows[0]?.can_migrate) {
        await runMigrations(fromPgClient(client), { log });
      } else {
        await assertMigrationsApplied(fromPgClient(client));
        log?.('Schema is up to date (runtime role without schema privileges; migrations run with DATABASE_MIGRATION_URL).');
      }
    } finally {
      client.release();
    }
  }

  close() {
    return this.pool.end();
  }
}

interface PGliteLike extends MigrationClient {
  transaction<T>(fn: (tx: { query: MigrationClient['query'] }) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

class PgliteDatabase implements Database {
  readonly kind = 'pglite' as const;

  constructor(private db: PGliteLike) {}

  async query<T = any>(sql: string, params: unknown[] = []) {
    const result = await this.db.query(sql, params);
    return { rows: result.rows as T[] };
  }

  tx<T>(fn: (q: Queryable) => Promise<T>, scope = 'global'): Promise<T> {
    assertScope(scope);
    return this.db.transaction(async tx => {
      await tx.query(`SELECT set_config('app.scope', $1, true)`, [scope]);
      return fn({ query: async <R = any>(sql: string, params: unknown[] = []) => ({ rows: (await tx.query(sql, params)).rows as R[] }) });
    });
  }

  async migrate(log?: (message: string) => void) {
    await runMigrations(this.db, { log });
  }

  close() {
    return this.db.close();
  }
}

// Verifies the database TLS certificate. Supabase's CA is not in Node's default trust store,
// so provide it (PEM) via DATABASE_SSL_CA.
function buildSslOptions(): pg.PoolConfig['ssl'] {
  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false') {
    console.warn('DATABASE_SSL_REJECT_UNAUTHORIZED=false: the database TLS certificate is NOT verified.');
    return { rejectUnauthorized: false };
  }
  const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n');
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true };
}

export function createPostgresDatabase(connectionString: string): Database {
  const url = new URL(connectionString);
  if (url.port === '6543') {
    throw new Error('DATABASE_URL must be a session-mode connection (port 5432), not the transaction pooler (6543).');
  }
  const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
  // sslmode in the URL would override the ssl option, so it is removed for remote hosts
  url.searchParams.delete('sslmode');
  const pool = new pg.Pool({
    connectionString: isLocal ? connectionString : url.toString(),
    ssl: isLocal ? false : buildSslOptions(),
    max: Number(process.env.DATABASE_POOL_MAX) || 10,
    application_name: 'ralo-api'
  });
  pool.on('error', err => console.error('Postgres pool error:', err.message));
  // Statements outside tx() (player, admin and job reads) run in the 'global' scope. Without a default the
  // tenant policies fail closed for the least-privilege role ralo_app and those queries would see no rows;
  // tx(fn, 'club:<id>') still narrows club panel work with SET LOCAL, which reverts to this at commit.
  pool.on('connect', client => {
    client.query(`SELECT set_config('app.scope', 'global', false)`).catch(err => {
      console.error('Could not set the default request scope:', err.message);
    });
  });
  return new PostgresDatabase(pool);
}

/** In-process Postgres. dataDir persists to disk; omit it for a throwaway in-memory database. */
export async function createPgliteDatabase(dataDir?: string): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { btree_gist } = await import('@electric-sql/pglite/contrib/btree_gist');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const db = new PGlite({ dataDir, extensions: { btree_gist, pgcrypto } });
  await db.waitReady;
  return new PgliteDatabase(db as unknown as PGliteLike);
}

/** DATABASE_URL selects Postgres; without it development uses a PGlite directory under data/. */
export async function createDatabase(): Promise<Database> {
  if (process.env.DATABASE_URL) {
    return createPostgresDatabase(process.env.DATABASE_URL);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required in production');
  }
  const dataDir = process.env.PGLITE_DATA_DIR || path.join(process.cwd(), 'data', 'pglite');
  return createPgliteDatabase(dataDir);
}

/** SQLSTATE of a Postgres/PGlite error, if any. */
export function sqlState(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : undefined;
}
