import crypto from 'crypto';
import fs from 'fs';
import { once } from 'events';
import { PassThrough, Readable, Transform, pipeline, type Writable } from 'stream';
import { pipeline as pipelineAsync } from 'stream/promises';
import zlib from 'zlib';

/**
 * Logical backup of the `app` schema without pg_dump (Supabase's free plan has no downloadable backups).
 *
 * File: gzip of tab-prefixed JSON lines, optionally encrypted with a passphrase (AES-256-GCM, scrypt key):
 *   H <header: format, created at, applied migrations>
 *   T <table: name, columns>        R <row as JSON>  (repeated)
 *   E <trailer: row count per table> (a file without it is incomplete)
 * All tables are read in one REPEATABLE READ snapshot, so the copy is consistent. Restore goes into a freshly
 * migrated database with the same migrations, with triggers off (session_replication_role = replica) because
 * the rows already passed every check when they were written.
 */

/** One database connection (a pg.Client or a PGlite instance), so BEGIN, cursors and SET apply to it. */
export interface SqlConnection {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

const FORMAT = 'ralo-backup';
const FORMAT_VERSION = 1;
const FETCH_SIZE = 500;
const INSERT_BATCH = 500;
/** Transient counters: nothing to restore. */
const SKIPPED_TABLES = new Set(['schema_migrations', 'rate_limit_counters']);

const MAGIC = Buffer.from('RALOBK1\n');
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
export const MIN_PASSPHRASE_LENGTH = 16;

interface TableInfo {
  name: string;
  columns: string[];
}

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function listTables(conn: SqlConnection): Promise<TableInfo[]> {
  const { rows } = await conn.query<{ relname: string }>(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'app' AND c.relkind IN ('r', 'p') AND NOT c.relispartition ORDER BY c.relname`
  );
  const tables: TableInfo[] = [];
  for (const { relname } of rows) {
    if (SKIPPED_TABLES.has(relname)) continue;
    // Generated columns are recomputed on insert, so they are neither saved nor restored
    const columns = await conn.query<{ attname: string }>(
      `SELECT a.attname FROM pg_attribute a
       WHERE a.attrelid = format('app.%I', $1::text)::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
       ORDER BY a.attnum`,
      [relname]
    );
    tables.push({ name: relname, columns: columns.rows.map(c => c.attname) });
  }
  return tables;
}

async function appliedMigrations(conn: SqlConnection): Promise<[string, string][]> {
  const { rows } = await conn.query<{ version: string; checksum: string }>(
    `SELECT version, checksum FROM app.schema_migrations ORDER BY version`
  );
  return rows.map(r => [String(r.version), String(r.checksum)]);
}

/** Writes every app table as backup lines to `out` (uncompressed text) from one consistent snapshot. */
export async function writeBackupLines(conn: SqlConnection, out: Writable): Promise<Record<string, number>> {
  const write = async (line: string) => {
    if (!out.write(line + '\n')) await once(out, 'drain');
  };
  const counts: Record<string, number> = {};
  await conn.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await conn.query(`SET LOCAL TIME ZONE 'UTC'`);
    const migrations = await appliedMigrations(conn);
    await write(`H\t${JSON.stringify({ format: FORMAT, version: FORMAT_VERSION, createdAt: new Date().toISOString(), migrations })}`);
    for (const table of await listTables(conn)) {
      await write(`T\t${JSON.stringify(table)}`);
      const select = table.columns.map(ident).join(', ');
      await conn.query(`DECLARE backup_cursor NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS j FROM (SELECT ${select} FROM app.${ident(table.name)}) t`);
      let count = 0;
      for (;;) {
        const { rows } = await conn.query<{ j: string }>(`FETCH ${FETCH_SIZE} FROM backup_cursor`);
        for (const row of rows) await write(`R\t${row.j}`);
        count += rows.length;
        if (rows.length < FETCH_SIZE) break;
      }
      await conn.query('CLOSE backup_cursor');
      counts[table.name] = count;
    }
    await write(`E\t${JSON.stringify({ counts })}`);
    await conn.query('COMMIT');
  } catch (err) {
    await conn.query('ROLLBACK').catch(() => {});
    throw err;
  }
  return counts;
}

export interface RestoreOptions {
  /** Restore even when the target already has users or clubs (they are replaced). */
  replaceExistingData?: boolean;
}

/**
 * Restores backup lines into a migrated database in one transaction. Refuses when the target's migrations differ
 * from the backup's, when the file is incomplete, or (unless replaceExistingData) when the target has users or clubs.
 */
export async function restoreBackupLines(
  conn: SqlConnection, lines: AsyncIterable<string>, options: RestoreOptions = {}
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  let header: { format: string; version: number; migrations: [string, string][] } | null = null;
  let trailer: { counts: Record<string, number> } | null = null;
  let current: TableInfo | null = null;
  let batch: string[] = [];
  let targetTables = new Map<string, TableInfo>();

  const flush = async () => {
    if (!current || batch.length === 0) return;
    const columns = current.columns.map(ident).join(', ');
    await conn.query(
      `INSERT INTO app.${ident(current.name)} (${columns}) OVERRIDING SYSTEM VALUE
       SELECT ${columns} FROM json_populate_recordset(NULL::app.${ident(current.name)}, $1::json)`,
      [`[${batch.join(',')}]`]
    );
    counts[current.name] = (counts[current.name] ?? 0) + batch.length;
    batch = [];
  };

  await conn.query('BEGIN');
  try {
    for await (const line of lines) {
      if (!line) continue;
      const kind = line.slice(0, 2);
      const body = line.slice(2);
      if (trailer) throw new Error('Backup file has data after its end marker.');
      if (!header) {
        if (kind !== 'H\t') throw new Error('Not a RALO backup file.');
        header = JSON.parse(body);
        if (header!.format !== FORMAT || header!.version !== FORMAT_VERSION) throw new Error('Unsupported backup format.');
        const target = await appliedMigrations(conn);
        if (JSON.stringify(target) !== JSON.stringify(header!.migrations)) {
          const last = (list: [string, string][]) => list[list.length - 1]?.[0] ?? 'none';
          throw new Error(
            `Migrations differ: the backup was taken at ${last(header!.migrations)}, the target is at ${last(target)}. ` +
            'Migrate an empty target database to exactly the migrations of the backup first.'
          );
        }
        const existing = await conn.query<{ n: number }>(
          `SELECT (SELECT count(*) FROM app.users) + (SELECT count(*) FROM app.clubs) AS n`
        );
        if (Number(existing.rows[0].n) > 0 && !options.replaceExistingData) {
          throw new Error('The target database already has users or clubs. Restore into an empty, freshly migrated database.');
        }
        targetTables = new Map((await listTables(conn)).map(t => [t.name, t]));
        // Rows already passed every trigger and constraint when they were first written; the migrations' reference
        // rows (cities, amenities) are replaced by the backup's copies
        await conn.query('SET LOCAL session_replication_role = replica');
        await conn.query(`TRUNCATE ${[...targetTables.keys()].map(t => `app.${ident(t)}`).join(', ')}`);
        continue;
      }
      if (kind === 'T\t') {
        await flush();
        const table = JSON.parse(body) as TableInfo;
        const target = targetTables.get(table.name);
        if (!target || JSON.stringify(target.columns) !== JSON.stringify(table.columns)) {
          throw new Error(`Table app.${table.name} does not match the target schema.`);
        }
        current = table;
      } else if (kind === 'R\t') {
        if (!current) throw new Error('Backup row outside a table.');
        batch.push(body);
        if (batch.length >= INSERT_BATCH) await flush();
      } else if (kind === 'E\t') {
        await flush();
        trailer = JSON.parse(body);
      } else {
        throw new Error('Backup file is corrupt (unknown line).');
      }
    }
    if (!header) throw new Error('Backup file is empty.');
    if (!trailer) throw new Error('Backup file is incomplete (no end marker): it was cut off while writing or copying.');
    for (const [table, expected] of Object.entries(trailer.counts)) {
      if ((counts[table] ?? 0) !== expected) {
        throw new Error(`Row count mismatch for app.${table}: expected ${expected}, read ${counts[table] ?? 0}.`);
      }
    }

    // Identity columns continue after the restored ids
    const { rows: sequences } = await conn.query<{ tbl: string; col: string; seq: string }>(
      `SELECT c.relname AS tbl, a.attname AS col, pg_get_serial_sequence(format('app.%I', c.relname), a.attname) AS seq
       FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'app' AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
         AND pg_get_serial_sequence(format('app.%I', c.relname), a.attname) IS NOT NULL`
    );
    for (const s of sequences) {
      await conn.query(
        `SELECT setval($1::regclass, COALESCE((SELECT max(${ident(s.col)}) FROM app.${ident(s.tbl)}), 1),
                       (SELECT max(${ident(s.col)}) IS NOT NULL FROM app.${ident(s.tbl)}))`,
        [s.seq]
      );
    }
    await conn.query('COMMIT');
  } catch (err) {
    await conn.query('ROLLBACK').catch(() => {});
    throw err;
  }
  return counts;
}

// -------------------------------------------------------------
// Files: gzip, optionally encrypted with a passphrase
// -------------------------------------------------------------

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passphrase.normalize('NFKC'), salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

/** Writes a backup file; with a passphrase the gzip stream is encrypted (AES-256-GCM, tag at the end). */
export async function writeBackupFile(conn: SqlConnection, filePath: string, passphrase: string | null): Promise<Record<string, number>> {
  if (passphrase !== null && passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`BACKUP_PASSPHRASE must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
  const text = new PassThrough();
  const file = fs.createWriteStream(filePath, { mode: 0o600 });
  let finished: Promise<void>;
  if (passphrase === null) {
    finished = pipelineAsync(text, zlib.createGzip(), file);
  } else {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
    let headerWritten = false;
    const frame = new Transform({
      transform(chunk, _enc, cb) {
        if (!headerWritten) {
          headerWritten = true;
          this.push(Buffer.concat([MAGIC, salt, iv]));
        }
        cb(null, chunk);
      },
      flush(cb) {
        if (!headerWritten) this.push(Buffer.concat([MAGIC, salt, iv]));
        cb(null, cipher.getAuthTag());
      }
    });
    finished = pipelineAsync(text, zlib.createGzip(), cipher, frame, file);
  }
  try {
    const counts = await writeBackupLines(conn, text);
    text.end();
    await finished;
    return counts;
  } catch (err) {
    text.destroy(err as Error);
    await finished.catch(() => {});
    await fs.promises.rm(filePath, { force: true });
    throw err;
  }
}

/** Splits a text stream into lines; stream errors (bad gzip, missing file) are thrown to the reader. */
async function* linesOf(stream: Readable): AsyncGenerator<string> {
  stream.setEncoding('utf8');
  let rest = '';
  for await (const chunk of stream) {
    const parts = (rest + chunk).split('\n');
    rest = parts.pop() ?? '';
    yield* parts;
  }
  if (rest) yield rest;
}

/**
 * Reads the lines of a backup file. The file is loaded into memory (compressed backups of this schema stay small), so an
 * encrypted file is authenticated in full before a single row is restored.
 */
export async function readBackupFile(filePath: string, passphrase: string | null): Promise<AsyncIterable<string>> {
  const data = await fs.promises.readFile(filePath);
  let gzipped: Buffer;
  if (data.subarray(0, MAGIC.length).equals(MAGIC)) {
    if (!passphrase) throw new Error('This backup is encrypted: set BACKUP_PASSPHRASE.');
    const prefix = MAGIC.length + SALT_LENGTH + IV_LENGTH;
    if (data.length < prefix + TAG_LENGTH) throw new Error('Backup file is truncated.');
    const salt = data.subarray(MAGIC.length, MAGIC.length + SALT_LENGTH);
    const iv = data.subarray(MAGIC.length + SALT_LENGTH, prefix);
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
    decipher.setAuthTag(data.subarray(data.length - TAG_LENGTH));
    try {
      gzipped = Buffer.concat([decipher.update(data.subarray(prefix, data.length - TAG_LENGTH)), decipher.final()]);
    } catch {
      throw new Error('Cannot decrypt the backup: wrong passphrase or damaged file.');
    }
  } else {
    gzipped = data;
  }
  return linesOf(pipeline(Readable.from([gzipped]), zlib.createGunzip(), () => {}));
}
