import type { NextRequest } from "next/server";

const tracker = new Map<string, { count: number; resetAt: number }>();

/**
 * Extracts the real client IP from a NextRequest.
 * Handles comma-separated x-forwarded-for chains (common behind proxies/load balancers).
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "127.0.0.1";
  }
  return req.headers.get("x-real-ip") || "127.0.0.1";
}

/**
 * Simple in-memory rate limiter based on client IP.
 *
 * ⚠️ Limitation : utilise un Map en mémoire. Sur Vercel (serverless),
 * chaque instance a sa propre mémoire — le rate limiting n'est pas global.
 * Pour une vraie solution multi-instances, migrer vers Vercel KV ou Upstash Redis.
 *
 * @param ip Client IP address
 * @param limit Max allowed requests within window
 * @param windowMs Time window in milliseconds (default: 1 minute)
 */
export function rateLimit(
  ip: string,
  limit: number = 20,
  windowMs: number = 60 * 1000
): { success: boolean; limit: number; remaining: number; reset: number } {
  const now = Date.now();
  const entry = tracker.get(ip);

  // Nettoyage périodique des entrées expirées (1 chance sur 20)
  if (Math.random() < 0.05) {
    const cutoff = now - windowMs;
    for (const [key, val] of tracker) {
      if (now > val.resetAt + cutoff) tracker.delete(key);
    }
  }

  // If no entry or expired, reset window
  if (!entry || now > entry.resetAt) {
    const newEntry = { count: 1, resetAt: now + windowMs };
    tracker.set(ip, newEntry);
    return { success: true, limit, remaining: limit - 1, reset: newEntry.resetAt };
  }

  // If limit reached, return block
  if (entry.count >= limit) {
    return { success: false, limit, remaining: 0, reset: entry.resetAt };
  }

  // Otherwise increment
  entry.count += 1;
  return { success: true, limit, remaining: limit - entry.count, reset: entry.resetAt };
}

const dailyTracker = new Map<string, { count: number; date: string }>();

/**
 * Compteur quotidien gratuit par IP (5 requêtes/jour).
 * Le compteur reset à minuit UTC automatiquement (date change).
 *
 * ⚠️ Map en mémoire → perdu si toutes les instances Vercel redémarrent.
 *    Pour de la persistance réelle, migrer vers Vercel KV.
 *
 * @param ip Client IP address
 * @param maxPerDay Nombre max de requêtes gratuites par jour (défaut: 5)
 */
export function dailyFreeLimit(
  ip: string,
  maxPerDay: number = 5
): { allowed: boolean; remaining: number } {
  const today = new Date().toISOString().slice(0, 10);

  // Nettoyage périodique pour éviter les fuites de mémoire (1 chance sur 20)
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
