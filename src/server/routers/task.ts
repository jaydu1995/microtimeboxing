import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc";
import { tasks, buckets } from "@/db/schema";
import { eq, and, isNull, isNotNull } from "drizzle-orm"; // added isNull

export const taskRouter = createTRPCRouter({
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

  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, ctx.userId), eq(tasks.isActive, true)))
      .orderBy(tasks.createdAt);
  }),

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
            isNull(tasks.completedAt), // exclude completed tasks
            ...(input.excludeDefault ? [eq(tasks.isDefault, false)] : [])
          )
        );

      if (allTasks.length === 0) return null;
      return allTasks[Math.floor(Math.random() * allTasks.length)];
    }),

  getRandomFromRandomBucket: protectedProcedure
    .input(
      z.object({
        excludeDefaultBucket: z.boolean().default(false),
        excludeDefaultTask: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
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

      const randomBucket =
        allBuckets[Math.floor(Math.random() * allBuckets.length)];

      const allTasks = await ctx.db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.bucketId, randomBucket.id),
            eq(tasks.userId, ctx.userId),
            eq(tasks.isActive, true),
            isNull(tasks.completedAt), // exclude completed tasks
            ...(input.excludeDefaultTask ? [eq(tasks.isDefault, false)] : [])
          )
        );

      if (allTasks.length === 0) return null;

      const randomTask =
        allTasks[Math.floor(Math.random() * allTasks.length)];

      return { bucket: randomBucket, task: randomTask };
    }),

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
          ...(input.description !== undefined && { description: input.description }),
          ...(input.minSeconds && { minSeconds: input.minSeconds }),
          ...(input.maxSeconds && { maxSeconds: input.maxSeconds }),
          ...(input.bucketId && { bucketId: input.bucketId }),
        })
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId)))
        .returning();

      return updated;
    }),

  // Mark a task as complete — retires it from random selection
  complete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId)));

      if (!existing) throw new Error("Task not found");
      if (existing.isDefault) throw new Error("Cannot complete the default task");

      const [completed] = await ctx.db
        .update(tasks)
        .set({ completedAt: new Date() })
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId)))
        .returning();

      return completed;
    }),

  // Restore a completed task back to active
  unarchive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId)));

      if (!existing) throw new Error("Task not found");

      const [restored] = await ctx.db
        .update(tasks)
        .set({ completedAt: null })
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId)))
        .returning();

      return restored;
    }),

  getArchived: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, ctx.userId),
          eq(tasks.isActive, true),
          isNotNull(tasks.completedAt)
        )
      )
      .orderBy(tasks.completedAt);
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId)));

      if (!existing) throw new Error("Task not found");
      if (existing.isDefault) throw new Error("Cannot delete the default task");

      const [deleted] = await ctx.db
        .update(tasks)
        .set({ isActive: false })
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId)))
        .returning();

      return deleted;
    }),
});
