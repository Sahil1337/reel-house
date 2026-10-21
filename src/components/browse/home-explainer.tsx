"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Idea01Icon } from "@hugeicons/core-free-icons";
import { useMemo, useState, type ReactNode } from "react";

import { FilterFunnel } from "@/components/browse/explainer/filter-funnel";
import {
  buildStrands,
  describeSignals,
  type Focus,
  isTied,
  litFor,
  num,
  ONBOARDING,
  points,
  SOURCES,
  sourceIndex,
  type Strand,
  titleNode,
} from "@/components/browse/explainer/model";
import { NumbersTables } from "@/components/browse/explainer/numbers-tables";
import { PickProof } from "@/components/browse/explainer/pick-proof";
import { PickScores } from "@/components/browse/explainer/pick-scores";
import { PipelineStrip } from "@/components/browse/explainer/pipeline-strip";
import { TasteFlow } from "@/components/browse/explainer/taste-flow";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { useHomeExplanation } from "@/hooks/queries/recommendations";
import type { HomeExplanation } from "@/types";
import { cn } from "@/lib/utils";

/** "Why these picks?" button + a large dialog that draws how Home was built, with this profile's live numbers. */
export function HomeExplainer({ profileId }: { profileId: number }) {
  const [open, setOpen] = useState(false);
  const { data, isPending, isError, refetch } = useHomeExplanation(profileId, open);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <HugeiconsIcon icon={Idea01Icon} strokeWidth={2} />
        Why these picks?
      </DialogTrigger>
      <DialogPopup className="sm:max-w-[min(1320px,calc(100vw-2rem))]">
        {isError ? (
          <>
            <Header />
            <DialogPanel>
              <div className="flex flex-col items-start gap-3 text-sm">
                <p className="text-muted-foreground">Couldn&apos;t load the explanation.</p>
                <Button size="sm" variant="outline" onClick={() => void refetch()}>
                  Try again
                </Button>
              </div>
            </DialogPanel>
          </>
        ) : isPending || !data ? (
          <>
            <Header />
            <DialogPanel>
              <ExplainerSkeleton />
            </DialogPanel>
          </>
        ) : (
          <Explanation data={data} />
        )}
      </DialogPopup>
    </Dialog>
  );
}

function Header({ children }: { children?: ReactNode }) {
  return (
    <DialogHeader className="gap-3 border-b pb-4 max-sm:gap-2.5 max-sm:p-4 max-sm:pb-3">
      <div className="flex flex-col gap-1 pe-8">
        <DialogTitle className="font-display text-2xl font-bold tracking-wide uppercase sm:text-3xl">
          Why these picks?
        </DialogTitle>
        <DialogDescription className="max-sm:hidden">
          What you did becomes genre taste. Taste scores every title you haven&apos;t seen. The best fill Home.
        </DialogDescription>
      </div>
      {children}
    </DialogHeader>
  );
}

function Explanation({ data }: { data: HomeExplanation }) {
  const isEmpty = data.signals.length === 0 && data.picks.length === 0;
  return (
    <>
      <Header />
      {/* Spacing lives on an inner div: DialogPanel's own pt-1 variant out-specifies padding passed to it. */}
      <DialogPanel>
        <div className="flex flex-col gap-4 pt-5">
          {isEmpty ? (
            <p className="rounded-lg border border-primary/30 bg-primary/8 p-3 text-sm">
              No activity and no onboarding picks yet, so every genre scores 0 and so does every title. Ties go to the
              newest release, so Home shows the newest titles. Watch, rate or save something and this fills in.
            </p>
          ) : null}

          <PipelineStrip data={data} />

          <Tabs defaultValue="picks" className="gap-5">
            <TabsList variant="underline" className="-mx-1">
              <TabsTab value="picks">Why each pick</TabsTab>
              <TabsTab value="pipeline">The whole pipeline</TabsTab>
              <TabsTab value="numbers">Every number</TabsTab>
            </TabsList>
            <TabsPanel value="picks">
              <PickProof data={data} />
            </TabsPanel>
            <TabsPanel value="pipeline">
              <Pipeline data={data} />
            </TabsPanel>
            <TabsPanel value="numbers">
              <NumbersTables data={data} />
            </TabsPanel>
          </Tabs>
        </div>
      </DialogPanel>
    </>
  );
}

