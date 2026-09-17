// Writes an encrypted logical backup of the app schema (every table, one consistent snapshot).
// Usage: bun run db:backup [output directory, default backups/]
// Connects with DATABASE_MIGRATION_URL (owner connection, sees every row), otherwise DATABASE_URL.
// BACKUP_PASSPHRASE (16+ characters, kept in the password manager) encrypts the file; the backup holds personal data,
// so an unencrypted file needs --unencrypted and must never leave this machine.
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { connectDirect } from '../server/db/migrate.js';
import { writeBackupFile } from '../server/db/backup.js';

const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
const unencrypted = process.argv.includes('--unencrypted');
const passphrase = unencrypted ? null : process.env.BACKUP_PASSPHRASE || null;
const outputDir = process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? 'backups';

if (!url) {
  console.error('Set DATABASE_MIGRATION_URL (or DATABASE_URL) to the database to back up.');
  process.exit(1);
}
if (!passphrase && !unencrypted) {
  console.error('Set BACKUP_PASSPHRASE to encrypt the backup (or pass --unencrypted for a copy that never leaves this machine).');
  process.exit(1);
}

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
fs.mkdirSync(outputDir, { recursive: true });
const file = path.join(outputDir, `ralo-${stamp}${passphrase ? '.ralobk' : '.jsonl.gz'}`);

const client = await connectDirect(url, 'ralo-backup');
try {
  const started = Date.now();
  const counts = await writeBackupFile(client, file, passphrase);
  const rows = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const size = fs.statSync(file).size;
  console.log(`Backup written: ${file}`);
  console.log(`${Object.keys(counts).length} tables, ${rows} rows, ${Math.ceil(size / 1024)} KB, ${Date.now() - started} ms`);
  console.log(`Users: ${counts.users ?? 0}, clubs: ${counts.clubs ?? 0}, reservations: ${counts.reservations ?? 0}`);
} catch (err) {
  console.error('Backup failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
