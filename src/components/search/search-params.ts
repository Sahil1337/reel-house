/** URL ⇄ state helpers for /search, shared by the server page and the client view. */
import type { ContentType, Genre } from "@/types";

/** Page size for /search (the API's default). */
export const SEARCH_RESULT_LIMIT = 60;

export interface SearchState {
  query: string;
  type: ContentType | null;
  genreId: number | null;
}

type RawParam = string | string[] | undefined;

const first = (value: RawParam) => (Array.isArray(value) ? value[0] : value);

export function parseContentType(value: string | null | undefined): ContentType | null {
  return value === "MOVIE" || value === "SERIES" ? value : null;
}

export function parseSearchParams(params: Record<string, RawParam>, genres: Genre[]): SearchState {
  const genreId = Number(first(params.genre));
  return {
    query: first(params.q)?.trim() ?? "",
    type: parseContentType(first(params.type)),
    genreId: genres.some((genre) => genre.genreId === genreId) ? genreId : null,
  };
}

export function searchHref({ query, type, genreId }: SearchState): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (type) params.set("type", type);
  if (genreId) params.set("genre", String(genreId));
  const search = params.toString();
  return search ? `/search?${search}` : "/search";
}

/** Page heading: the top nav's "Films" / "Series" links land here with a type set. */
export function searchHeading(type: ContentType | null): string {
  if (type === "MOVIE") return "Films";
  if (type === "SERIES") return "Series";
  return "Search";
}
