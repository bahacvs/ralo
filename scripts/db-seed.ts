// Seeds demo clubs, courts, players and open matches into an empty database.
// Usage: bun run db:seed
// Without DATABASE_URL it uses the local PGlite directory (data/pglite). A remote database needs --remote,
// and production is always refused: demo data must never reach real clubs and players.
import 'dotenv/config';
import '../server/time.js';
import { createDatabase } from '../server/db/client.js';
import { seedDemoData } from '../server/db/seed.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data with NODE_ENV=production.');
  process.exit(1);
}
if (process.env.DATABASE_URL && !process.argv.includes('--remote')) {
  console.error('DATABASE_URL is set. Seeding a remote database needs --remote (use a staging database only).');
  process.exit(1);
}

const db = await createDatabase();
try {
  await db.migrate(message => console.log(message));
  const seeded = await seedDemoData(db);
  console.log(seeded ? 'Demo data seeded.' : 'The database already has clubs; nothing was seeded.');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.close();
}
