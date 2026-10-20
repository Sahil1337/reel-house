"use client";

import { useState, type ReactNode } from "react";

import { Poster } from "@/components/content/artwork";
import type { GenreTaste, HomeExplanation, PickExplanation } from "@/types";
import { formatYear } from "@/lib/format";
import { cn } from "@/lib/utils";

import { type Evidence, evidenceFor, isTied, listWords, num, ordinal, points, SOURCES, sourceIndex } from "./model";

/** Which pick's case to open on first render: the hero, pick #1. */
export function PickProof({ data }: { data: HomeExplanation }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const index = Math.max(
    0,
    data.topPicks.findIndex((p) => p.contentId === selectedId),
  );
  const pick = data.topPicks[index];
  if (!pick) return <p className="text-sm text-muted-foreground">No pick to explain: every title is already seen.</p>;

  return (
    <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
      <RankedList picks={data.topPicks} selected={pick.contentId} onSelect={setSelectedId} />
      <CaseFile key={pick.contentId} data={data} pick={pick} index={index} />
    </div>
  );
}

/** The ten picks in Home order. A column on wide screens, a poster strip below that. */
function RankedList({
  picks,
  selected,
  onSelect,
}: {
  picks: PickExplanation[];
  selected: number;
  onSelect: (contentId: number) => void;
}) {
  return (
    <ol
      aria-label="Top picks, in Home order"
      className="no-scrollbar flex gap-2 overflow-x-auto pb-1 max-lg:-mx-1 max-lg:px-1 lg:flex-col lg:gap-0.5 lg:overflow-visible"
    >
      {picks.map((pick, i) => {
        const active = pick.contentId === selected;
        return (
          <li key={pick.contentId} className="shrink-0">
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(pick.contentId)}
              className={cn(
                "group/pick relative flex items-center gap-2.5 rounded-lg text-start outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                "max-lg:w-[4.5rem] max-lg:flex-col max-lg:items-stretch max-lg:gap-1 lg:w-full lg:px-2 lg:py-1.5",
                active ? "lg:bg-accent" : "hover-fine:lg:bg-accent/50",
              )}
            >
              <span
                className={cn(
                  "relative shrink-0 overflow-hidden rounded-[5px] ring-1 transition-[box-shadow,opacity] duration-150",
                  active ? "ring-primary" : "ring-foreground/10 max-lg:opacity-60 group-hover/pick:opacity-100",
                )}
              >
                <Poster content={pick} sizes="72px" className="w-full lg:w-8" />
                <span className="absolute top-0.5 left-0.5 rounded-sm bg-scrim/85 px-1 font-mono text-[10px] leading-4 font-semibold tabular-nums lg:hidden">
                  {i + 1}
                </span>
              </span>
              <span className="hidden w-4 shrink-0 font-mono text-xs text-muted-foreground tabular-nums lg:inline">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col lg:gap-0.5">
                <span className={cn("truncate text-xs leading-4 lg:text-sm", active ? "font-semibold" : "font-medium")}>
                  {pick.title}
                </span>
                <span className="font-mono text-[11px] leading-4 text-muted-foreground tabular-nums">
                  {pick.match !== undefined ? `${pick.match}%` : "–"}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** One pick, argued in full: the verdict, the evidence behind each of its genres, the arithmetic, and the title it beats. */
function CaseFile({ data, pick, index }: { data: HomeExplanation; pick: PickExplanation; index: number }) {
  const year = formatYear(pick.releaseDate);
  const cold = pick.match === undefined;
  const rows = byTaste(pick);
  const best = data.topPicks[0]?.score ?? 0;
  const tasteOf = new Map(data.taste.map((row) => [row.genreId, row]));

  return (
    <article className="flex min-w-0 flex-col gap-7 animate-in duration-300 fade-in-0 slide-in-from-bottom-1">
      <header className="flex items-start gap-4">
        <Poster
          content={pick}
          sizes="96px"
          className="w-16 shrink-0 rounded-md shadow-lg ring-1 ring-foreground/10 sm:w-20"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            Pick #{index + 1}
            {index === 0 ? " · the hero" : ""}
          </span>
          <h3 className="font-display text-2xl leading-none font-bold tracking-wide uppercase sm:text-3xl">
            {pick.title}
          </h3>
          <p className="text-xs text-muted-foreground">
            {[year, pick.contentType === "MOVIE" ? "Film" : "Series"].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end leading-none">
          <span className="font-mono text-3xl font-semibold tabular-nums text-primary">
            {pick.match !== undefined ? `${pick.match}%` : "–"}
          </span>
          <span className="mt-1 text-[11px] text-muted-foreground">match</span>
        </div>
      </header>

      <p className="text-sm leading-6 text-pretty">{verdict(data, pick, index)}</p>

      <Section title="The evidence" hint={cold ? "Nothing you did points to any of these genres yet." : undefined}>
        <ol className="flex flex-col divide-y">
          {rows.map((g, i) => (
            <EvidenceRow
              key={g.genreId}
              genre={g.name}
              taste={g.taste}
              row={tasteOf.get(g.genreId)}
              evidence={evidenceFor(g.name, data)}
              delay={60 + i * 50}
            />
          ))}
        </ol>
      </Section>

      <Section title="The score" hint="Sum ÷ √genres, so having many genres alone can't win.">
        <Receipt pick={pick} best={best} />
      </Section>

      {data.topPicks.length > 1 ? (
        <Section title={index < data.topPicks.length - 1 ? "Why it ranks here" : "Why it ranks last of these"}>
          <Versus data={data} pick={pick} index={index} />
        </Section>
      ) : null}
    </article>
  );
}

/** A pick's genres strongest first, the order every part of the case file uses. */
const byTaste = (pick: PickExplanation) => [...pick.genres].sort((a, b) => b.taste - a.taste);

/** The one-paragraph argument, built from the numbers so it can never drift from them. */
function verdict(data: HomeExplanation, pick: PickExplanation, index: number): string {
  const names = pick.genres.map((g) => g.name);
  const n = names.length;
  const liked = pick.genres.filter((g) => g.taste > 0);
  const pool = data.filters.candidates;
  const year = formatYear(pick.releaseDate);
  const is = `${pick.title} is ${listWords(names)}.`;

  if (pick.match === undefined) {
    return `${is} Nothing you've watched, rated, saved or picked points to a genre yet, so all ${pool} unseen titles score 0 and the newest release goes first${year ? `; this one is from ${year}` : ""}.`;
  }

  // Which signal did most of the work for this pick's genres? Sum each source over its liked genres.
  const tasteOf = new Map(data.taste.map((row) => [row.genreId, row]));
  const totals = { watch: 0, rating: 0, list: 0, pick: 0 };
  for (const g of liked) {
    const row = tasteOf.get(g.genreId);
    if (!row) continue;
    totals.watch += Math.max(0, row.watchScore);
    totals.rating += Math.max(0, row.ratingScore);
    totals.list += Math.max(0, row.myListScore);
    totals.pick += Math.max(0, row.pickScore);
  }
  const top = (Object.entries(totals) as [keyof typeof totals, number][]).sort((a, b) => b[1] - a[1])[0];
  const all = totals.watch + totals.rating + totals.list + totals.pick;
  const mostly =
    top[1] >= all * 0.999
      ? {
          watch: "all from what you watched",
          rating: "all from your ratings",
          list: "all from My List",
          pick: "all from your setup picks",
        }[top[0]]
      : {
          watch: "mostly from what you watched",
          rating: "mostly from your ratings",
          list: "mostly from My List",
          pick: "mostly from your setup picks",
        }[top[0]];

  const taste =
    liked.length === n
      ? `You've shown a taste for every one of ${n === 1 ? "them" : `those ${n}`} (${mostly})`
      : `You've shown a taste for ${liked.length} of those ${n}, ${listWords(liked.map((g) => g.name))} (${mostly})`;
  const rank = index === 0 ? "the best score" : `the ${ordinal(index + 1)}-best score`;
  return `${is} ${taste}, which gives it ${rank} of the ${pool} titles you haven't seen.`;
}

/** One genre of the pick: its taste on the left, every title that earned it on the right. */
function EvidenceRow({
  genre,
  taste,
  row,
  evidence,
  delay,
}: {
  genre: string;
  taste: number;
  row?: GenreTaste;
  evidence: Evidence[];
  delay: number;
}) {
  const none = taste <= 0;
  return (
    <li
      className="grid gap-x-4 gap-y-1.5 py-3 animate-in duration-300 fade-in-0 slide-in-from-left-1 fill-mode-both sm:grid-cols-[9.5rem_1fr] sm:items-center"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-start sm:gap-0.5">
        <span className={cn("text-sm font-medium", none && "text-muted-foreground")}>{genre}</span>
        <span className="flex items-center gap-1.5">
          <span className={cn("font-mono text-sm font-semibold tabular-nums", none && "text-muted-foreground")}>
            {none ? "0" : num(taste)}
          </span>
          {row ? <SourceBar row={row} /> : null}
        </span>
      </div>
      {none ? (
        <p className="text-xs text-muted-foreground">No taste yet · still counts in the √</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {evidence.map((e) => (
            <EvidenceChip key={e.id} evidence={e} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** A title that gave the genre its points: poster, name, and each signal with its points in that signal's colour. */
function EvidenceChip({ evidence }: { evidence: Evidence }) {
  const negative = evidence.total < 0;
  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-md bg-muted/60 py-1 pe-2.5 ps-1 text-xs",
        negative && "opacity-70",
      )}
    >
      {evidence.poster ? (
        <Poster content={evidence.poster} sizes="24px" className="w-5 rounded-[3px] ring-1 ring-foreground/10" />
      ) : (
        <span aria-hidden="true" className="flex h-[30px] w-5 items-center justify-center">
          <span className="size-2.5 rounded-[3px] bg-signal-pick" />
        </span>
      )}
      <span className="flex min-w-0 flex-col leading-4">
        <span className="max-w-40 truncate font-medium">{evidence.title}</span>
        <span className="flex flex-wrap gap-x-2 font-mono text-[11px] text-muted-foreground tabular-nums">
          {evidence.parts.map((p) => (
            <span key={p.source} className="flex items-center gap-1">
              <span
                aria-hidden="true"
                className={cn("size-1.5 rounded-[2px]", SOURCES[sourceIndex(p.source)].swatch)}
              />
              {p.how} {points(p.value)}
            </span>
          ))}
        </span>
      </span>
    </li>
  );
}

/** A 40px bar split by where the genre's taste came from, in the legend's colours. */
function SourceBar({ row }: { row: GenreTaste }) {
  const parts = [row.watchScore, row.ratingScore, row.myListScore, row.pickScore].map((v) => Math.max(0, v));
  const total = parts.reduce((t, v) => t + v, 0);
  if (total <= 0) return null;
  return (
    <span aria-hidden="true" className="flex h-1.5 w-10 gap-px overflow-hidden rounded-[2px]">
      {parts.map((v, i) =>
        v > 0 ? (
          <span key={SOURCES[i].key} className={SOURCES[i].swatch} style={{ width: `${(v / total) * 100}%` }} />
        ) : null,
      )}
    </span>
  );
}

/** The arithmetic as a receipt: the sum, the division, the match. */
function Receipt({ pick, best }: { pick: PickExplanation; best: number }) {
  const terms = byTaste(pick)
    .map((g) => `${g.name} ${num(g.taste)}`)
    .join(" + ");
  return (
    <dl className="grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-1.5 rounded-lg border bg-card px-3 py-2.5 font-mono text-xs tabular-nums">
      <dt className="text-muted-foreground">sum</dt>
      <dd className="text-muted-foreground">{terms}</dd>
      <dd className="text-end font-semibold">{num(pick.sum)}</dd>
      <dt className="text-muted-foreground">score</dt>
      <dd className="text-muted-foreground">
        {num(pick.sum)} ÷ √{pick.genreCount} <span className="opacity-70">({pick.sqrtN.toFixed(3)})</span>
      </dd>
      <dd className="text-end font-semibold">{pick.score.toFixed(2)}</dd>
      <dt className="text-muted-foreground">match</dt>
      <dd className="text-muted-foreground">
        {best > 0 ? `55 + 44 × ${pick.score.toFixed(2)} ÷ ${best.toFixed(2)}` : "no score above 0"}
      </dd>
      <dd className="text-end font-semibold text-primary">{pick.match !== undefined ? `${pick.match}%` : "–"}</dd>
    </dl>
  );
}

/** Head to head with the next pick down (or, for the last, the one above): why the order is what it is. */
function Versus({ data, pick, index }: { data: HomeExplanation; pick: PickExplanation; index: number }) {
  const last = index === data.topPicks.length - 1;
  const other = data.topPicks[last ? index - 1 : index + 1];
  const tied = isTied(data.topPicks, index) && Math.abs(other.score - pick.score) < 1e-9;
  const year = formatYear(pick.releaseDate);
  const otherYear = formatYear(other.releaseDate);

  let line: string;
  if (tied) {
    line = `Ties with ${other.title} at ${pick.score.toFixed(2)}. Equal scores go to the newer release${
      year && otherYear ? ` (${last ? `${otherYear} vs ${year}` : `${year} vs ${otherYear}`})` : ""
    }, so ${last ? other.title : pick.title} goes first.`;
  } else if (!last) {
    line = `Beats ${other.title}, ${pick.score.toFixed(2)} to ${other.score.toFixed(2)}: ${edge(pick, other)}.`;
  } else {
    line = `Sits below ${other.title}, ${pick.score.toFixed(2)} to ${other.score.toFixed(2)}: ${edge(other, pick)}.`;
  }

  return <p className="text-sm leading-6 text-pretty">{line}</p>;
}

/** Why `a` outscores `b`, in words: more taste in total, or the same taste spread over fewer genres. */
function edge(a: PickExplanation, b: PickExplanation): string {
  if (a.sum > b.sum + 1e-9 && a.genreCount <= b.genreCount)
    return `more taste in total (${num(a.sum)} vs ${num(b.sum)}) across no more genres`;
  if (a.sum > b.sum + 1e-9)
    return `more taste in total (${num(a.sum)} vs ${num(b.sum)}), enough to pay for its extra genres`;
  if (Math.abs(a.sum - b.sum) < 1e-9)
    return `the same taste (${num(a.sum)}) spread over fewer genres (${a.genreCount} vs ${b.genreCount}), so ÷ √n costs it less`;
  return `${b.title} has more taste (${num(b.sum)} vs ${num(a.sum)}) but spreads it over ${b.genreCount} genres, and ÷ √${b.genreCount} costs it more`;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div>
        <h4 className="text-sm font-semibold">{title}</h4>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}
