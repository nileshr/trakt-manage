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

export interface TraktHistoryItem {
  id: number;
  watched_at: string;
  action: string;
  type: "movie" | "episode";
  movie?: {
    title: string;
    year: number;
    ids: { trakt: number; slug: string; imdb: string; tmdb: number };
  };
  show?: {
    title: string;
    year: number;
    ids: { trakt: number; slug: string; imdb: string; tmdb: number };
  };
  episode?: {
    season: number;
    number: number;
    title: string;
    ids: { trakt: number; imdb: string; tmdb: number };
  };
}

export interface FindDuplicatesOptions {
  type: "movies" | "episodes";
  keepPerDay: boolean;
}
