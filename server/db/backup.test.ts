/**
 * Backup and restore round trip: seed a database, back it up (encrypted), restore it into a freshly migrated one and
 * compare every table. Run: npx tsx server/db/backup.test.ts. With TEST_DATABASE_URL (local throwaway Postgres, CI)
 * it uses new databases on that server instead of in-memory PGlite, so the restore runs on a real Postgres.
 */
process.env.MAIL_PROVIDER = 'console';
process.env.DEMO_MODE = 'false';

import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import pg from 'pg';
import '../time.js';
import { createPgliteDatabase, createPostgresDatabase, type Database } from './client.js';
import { setDatabase } from './instance.js';
import { seedDemoData } from './seed.js';
import { writeBackupFile, readBackupFile, restoreBackupLines, type SqlConnection } from './backup.js';

let passed = 0;
let failed = 0;

function check(condition: unknown, name: string, detail?: unknown) {
  if (condition) {
    console.log(`  ok   ${name}`);
    passed++;
  } else {
    console.error(`  FAIL ${name}${detail !== undefined ? ` - ${JSON.stringify(detail)}` : ''}`);
    failed++;
  }
}

/** The error message when fn throws one matching pattern; otherwise null (no error) or "unexpected: ...". */
async function rejects(fn: () => Promise<unknown>, pattern: RegExp): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return pattern.test(message) ? message : `unexpected: ${message}`;
  }
}

interface Target {
  db: Database;
  /** One connection for BEGIN and cursors (PGlite has only one; on Postgres a dedicated client). */
  conn: SqlConnection;
  close(): Promise<void>;
}

async function openTargets(): Promise<{ open: () => Promise<Target>; cleanup: () => Promise<void> }> {
  const serverUrl = process.env.TEST_DATABASE_URL;
  if (!serverUrl) {
    return {
      open: async () => {
        const db = await createPgliteDatabase();
        await db.migrate();
        return { db, conn: db, close: () => db.close() };
      },
      cleanup: async () => {}
    };
  }
  if (!['localhost', '127.0.0.1'].includes(new URL(serverUrl).hostname)) {
    throw new Error('TEST_DATABASE_URL must point at a local throwaway Postgres.');
  }
  const admin = new pg.Client({ connectionString: serverUrl });
  await admin.connect();
  const created: string[] = [];
  return {
    open: async () => {
      const name = `ralo_backup_test_${created.length}`;
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.query(`CREATE DATABASE ${name}`);
      created.push(name);
      const url = new URL(serverUrl);
      url.pathname = `/${name}`;
      const db = createPostgresDatabase(url.toString());
      await db.migrate();
      const client = new pg.Client({ connectionString: url.toString() });
      await client.connect();
      return { db, conn: client, close: async () => { await client.end(); await db.close(); } };
    },
    cleanup: async () => {
      for (const name of created) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => {});
      await admin.end();
    }
  };
}

