// Grants RALO platform admin (super-admin panel) rights to an existing account.
// Usage: bun run admin:grant you@example.com
// Sign up in the app first. Uses DATABASE_URL, else DATABASE_MIGRATION_URL, else the local PGlite directory.
import 'dotenv/config';
import '../server/time.js';
import { createDatabase } from '../server/db/client.js';
import { setDatabase } from '../server/db/instance.js';
import { grantPlatformAdmin } from '../server/repo/admin.js';
import { normalizeEmail } from '../server/auth.js';

const email = normalizeEmail(process.argv[2]);
if (!email) {
  console.error('Usage: bun run admin:grant you@example.com');
  process.exit(1);
}

process.env.DATABASE_URL ||= process.env.DATABASE_MIGRATION_URL;
const db = await createDatabase();
setDatabase(db);
try {
  await db.migrate();
  const userId = await grantPlatformAdmin(email);
  console.log(`Platform admin rights granted to ${email} (${userId}).`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.close();
}
