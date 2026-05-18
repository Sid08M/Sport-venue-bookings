import Redis from 'ioredis';
import Redlock from 'redlock';

export class LockService {
  private redis: Redis;
  private redlock: Redlock;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.redlock = new Redlock([this.redis], {
      driftFactor: 0.01,
      retryCount: 3,
      retryDelay: 200, // time in ms
      retryJitter: 200, // time in ms
    });
  }

  async acquireLock(resource: string, ttl: number) {
    return await this.redlock.acquire([resource], ttl);
  }

  getRedisClient() {
    return this.redis;
  }
}

export const lockService = new LockService();
