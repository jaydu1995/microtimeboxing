import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc";
import { timerSessions, tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { type ActiveTimer } from "@/lib/redis";

export const timerRouter = createTRPCRouter({
  // Check for an active timer on page load
  // This is what makes the timer refresh-safe
  getActive: protectedProcedure.query(async ({ ctx }) => {
    const raw = await ctx.redis.get(`timer:${ctx.userId}`);
    if (!raw) return null;
    return raw as ActiveTimer;
  }),

  // Start a new timer session
  start: protectedProcedure
    .input(
      z.object({
        taskId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the task belongs to this user
      const [task] = await ctx.db
        .select()
        .from(tasks)
        .where(
          and(eq(tasks.id, input.taskId), eq(tasks.userId, ctx.userId))
        );

      if (!task) throw new Error("Task not found");

      // Check if there's already an active timer — abandon it if so
      const existing = await ctx.redis.get(`timer:${ctx.userId}`);
      if (existing) {
        const activeTimer = existing as ActiveTimer;
        await ctx.db
          .update(timerSessions)
          .set({ status: "abandoned", completedAt: new Date() })
          .where(eq(timerSessions.id, activeTimer.sessionId));
      }

      // Randomly select a duration between min and max
      const allocatedSeconds =
        Math.floor(
          Math.random() * (task.maxSeconds - task.minSeconds + 1)
        ) + task.minSeconds;

      const startedAt = new Date();

      // Persist to Postgres for history
      const [session] = await ctx.db
        .insert(timerSessions)
        .values({
          userId: ctx.userId,
          taskId: task.id,
          allocatedSeconds,
          startedAt,
          status: "active",
        })
        .returning();

      // Write to Redis for fast refresh-safe access
      const activeTimer: ActiveTimer = {
        taskId: task.id,
        taskName: task.name,
        bucketName: "", // populated below
        allocatedSeconds,
        startedAt: startedAt.toISOString(),
        sessionId: session.id,
      };

      // Set TTL to allocatedSeconds + 5 min grace period
      await ctx.redis.setex(
        `timer:${ctx.userId}`,
        allocatedSeconds + 300,
        JSON.stringify(activeTimer)
      );

      return activeTimer;
    }),

  // Mark the current timer as completed
  complete: protectedProcedure.mutation(async ({ ctx }) => {
    const raw = await ctx.redis.get(`timer:${ctx.userId}`);
    if (!raw) throw new Error("No active timer found");

    const activeTimer = raw as ActiveTimer;

    // Update the Postgres record
    const [session] = await ctx.db
      .update(timerSessions)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(timerSessions.id, activeTimer.sessionId))
      .returning();

    // Remove from Redis
    await ctx.redis.del(`timer:${ctx.userId}`);

    return session;
  }),

  // Abandon the current timer early
  abandon: protectedProcedure.mutation(async ({ ctx }) => {
    const raw = await ctx.redis.get(`timer:${ctx.userId}`);
    if (!raw) throw new Error("No active timer found");

    const activeTimer = raw as ActiveTimer;

    // Update the Postgres record
    const [session] = await ctx.db
      .update(timerSessions)
      .set({ status: "abandoned", completedAt: new Date() })
      .where(eq(timerSessions.id, activeTimer.sessionId))
      .returning();

    // Remove from Redis
    await ctx.redis.del(`timer:${ctx.userId}`);

    return session;
  }),

  // Get timer session history for the current user
  getHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(timerSessions)
        .where(eq(timerSessions.userId, ctx.userId))
        .orderBy(timerSessions.startedAt)
        .limit(input.limit);
    }),
});
