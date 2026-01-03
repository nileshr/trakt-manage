/**
 * Shared types for trakt-manage
 */

export interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  created_at: number;
}

export interface Credentials {
  client_id: string;
  client_secret: string;
  username: string;
}

export interface TraktIds {
  trakt: number;
  slug?: string | null;
  imdb?: string | null;
  tmdb?: number | null;
  tvdb?: number | null;
  tvrage?: number | null;
}

export interface TraktHistoryItem {
  id: number;
  watched_at: string;
  action: string;
  type: "movie" | "episode";
  movie?: {
    title: string;
    year: number;
    ids: TraktIds;
  };
  show?: {
    title: string;
    year: number;
    ids: TraktIds;
  };
  episode?: {
    season: number;
    number: number;
    title: string;
    ids: TraktIds;
  };
}

export interface FindDuplicatesOptions {
  type: "movies" | "episodes";
  keepPerDay: boolean;
}

/**
 * Type-safe helper to get the title from a TraktHistoryItem.
 * Uses the item's type discriminant to access the correct property.
 */
export function getItemTitle(item: TraktHistoryItem): string {
  if (item.type === "movie") {
    return item.movie?.title ?? "Unknown";
  }
  return item.episode?.title ?? "Unknown";
}
