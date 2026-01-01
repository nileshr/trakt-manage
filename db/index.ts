import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";

const sqlite = new Database("trakt.db");
export const db = drizzle(sqlite, { schema });

export function initializeDatabase() {
    // Rely on drizzle-kit push or migration for schema creation
    // But for a simple CLI tool, we can keep a simple check or use the sync helper if available in bun-sqlite adapter (it's not).
    // Let's keep the manual init for now but strictly matching schema.
    // Actually, `drizzle-kit push` is better but requires CLI run.
    // Let's execute the raw SQL but make sure it matches the schema.ts exactly to avoid "duplication" complaints
    // or better, just rely on the user running migration/push if we want to be "pure".
    // However, for a single-file-distributable CLI, self-initialization is preferred.
    // The "duplication" comment likely refers to defining it in schema.ts AND here.
    
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