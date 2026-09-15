// Applies pending SQL migrations from server/db/migrations.
// Usage: bun run db:migrate
// Uses DATABASE_MIGRATION_URL when set (Supabase: the direct or session connection on port 5432),
// otherwise DATABASE_URL.
import 'dotenv/config';
import { migrateDatabase } from '../server/db/migrate.js';

const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;

if (!url) {
  console.error('Set DATABASE_MIGRATION_URL or DATABASE_URL before running db:migrate.');
  process.exit(1);
}

try {
  const result = await migrateDatabase(url, { log: message => console.log(message) });
  console.log(
    `Migrations complete: ${result.applied.length} applied, ${result.alreadyApplied.length} already applied.`
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
