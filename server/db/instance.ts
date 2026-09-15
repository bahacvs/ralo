import type { Database } from './client.js';

export type { Database, Queryable } from './client.js';

// The process-wide database, assigned once at boot (server.ts) or by a test before it builds the app.
let current: Database | null = null;

export function setDatabase(db: Database): void {
  current = db;
}

export function getDb(): Database {
  if (!current) {
    throw new Error('Database is not initialised; call setDatabase() first');
  }
  return current;
}
