import { createTRPCRouter } from "@/lib/trpc";
import { bucketRouter } from "./bucket";
import { taskRouter } from "./task";
import { timerRouter } from "./timer";

export const appRouter = createTRPCRouter({
  bucket: bucketRouter,
  task: taskRouter,
  timer: timerRouter,
});

// Export type for the frontend — this is how tRPC shares types
// between your backend and frontend without any codegen
export type AppRouter = typeof appRouter;
