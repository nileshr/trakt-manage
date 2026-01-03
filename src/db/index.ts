import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";

const DB_FILE_NAME = process.env.DB_FILE_NAME || "trakt.db";

const sqlite = new Database(DB_FILE_NAME);
export const db = drizzle({ client: sqlite, schema });
