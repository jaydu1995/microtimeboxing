import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc";
import { buckets } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const bucketRouter = createTRPCRouter({
  // Get all buckets for the current user
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(buckets)
      .where(eq(buckets.userId, ctx.userId))
      .orderBy(buckets.createdAt);
  }),

  // Create a new bucket
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required").max(50),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [bucket] = await ctx.db
        .insert(buckets)
        .values({
          userId: ctx.userId,
          name: input.name,
          color: input.color,
          isDefault: false,
        })
        .returning();

      return bucket;
    }),

  // Update a bucket's name or color
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(50).optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership before updating
      const [existing] = await ctx.db
        .select()
        .from(buckets)
        .where(and(eq(buckets.id, input.id), eq(buckets.userId, ctx.userId)));

      if (!existing) {
        throw new Error("Bucket not found");
      }

      if (existing.isDefault) {
        // Allow renaming default bucket but not deleting it
        if (input.name === undefined && input.color === undefined) {
          throw new Error("Nothing to update");
        }
      }

      const [updated] = await ctx.db
        .update(buckets)
        .set({
          ...(input.name && { name: input.name }),
          ...(input.color && { color: input.color }),
        })
        .where(and(eq(buckets.id, input.id), eq(buckets.userId, ctx.userId)))
        .returning();

      return updated;
    }),

  // Soft delete — sets isActive to false instead of deleting the row
  // This preserves historical timer session data
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(buckets)
        .where(and(eq(buckets.id, input.id), eq(buckets.userId, ctx.userId)));

      if (!existing) {
        throw new Error("Bucket not found");
      }

      if (existing.isDefault) {
        throw new Error("Cannot delete the default bucket");
      }

      const [deleted] = await ctx.db
        .update(buckets)
        .set({ isActive: false })
        .where(and(eq(buckets.id, input.id), eq(buckets.userId, ctx.userId)))
        .returning();

      return deleted;
    }),
});
