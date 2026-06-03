const tracker = new Map<string, { count: number; resetAt: number }>();

/**
 * Simple in-memory rate limiter based on client IP.
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
