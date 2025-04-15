import Redis from "ioredis";

let redis: Redis;

if (process.env.NODE_ENV === "production") {
  // ✅ Production (e.g., Vercel + Upstash)
  redis = new Redis(process.env.REDIS_URL as string, {
    // optional: log friendly name
    name: "vercel-prod-redis",
    tls: process.env.REDIS_URL?.startsWith("rediss://") ? {} : undefined,
  });
} else {
  // ✅ Local development
  redis = new Redis({
    port: 6379, // default Redis port
    host: "127.0.0.1", // localhost
    // password: 'your_local_password', // kalau Redis lokal kamu ada password
  });
}

export { redis };
