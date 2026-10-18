/**
 * Pure helpers for the "Why these picks?" visuals: turn a HomeExplanation into the flow's
 * strands (title → genre, one per signal) and work out what to highlight for a hovered item.
 */
import type { HomeExplanation, PickExplanation, TitleSignals } from "@/types";

/** The four places taste comes from, in the genre_taste view's column order (also the stack order). */
export const SOURCES = [
  { key: "watch", label: "Watched", color: "var(--signal-watch)", swatch: "bg-signal-watch" },
  { key: "rating", label: "Rated", color: "var(--signal-rating)", swatch: "bg-signal-rating" },
  { key: "list", label: "My List", color: "var(--signal-list)", swatch: "bg-signal-list" },
  { key: "pick", label: "Onboarding pick", color: "var(--signal-pick)", swatch: "bg-signal-pick" },
] as const;

export type Source = (typeof SOURCES)[number]["key"];

export const sourceIndex = (source: Source) => SOURCES.findIndex((s) => s.key === source);

/** Node id of the onboarding picks in the flow (titles use `t:<contentId>`). */
export const ONBOARDING = "onboarding";
export const titleNode = (contentId: number) => `t:${contentId}`;

/** One signal giving points to one genre: a band in the flow. `value` can be negative (low rating). */
export interface Strand {
  id: string;
  from: string;
  genre: string;
  source: Source;
  value: number;
}

/** 1 → "1", 0.5 → "0.5", 3.75 → "3.75" */
export const num = (value: number) => String(Math.round(value * 100) / 100);
/** Points with a sign: +1, +0.5, −0.5 */
export const points = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${num(Math.abs(value))}`;

/** Each signal of a title goes to every one of its genres; each onboarding pick gives its genre +1. */
export function buildStrands(data: HomeExplanation): Strand[] {
  const strands: Strand[] = [];
  const add = (from: string, genre: string, source: Source, value: number) => {
    if (value !== 0) strands.push({ id: `${from}|${genre}|${source}`, from, genre, source, value });
  };
  for (const s of data.signals) {
    for (const genre of s.genres) {
      add(titleNode(s.contentId), genre, "watch", s.watched?.points ?? 0);
      add(titleNode(s.contentId), genre, "rating", s.rating?.points ?? 0);
      add(titleNode(s.contentId), genre, "list", s.myList?.points ?? 0);
    }
  }
  for (const genre of data.picks) add(ONBOARDING, genre, "pick", 1);
  return strands;
}

/** What the reader is pointing at: a title (or the onboarding picks), a genre, a band or a pick. */
export type Focus =
  | { kind: "node"; id: string }
  | { kind: "genre"; name: string }
  | { kind: "strand"; id: string }
  | { kind: "pick"; contentId: number };

/** Everything connected to the focus; null = nothing focused, show everything. */
export interface Lit {
  nodes: Set<string>;
  genres: Set<string>;
  strands: Set<string>;
  picks: Set<number>;
}

const picksWithAny = (picks: PickExplanation[], genres: Set<string>) =>
  new Set(picks.filter((p) => p.genres.some((g) => genres.has(g.name))).map((p) => p.contentId));

export function litFor(focus: Focus | null, strands: Strand[], picks: PickExplanation[]): Lit | null {
  if (!focus) return null;
  let chosen: Strand[];
  let genres: Set<string>;
  if (focus.kind === "node") {
    chosen = strands.filter((s) => s.from === focus.id);
    genres = new Set(chosen.map((s) => s.genre));
  } else if (focus.kind === "genre") {
    genres = new Set([focus.name]);
    chosen = strands.filter((s) => s.genre === focus.name);
  } else if (focus.kind === "strand") {
    chosen = strands.filter((s) => s.id === focus.id);
    genres = new Set(chosen.map((s) => s.genre));
  } else {
    const pick = picks.find((p) => p.contentId === focus.contentId);
    genres = new Set(pick?.genres.map((g) => g.name) ?? []);
    chosen = strands.filter((s) => genres.has(s.genre));
  }
  return {
    nodes: new Set(chosen.map((s) => s.from)),
    genres,
    strands: new Set(chosen.map((s) => s.id)),
    picks: focus.kind === "pick" ? new Set([focus.contentId]) : picksWithAny(picks, genres),
  };
}

/** Same score as the pick before or after it: the order between them is newest release first. */
export function isTied(picks: PickExplanation[], index: number) {
  const close = (other?: PickExplanation) => other !== undefined && Math.abs(other.score - picks[index].score) < 1e-9;
  return close(picks[index - 1]) || close(picks[index + 1]);
}

/** "watched 100% → +1 · rated 5★ → +1" for a title. */
export function describeSignals(s: TitleSignals) {
  const parts: string[] = [];
  if (s.watched) parts.push(`watched ${s.watched.percent}% → ${points(s.watched.points)}`);
  if (s.rating) parts.push(`rated ${s.rating.stars}★ → ${points(s.rating.points)}`);
  if (s.myList) parts.push(`on My List → ${points(s.myList.points)}`);
  return parts.join(" · ");
}
