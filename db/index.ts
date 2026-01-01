import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";

const sqlite = new Database("trakt.db");
export const db = drizzle(sqlite, { schema });

export function initializeDatabase() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trakt_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        year INTEGER,
        season INTEGER,
        episode INTEGER,
        watched_at TEXT NOT NULL,
        raw_json TEXT
    );
  `);
}
