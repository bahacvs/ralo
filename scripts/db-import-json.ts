// Imports a JSON data file (the old file store format) into Postgres.
// Usage: bun run db:import data/ralo_db.json [--force]
// --force replaces the current database contents with the file.
import 'dotenv/config';
import fs from 'fs';
import { Persistence, COLLECTIONS } from '../server/persistence.js';

const file = process.argv.slice(2).find(arg => !arg.startsWith('--'));
const force = process.argv.includes('--force');
const url = process.env.DATABASE_URL;

if (!file || !url) {
  console.error('Usage: DATABASE_URL=... bun run db:import <file.json> [--force]');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
const persistence = new Persistence(url);

try {
  await persistence.migrate();
  const existing = await persistence.loadAll();
  if (existing && !force) {
    console.error('Database already has data. Re-run with --force to replace it with the file contents.');
    process.exitCode = 1;
  } else {
    await persistence.flush(data);
    for (const name of COLLECTIONS) {
      console.log(`${name}: ${(data[name] ?? []).length}`);
    }
    console.log('Import complete.');
  }
} finally {
  await persistence.close();
}