/** The four steps as charts, with a readout that traces whatever is hovered or tapped through all of them. */
function Pipeline({ data }: { data: HomeExplanation }) {
  const strands = useMemo(() => buildStrands(data), [data]);
  const [hovered, setHovered] = useState<Focus | null>(null);
  const [pinned, setPinned] = useState<Focus | null>(null);
  const focus = hovered ?? pinned;
  const lit = useMemo(() => litFor(focus, strands, data.topPicks), [focus, strands, data.topPicks]);
  // Tap/click pins a focus (so it works on touch); the same item again unpins it.
  const select = (next: Focus) =>
    setPinned((current) => (JSON.stringify(current) === JSON.stringify(next) ? null : next));
  const isEmpty = data.signals.length === 0 && data.picks.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Legend />
        <Inspector
          data={data}
          strands={strands}
          focus={focus}
          pinned={pinned !== null}
          onClear={() => setPinned(null)}
        />
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
        <Step
          n={1}
          className="lg:sticky lg:top-0 lg:self-start"
          title="What you did becomes genre taste"
          hint="Each title gives its points to every one of its genres. Band thickness = points; a genre's bar adds them up (its taste)."
        >
          {isEmpty ? (
            <Muted>Nothing watched, rated, saved or picked yet.</Muted>
          ) : (
            <TasteFlow data={data} strands={strands} lit={lit} onHover={setHovered} onSelect={select} />
          )}
        </Step>

        <div className="flex flex-col gap-10">
          <Step
            n={2}
            title="Only unseen, allowed titles are scored"
            hint="Each filter removes titles before any scoring."
          >
            <FilterFunnel filters={data.filters} shown={data.topPicks.length} />
          </Step>
          <Step
            n={3}
            title="Each title scores SUM(taste) ÷ √genres"
            hint="Top bar: its genres' taste end to end. Bottom bar: that sum ÷ √genres, so many genres alone can't win."
          >
            <PickScores picks={data.topPicks} taste={data.taste} lit={lit} onHover={setHovered} onSelect={select} />
          </Step>
        </div>
      </div>
    </div>
  );
}

/** One key for every chart: colour = where the points came from; white = the score. */
function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground max-sm:gap-x-3 max-sm:text-[11px]">
      {SOURCES.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("size-2.5 rounded-[3px]", s.swatch)} />
          {s.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-4 rounded-[3px] bg-foreground/14" />
        Genre taste in a pick
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-1.5 w-4 rounded-[2px] bg-foreground" />
        Score
      </li>
    </ul>
  );
}

/** A live readout of the exact numbers behind whatever is hovered, focused or tapped. */
function Inspector({
  data,
  strands,
  focus,
  pinned,
  onClear,
}: {
  data: HomeExplanation;
  strands: Strand[];
  focus: Focus | null;
  pinned: boolean;
  onClear: () => void;
}) {
  const text = focus ? describe(focus, data, strands) : null;
  // Fixed height: a readout that grew would push the charts out from under the pointer.
  return (
    <div
      aria-live="polite"
      className="flex h-24 items-start justify-between gap-3 overflow-y-auto rounded-lg border bg-card px-3 py-2 text-xs sm:h-16"
    >
      {text ? (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold">{text.title}</span>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{text.detail}</span>
        </div>
      ) : (
        <span className="self-center text-muted-foreground">
          Point at, tap or tab to any title, genre, band or pick to trace its numbers through every step.
        </span>
      )}
      {pinned ? (
        <Button size="xs" variant="ghost" onClick={onClear} className="shrink-0">
          Clear
        </Button>
      ) : null}
    </div>
  );
}

