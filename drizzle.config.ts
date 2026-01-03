import { defineConfig } from "drizzle-kit";

const DB_FILE_NAME = process.env.DB_FILE_NAME || "trakt.db";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: DB_FILE_NAME,
  },
});