/** Row count and a digest of every row (generated columns included) per app table. */
async function fingerprint(conn: SqlConnection): Promise<Record<string, string>> {
  await conn.query(`SET TIME ZONE 'UTC'`);
  const { rows: tables } = await conn.query<{ relname: string }>(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'app' AND c.relkind IN ('r','p') AND c.relname NOT IN ('schema_migrations','rate_limit_counters')
     ORDER BY c.relname`
  );
  const result: Record<string, string> = {};
  for (const { relname } of tables) {
    const { rows } = await conn.query<{ n: number; digest: string }>(
      `SELECT count(*)::int AS n, md5(coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text), '')) AS digest
       FROM app."${relname}" t`
    );
    result[relname] = `${rows[0].n}:${rows[0].digest}`;
  }
  return result;
}

async function main() {
  console.log('\nBackup and restore tests\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralo-backup-'));
  const { open, cleanup } = await openTargets();
  const source = await open();
  const passphrase = 'doğru at pil zımba 2026';
  try {
    setDatabase(source.db);
    await seedDemoData(source.db);
    // Binary data and characters that must survive the JSON round trip
    const club = (await source.db.query<{ id: string }>(`SELECT id FROM app.clubs ORDER BY created_at LIMIT 1`)).rows[0];
    const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from(Array.from({ length: 300 }, (_, i) => i % 256))]);
    await source.db.query(
      `INSERT INTO app.media_assets (club_id, purpose, content_type, data) VALUES ($1, 'club_cover', 'image/png', $2)`, [club.id, bytes]
    );
    await source.db.query(`UPDATE app.clubs SET address = $1 WHERE id = $2`, ['Tırnak " ters\\eğik çizgi\tsekme\nsatır 🎾', club.id]);

    const before = await fingerprint(source.conn);
    const encryptedFile = path.join(dir, 'ralo.ralobk');
    const counts = await writeBackupFile(source.conn, encryptedFile, passphrase);
    const raw = fs.readFileSync(encryptedFile);
    check(counts.users > 0 && counts.reservations > 0 && counts.media_assets === 1 && raw.subarray(0, 8).toString() === 'RALOBK1\n',
      'Yedek şifreli dosyaya yazıldı', counts);

    const target = await open();
    try {
      const wrong = await rejects(async () => readBackupFile(encryptedFile, 'yanlis parola 1234567'), /wrong passphrase/);
      check(wrong !== null && !wrong.startsWith('unexpected'), 'Yanlış parolayla yedek açılamadı', wrong);

      const restored = await restoreBackupLines(target.conn, await readBackupFile(encryptedFile, passphrase));
      const after = await fingerprint(target.conn);
      const differing = Object.keys(before).filter(t => before[t] !== after[t]);
      check(differing.length === 0 && restored.users === counts.users, 'Geri yüklenen veritabanı tablo tablo, satır satır aynı',
        differing.map(t => ({ t, before: before[t], after: after[t] })));

      const media = await target.conn.query<{ data: Buffer | Uint8Array }>(`SELECT data FROM app.media_assets`);
      check(Buffer.compare(Buffer.from(media.rows[0].data), bytes) === 0, 'İkili veri (fotoğraf) bayt bayt korundu');

      const maxBefore = await source.conn.query<{ m: number | null }>(`SELECT max(id)::int AS m FROM app.districts`);
      const district = await target.conn.query<{ id: number }>(
        `INSERT INTO app.districts (city_id, name, slug) VALUES (35, 'Geri Yükleme İlçesi', 'geri-yukleme-ilcesi') RETURNING id`
      );
      check(district.rows[0].id > (maxBefore.rows[0].m ?? 0), 'Otomatik artan kimlikler geri yüklemeden sonra kaldığı yerden devam etti',
        { id: district.rows[0].id, max: maxBefore.rows[0].m });

      const rateRows = (await target.conn.query<{ n: number }>(`SELECT count(*)::int AS n FROM app.platform_fee_rates`)).rows[0].n;
      const triggerActive = await rejects(() => target.conn.query(`UPDATE app.platform_fee_rates SET amount_kurus = amount_kurus + 1`), /./);
      check(rateRows > 0 && triggerActive !== null, 'Geri yüklemeden sonra veritabanı kuralları (tetikleyiciler) yeniden devrede', { rateRows, triggerActive });

      const again = await rejects(async () => restoreBackupLines(target.conn, await readBackupFile(encryptedFile, passphrase)), /already has users/);
      check(again !== null && !again.startsWith('unexpected'), 'Dolu bir veritabanının üzerine geri yükleme reddedildi', again);
    } finally {
      await target.close();
    }

    const plainFile = path.join(dir, 'ralo.jsonl.gz');
    await writeBackupFile(source.conn, plainFile, null);
    const text = zlib.gunzipSync(fs.readFileSync(plainFile)).toString('utf8');
    const truncatedFile = path.join(dir, 'truncated.jsonl.gz');
    fs.writeFileSync(truncatedFile, zlib.gzipSync(text.slice(0, Math.floor(text.length * 0.6))));
    const partial = await open();
    try {
      const truncated = await rejects(async () => restoreBackupLines(partial.conn, await readBackupFile(truncatedFile, null)), /incomplete|mismatch|json/i);
      const users = await partial.conn.query<{ n: number }>(`SELECT count(*)::int AS n FROM app.users`);
      check(truncated !== null && !truncated.startsWith('unexpected') && users.rows[0].n === 0,
        'Yarım kalmış yedek reddedildi ve hedef veritabanına hiçbir satır yazılmadı', { truncated, users: users.rows[0].n });
    } finally {
      await partial.close();
    }
  } finally {
    await source.close();
    await cleanup();
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
