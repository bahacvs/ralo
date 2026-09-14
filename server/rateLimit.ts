import type { Request, Response, NextFunction } from 'express';

// Fixed-window rate limiter kept in process memory. Limits are per instance;
// they move to Postgres together with the Phase 2 data layer.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60 * 1000);
sweep.unref();

export function hit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count++;
  return {
    allowed: bucket.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  };
}

export const byIp = (req: Request): string | undefined => req.ip;
export const byUser = (req: Request): string | undefined => (req as any).user?.id;
export const global = (): string => 'all';

export function rateLimit(options: {
  name: string;
  limit: number;
  windowMs: number;
  key: (req: Request) => string | undefined;
  message: string;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const subject = options.key(req);
    if (!subject) return next();

    const result = hit(`${options.name}:${subject}`, options.limit, options.windowMs);
    if (!result.allowed) {
      if (options.key === global) {
        console.warn(`Rate limit "${options.name}" reached for all clients`);
      }
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      return res.status(429).json({ error: options.message });
    }
    next();
  };
}
