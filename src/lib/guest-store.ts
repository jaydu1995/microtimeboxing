import { create } from "zustand";
import { persist } from "zustand/middleware";

// These types mirror the database schema but for local storage
export type GuestBucket = {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
};

export type GuestTask = {
  id: string;
  bucketId: string;
  name: string;
  description?: string;
  completedAt?: string; // ISO string
  minSeconds: number;
  maxSeconds: number;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
};

export type GuestActiveTimer = {
  taskId: string;
  taskName: string;
  bucketName: string;
  allocatedSeconds: number;
  startedAt: string; // ISO string
  sessionId: string; // local uuid
};

type GuestStore = {
  buckets: GuestBucket[];
  tasks: GuestTask[];
  activeTimer: GuestActiveTimer | null;

  // Bucket actions
  addBucket: (name: string, color: string) => GuestBucket;
  updateBucket: (id: string, updates: Partial<Pick<GuestBucket, "name" | "color">>) => void;
  deleteBucket: (id: string) => void;

  // Task actions
  addTask: (task: Omit<GuestTask, "id" | "createdAt" | "isDefault" | "isActive">) => GuestTask;
  updateTask: (id: string, updates: Partial<Pick<GuestTask, "name" | "description" | "minSeconds" | "maxSeconds" | "bucketId">>) => void;
  completeTask: (id: string) => void;
  deleteTask: (id: string) => void;
  unarchiveTask: (id: string) => void;

  // Timer actions
  startTimer: (task: GuestTask, bucket: GuestBucket) => GuestActiveTimer;
  completeTimer: () => void;
  abandonTimer: () => void;

  // Migration helper — returns all data then clears it
  drainForMigration: () => { buckets: GuestBucket[]; tasks: GuestTask[] };
};

function generateId() {
  return crypto.randomUUID();
}

const DEFAULT_BUCKET: GuestBucket = {
  id: "default-bucket",
  name: "General",
  color: "#14b8a6",
  isDefault: true,
  isActive: true,
  createdAt: new Date().toISOString(),
};

const DEFAULT_TASK: GuestTask = {
  id: "default-task",
  bucketId: "default-bucket",
  name: "Open Session",
  minSeconds: 300,
  maxSeconds: 1500,
  isDefault: true,
  isActive: true,
  createdAt: new Date().toISOString(),
};

export const useGuestStore = create<GuestStore>()(
  persist(
    (set, get) => ({
      buckets: [DEFAULT_BUCKET],
      tasks: [DEFAULT_TASK],
      activeTimer: null,

      addBucket: (name, color) => {
        const bucket: GuestBucket = {
          id: generateId(),
          name,
          color,
          isDefault: false,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ buckets: [...state.buckets, bucket] }));
        return bucket;
      },

      updateBucket: (id, updates) => {
        set((state) => ({
          buckets: state.buckets.map((b) =>
            b.id === id ? { ...b, ...updates } : b
          ),
        }));
      },

      deleteBucket: (id) => {
        const bucket = get().buckets.find((b) => b.id === id);
        if (bucket?.isDefault) return;
        set((state) => ({
          buckets: state.buckets.map((b) =>
            b.id === id ? { ...b, isActive: false } : b
          ),
          // Also soft delete all tasks in this bucket
          tasks: state.tasks.map((t) =>
            t.bucketId === id ? { ...t, isActive: false } : t
          ),
        }));
      },

      addTask: (taskData) => {
        const task: GuestTask = {
          ...taskData,
          id: generateId(),
          isDefault: false,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ tasks: [...state.tasks, task] }));
        return task;
      },

      updateTask: (id, updates) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        }));
      },

      deleteTask: (id) => {
        const task = get().tasks.find((t) => t.id === id);
        if (task?.isDefault) return;
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, isActive: false } : t
          ),
        }));
      },

      completeTask: (id: string) => {
        const task = get().tasks.find((t) => t.id === id);
        if (!task || task.isDefault) return;
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, completedAt: new Date().toISOString() } : t
          ),
        }));
      },

      unarchiveTask: (id: string) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, completedAt: undefined } : t
          ),
        }));
      },

      startTimer: (task: GuestTask, bucket: GuestBucket) => {
        const allocatedSeconds =
          Math.floor(
            Math.random() * (task.maxSeconds - task.minSeconds + 1)
          ) + task.minSeconds;

        const timer: GuestActiveTimer = {
          taskId: task.id,
          taskName: task.name,
          bucketName: bucket.name,
          allocatedSeconds,
          startedAt: new Date().toISOString(),
          sessionId: generateId(),
        };
        set({ activeTimer: timer });
        return timer;
      },

      completeTimer: () => set({ activeTimer: null }),
      abandonTimer: () => set({ activeTimer: null }),

      drainForMigration: () => {
        const { buckets, tasks } = get();
        // Return all non-default active data for migration
        const migratable = {
          buckets: buckets.filter((b) => !b.isDefault && b.isActive),
          tasks: tasks.filter((t) => !t.isDefault && t.isActive),
        };
        // Reset to defaults after draining
        set({ buckets: [DEFAULT_BUCKET], tasks: [DEFAULT_TASK], activeTimer: null });
        return migratable;
      },
    }),
    {
      name: "microtimeboxing-guest",
    }
  )
);