function describe(focus: Focus, data: HomeExplanation, strands: Strand[]): { title: string; detail: string } {
  const pickCount = (genres: Set<string>) =>
    data.topPicks.filter((p) => p.genres.some((g) => genres.has(g.name))).length;
  const feeds = (genres: Set<string>) => `feeds ${pickCount(genres)} of ${data.topPicks.length} picks`;

  if (focus.kind === "node") {
    if (focus.id === ONBOARDING) {
      return {
        title: "Onboarding picks",
        detail: `+1 to each of ${data.picks.join(", ")} · ${feeds(new Set(data.picks))}`,
      };
    }
    const s = data.signals.find((x) => titleNode(x.contentId) === focus.id);
    if (!s) return { title: "", detail: "" };
    return {
      title: s.title,
      detail: `${describeSignals(s)} = ${points(s.totalPoints)} to each of ${s.genres.join(", ")} · ${feeds(new Set(s.genres))}`,
    };
  }
  if (focus.kind === "genre") {
    const row = data.taste.find((t) => t.genre === focus.name);
    if (!row) return { title: focus.name, detail: "" };
    const titles = new Set(strands.filter((s) => s.genre === focus.name && s.from !== ONBOARDING).map((s) => s.from));
    return {
      title: `${row.genre} · taste ${num(row.tasteScore)}`,
      detail: `= watched ${num(row.watchScore)} + rated ${num(row.ratingScore)} + My List ${num(row.myListScore)} + pick ${num(row.pickScore)} · from ${titles.size} title${titles.size === 1 ? "" : "s"} · ${feeds(new Set([row.genre]))}`,
    };
  }
  if (focus.kind === "strand") {
    const s = strands.find((x) => x.id === focus.id);
    if (!s) return { title: "", detail: "" };
    const source = SOURCES[sourceIndex(s.source)].label;
    if (s.from === ONBOARDING) return { title: `Onboarding pick → ${s.genre}`, detail: `${source} → +1` };
    const signal = data.signals.find((x) => titleNode(x.contentId) === s.from);
    const how =
      s.source === "watch"
        ? `watched ${signal?.watched?.percent}%`
        : s.source === "rating"
          ? `rated ${signal?.rating?.stars}★`
          : "on My List";
    return { title: `${signal?.title} → ${s.genre}`, detail: `${how} → ${points(s.value)} to ${s.genre}` };
  }
  const index = data.topPicks.findIndex((p) => p.contentId === focus.contentId);
  const pick = data.topPicks[index];
  if (!pick) return { title: "", detail: "" };
  const best = data.topPicks[0]?.score ?? 0;
  const parts = pick.genres.map((g) => `${g.name} ${num(g.taste)}`).join(" + ");
  const match = best > 0 ? ` · match 55 + 44 × ${pick.score.toFixed(2)} ÷ ${best.toFixed(2)} = ${pick.match}%` : "";
  const tie = isTied(data.topPicks, index) ? " · tied score: the newer release ranks first" : "";
  return {
    title: `#${index + 1} ${pick.title}`,
    detail: `${parts} = ${num(pick.sum)} ÷ √${pick.genreCount} (${pick.sqrtN.toFixed(3)}) = ${pick.score.toFixed(2)}${match}${tie}`,
  };
}

function Step({
  n,
  title,
  hint,
  className,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-4", className)}>
      <div className="flex items-start gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/50 font-mono text-xs font-semibold text-primary">
          {n}
        </span>
        <div>
          <h3 className="text-sm leading-6 font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function ExplainerSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-10 lg:grid-cols-[7fr_5fr]">
      <span className="sr-only" role="status">
        Loading the explanation…
      </span>
      <Skeleton className="h-[480px] w-full" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}
