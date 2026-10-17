/** Activity steps: watch_history, my_list, rating (titles resolved via {contentType, tmdbId}). */
import { myList, rating, watchHistory } from "../schema";
import { titleKey } from "./catalog";
import type { SeedData, TitleRef } from "./data";
import { chunks, fail, logCount, lookup, note, toDate, type Tx } from "./util";

interface Maps {
  profileById: Map<number, number>;
  contentByKey: Map<string, number>;
  episodeByKey: Map<string, number>;
}

function resolveContent(m: Maps, ref: TitleRef, where: string) {
  return lookup(
    m.contentByKey,
    titleKey(ref.contentType, ref.tmdbId),
    `title ${ref.contentType}:${ref.tmdbId} in ${where}`,
  );
}

export async function seedActivity(tx: Tx, data: SeedData, m: Maps) {
  // watch_history: unique (profile, content, episode) - keep the most recent.
  const wh = new Map<string, typeof watchHistory.$inferInsert>();
  for (const w of data.watchHistory) {
    const contentId = resolveContent(m, w, "watch-history");
    const profileId = lookup(m.profileById, w.profileId, "watch-history profileId");
    let episodeId: number | null = null;
    if (w.contentType === "SERIES") {
      if (w.seasonNumber == null || w.episodeNumber == null) {
        fail(`watch-history SERIES:${w.tmdbId} missing seasonNumber/episodeNumber`);
      }
      episodeId = lookup(
        m.episodeByKey,
        `${contentId}:${w.seasonNumber}:${w.episodeNumber}`,
        `episode S${w.seasonNumber}E${w.episodeNumber} of SERIES:${w.tmdbId} in watch-history`,
      );
    }
    const row = { profileId, contentId, episodeId, watchedAt: toDate(w.watchedAt), progressPercent: w.progressPercent };
    const k = `${profileId}:${contentId}:${episodeId}`;
    const prev = wh.get(k);
    if (!prev || prev.watchedAt! < row.watchedAt) wh.set(k, row);
  }
  const whRows = [...wh.values()].sort((a, b) => a.watchedAt!.getTime() - b.watchedAt!.getTime());
  for (const batch of chunks(whRows)) await tx.insert(watchHistory).values(batch);
  logCount("watch_history", whRows.length);
  if (whRows.length !== data.watchHistory.length) {
    note(`watch_history: ${data.watchHistory.length - whRows.length} duplicate rows merged`);
  }

  const list = new Map<string, typeof myList.$inferInsert>();
  for (const l of data.myList) {
    const profileId = lookup(m.profileById, l.profileId, "my-list profileId");
    const contentId = resolveContent(m, l, "my-list");
    list.set(`${profileId}:${contentId}`, { profileId, contentId, addedAt: toDate(l.addedAt) });
  }
  if (list.size) await tx.insert(myList).values([...list.values()]);
  logCount("my_list", list.size);

  const rate = new Map<string, typeof rating.$inferInsert>();
  for (const r of data.ratings) {
    const profileId = lookup(m.profileById, r.profileId, "ratings profileId");
    const contentId = resolveContent(m, r, "ratings");
    rate.set(`${profileId}:${contentId}`, { profileId, contentId, value: r.value, ratedAt: toDate(r.ratedAt) });
  }
  if (rate.size) await tx.insert(rating).values([...rate.values()]);
  logCount("rating", rate.size);
}
