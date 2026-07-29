import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { getClientIp, rateLimit, dailyFreeLimit, getDailyFreeRemaining } from "./rateLimit";

describe("rateLimit", () => {
  describe("getClientIp", () => {
    it("devrait retourner l'IP depuis x-vercel-forwarded-for si présente", () => {
      const req = new NextRequest("http://localhost/api/quota", {
        headers: {
          "x-vercel-forwarded-for": "203.0.113.195, 70.41.3.18",
        },
      });
      expect(getClientIp(req)).toBe("203.0.113.195");
    });

    it("devrait retourner l'IP depuis x-real-ip si x-vercel-forwarded-for est absente", () => {
      const req = new NextRequest("http://localhost/api/quota", {
        headers: {
          "x-real-ip": "198.51.100.1",
        },
      });
      expect(getClientIp(req)).toBe("198.51.100.1");
    });

    it("devrait retourner l'IP depuis x-forwarded-for si aucun en-tête Vercel n'est présent", () => {
      const req = new NextRequest("http://localhost/api/quota", {
        headers: {
          "x-forwarded-for": "192.0.2.1, 192.0.2.2",
        },
      });
      expect(getClientIp(req)).toBe("192.0.2.1");
    });

    it("devrait retourner 127.0.0.1 par défaut si aucun en-tête n'est présent", () => {
      const req = new NextRequest("http://localhost/api/quota");
      expect(getClientIp(req)).toBe("127.0.0.1");
    });
  });

  describe("rateLimit (in-memory)", () => {
    const testIp = "1.2.3.4";

    it("devrait autoriser les requêtes sous la limite et décrémenter le quota restant", async () => {
      const limit = 5;
      const res = await rateLimit(testIp, limit, 60000);
      expect(res.success).toBe(true);
      expect(res.limit).toBe(limit);
      expect(res.remaining).toBe(4);
    });

    it("devrait bloquer les requêtes qui dépassent la limite", async () => {
      const limit = 2;
      const ip = "5.6.7.8";
      
      const res1 = await rateLimit(ip, limit, 60000);
      const res2 = await rateLimit(ip, limit, 60000);
      const res3 = await rateLimit(ip, limit, 60000);

      expect(res1.success).toBe(true);
      expect(res1.remaining).toBe(1);
      expect(res2.success).toBe(true);
      expect(res2.remaining).toBe(0);
      expect(res3.success).toBe(false);
      expect(res3.remaining).toBe(0);
    });
  });

  describe("dailyFreeLimit and getDailyFreeRemaining (in-memory)", () => {
    const dailyIp = "9.10.11.12";

    it("devrait gérer correctement les quotas quotidiens", async () => {
      const maxPerDay = 3;

      // Check initial remaining without incrementing
      const initial = await getDailyFreeRemaining(dailyIp, maxPerDay);
      expect(initial.remaining).toBe(maxPerDay);

      // Increment 1
      const res1 = await dailyFreeLimit(dailyIp, maxPerDay);
      expect(res1.allowed).toBe(true);
      expect(res1.remaining).toBe(2);

      const check1 = await getDailyFreeRemaining(dailyIp, maxPerDay);
      expect(check1.remaining).toBe(2);

      // Increment 2
      const res2 = await dailyFreeLimit(dailyIp, maxPerDay);
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(1);

      // Increment 3
      const res3 = await dailyFreeLimit(dailyIp, maxPerDay);
      expect(res3.allowed).toBe(true);
      expect(res3.remaining).toBe(0);

      // Increment 4 (should block)
      const res4 = await dailyFreeLimit(dailyIp, maxPerDay);
      expect(res4.allowed).toBe(false);
      expect(res4.remaining).toBe(0);

      const checkBlocked = await getDailyFreeRemaining(dailyIp, maxPerDay);
      expect(checkBlocked.remaining).toBe(0);
    });
  });
});