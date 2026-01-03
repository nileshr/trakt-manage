import type { TraktHistoryItem, FindDuplicatesOptions } from "../types";

/**
 * Find duplicate watch entries in Trakt history.
 *
 * When keepPerDay is false: keeps only the first watch per item (movie/episode).
 * When keepPerDay is true: keeps one watch per day per item.
 */
export function findDuplicates(
  items: TraktHistoryItem[],
  options: FindDuplicatesOptions,
): TraktHistoryItem[] {
  const { type, keepPerDay } = options;
  const entryType = type === "movies" ? "movie" : "episode";
  const seen = new Map<string, TraktHistoryItem>();
  const duplicates: TraktHistoryItem[] = [];

  // Sort by watched_at ascending so we keep the earliest entry
  const sorted = [...items].sort(
    (a, b) =>
      new Date(a.watched_at).getTime() - new Date(b.watched_at).getTime(),
  );

  for (const item of sorted) {
    const entry = item[entryType] as any;
    if (!entry?.ids?.trakt) continue;

    let key: string;
    if (keepPerDay) {
      // Key = traktId + date (YYYY-MM-DD)
      const dateStr = item.watched_at.slice(0, 10);
      key = `${entry.ids.trakt}:${dateStr}`;
    } else {
      // Key = traktId only (one watch per item ever)
      key = `${entry.ids.trakt}`;
    }

    if (seen.has(key)) {
      // This is a duplicate—mark for removal
      duplicates.push(item);
    } else {
      seen.set(key, item);
    }
  }

  return duplicates;
}
