import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
const globalForRedis = global as unknown as { redis: Redis };

const redis = globalForRedis.redis || Redis.fromEnv();

if (!globalForRedis.redis) {
  globalForRedis.redis = redis;
}

// Create a new ratelimiter, that allows x requests per x seconds
export const ratelimit = {
  login: new Ratelimit({
    redis,
    prefix: 'ratelimit:login',
    limiter: Ratelimit.slidingWindow(20, '120s'),
  }),
  otpSubmit: new Ratelimit({
    redis,
    prefix: 'ratelimit:otpSubmit',
    limiter: Ratelimit.slidingWindow(8, '120s'),
  }),
  signup: new Ratelimit({
    redis,
    prefix: 'ratelimit:signup',
    limiter: Ratelimit.slidingWindow(4, '500s'),
  }),
  smsVerify: new Ratelimit({
    redis,
    prefix: 'ratelimit:smsVerify',
    limiter: Ratelimit.slidingWindow(30, '6h'),
  }),
  accountSync: new Ratelimit({
    redis,
    prefix: 'ratelimit:accountSync',
    limiter: Ratelimit.slidingWindow(2, '12h'),
  }),
};

export default redis;
