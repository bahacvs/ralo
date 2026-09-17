// Restores a backup written by `bun run db:backup` into an EMPTY database (restore drill or disaster recovery).
// Usage: RESTORE_DATABASE_URL=... BACKUP_PASSPHRASE=... bun run db:restore <backup file>
// The target is never taken from DATABASE_URL, so a restore cannot overwrite the live database by accident.
// Pending migrations are applied to the target first; the backup must come from the same migrations.
import 'dotenv/config';
import { connectDirect, runMigrations, fromPgClient } from '../server/db/migrate.js';
import { readBackupFile, restoreBackupLines } from '../server/db/backup.js';

const url = process.env.RESTORE_DATABASE_URL;
const file = process.argv.slice(2).find(arg => !arg.startsWith('--'));

if (!url || !file) {
  console.error('Usage: RESTORE_DATABASE_URL=<empty target database, owner connection> bun run db:restore <backup file>');
  process.exit(1);
}
if ([process.env.DATABASE_URL, process.env.DATABASE_MIGRATION_URL].includes(url)) {
  console.error('RESTORE_DATABASE_URL equals DATABASE_URL or DATABASE_MIGRATION_URL. Restore into a separate, empty database.');
  process.exit(1);
}

const client = await connectDirect(url, 'ralo-restore');
try {
  const lines = await readBackupFile(file, process.env.BACKUP_PASSPHRASE || null);
  const migrated = await runMigrations(fromPgClient(client), { log: message => console.log(message) });
  console.log(`Target migrations: ${migrated.applied.length} applied, ${migrated.alreadyApplied.length} already applied.`);
  const started = Date.now();
  const counts = await restoreBackupLines(client, lines);
  const rows = Object.values(counts).reduce((sum, n) => sum + n, 0);
  console.log(`Restore complete: ${Object.keys(counts).length} tables, ${rows} rows, ${Date.now() - started} ms`);
  console.log(`Users: ${counts.users ?? 0}, clubs: ${counts.clubs ?? 0}, reservations: ${counts.reservations ?? 0}`);
} catch (err) {
  console.error('Restore failed (no rows were restored):', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
