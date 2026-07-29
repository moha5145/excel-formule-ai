import { NextRequest, NextResponse } from "next/server";
import { getClientIp, getDailyFreeRemaining } from "@/lib/rateLimit";

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const { remaining } = await getDailyFreeRemaining(ip);

  return NextResponse.json({ remaining });
}
