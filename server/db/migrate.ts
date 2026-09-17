import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

/**
 * Minimal client surface the migrator needs. A `pg.Client` fits through `fromPgClient()`,
 * and a PGlite instance satisfies it directly (used by server/db/schema.test.ts).
 * `exec` must accept several statements in one string (simple query protocol).
 */
export interface MigrationClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
  exec(sql: string): Promise<unknown>;
}

export interface Migration {
  version: string;
  name: string;
  file: string;
  sql: string;
  checksum: string;
}

export interface MigrateOptions {
  dir?: string;
  log?: (message: string) => void;
}

export interface MigrateResult {
  applied: string[];
  alreadyApplied: string[];
}

// Resolved from the project root: the production server is a CommonJS bundle in dist/ (no import.meta),
// and Render and CI run from the repository root where server/db/migrations lives.
export const MIGRATIONS_DIR = path.join(process.cwd(), 'server', 'db', 'migrations');

// Arbitrary constant shared by every instance; only one migrator can hold it at a time.
const MIGRATION_LOCK_KEY = 7274365001;
const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export function loadMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  const files = fs.readdirSync(dir).filter(file => file.endsWith('.sql')).sort();
  const seen = new Set<string>();
  return files.map(file => {
    const match = FILE_PATTERN.exec(file);
    if (!match) {
      throw new Error(`Invalid migration file name "${file}" (expected NNNN_snake_case.sql)`);
    }
    const [, version, name] = match;
    if (seen.has(version)) {
      throw new Error(`Duplicate migration version ${version}`);
    }
    seen.add(version);
    // Normalize line endings so a Windows checkout produces the same checksum as Linux.
    const sql = fs.readFileSync(path.join(dir, file), 'utf-8').replace(/\r\n/g, '\n');
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(sql)) {
      throw new Error(`Migration ${file} must not contain transaction control; the runner wraps each file`);
    }
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    return { version, name, file, sql, checksum };
  });
}

/**
 * Applies pending migrations in order. Safe to call from several instances at once:
 * a session-level advisory lock serializes runners, and each file runs in its own transaction
 * together with its schema_migrations row, so a failure leaves no partial migration behind.
 */
export async function runMigrations(client: MigrationClient, options: MigrateOptions = {}): Promise<MigrateResult> {
  const log = options.log ?? (() => {});
  const migrations = loadMigrations(options.dir);

  const { rows: lockRows } = await client.query(`SELECT pg_try_advisory_lock(${MIGRATION_LOCK_KEY}) AS locked`);
  if (!lockRows[0]?.locked) {
    log('Another instance is running migrations; waiting for the lock...');
    await client.query(`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`);
  }

  try {
    await client.exec(`
      CREATE SCHEMA IF NOT EXISTS app;
      CREATE TABLE IF NOT EXISTS app.schema_migrations (
        version       text PRIMARY KEY,
        name          text NOT NULL,
        checksum      text NOT NULL,
        execution_ms  integer NOT NULL,
        applied_at    timestamptz NOT NULL DEFAULT now()
      );
    `);

    const { rows } = await client.query('SELECT version, name, checksum FROM app.schema_migrations ORDER BY version');
    const applied = new Map<string, { name: string; checksum: string }>(
      rows.map(row => [String(row.version), { name: String(row.name), checksum: String(row.checksum) }])
    );

    const known = new Set(migrations.map(m => m.version));
    for (const version of applied.keys()) {
      if (!known.has(version)) {
        log(`Warning: database has migration ${version} that is not present in ${options.dir ?? MIGRATIONS_DIR}`);
      }
    }

    const result: MigrateResult = { applied: [], alreadyApplied: [] };
    for (const migration of migrations) {
      const existing = applied.get(migration.version);
      if (existing) {
        if (existing.checksum !== migration.checksum) {
          throw new Error(
            `Migration ${migration.file} was modified after it was applied (checksum mismatch). ` +
              'Add a new migration instead of editing an applied one.'
          );
        }
        result.alreadyApplied.push(migration.file);
        continue;
      }

      const started = Date.now();
      await client.exec('BEGIN');
      try {
        await client.exec(migration.sql);
        await client.query(
          'INSERT INTO app.schema_migrations (version, name, checksum, execution_ms) VALUES ($1, $2, $3, $4)',
          [migration.version, migration.name, migration.checksum, Date.now() - started]
        );
        await client.exec('COMMIT');
      } catch (err) {
        await client.exec('ROLLBACK').catch(() => {});
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Migration ${migration.file} failed: ${message}`, { cause: err });
      }
      log(`Applied ${migration.file} (${Date.now() - started} ms)`);
      result.applied.push(migration.file);
    }
    return result;
  } finally {
    await client.query(`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`).catch(() => {});
  }
}

/**
 * For a connection that may not change the schema (the runtime role ralo_app): throws unless every migration
 * file is applied with an unchanged checksum, so a deploy never runs against an older schema.
 */
export async function assertMigrationsApplied(client: MigrationClient, dir?: string): Promise<void> {
  const { rows } = await client.query(
    `SELECT version, checksum FROM app.schema_migrations`
  ).catch(err => {
    throw new Error(`Cannot read app.schema_migrations (${err instanceof Error ? err.message : err}). Run the migrations with the owner connection first.`);
  });
  const applied = new Map(rows.map(row => [String(row.version), String(row.checksum)]));
  const problems = loadMigrations(dir).flatMap(m => {
    const checksum = applied.get(m.version);
    if (!checksum) return [`${m.file} is not applied`];
    return checksum === m.checksum ? [] : [`${m.file} was modified after it was applied`];
  });
  if (problems.length > 0) {
    throw new Error(
      `Database schema is not up to date: ${problems.join('; ')}. This connection may not change the schema: run ` +
      '`bun run db:migrate` with DATABASE_MIGRATION_URL (owner connection) before deploying, or set DATABASE_MIGRATION_URL on the server.'
    );
  }
}

export function fromPgClient(client: pg.ClientBase): MigrationClient {
  return {
    query: async (sql, params) => {
      const res = await client.query(sql, params as unknown[] | undefined);
      return { rows: res.rows };
    },
    exec: sql => client.query(sql)
  };
}

// Verifies the database TLS certificate (same rules as the application pool). Supabase's CA is not in
// Node's default trust store, so provide it (PEM) via DATABASE_SSL_CA.
function buildSslOptions(): pg.ClientConfig['ssl'] {
  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false') {
    console.warn('DATABASE_SSL_REJECT_UNAUTHORIZED=false: the database TLS certificate is NOT verified.');
    return { rejectUnauthorized: false };
  }
  const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n');
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true };
}

/** Connects with a dedicated (non-pooled) connection and applies pending migrations. */
export async function migrateDatabase(connectionString: string, options: MigrateOptions = {}): Promise<MigrateResult> {
  const url = new URL(connectionString);
  if (url.port === '6543') {
    // Supavisor transaction mode cannot hold a session advisory lock or run multi-statement files safely.
    throw new Error('Migrations need a direct or session-mode connection (port 5432), not the transaction pooler (6543).');
  }
  const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
  // sslmode in the URL would override the ssl option, so it is removed for remote hosts.
  url.searchParams.delete('sslmode');
  const client = new pg.Client({
    connectionString: isLocal ? connectionString : url.toString(),
    ssl: isLocal ? false : buildSslOptions(),
    application_name: 'ralo-migrate'
  });
  await client.connect();
  try {
    return await runMigrations(fromPgClient(client), options);
  } finally {
    await client.end();
  }
}
