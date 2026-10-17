/** Groups watch history into days for the History page (computed on the server). */
import { formatRelative } from "@/lib/format";
import type { HistoryItem } from "@/types";

export interface HistoryEntry extends HistoryItem {
  /** "2 hours ago" */
  watchedLabel: string;
}

export interface HistoryGroup {
  /** YYYY-MM-DD */
  day: string;
  /** "Today", "Yesterday", or "Monday, 12 October" */
  label: string;
  entries: HistoryEntry[];
}

const dayKey = (date: Date) => date.toLocaleDateString("en-CA"); // YYYY-MM-DD, local time

function dayLabel(date: Date, now: Date): string {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(now)) return "Today";
  if (dayKey(date) === dayKey(yesterday)) return "Yesterday";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(date);
}

/** Expects items newest first (as GET /api/profiles/:profileId/history returns them). */
export function groupHistoryByDay(items: HistoryItem[], now: Date = new Date()): HistoryGroup[] {
  const groups: HistoryGroup[] = [];
  for (const item of items) {
    const watchedAt = new Date(item.watchedAt);
    const day = dayKey(watchedAt);
    let group = groups.at(-1);
    if (group?.day !== day) {
      group = { day, label: dayLabel(watchedAt, now), entries: [] };
      groups.push(group);
    }
    group.entries.push({ ...item, watchedLabel: formatRelative(item.watchedAt, now) });
  }
  return groups;
}
