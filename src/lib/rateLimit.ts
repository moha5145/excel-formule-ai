import type { NextRequest } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// Upstash / Vercel KV Redis setup (if env variables exist)
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const redis = (redisUrl && redisToken)
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

// Cache Ratelimit instances for general rate limiting
const ratelimiters = new Map<string, Ratelimit>();

function getRatelimiter(limit: number, windowMs: number): Ratelimit | null {
  if (!redis) return null;
  const key = `${limit}:${windowMs}`;
  if (!ratelimiters.has(key)) {
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    ratelimiters.set(
      key,
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
        prefix: "@upstash/ratelimit",
      })
    );
  }
  return ratelimiters.get(key)!;
}

// In-memory fallback trackers
const tracker = new Map<string, { count: number; resetAt: number }>();
const dailyTracker = new Map<string, { count: number; date: string }>();

/**
 * Extracts the real client IP from a NextRequest.
 * Prefers Vercel trusted headers (x-vercel-forwarded-for, x-real-ip) over standard x-forwarded-for.
 */
export function getClientIp(req: NextRequest): string {
  const vercelIp = req.headers.get("x-vercel-forwarded-for") || req.headers.get("x-real-ip");
  if (vercelIp) {
    return vercelIp.split(",")[0]?.trim() || "127.0.0.1";
  }
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "127.0.0.1";
  }
  return "127.0.0.1";
}

/**
 * Rate limiter based on client IP.
 * Uses Upstash Redis when available, falls back to in-memory Map.
 */
export async function rateLimit(
  ip: string,
  limit: number = 20,
  windowMs: number = 60 * 1000
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  const rl = getRatelimiter(limit, windowMs);
  if (rl) {
    try {
      const res = await rl.limit(ip);
      return {
        success: res.success,
        limit: res.limit,
        remaining: res.remaining,
        reset: res.reset,
      };
    } catch (error) {
      console.warn("Upstash Redis rate limiting failed, falling back to in-memory:", error);
    }
  }

  // Fallback in-memory
  const now = Date.now();
  const entry = tracker.get(ip);

  if (Math.random() < 0.05) {
    const cutoff = now - windowMs;
    for (const [key, val] of tracker) {
      if (now > val.resetAt + cutoff) tracker.delete(key);
    }
  }

  if (!entry || now > entry.resetAt) {
    const newEntry = { count: 1, resetAt: now + windowMs };
    tracker.set(ip, newEntry);
    return { success: true, limit, remaining: limit - 1, reset: newEntry.resetAt };
  }

  if (entry.count >= limit) {
    return { success: false, limit, remaining: 0, reset: entry.resetAt };
  }

  entry.count += 1;
  return { success: true, limit, remaining: limit - entry.count, reset: entry.resetAt };
}

/**
 * Compteur quotidien gratuit par IP (3 requêtes/jour).
 * Uses Redis key expiration when available, falls back to in-memory Map.
 */
export async function dailyFreeLimit(
  ip: string,
  maxPerDay: number = 3
): Promise<{ allowed: boolean; remaining: number }> {
  const today = new Date().toISOString().slice(0, 10);

  if (redis) {
    try {
      const key = `daily_free:${today}:${ip}`;
      const count = await redis.incr(key);
      if (count === 1) {
        // Set key to expire in 48h to clean up
        await redis.expire(key, 172800);
      }
      if (count > maxPerDay) {
        return { allowed: false, remaining: 0 };
      }
      return { allowed: true, remaining: maxPerDay - count };
    } catch (error) {
      console.warn("Upstash Redis daily limit failed, falling back to in-memory:", error);
    }
  }

  // Fallback in-memory
  if (Math.random() < 0.05) {
    for (const [key, val] of dailyTracker) {
      if (val.date !== today) dailyTracker.delete(key);
    }
  }

  const entry = dailyTracker.get(ip);

  if (!entry || entry.date !== today) {
    dailyTracker.set(ip, { count: 1, date: today });
    return { allowed: true, remaining: maxPerDay - 1 };
  }

  if (entry.count >= maxPerDay) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: maxPerDay - entry.count };
}

/**
 * Read the daily free remaining quota without incrementing the counter.
 */
export async function getDailyFreeRemaining(
  ip: string,
  maxPerDay: number = 3
): Promise<{ remaining: number }> {
  const today = new Date().toISOString().slice(0, 10);

  if (redis) {
    try {
      const key = `daily_free:${today}:${ip}`;
      const countStr = await redis.get<number | string>(key);
      const count = countStr ? Number(countStr) : 0;
      const remaining = Math.max(0, maxPerDay - count);
      return { remaining };
    } catch (error) {
      console.warn("Upstash Redis read remaining failed, falling back to in-memory:", error);
    }
  }

  // Fallback in-memory
  const entry = dailyTracker.get(ip);

  if (!entry || entry.date !== today) {
    return { remaining: maxPerDay };
  }

  if (entry.count >= maxPerDay) {
    return { remaining: 0 };
  }

  return { remaining: maxPerDay - entry.count };
}
