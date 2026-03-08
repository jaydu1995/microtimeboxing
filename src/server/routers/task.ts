import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc";
import { tasks, buckets } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const taskRouter = createTRPCRouter({
  // Get all tasks for a specific bucket
  getByBucket: protectedProcedure
    .input(z.object({ bucketId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.bucketId, input.bucketId),
            eq(tasks.userId, ctx.userId),
            eq(tasks.isActive, true)
          )
        )
        .orderBy(tasks.createdAt);
    }),

  // Get all active tasks for the current user across all buckets
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, ctx.userId), eq(tasks.isActive, true)))
      .orderBy(tasks.createdAt);
  }),

  // Pick a random task from a specific bucket
  getRandom: protectedProcedure
    .input(
      z.object({
        bucketId: z.string().uuid(),
        excludeDefault: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const allTasks = await ctx.db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.bucketId, input.bucketId),
            eq(tasks.userId, ctx.userId),
            eq(tasks.isActive, true),
            // Optionally exclude the default "Open Session" task
            ...(input.excludeDefault ? [eq(tasks.isDefault, false)] : [])
          )
        );

      if (allTasks.length === 0) return null;

      // Pure random selection — equal weight for all tasks
      const randomIndex = Math.floor(Math.random() * allTasks.length);
      return allTasks[randomIndex];
    }),

  // Pick a random task from a random bucket
  getRandomFromRandomBucket: protectedProcedure
    .input(
      z.object({
        excludeDefaultBucket: z.boolean().default(false),
        excludeDefaultTask: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      // First get all eligible buckets
      const allBuckets = await ctx.db
        .select()
        .from(buckets)
        .where(
          and(
            eq(buckets.userId, ctx.userId),
            eq(buckets.isActive, true),
            ...(input.excludeDefaultBucket
              ? [eq(buckets.isDefault, false)]
              : [])
          )
        );

      if (allBuckets.length === 0) return null;

      // Pick a random bucket
      const randomBucket =
        allBuckets[Math.floor(Math.random() * allBuckets.length)];

      // Then get all eligible tasks from that bucket
      const allTasks = await ctx.db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.bucketId, randomBucket.id),
            eq(tasks.userId, ctx.userId),
            eq(tasks.isActive, true),
            ...(input.excludeDefaultTask ? [eq(tasks.isDefault, false)] : [])
          )
        );

      if (allTasks.length === 0) return null;

      // Pick a random task from that bucket
      const randomTask =
        allTasks[Math.floor(Math.random() * allTasks.length)];

      return {
        bucket: randomBucket,
        task: randomTask,
      };
    }),

  // Create a new task
  create: protectedProcedure
    .input(
      z.object({
        bucketId: z.string().uuid(),
        name: z.string().min(1, "Name is required").max(100),
        description: z.string().max(500).optional(),
        minSeconds: z.number().int().min(60, "Minimum is 1 minute"),
        maxSeconds: z.number().int(),
      }).refine((data) => data.maxSeconds > data.minSeconds, {
        message: "Max time must be greater than min time",
        path: ["maxSeconds"],
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the bucket belongs to this user
      const [bucket] = await ctx.db
        .select()
        .from(buckets)
        .where(
          and(eq(buckets.id, input.bucketId), eq(buckets.userId, ctx.userId))
        );

      if (!bucket) throw new Error("Bucket not found");

      const [task] = await ctx.db
        .insert(tasks)
        .values({
          userId: ctx.userId,
          bucketId: input.bucketId,
          name: input.name,
          description: input.description,
          minSeconds: input.minSeconds,
          maxSeconds: input.maxSeconds,
          isDefault: false,
        })
        .returning();

      return task;
    }),

  // Update a task
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        minSeconds: z.number().int().min(60).optional(),
        maxSeconds: z.number().int().optional(),
        bucketId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId)));

      if (!existing) throw new Error("Task not found");

      const [updated] = await ctx.db
        .update(tasks)
        .set({
          ...(input.name && { name: input.name }),
          ...(input.description !== undefined && {
            description: input.description,
          }),
          ...(input.minSeconds && { minSeconds: input.minSeconds }),
          ...(input.maxSeconds && { maxSeconds: input.maxSeconds }),
          ...(input.bucketId && { bucketId: input.bucketId }),
        })
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId)))
        .returning();

      return updated;
    }),

  // Soft delete
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId)));

      if (!existing) throw new Error("Task not found");

      if (existing.isDefault) {
        throw new Error("Cannot delete the default task");
      }

      const [deleted] = await ctx.db
        .update(tasks)
        .set({ isActive: false })
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId)))
        .returning();

      return deleted;
    }),
});
