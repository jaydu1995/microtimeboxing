import { useUser } from "@clerk/nextjs";
import { useGuestStore } from "@/lib/guest-store";
import { trpc } from "@/lib/trpc-react";

// The shape of a bucket regardless of source
export type AppBucket = {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
};

// The shape of a task regardless of source
export type AppTask = {
  id: string;
  bucketId: string;
  name: string;
  description?: string | null;
  minSeconds: number;
  maxSeconds: number;
  isDefault: boolean;
  isActive: boolean;
  completedAt?: string | Date | null;
  createdAt: string;
};

export type AppActiveTimer = {
  taskId: string;
  taskName: string;
  bucketName: string;
  allocatedSeconds: number;
  startedAt: string;
  sessionId: string;
};

// Hook for buckets
export function useAppBuckets() {
  const { isSignedIn } = useUser();
  const guestBuckets = useGuestStore((s) => s.buckets);
  const addGuestBucket = useGuestStore((s) => s.addBucket);
  const updateGuestBucket = useGuestStore((s) => s.updateBucket);
  const deleteGuestBucket = useGuestStore((s) => s.deleteBucket);

  const { data: authBuckets, refetch } = trpc.bucket.getAll.useQuery(
    undefined,
    { enabled: !!isSignedIn }
  );

  const createMutation = trpc.bucket.create.useMutation({ onSuccess: () => refetch() });
  const updateMutation = trpc.bucket.update.useMutation({ onSuccess: () => refetch() });
  const deleteMutation = trpc.bucket.delete.useMutation({ onSuccess: () => refetch() });

  if (!isSignedIn) {
    return {
      buckets: guestBuckets.filter((b) => b.isActive) as AppBucket[],
      addBucket: (name: string, color: string) => addGuestBucket(name, color),
      updateBucket: (id: string, updates: Partial<Pick<AppBucket, "name" | "color">>) =>
        updateGuestBucket(id, updates),
      deleteBucket: (id: string) => deleteGuestBucket(id),
      isLoading: false,
    };
  }

  return {
    buckets: (authBuckets ?? []) as AppBucket[],
    addBucket: (name: string, color: string) =>
      createMutation.mutate({ name, color }),
    updateBucket: (id: string, updates: Partial<Pick<AppBucket, "name" | "color">>) =>
      updateMutation.mutate({ id, ...updates }),
    deleteBucket: (id: string) => deleteMutation.mutate({ id }),
    isLoading: !authBuckets,
  };
}

// Hook for tasks
export function useAppTasks(bucketId?: string) {
  const { isSignedIn } = useUser();
  const guestTasks = useGuestStore((s) => s.tasks);
  const addGuestTask = useGuestStore((s) => s.addTask);
  const updateGuestTask = useGuestStore((s) => s.updateTask);
  const deleteGuestTask = useGuestStore((s) => s.deleteTask);
  const completeGuestTask = useGuestStore((s) => s.completeTask);
  const unarchiveGuestTask = useGuestStore((s) => s.unarchiveTask);

  const { data: authTasks, refetch } = trpc.task.getAll.useQuery(
    undefined,
    { enabled: !!isSignedIn }
  );

  const createMutation = trpc.task.create.useMutation({ onSuccess: () => refetch() });
  const updateMutation = trpc.task.update.useMutation({ onSuccess: () => refetch() });
  const deleteMutation = trpc.task.delete.useMutation({ onSuccess: () => refetch() });
  const completeMutation = trpc.task.complete.useMutation({ onSuccess: () => refetch() });
  const unarchiveMutation = trpc.task.unarchive.useMutation({ onSuccess: () => refetch() });

  if (!isSignedIn) {
    const activeTasks = guestTasks.filter(
      (t) => t.isActive && !t.completedAt && (!bucketId || t.bucketId === bucketId)
    ) as AppTask[];

    const archivedTasks = guestTasks.filter(
      (t) => t.isActive && !!t.completedAt && (!bucketId || t.bucketId === bucketId)
    ) as AppTask[];

    return {
      tasks: activeTasks,
      archivedTasks,
      addTask: (task: Omit<AppTask, "id" | "createdAt" | "isDefault" | "isActive" | "completedAt">) =>
        addGuestTask(task),
      updateTask: (id: string, updates: Partial<Pick<AppTask, "name" | "description" | "minSeconds" | "maxSeconds" | "bucketId">>) =>
        updateGuestTask(id, updates),
      deleteTask: (id: string) => deleteGuestTask(id),
      completeTask: (id: string) => completeGuestTask(id),
      unarchiveTask: (id: string) => unarchiveGuestTask(id),
      isLoading: false,
    };
  }

  const allTasks = (authTasks ?? []) as AppTask[];
  const activeTasks = allTasks.filter(
    (t) => !t.completedAt && (!bucketId || t.bucketId === bucketId)
  );
  const archivedTasks = allTasks.filter(
    (t) => !!t.completedAt && (!bucketId || t.bucketId === bucketId)
  );

  return {
    tasks: activeTasks,
    archivedTasks,
    addTask: (task: Omit<AppTask, "id" | "createdAt" | "isDefault" | "isActive" | "completedAt">) =>
      createMutation.mutate({
        bucketId: task.bucketId,
        name: task.name,
        description: task.description ?? undefined,
        minSeconds: task.minSeconds,
        maxSeconds: task.maxSeconds,
      }),
    updateTask: (id: string, updates: Partial<Pick<AppTask, "name" | "description" | "minSeconds" | "maxSeconds" | "bucketId">>) =>
      updateMutation.mutate({ id, ...updates }),
    deleteTask: (id: string) => deleteMutation.mutate({ id }),
    completeTask: (id: string) => completeMutation.mutate({ id }),
    unarchiveTask: (id: string) => unarchiveMutation.mutate({ id }),
    isLoading: !authTasks,
  };
}

