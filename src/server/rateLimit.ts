import CacheService from "./cache";

export async function rateLimit(ip: string): Promise<{ success: boolean; remaining: number }> {
  const redis = CacheService.getInstance();
  if (!redis) return { success: true, remaining: 999 }; // Redis yoksa limiti boşver

  const key = `ratelimit:${ip}`;
  const limit = 60;
  const windowSize = 300;

  try {
    const current = await redis.get(key);
    const count = current ? parseInt(current) : 0;

    if (count >= limit) {
      return { success: false, remaining: 0 };
    }

    if (count === 0) {
      await redis.set(key, 1, "EX", windowSize);
    } else {
      await redis.incr(key);
    }

    return { success: true, remaining: limit - count - 1 };
  } catch {
    return { success: true, remaining: 999 };
  }
}
