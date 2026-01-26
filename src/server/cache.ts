import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

class CacheService {
  private static instance: Redis | null = null;
  private static isAvailable: boolean = true;

  static getInstance(): Redis | null {
    if (!this.instance && this.isAvailable) {
      try {
        this.instance = new Redis(REDIS_URL, {
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
        });
        
        this.instance.on("error", (err) => {
          console.warn("Redis unavailable, switching to bypass mode.");
          this.isAvailable = false;
          this.instance = null;
        });
      } catch (e) {
        this.isAvailable = false;
        return null;
      }
    }
    return this.instance;
  }

  static async get<T>(key: string): Promise<T | null> {
    const redis = this.getInstance();
    if (!redis) return null;
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  static async set(key: string, value: any, ttlSeconds: number = 600): Promise<void> {
    const redis = this.getInstance();
    if (!redis) return;
    try {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      // ignore
    }
  }
}

export default CacheService;
