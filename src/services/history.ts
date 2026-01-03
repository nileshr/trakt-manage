import { db } from "../db";
import { history } from "../db/schema";
import { eq } from "drizzle-orm";
import type { TraktHistoryItem } from "../types";

/**
 * Save history items to the local database.
 * Clears existing history for the given type first.
 */
export async function saveHistoryToDb(items: TraktHistoryItem[], type: string) {
  console.log(`Saving ${items.length} ${type} to database...`);

  // Clear existing for this type
  await db
    .delete(history)
    .where(eq(history.type, type === "movies" ? "movie" : "episode"));

  const batchSize = 100;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const values = batch.map((item) => {
      const entryType = type === "movies" ? "movie" : "episode";
      const entryData = item[entryType];
      if (!entryData) {
        console.error("Invalid history item:", item);
        return null;
      }
      return {
        traktId: entryData.ids.trakt,
        type: entryType,
        title: entryData.title,
        year: item.movie?.year ?? item.show?.year ?? null,
        season: item.episode?.season || null,
        episode: item.episode?.number || null,
        watchedAt: item.watched_at,
        rawJson: JSON.stringify(item),
      };
    });
    const validValues = values.filter((v) => v !== null);
    if (validValues.length > 0) {
      await db.insert(history).values(validValues);
    }
  }
  console.log("Database updated.");
}

/**
 * Retrieve history items from local database.
 */
export async function getHistoryFromDb(
  type: "movies" | "episodes",
): Promise<TraktHistoryItem[]> {
  const entryType = type === "movies" ? "movie" : "episode";
  const rows = await db
    .select()
    .from(history)
    .where(eq(history.type, entryType));
  return rows.map((r) => JSON.parse(r.rawJson || "{}")) as TraktHistoryItem[];
}
