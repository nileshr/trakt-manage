import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const config = sqliteTable("config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const history = sqliteTable("history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  traktId: integer("trakt_id").notNull(),
  type: text("type").notNull(), // 'movie' or 'episode'
  title: text("title").notNull(),
  year: integer("year"),
  season: integer("season"),
  episode: integer("episode"),
  watchedAt: text("watched_at").notNull(),
  rawJson: text("raw_json"),
});
