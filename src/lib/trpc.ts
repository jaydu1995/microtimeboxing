import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { ZodError } from "zod";

// This is the context object available in every tRPC procedure
// It contains the user's auth state, the database, and Redis
export const createTRPCContext = async () => {
  const { userId } = await auth();

  return {
    userId,
    db,
    redis,
  };
};

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

// Initialize tRPC with our context type
const t = initTRPC.context<TRPCContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Surface Zod validation errors cleanly to the frontend
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

// Base router and procedure helpers
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

// Public procedure — no auth required
export const publicProcedure = t.procedure;

// Protected procedure — throws if user is not signed in
// Use this for every procedure that touches user data
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to do that",
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId, // narrowed from string | null to string
    },
  });
});
