import type { ReactNode } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { HomeExplanation } from "@/types";

import { num, points } from "./model";

/** Every number behind the charts as plain tables (the charts' table view). */
export function NumbersTables({ data }: { data: HomeExplanation }) {
  const { signals, picks, taste, topPicks } = data;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Block
        title="Signals per title"
        hint="Watched <10% 0 · <30% 0.25 · <50% 0.5 · <80% 0.75 · else 1. Rating (stars − 3) ÷ 2. My List +0.5."
      >
        <Table className="text-xs [&_td]:px-2 [&_th]:px-2">
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead className="text-end">Watched</TableHead>
              <TableHead className="text-end">Rating</TableHead>
              <TableHead className="text-end">My List</TableHead>
              <TableHead className="text-end">Points</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {signals.map((s) => (
              <TableRow key={s.contentId}>
                <TableCell>
                  <div className="font-medium">{s.title}</div>
                  <div className="max-w-44 whitespace-normal text-muted-foreground">{s.genres.join(", ")}</div>
                </TableCell>
                <TableCell className="text-end font-mono tabular-nums">
                  {s.watched ? `${s.watched.percent}% → ${points(s.watched.points)}` : "–"}
                </TableCell>
                <TableCell className="text-end font-mono tabular-nums">
                  {s.rating ? `${s.rating.stars}★ → ${points(s.rating.points)}` : "–"}
                </TableCell>
                <TableCell className="text-end font-mono tabular-nums">
                  {s.myList ? points(s.myList.points) : "–"}
                </TableCell>
                <TableCell className="text-end font-mono font-medium tabular-nums">{points(s.totalPoints)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="px-2 pt-2 text-xs text-muted-foreground">
          Onboarding picks (+1 to each): {picks.length > 0 ? picks.join(", ") : "none"}
        </p>
      </Block>

      <Block title="Genre taste" hint="Each title's points, added up per genre.">
        <Table className="text-xs [&_td]:px-2 [&_th]:px-2">
          <TableHeader>
            <TableRow>
              <TableHead>Genre</TableHead>
              <TableHead className="text-end">Watch</TableHead>
              <TableHead className="text-end">Rating</TableHead>
              <TableHead className="text-end">My List</TableHead>
              <TableHead className="text-end">Pick</TableHead>
              <TableHead className="text-end">= Taste</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {taste.map((row) => (
              <TableRow key={row.genreId}>
                <TableCell className="font-medium">{row.genre}</TableCell>
                <TableCell className="text-end font-mono tabular-nums">{num(row.watchScore)}</TableCell>
                <TableCell className="text-end font-mono tabular-nums">{num(row.ratingScore)}</TableCell>
                <TableCell className="text-end font-mono tabular-nums">{num(row.myListScore)}</TableCell>
                <TableCell className="text-end font-mono tabular-nums">{num(row.pickScore)}</TableCell>
                <TableCell className="text-end font-mono font-medium tabular-nums">{num(row.tasteScore)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Block>

      <Block
        title="Top pick scores"
        hint="score = sum ÷ √genres · match = 55 + 44 × score ÷ best · ties: newest first."
        className="lg:col-span-2"
      >
        <Table className="text-xs [&_td]:px-2 [&_th]:px-2">
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Genre taste</TableHead>
              <TableHead className="text-end">Sum ÷ √n</TableHead>
              <TableHead className="text-end">Score</TableHead>
              <TableHead className="text-end">Match</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topPicks.map((pick, index) => (
              <TableRow key={pick.contentId}>
                <TableCell className="font-mono text-muted-foreground tabular-nums">{index + 1}</TableCell>
                <TableCell>
                  <div className="font-medium">{pick.title}</div>
                  <div className="text-muted-foreground">{pick.releaseDate?.slice(0, 4) ?? "–"}</div>
                </TableCell>
                <TableCell className="max-w-72 whitespace-normal font-mono tabular-nums">
                  {pick.genres.map((g) => `${g.name} ${num(g.taste)}`).join(" + ")}
                </TableCell>
                <TableCell className="text-end font-mono whitespace-nowrap tabular-nums">
                  {num(pick.sum)} ÷ √{pick.genreCount} ({pick.sqrtN.toFixed(3)})
                </TableCell>
                <TableCell className="text-end font-mono font-medium tabular-nums">{pick.score.toFixed(2)}</TableCell>
                <TableCell className="text-end font-mono tabular-nums">{pick.match ?? "–"}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Block>
    </div>
  );
}

function Block({
  title,
  hint,
  className,
  children,
}: {
  title: string;
  hint: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className}>
      <h4 className="text-sm font-semibold">{title}</h4>
      <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
      <div className="overflow-x-auto rounded-lg border">{children}</div>
    </section>
  );
}
