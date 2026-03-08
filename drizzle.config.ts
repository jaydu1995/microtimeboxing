import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
import { expand } from "dotenv-expand";

expand(dotenv.config({ path: ".env.local" }));

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
});