// Hook for the active timer
export function useAppTimer() {
  const { isSignedIn } = useUser();
  const guestStore = useGuestStore();

  const { data: authTimer, refetch } = trpc.timer.getActive.useQuery(
    undefined,
    { enabled: !!isSignedIn }
  );

  const startMutation = trpc.timer.start.useMutation({ onSuccess: () => refetch() });
  const completeMutation = trpc.timer.complete.useMutation({ onSuccess: () => refetch() });
  const abandonMutation = trpc.timer.abandon.useMutation({ onSuccess: () => refetch() });

  if (!isSignedIn) {
    return {
      activeTimer: guestStore.activeTimer as AppActiveTimer | null,
      startTimer: (task: AppTask, bucket: AppBucket) => {
        const guestTask = {
          id: task.id,
          bucketId: task.bucketId,
          name: task.name,
          minSeconds: task.minSeconds,
          maxSeconds: task.maxSeconds,
          isDefault: task.isDefault,
          isActive: task.isActive,
          createdAt: task.createdAt,
        };
        const guestBucket = {
          id: bucket.id,
          name: bucket.name,
          color: bucket.color,
          isDefault: bucket.isDefault,
          isActive: bucket.isActive,
          createdAt: bucket.createdAt,
        };
        return guestStore.startTimer(guestTask, guestBucket);
      },
      completeTimer: () => guestStore.completeTimer(),
      abandonTimer: () => guestStore.abandonTimer(),
      isLoading: false,
    };
  }

  return {
    activeTimer: authTimer as AppActiveTimer | null,
    startTimer: (task: AppTask) => startMutation.mutate({ taskId: task.id }),
    completeTimer: () => completeMutation.mutate(),
    abandonTimer: () => abandonMutation.mutate(),
    isLoading: !authTimer === undefined,
  };
}

// Migration hook — call this once after a guest signs up
export function useMigrateGuestData() {
  const { isSignedIn } = useUser();
  const drainForMigration = useGuestStore((s) => s.drainForMigration);

  const createBucket = trpc.bucket.create.useMutation();
  const createTask = trpc.task.create.useMutation();

  const migrate = async () => {
    if (!isSignedIn) return;

    const { buckets, tasks } = drainForMigration();
    if (buckets.length === 0 && tasks.length === 0) return;

    // Create buckets first, tracking old id → new id mapping
    const bucketIdMap: Record<string, string> = {};

    for (const bucket of buckets) {
      const created = await createBucket.mutateAsync({
        name: bucket.name,
        color: bucket.color,
      });
      bucketIdMap[bucket.id] = created.id;
    }

    // Create tasks using mapped bucket ids
    for (const task of tasks) {
      const newBucketId = bucketIdMap[task.bucketId];
      if (!newBucketId) continue; // skip if bucket wasn't migrated

      await createTask.mutateAsync({
        bucketId: newBucketId,
        name: task.name,
        description: task.description,
        minSeconds: task.minSeconds,
        maxSeconds: task.maxSeconds,
      });
    }
  };

  return { migrate };
}
