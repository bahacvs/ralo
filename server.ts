import 'dotenv/config';
import './server/time.js';
import express from 'express';
import path from 'path';
import { createDatabase } from './server/db/client.js';
import { setDatabase } from './server/db/instance.js';
import { seedDemoData } from './server/db/seed.js';
import { createApp } from './server/app.js';
import { assertMailConfigured } from './server/mailer.js';
import { startJobs } from './server/jobs.js';
import { recordError } from './server/repo/errors.js';
import { assertLegalConfigured, syncLegalDocuments } from './server/repo/legal.js';

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  assertMailConfigured();
  assertLegalConfigured();

  const db = await createDatabase();
  setDatabase(db);
  await db.migrate(message => console.log(message));
  console.log(db.kind === 'postgres' ? 'Connected to Postgres.' : 'Using the local PGlite database (data/pglite).');
  console.log(`Legal documents published: ${await syncLegalDocuments()}`);

  if (process.env.DEMO_MODE === 'true' && (await seedDemoData(db))) {
    console.log('Demo data seeded (DEMO_MODE=true).');
  }

  const app = createApp();
  app.use(express.static(path.join(process.cwd(), 'public')));

  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`RALO Server running on http://0.0.0.0:${PORT}`);
  });

  // Expired sessions, automatic result confirmation, overdue and monthly statements
  const stopJobs = startJobs();

  // Render sends SIGTERM on deploy: finish in-flight requests, then close the pool
  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down...`);
    stopJobs();
    setTimeout(() => process.exit(0), 10_000).unref();
    server.close(() => {
      db.close().catch(() => {}).finally(() => process.exit(0));
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

// Keep a record of crashes that happen outside request handling (jobs, timers)
process.on('unhandledRejection', reason => {
  console.error('Unhandled promise rejection:', reason);
  void recordError({ source: 'server', message: (reason as any)?.message ?? String(reason), stack: (reason as any)?.stack, path: 'process' });
});
process.on('uncaughtException', err => {
  console.error('Uncaught exception:', err);
  recordError({ source: 'server', message: err.message, stack: err.stack, path: 'process' })
    .finally(() => process.exit(1));
});

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
