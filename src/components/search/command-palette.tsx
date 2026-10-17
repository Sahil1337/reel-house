"use client";

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Bookmark02Icon,
  Clock01Icon,
  Film01Icon,
  Home01Icon,
  Search01Icon,
  Tv01Icon,
  UserAccountIcon,
  UserSwitchIcon,
} from "@hugeicons/core-free-icons";

import { Poster } from "@/components/content/artwork";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useContentSearch } from "@/hooks/queries/catalog";
import { formatYear } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ContentSummary } from "@/types";

import { searchHref } from "./search-params";

const DEBOUNCE_MS = 200;
const RESULT_LIMIT = 8;

type PaletteItem =
  | { kind: "link"; id: string; label: string; href: string; icon: IconSvgElement }
  | { kind: "title"; id: string; label: string; href: string; content: ContentSummary }
  | { kind: "all"; id: string; label: string; href: string };

interface PaletteGroup {
  value: string;
  items: PaletteItem[];
}

const QUICK_LINKS: PaletteItem[] = [
  { kind: "link", id: "home", label: "Home", href: "/browse", icon: Home01Icon },
  { kind: "link", id: "films", label: "Films", href: "/search?type=MOVIE", icon: Film01Icon },
  { kind: "link", id: "series", label: "Series", href: "/search?type=SERIES", icon: Tv01Icon },
  { kind: "link", id: "my-list", label: "My List", href: "/my-list", icon: Bookmark02Icon },
  { kind: "link", id: "history", label: "History", href: "/history", icon: Clock01Icon },
  { kind: "link", id: "account", label: "Account", href: "/account", icon: UserAccountIcon },
  { kind: "link", id: "profiles", label: "Switch profile", href: "/profiles", icon: UserSwitchIcon },
];

const noopSubscribe = () => () => {};

/** ⌘ on Apple platforms, Ctrl elsewhere (⌘ during SSR to avoid a flash on Macs). */
function useModifierKeyLabel(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "⌘",
  );
}

/** Global ⌘K / Ctrl+K title search with quick links. Renders its own trigger for the top nav. */
export function CommandPalette() {
  const router = useRouter();
  const modifierKey = useModifierKeyLabel();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** The trimmed query the (debounced) search runs for. */
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const debounce = useRef<number | undefined>(undefined);

  const trimmed = query.trim();
  const search = useContentSearch({ q: debouncedQuery, limit: RESULT_LIMIT }, { enabled: debouncedQuery !== "" });
  const results = trimmed ? (search.data?.items ?? []) : [];
  const pending = trimmed !== "" && (trimmed !== debouncedQuery || search.isFetching);
  const failed = trimmed !== "" && search.isError;

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) {
      window.clearTimeout(debounce.current);
      setQuery("");
      setDebouncedQuery("");
    }
  };

  const onShortcut = useEffectEvent(() => changeOpen(!open));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onShortcut();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(debounce.current);
    };
  }, []);

  const onQueryChange = (value: string) => {
    setQuery(value);
    window.clearTimeout(debounce.current);
    const q = value.trim();
    if (!q) {
      setDebouncedQuery("");
      return;
    }
    debounce.current = window.setTimeout(() => setDebouncedQuery(q), DEBOUNCE_MS);
  };

  const go = (href: string) => {
    changeOpen(false);
    router.push(href);
  };

  const groups: PaletteGroup[] = trimmed
    ? [
        ...(results.length > 0
          ? [
              {
                value: "Titles",
                items: results.map((content): PaletteItem => ({
                  kind: "title",
                  id: `title-${content.contentId}`,
                  label: content.title,
                  href: `/title/${content.contentId}`,
                  content,
                })),
              },
            ]
          : []),
        {
          value: "Search",
          items: [
            {
              kind: "all",
              id: "see-all",
              label: `See all results for “${trimmed}”`,
              href: searchHref({ query: trimmed, type: null, genreId: null }),
            },
          ],
        },
      ]
    : [{ value: "Go to", items: QUICK_LINKS }];

  const status = failed
    ? "Couldn't load titles. Check your connection and try again."
    : trimmed && !pending && results.length === 0
      ? `No titles match “${trimmed}”. Try an actor or director.`
      : null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Search titles"
        className="md:hidden"
        onClick={() => changeOpen(true)}
      >
        <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
      </Button>
      <Button
        variant="outline"
        className="hidden w-56 justify-between gap-6 text-muted-foreground md:inline-flex"
        onClick={() => changeOpen(true)}
      >
        <span className="flex items-center gap-2">
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          Search titles…
        </span>
        <KbdGroup>
          <Kbd>{modifierKey}</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>

      <CommandDialog open={open} onOpenChange={changeOpen}>
        <CommandDialogPopup aria-label="Search titles">
          {/* Results are already filtered by the server, so the list must not filter them again. */}
          <Command
            items={groups}
            value={query}
            onValueChange={(value, details) => {
              // Choosing an item navigates; it shouldn't also be typed into the input.
              if (details.reason !== "item-press") onQueryChange(value);
            }}
            filter={null}
          >
            <CommandInput placeholder="Search titles, actors, directors…" aria-label="Search titles" />
            {status ? (
              <p role="status" className="px-5 pt-1 pb-2 text-sm text-muted-foreground">
                {status}
              </p>
            ) : null}
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandList
              className={cn("transition-opacity duration-150", pending && results.length > 0 && "opacity-60")}
            >
              {(group: PaletteGroup) => (
                <CommandGroup key={group.value} items={group.items}>
                  <CommandGroupLabel>{group.value}</CommandGroupLabel>
                  <CommandCollection>
                    {(item: PaletteItem) => (
                      <CommandItem key={item.id} value={item} className="gap-3" onClick={() => go(item.href)}>
                        <PaletteItemContent item={item} />
                      </CommandItem>
                    )}
                  </CommandCollection>
                </CommandGroup>
              )}
            </CommandList>
            <CommandFooter>
              <span className="flex items-center gap-1.5">
                <KbdGroup>
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                </KbdGroup>
                to navigate
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>↵</Kbd>
                to open
                <Kbd className="ms-2">Esc</Kbd>
                to close
              </span>
            </CommandFooter>
          </Command>
        </CommandDialogPopup>
      </CommandDialog>
    </>
  );
}

function PaletteItemContent({ item }: { item: PaletteItem }) {
  if (item.kind === "title") {
    const { content } = item;
    const year = formatYear(content.releaseDate);
    return (
      <>
        <Poster content={content} sizes="32px" className="w-8 shrink-0 rounded-sm ring-1 ring-foreground/8" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{content.title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {[year, content.contentType === "MOVIE" ? "Film" : "Series"].filter(Boolean).join(" · ")}
          </span>
        </span>
      </>
    );
  }
  return (
    <>
      <HugeiconsIcon
        icon={item.kind === "link" ? item.icon : Search01Icon}
        strokeWidth={2}
        className="size-4 shrink-0 text-muted-foreground"
      />
      <span className="truncate">{item.label}</span>
    </>
  );
}
