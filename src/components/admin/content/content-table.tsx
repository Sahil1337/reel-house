"use client";

import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, Edit02Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatYear } from "@/lib/format";
import type { AdminContentRow } from "@/types";

const TMDB_IMAGE_PREFIX = "https://image.tmdb.org/t/p/";
const VISIBLE_GENRES = 2;
const SKELETON_ROWS = 8;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Poster thumbnail; posters an admin pasted from another host skip the optimizer (next.config only allows TMDB). */
function PosterThumb({ row }: { row: AdminContentRow }) {
  return (
    <span className="relative block h-12 w-8 shrink-0 overflow-hidden rounded-sm bg-muted">
      {row.posterUrl ? (
        <Image
          src={row.posterUrl}
          alt=""
          fill
          sizes="32px"
          unoptimized={!row.posterUrl.startsWith(TMDB_IMAGE_PREFIX)}
          className="object-cover"
        />
      ) : null}
    </span>
  );
}

function Genres({ row }: { row: AdminContentRow }) {
  if (row.genres.length === 0) return <span className="text-muted-foreground">—</span>;
  const visible = row.genres.slice(0, VISIBLE_GENRES);
  const hidden = row.genres.slice(VISIBLE_GENRES);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((genre) => (
        <Badge key={genre.genreId} variant="outline">
          {genre.name}
        </Badge>
      ))}
      {hidden.length ? (
        <Badge variant="secondary" title={hidden.map((genre) => genre.name).join(", ")}>
          +{hidden.length}
          <span className="sr-only"> more: {hidden.map((genre) => genre.name).join(", ")}</span>
        </Badge>
      ) : null}
    </div>
  );
}

function SeasonsAndEpisodes({ row }: { row: AdminContentRow }) {
  if (row.contentType === "MOVIE" || row.seasonCount === null || row.episodeCount === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="tabular-nums">
      {plural(row.seasonCount, "season")} · {plural(row.episodeCount, "episode")}
    </span>
  );
}

/** The titles table. Presentational: the view owns the data and the dialogs. */
export function ContentTable({
  rows,
  onEdit,
  onRemove,
}: {
  rows: AdminContentRow[];
  onEdit: (row: AdminContentRow) => void;
  onRemove: (row: AdminContentRow) => void;
}) {
  return (
    <Table className="min-w-190">
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Year</TableHead>
          <TableHead>Rating</TableHead>
          <TableHead>Genres</TableHead>
          <TableHead>Seasons / episodes</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.contentId}>
            <TableCell>
              <div className="flex min-w-0 items-center gap-3">
                <PosterThumb row={row} />
                <span className="max-w-64 truncate font-medium" title={row.title}>
                  {row.title}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={row.contentType === "MOVIE" ? "info" : "success"}>
                {row.contentType === "MOVIE" ? "Movie" : "Series"}
              </Badge>
            </TableCell>
            <TableCell className="tabular-nums">
              {formatYear(row.releaseDate) ?? <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell>{row.ageRating ?? <span className="text-muted-foreground">—</span>}</TableCell>
            <TableCell>
              <Genres row={row} />
            </TableCell>
            <TableCell>
              <SeasonsAndEpisodes row={row} />
            </TableCell>
            <TableCell>
              <Menu>
                <MenuTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label={`Actions for ${row.title}`}>
                  <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                </MenuTrigger>
                <MenuPopup align="end">
                  <MenuItem onClick={() => onEdit(row)}>
                    <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
                    Edit details
                  </MenuItem>
                  <MenuItem variant="destructive" onClick={() => onRemove(row)}>
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                    Remove
                  </MenuItem>
                </MenuPopup>
              </Menu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Same columns and row height as the table, so nothing shifts when the data arrives. */
export function ContentTableSkeleton() {
  return (
    <Table className="min-w-190" aria-busy="true" aria-label="Loading titles">
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Year</TableHead>
          <TableHead>Rating</TableHead>
          <TableHead>Genres</TableHead>
          <TableHead>Seasons / episodes</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <TableRow key={index}>
            <TableCell>
              <div className="flex items-center gap-3">
                <Skeleton className="h-12 w-8 shrink-0" />
                <Skeleton className="h-4 w-40" />
              </div>
            </TableCell>
            <TableCell>
              <Skeleton className="h-4.5 w-12" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-10" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-8" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4.5 w-28" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-32" />
            </TableCell>
            <TableCell>
              <Skeleton className="size-7" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
