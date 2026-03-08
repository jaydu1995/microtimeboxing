import { pgTable, uuid, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user ID
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const buckets = pgTable("buckets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#14b8a6"),
  isDefault: boolean("is_default").notNull().default(false), // true for "General"
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  bucketId: uuid("bucket_id")
    .notNull()
    .references(() => buckets.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  minSeconds: integer("min_seconds").notNull(),
  maxSeconds: integer("max_seconds").notNull(),
  isDefault: boolean("is_default").notNull().default(false), // true for "Open Session"
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const timerSessions = pgTable("timer_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  allocatedSeconds: integer("allocated_seconds").notNull(),
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
  status: text("status", {
    enum: ["active", "completed", "abandoned"],
  }).notNull().default("active"),
});
