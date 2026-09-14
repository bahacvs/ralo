import pg from 'pg';

// Pilot persistence: the store keeps all data in memory (single instance) and this class
// mirrors it to Postgres, one jsonb row per record, writing only rows that changed.
export const COLLECTIONS = [
  'users',
  'businesses',
  'courts',
  'reservations',
  'reservation_slots',
  'open_match_participants',
  'open_match_waitlists',
  'court_blocks',
  'staff_memberships',
  'messages',
  'conversations',
  'notifications',
  'feed_posts',
  'sessions'
] as const;

type Snapshot = Record<string, Array<{ id: string }>>;

const FLUSH_DELAY_MS = 20;
const RETRY_DELAY_MS = 2000;

export class Persistence {
  private pool: pg.Pool;
  // Last JSON written per collection and id, used to diff the next flush
  private persisted = new Map<string, Map<string, string>>();
  private flushing: Promise<void> | null = null;
  private pendingData: Snapshot | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(connectionString: string) {
    const isLocal = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(connectionString);
    this.pool = new pg.Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 5
    });
    this.pool.on('error', err => console.error('Postgres pool error:', err.message));
  }

  async migrate(): Promise<void> {
    for (const name of COLLECTIONS) {
      await this.pool.query(
        `CREATE TABLE IF NOT EXISTS "${name}" (
          id text PRIMARY KEY,
          data jsonb NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        )`
      );
    }
  }

  /** Loads every collection; returns null when the database holds no rows at all. */
  async loadAll(): Promise<Snapshot | null> {
    const snapshot: Snapshot = {};
    let total = 0;
    for (const name of COLLECTIONS) {
      const { rows } = await this.pool.query<{ id: string; data: { id: string } }>(`SELECT id, data FROM "${name}"`);
      snapshot[name] = rows.map(r => r.data);
      this.persisted.set(name, new Map(rows.map(r => [r.id, JSON.stringify(r.data)])));
      total += rows.length;
    }
    return total > 0 ? snapshot : null;
  }

  /** Debounced flush; call after every in-memory mutation. */
  scheduleFlush(data: object): void {
    this.pendingData = data as Snapshot;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush(this.pendingData!).catch(err => {
        console.error('Postgres flush failed, retrying:', err.message);
        setTimeout(() => this.scheduleFlush(this.pendingData!), RETRY_DELAY_MS);
      });
    }, FLUSH_DELAY_MS);
  }

  /** Writes all changes since the last successful flush. Flushes run one at a time. */
  async flush(data: object): Promise<void> {
    while (this.flushing) {
      await this.flushing.catch(() => {});
    }
    this.flushing = this.writeChanges(data as Snapshot).finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  async close(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pendingData) {
      await this.flush(this.pendingData);
    }
    await this.pool.end();
  }

  private async writeChanges(data: Snapshot): Promise<void> {
    const nextState = new Map<string, Map<string, string>>();
    const upserts: Array<{ name: string; ids: string[]; json: string[] }> = [];
    const deletes: Array<{ name: string; ids: string[] }> = [];

    // Diff synchronously so later mutations are picked up by the next flush
    for (const name of COLLECTIONS) {
      const previous = this.persisted.get(name) ?? new Map<string, string>();
      const next = new Map<string, string>();
      for (const row of data[name] ?? []) {
        if (row && typeof row.id === 'string') next.set(row.id, JSON.stringify(row));
      }

      const changedIds: string[] = [];
      const changedJson: string[] = [];
      for (const [id, json] of next) {
        if (previous.get(id) !== json) {
          changedIds.push(id);
          changedJson.push(json);
        }
      }
      if (changedIds.length > 0) upserts.push({ name, ids: changedIds, json: changedJson });

      const removedIds = [...previous.keys()].filter(id => !next.has(id));
      if (removedIds.length > 0) deletes.push({ name, ids: removedIds });

      nextState.set(name, next);
    }

    if (upserts.length === 0 && deletes.length === 0) {
      this.persisted = nextState;
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const { name, ids, json } of upserts) {
        await client.query(
          `INSERT INTO "${name}" (id, data)
           SELECT id, data FROM unnest($1::text[], $2::jsonb[]) AS t(id, data)
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [ids, json]
        );
      }
      for (const { name, ids } of deletes) {
        await client.query(`DELETE FROM "${name}" WHERE id = ANY($1::text[])`, [ids]);
      }
      await client.query('COMMIT');
      this.persisted = nextState;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}
