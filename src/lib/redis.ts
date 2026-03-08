import { Redis } from "@upstash/redis";

if (!process.env.UPSTASH_REDIS_REST_URL) {
  throw new Error("UPSTASH_REDIS_REST_URL is not set");
}

if (!process.env.UPSTASH_REDIS_REST_TOKEN) {
  throw new Error("UPSTASH_REDIS_REST_TOKEN is not set");
}

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Type for what we store in Redis for an active timer session
export type ActiveTimer = {
  taskId: string;
  taskName: string;
  bucketName: string;
  allocatedSeconds: number;
  startedAt: string; // ISO 8601 string — source of truth for elapsed time
  sessionId: string; // references timer_sessions.id in Postgres
};
