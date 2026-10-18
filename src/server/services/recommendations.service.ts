/**
 * Recommendations: the personalised Home page and the pipeline behind it.
 *
 * Tables owned: recommendation (PK (profile_id, content_id)). Reads interaction_score (view),
 * content_similarity (materialized view), watch_history, rating, my_list, profile_genre_preference,
 * content, content_genre, genre, content_credit, person, episode, season.
 *
 * Exported functions:
 *   getHomeFeed(profile)                          → HomeFeed            GET /api/profiles/:profileId/home
 *   shouldRefreshRecommendations(profileId)       → boolean             refresh policy (used by getHomeFeed)
 *   computeInteractionScores(profileId)           → InteractionScores   stage 1
 *   generateCandidates(profileId, scores)         → Candidate[]         stage 2
 *   rankCandidates(candidates, profile)           → RankedCandidate[]   stage 3
 *   buildHomeRows(ranked, profile, scores)        → HomeBuild           stage 4
 *   storeRecommendations(profileId, ranked, rows) → void                stage 5
 *   refreshContentSimilarity()                    → void                nightly job
 *
 * ─── The recommendation pipeline ────────────────────────────────────────────────────────
 * Four stages, each a query (or view) over the activity tables, so they can be built and
 * checked one at a time, plus a fifth that stores the result. Weights live in one place
 * (a const object in this file) so they're easy to tune.
 *
 * Stage 1 — Signals: one interaction score per (profile, content), summed over
 *   rating              (stars − 3) × 2   → 5★ = +4 … 1★ = −4
 *   watch_history       aggregate per title first (a series has a row per episode):
 *                         max(progress_percent) >= 90 (completed)    +3
 *                         else best progress >= 50%                  +1.5
 *                         else best progress < 10% (abandoned)       −0.5
 *   my_list             in the list                                  +1
 *   → a UNION ALL of the three sources, then GROUP BY profile_id, content_id with SUM(weight)
 *     (the interaction_score view in docs/schema/SCHEMA.md). Onboarding genres aren't title signals: they
 *     enter in stage 2a.
 *
 * Stage 2 — Candidate generation (every score normalised to 0–1 by dividing by the max):
 *   a. Genre affinity: spread each title's score evenly over its genres (score ÷ #genres),
 *      plus +2 per genre picked in profile_genre_preference. A candidate's genre score is
 *      (max + mean) of its genres' affinities ÷ 2.
 *   b. People affinity: the same spread over the title's content_credit rows — top-5 billed
 *      actors (role = 'ACTOR', credit_order < 5: ×1 for the first three, ×0.6 after) and
 *      directors (role = 'DIRECTOR', ×1.5). A candidate's people score is its strongest shared
 *      person + 0.25 × the next two, capped at 1.
 *   c. Item-item kNN: represent each title as a vector of every *other* profile's scores and
 *      take cosine similarity between titles (a self-join of the stage-1 result on content_id),
 *      shrunk by common / (common + 2). A candidate's kNN score is the similarity-weighted
 *      average over the titles this profile scored positively. The pairwise similarities live in
 *      the materialized view content_similarity (content_a, content_b, score), refreshed on a
 *      schedule rather than recomputed per request.
 *   d. Popularity prior, from our own viewing only: viewers = COUNT(DISTINCT profile_id) FROM
 *      watch_history WHERE watched_at > now() − 30 days, per content_id; prior = ln(1 + viewers),
 *      min-max normalised to 0–1 over the catalogue (a title nobody watched → 0).
 *   Cold start: a profile whose only signal is profile_genre_preference has no stage-1 rows, so
 *   b and c are 0; the candidates are the titles in its picked genres, ranked by the prior.
 *
 * Stage 3 — Ranking:
 *   affinity = 0.6 × genre + 0.4 × people
 *   score    = 0.5 × affinity + 0.3 × kNN + 0.2 × popularityPrior; ties break on release_date DESC.
 *   Filters: only titles the profile's maturity level allows (KIDS < TEEN < ADULT), drop titles
 *   already finished (a completed movie, or a series whose every episode is completed), and drop
 *   titles whose recommendation.rec_status is DISMISSED (the feedback loop).
 *   "match" (the "93% fit" chip) = round(55 + 44 × min(1, score ÷ best score)).
 *
 * Stage 4 — Rows, in this order (rows with no items are omitted; 18 items per row):
 *   continue-watching  latest watch_history row per title with 1–89% progress, newest first.
 *                      reason "Pick up where you left off."
 *   top-picks          ranked candidates the profile hasn't watched or rated.
 *                      reason "Ranked from the genres and people you watch, what similar viewers
 *                      enjoyed, and what's popular." Cold start (only onboarding genres): the picked
 *                      genres' titles by popularity prior, reason "Popular in the genres you picked —
 *                      rate a few to personalise this row."; with no genre picks either, every title
 *                      by popularity prior, reason "Popular titles to get you started — rate a few to
 *                      personalise this row."
 *   because-you-liked  for the 2 strongest anchors (score ≥ 3, most recent first), unseen titles by
 *                      0.65 × kNN similarity + 0.35 × content similarity (see /api/content/:id/similar).
 *                      reason "Viewers who enjoyed X also watched these." when most items came from
 *                      kNN, else "Shares genres and people with X." The anchor is returned as
 *                      HomeRow.anchor { contentId, title }; it is built at request time from
 *                      content_similarity and never stored.
 *   trending           most distinct viewers in watch_history over the last 7 days, then
 *                      release_date DESC; the same for everyone at this maturity level.
 *                      reason "The most-watched titles on Reelhouse right now."
 *   top-rated-genre    strongest genre, sorted by a Bayesian average over our own rating rows:
 *                      (v/(v+m))·R + (m/(v+m))·C, v = the title's rating count, R its average,
 *                      C the average over all ratings, m = 5; then release_date DESC.
 *                      reason "<Genre> is your strongest genre — sorted by audience rating." or, with only
 *                      onboarding picks, "You picked <Genre> during setup — here are its best-reviewed titles."
 *   more-with-person   the strongest person with ≥ 3 titles of which ≥ 2 are unseen ("From <director>" /
 *                      "More with <actor>"). reason "You've enjoyed N titles featuring/by <name>."
 *   genre-picks        the 2nd and 3rd strongest genres, ranked by score.
 *                      reason "You picked <Genre> during setup." or "You watch a lot of <Genre>."
 *   hero               the first top pick. reason "Our top pick for <name> tonight", or
 *                      "Popular on Reelhouse" when the profile has no signals yet.
 *   Reasons are computed here from the row kind plus context (genre name, person name, anchor
 *   title) — there is no recommendation.reason column, so they can't go stale.
 *
 * Stage 5 — Store (storeRecommendations) and the refresh policy (shouldRefreshRecommendations).
 *   The player and title page move rec_status SHOWN → CLICKED → WATCHED, or DISMISSED; stage 3
 *   drops DISMISSED titles — the feedback loop (see activity.service recordProgress).
 */
import "server-only";

import { getMockDb, toHistoryItem, toSummary } from "@/server/mocks/db";
import { isCompleted } from "@/lib/content/progress";
import type { Candidate, HomeBuild, HomeFeed, HomeRow, InteractionScores, Profile, RankedCandidate } from "@/types";

/** Items per row. */
export const ROW_SIZE = 18;

/** The tunable numbers of the pipeline, in one place (see the stage descriptions above). */
export const WEIGHTS = {
  rating: { centre: 3, scale: 2 },
  watch: { completed: 3, half: 1.5, abandoned: -0.5 },
  myList: 1,
  genrePick: 2,
  blend: { genre: 0.6, people: 0.4, affinity: 0.5, knn: 0.3, prior: 0.2 },
  match: { floor: 55, span: 44 },
} as const;

/** Row reasons, built from the row kind plus context. Single source for buildHomeRows and the mock. */
const REASONS = {
  continueWatching: "Pick up where you left off.",
  topPicks: "Ranked from the genres and people you watch, what similar viewers enjoyed, and what's popular.",
  topPicksPickedGenres: "Popular in the genres you picked — rate a few to personalise this row.",
  topPicksNoSignals: "Popular titles to get you started — rate a few to personalise this row.",
  becauseKnn: (anchor: string) => `Viewers who enjoyed ${anchor} also watched these.`,
  becauseSimilar: (anchor: string) => `Shares genres and people with ${anchor}.`,
  trending: "The most-watched titles on Reelhouse right now.",
  topRatedStrongest: (genre: string) => `${genre} is your strongest genre — sorted by audience rating.`,
  topRatedPicked: (genre: string) => `You picked ${genre} during setup — here are its best-reviewed titles.`,
  morePerson: (count: number, name: string, role: "ACTOR" | "DIRECTOR") =>
    `You've enjoyed ${count} titles ${role === "DIRECTOR" ? "by" : "featuring"} ${name}.`,
  genrePicked: (genre: string) => `You picked ${genre} during setup.`,
  genreWatched: (genre: string) => `You watch a lot of ${genre}.`,
  heroPick: (name: string) => `Our top pick for ${name} tonight`,
  heroPopular: "Popular on Reelhouse",
};

/**
 * The orchestrator: the Home page for one profile (hero + shelves).
 *
 * Steps:
 *   1. shouldRefreshRecommendations(profileId). If false, serve the stored rows: read
 *      `recommendation` (rec_status <> 'DISMISSED') ordered by relevance_score, regroup by row_type,
 *      and run stage 4 again over them (reasons and the because-you-liked row are computed per
 *      request). Skip to 7.
 *   2. computeInteractionScores(profileId)                  — stage 1.
 *   3. generateCandidates(profileId, scores)                — stage 2.
 *   4. rankCandidates(candidates, profile)                  — stage 3.
 *   5. buildHomeRows(ranked, profile, scores)               — stage 4.
 *   6. storeRecommendations(profileId, ranked, rows)        — stage 5.
 *   7. Return { profileId, hero, rows, generatedAt } (generatedAt = the newest recommendation.generated_at,
 *      or now() right after a refresh).
 * SQL: see the stage functions; the stored read in step 1 is
 *   SELECT r.content_id, r.row_type, r.relevance_score, r.generated_at
 *     FROM recommendation AS r
 *    WHERE r.profile_id = $1 AND r.rec_status <> 'DISMISSED'
 *    ORDER BY r.relevance_score DESC;                       -- recommendation_rank_idx
 * Tables: recommendation (+ everything the stages read)  ·  Keys/constraints relied on: PK (profile_id,
 *   content_id), recommendation_rank_idx
 * Transaction: no for the reads; storeRecommendations opens its own  ·  Idempotent: yes (same
 *   activity → same feed; only generated_at moves)
 * Edge cases: a profile with no signals and no picked genres still gets the popularity-ranked
 *   fallback (cold start); a failed store must not fail the request — log and still return the feed.
 * Throws: nothing of its own (the route has already 404'd an unknown profile).
 * Called by: GET /api/profiles/:profileId/home (and the Home page via src/lib/api/server.ts getHome)
 * Mock today: no pipeline. Fixed slices of the catalogue (18 each: top-picks 0, top-rated-genre 18,
 *   because-you-liked 36, trending 300, genre-picks 318), continue-watching from the profile's
 *   history filtered with !isCompleted, because-you-liked anchored on history[0] (only when the
 *   profile has history), genres[0]/genres[1] as the top-rated/genre-picks genres, hero = the first
 *   catalogue title, generatedAt = now.
 */
export async function getHomeFeed(profile: Profile): Promise<HomeFeed> {
  // TODO: implement — until then the shelves are fixed slices of the catalogue.
  const { contents, watchHistory, genres } = getMockDb();
  const slice = (start: number) =>
    contents.slice(start, start + ROW_SIZE).map((content) => ({ content: toSummary(content) }));

  const history = watchHistory.filter((row) => row.profileId === profile.profileId).map(toHistoryItem);
  const rows: HomeRow[] = [
    {
      id: "continue-watching",
      kind: "continue-watching",
      title: `Continue watching for ${profile.name}`,
      reason: REASONS.continueWatching,
      items: history
        .filter((item) => !isCompleted(item.progressPercent))
        .map((item) => ({
          content: item.content,
          progress: { progressPercent: item.progressPercent, episode: item.episode },
        })),
    },
    {
      id: "top-picks",
      kind: "top-picks",
      title: `Top picks for ${profile.name}`,
      reason: REASONS.topPicks,
      items: slice(0),
    },
  ];
  if (history[0]) {
    rows.push({
      id: "because-you-liked",
      kind: "because-you-liked",
      title: `Because you liked ${history[0].content.title}`,
      reason: REASONS.becauseSimilar(history[0].content.title),
      anchor: { contentId: history[0].content.contentId, title: history[0].content.title },
      items: slice(36),
    });
  }
  rows.push(
    {
      id: "trending",
      kind: "trending",
      title: "Trending now",
      reason: REASONS.trending,
      items: slice(300),
    },
    {
      id: "top-rated-genre",
      kind: "top-rated-genre",
      title: `Top rated in ${genres[0].name}`,
      reason: REASONS.topRatedStrongest(genres[0].name),
      items: slice(18),
    },
    {
      id: "genre-picks",
      kind: "genre-picks",
      title: `${genres[1].name} for you`,
      reason: REASONS.genreWatched(genres[1].name),
      items: slice(318),
    },
  );

  return {
    profileId: profile.profileId,
    hero: { content: toSummary(contents[0]), reason: REASONS.heroPick(profile.name) },
    rows,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * The refresh policy: should Home rerun the pipeline, or serve the stored recommendations?
 *
 * The open decision (docs/schema/SCHEMA.md "Still open") is when `recommendation` is regenerated: after
 * every activity write, on Home load once it is older than N minutes, or nightly. Recommended
 * default (chosen here): regenerate on Home load when the newest generated_at is older than
 * 15 minutes OR older than the profile's latest activity. That keeps Home fresh right after a
 * rating/watch/My List change without recomputing on every request or on every 10-second progress
 * ping, and needs no background worker. content_similarity is refreshed separately and nightly
 * (refreshContentSimilarity).
 *
 * Steps:
 *   1. Newest generated_at for the profile; none stored → true.
 *   2. Latest activity time = greatest(max(watch_history.watched_at), max(rating.rated_at),
 *      max(my_list.added_at), profile.onboarded_at).
 *   3. true when now() − generated_at > 15 minutes or generated_at < latest activity.
 * SQL:
 *   SELECT (SELECT max(generated_at) FROM recommendation WHERE profile_id = $1) AS generated_at,
 *          greatest(
 *            (SELECT max(watched_at) FROM watch_history WHERE profile_id = $1),
 *            (SELECT max(rated_at)   FROM rating        WHERE profile_id = $1),
 *            (SELECT max(added_at)   FROM my_list       WHERE profile_id = $1),
 *            (SELECT onboarded_at    FROM profile       WHERE profile_id = $1)
 *          ) AS latest_activity;
 * Tables: recommendation, watch_history, rating, my_list, profile  ·  Keys/constraints relied on:
 *   recommendation_rank_idx / PK, watch_history_recent_idx, rating and my_list PKs
 * Transaction: no  ·  Idempotent: yes (read)
 * Edge cases: removing history/rating/My List rows lowers max(...) and doesn't trigger a refresh by
 *   itself — the 15-minute limit catches it. Progress pings on an unfinished title move
 *   watched_at every 10 seconds, so a profile mid-binge reruns the pipeline on each Home load;
 *   if that proves too costly, drop the "older than latest activity" rule for watch_history and
 *   keep it for ratings/My List/onboarding only.
 * Throws: nothing.
 * Called by: getHomeFeed
 * Mock today: returns false (there is nothing stored).
 */
export async function shouldRefreshRecommendations(profileId: number): Promise<boolean> {
  // TODO: implement
  void profileId;
  return false;
}

/**
 * Stage 1 — signals: one interaction score per title this profile touched.
 *
 * Steps:
 *   1. Read the interaction_score view for the profile (weights in WEIGHTS):
 *        rating (value − 3) × 2; watch_history aggregated per title: max(progress_percent) >= 90 +3,
 *        else >= 50 +1.5, else < 10 −0.5, else 0; my_list +1; summed per (profile, content).
 *   2. Return contentId → score. Onboarding genres are not title signals (they enter in stage 2a).
 * SQL:
 *   SELECT content_id, score FROM interaction_score WHERE profile_id = $1;
 *   -- the view (docs/schema/SCHEMA.md):
 *   --   SELECT profile_id, content_id, SUM(weight) AS score FROM (
 *   --     SELECT profile_id, content_id, (value - 3) * 2.0 FROM rating
 *   --     UNION ALL
 *   --     SELECT profile_id, content_id,
 *   --            CASE WHEN max(progress_percent) >= 90 THEN 3.0 WHEN max(progress_percent) >= 50 THEN 1.5
 *   --                 WHEN max(progress_percent) < 10 THEN -0.5 ELSE 0 END
 *   --       FROM watch_history GROUP BY profile_id, content_id
 *   --     UNION ALL
 *   --     SELECT profile_id, content_id, 1.0 FROM my_list
 *   --   ) AS signals GROUP BY profile_id, content_id;
 * Tables: interaction_score (view over rating, watch_history, my_list)  ·  Keys/constraints relied on:
 *   rating_content_idx, watch_history_recent_idx, PKs of rating and my_list
 * Transaction: no  ·  Idempotent: yes (read; the view is always fresh)
 * Edge cases: a new profile → empty map (cold start). The kNN step needs every other profile's
 *   scores too: that is the same view without the profile filter, consumed by content_similarity.
 * Throws: nothing.
 * Called by: getHomeFeed
 * Mock today: returns an empty map (getHomeFeed does not call it).
 */
export async function computeInteractionScores(profileId: number): Promise<InteractionScores> {
  // TODO: implement
  void profileId;
  return new Map();
}

/**
 * Stage 2 — candidate generation: for each candidate title its four 0–1 parts.
 *
 * Steps (each part normalised to 0–1 by dividing by its max; negatives clamp to 0):
 *   a. Genre affinity: spread each scored title's score over its genres (score ÷ #genres), add +2
 *      per genre in profile_genre_preference, sum per genre; a candidate's genreAffinity is
 *      (max + mean) of its genres' affinities ÷ 2.
 *   b. People affinity: the same spread over the title's content_credit rows — top-5 billed actors
 *      (credit_order < 5: ×1 for the first three, ×0.6 after) and directors (×1.5); a candidate's
 *      peopleAffinity is its strongest shared person + 0.25 × the next two, capped at 1.
 *   c. Item kNN: for every candidate, the similarity-weighted average over the titles this profile
 *      scored positively, using content_similarity (refreshed on a schedule, not per request).
 *   d. Popularity prior: ln(1 + distinct viewers in the last 30 days), min-max normalised over the
 *      catalogue (0 for a title nobody watched).
 *   Cold start (scores is empty): the candidates are the titles in the picked genres, with
 *   genreAffinity from the picks only, peopleAffinity = itemKnn = 0, so the prior orders them; with
 *   no picks either, every title.
 * SQL:
 *   -- a. genre affinity (then divide by max, in the app)
 *   WITH n AS (SELECT content_id, COUNT(*) AS cnt FROM content_genre GROUP BY content_id),
 *        spread AS (
 *          SELECT cg.genre_id, SUM(s.score / n.cnt) AS a
 *            FROM interaction_score AS s
 *            JOIN content_genre AS cg ON cg.content_id = s.content_id
 *            JOIN n ON n.content_id = s.content_id
 *           WHERE s.profile_id = $1 GROUP BY cg.genre_id
 *          UNION ALL
 *          SELECT genre_id, 2.0 FROM profile_genre_preference WHERE profile_id = $1
 *        )
 *   SELECT genre_id, SUM(a) AS affinity FROM spread GROUP BY genre_id;
 *   -- b. people affinity (credits counted: ACTOR with credit_order < 5, and DIRECTOR)
 *   WITH credits AS (
 *          SELECT content_id, person_id, role, credit_order FROM content_credit
 *           WHERE role = 'DIRECTOR' OR (role = 'ACTOR' AND credit_order < 5)),
 *        n AS (SELECT content_id, COUNT(*) AS cnt FROM credits GROUP BY content_id)
 *   SELECT cr.person_id,
 *          SUM(s.score / n.cnt * CASE WHEN cr.role = 'DIRECTOR' THEN 1.5
 *                                     WHEN cr.credit_order < 3 THEN 1.0 ELSE 0.6 END) AS affinity
 *     FROM interaction_score AS s
 *     JOIN credits AS cr ON cr.content_id = s.content_id
 *     JOIN n ON n.content_id = s.content_id
 *    WHERE s.profile_id = $1 GROUP BY cr.person_id;
 *   -- c. item kNN (then divide by max)
 *   SELECT cs.content_b AS content_id, SUM(cs.score * s.score) / NULLIF(SUM(cs.score), 0) AS knn
 *     FROM interaction_score AS s
 *     JOIN content_similarity AS cs ON cs.content_a = s.content_id
 *    WHERE s.profile_id = $1 AND s.score > 0
 *    GROUP BY cs.content_b;
 *   -- d. popularity prior (docs/schema/SCHEMA.md "Ranking")
 *   WITH viewers AS (
 *     SELECT c.content_id, ln(1 + COUNT(DISTINCT w.profile_id)) AS v
 *       FROM content AS c
 *       LEFT JOIN watch_history AS w
 *              ON w.content_id = c.content_id AND w.watched_at > now() - interval '30 days'
 *      GROUP BY c.content_id)
 *   SELECT content_id,
 *          COALESCE((v - MIN(v) OVER ()) / NULLIF(MAX(v) OVER () - MIN(v) OVER (), 0), 0) AS popularity_prior
 *     FROM viewers;
 * Tables: interaction_score, content_genre, profile_genre_preference, content_credit, content_similarity,
 *   watch_history, content  ·  Keys/constraints relied on: content_genre_genre_idx, content_credit_person_idx,
 *   content_similarity_pair_key, watch_history_recent_idx
 * Transaction: no  ·  Idempotent: yes (read)
 * Edge cases: a title in no genre gets genreAffinity 0; fewer than three credits is fine (the
 *   "next two" are simply missing); an empty content_similarity (not refreshed yet) gives itemKnn 0
 *   everywhere and the blend degrades gracefully; the genre/person tables are also what
 *   buildHomeRows reads for "strongest genre/person" — return or recompute them as needed.
 * Throws: nothing.
 * Called by: getHomeFeed
 * Mock today: returns an empty array (getHomeFeed does not call it).
 */
export async function generateCandidates(profileId: number, scores: InteractionScores): Promise<Candidate[]> {
  // TODO: implement
  void profileId;
  void scores;
  return [];
}

/**
 * Stage 3 — ranking: blend the four parts into one score, filter, sort.
 *
 * Steps:
 *   1. affinity = 0.6 × genreAffinity + 0.4 × peopleAffinity;
 *      score = 0.5 × affinity + 0.3 × itemKnn + 0.2 × popularityPrior (WEIGHTS.blend).
 *   2. Filter: maturity_of(content.age_rating) <= profile.maturityLevel (KIDS < TEEN < ADULT); drop
 *      finished titles (a completed movie, or a series whose every episode has progress >= 90);
 *      drop titles with recommendation.rec_status = 'DISMISSED' (feedback loop).
 *   3. Sort by score DESC, ties by content.release_date DESC.
 *   4. match = round(55 + 44 × min(1, score ÷ best score)); a best score of 0 → 55.
 * SQL (the filters, applied to the candidate ids):
 *   SELECT c.content_id, c.release_date
 *     FROM content AS c
 *    WHERE c.content_id IN ($ids...)          -- one placeholder per candidate id
 *      AND maturity_of(c.age_rating) <= $maturity::maturity_level
 *      AND NOT (c.content_type = 'MOVIE' AND EXISTS (
 *            SELECT 1 FROM watch_history AS w
 *             WHERE w.profile_id = $1 AND w.content_id = c.content_id AND w.progress_percent >= 90))
 *      AND NOT (c.content_type = 'SERIES'
 *               AND EXISTS (SELECT 1 FROM season AS s JOIN episode AS e ON e.season_id = s.season_id
 *                            WHERE s.content_id = c.content_id)
 *               AND NOT EXISTS (
 *                 SELECT 1 FROM season AS s JOIN episode AS e ON e.season_id = s.season_id
 *                  WHERE s.content_id = c.content_id
 *                    AND NOT EXISTS (SELECT 1 FROM watch_history AS w
 *                                     WHERE w.profile_id = $1 AND w.episode_id = e.episode_id
 *                                       AND w.progress_percent >= 90)))
 *      AND NOT EXISTS (SELECT 1 FROM recommendation AS r
 *                       WHERE r.profile_id = $1 AND r.content_id = c.content_id AND r.rec_status = 'DISMISSED');
 * Tables: content, watch_history, season, episode, recommendation  ·  Keys/constraints relied on:
 *   maturity_of(), PK (profile_id, content_id) on recommendation
 * Transaction: no  ·  Idempotent: yes (pure over its inputs plus reads)
 * Edge cases: the scoring itself is arithmetic in the app; only the filters need the database. Empty
 *   input → []. Candidates the profile has already watched or rated are kept here (top-picks drops
 *   them in stage 4; the person/genre rows reuse the ranking).
 * Throws: nothing.
 * Called by: getHomeFeed
 * Mock today: returns an empty array (getHomeFeed does not call it).
 */
export async function rankCandidates(candidates: Candidate[], profile: Profile): Promise<RankedCandidate[]> {
  // TODO: implement
  void candidates;
  void profile;
  return [];
}

/**
 * Stage 4 — slice the ranking into shelves, each with its reason, and pick the hero.
 *
 * Steps (rows in this order; a row with no items is omitted; 18 items per row):
 *   1. continue-watching: latest watch_history row per title with 1–89% progress, newest first →
 *      items carry { progressPercent, episode (+ seasonNumber) }. Title "Continue watching for <name>".
 *   2. top-picks: ranked candidates the profile hasn't watched or rated, each with its `match`.
 *      Title "Top picks for <name>". Cold start: picked genres' titles (or every title) by
 *      popularity prior, with the cold-start reasons.
 *   3. because-you-liked: for the 2 strongest anchors (interaction score >= 3, most recent first),
 *      unseen titles ordered by 0.65 × kNN similarity + 0.35 × content similarity (genre/people
 *      overlap, as in /api/content/:id/similar). Title "Because you liked <anchor>", row.anchor =
 *      { contentId, title }; id "because-you-liked-<anchor contentId>" so the two rows have
 *      distinct ids. Reason "Viewers who enjoyed X also watched these." when most items came from
 *      kNN, else "Shares genres and people with X.".
 *   4. trending: most distinct viewers in the last 7 days, then release_date DESC; same for
 *      everyone at this maturity level. Title "Trending now".
 *   5. top-rated-genre: the strongest genre, ordered by the Bayesian average. Title
 *      "Top rated in <Genre>".
 *   6. more-with-person: the strongest person with >= 3 titles of which >= 2 are unseen. Title
 *      "From <director>" / "More with <actor>".
 *   7. genre-picks: the 2nd and 3rd strongest genres, ranked by score (one row each, id
 *      "genre-picks-<genreId>"). Title "<Genre> for you".
 *   8. hero: the first top pick, reason "Our top pick for <name> tonight", or "Popular on Reelhouse"
 *      when the profile has no signals yet; hero.match = that pick's match.
 *   Reasons: see REASONS in this file; they are the strings listed in the file header, computed from
 *   the row kind plus context (genre name, person name, anchor title).
 * SQL:
 *   -- continue-watching
 *   SELECT * FROM (
 *     SELECT DISTINCT ON (w.content_id) w.*              -- latest row per title first,
 *       FROM watch_history AS w WHERE w.profile_id = $1
 *      ORDER BY w.content_id, w.watched_at DESC
 *   ) AS latest
 *   WHERE progress_percent BETWEEN 1 AND 89              -- then the 1–89% filter
 *   ORDER BY watched_at DESC LIMIT 18;
 *   -- trending (maturity-filtered)
 *   SELECT c.content_id, COUNT(DISTINCT w.profile_id) AS viewers
 *     FROM watch_history AS w JOIN content AS c ON c.content_id = w.content_id
 *    WHERE w.watched_at > now() - interval '7 days' AND maturity_of(c.age_rating) <= $maturity
 *    GROUP BY c.content_id, c.release_date
 *    ORDER BY viewers DESC, c.release_date DESC NULLS LAST LIMIT 18;
 *   -- top-rated-genre ($genre = the strongest genre)
 *   WITH stats AS (SELECT content_id, COUNT(*) AS v, AVG(value) AS r FROM rating GROUP BY content_id),
 *        overall AS (SELECT AVG(value) AS c FROM rating)
 *   SELECT s.content_id, (s.v / (s.v + 5.0)) * s.r + (5.0 / (s.v + 5.0)) * o.c AS bayes
 *     FROM stats AS s CROSS JOIN overall AS o
 *     JOIN content AS c ON c.content_id = s.content_id
 *     JOIN content_genre AS cg ON cg.content_id = c.content_id AND cg.genre_id = $genre
 *    WHERE maturity_of(c.age_rating) <= $maturity
 *    ORDER BY bayes DESC, c.release_date DESC NULLS LAST LIMIT 18;
 *   -- because-you-liked: kNN part for anchor $a (the content part is catalog.service getSimilarTitles)
 *   SELECT content_b AS content_id, score FROM content_similarity
 *    WHERE content_a = $a ORDER BY score DESC;
 * Tables: watch_history, rating, content, content_genre, genre, content_credit, person,
 *   content_similarity, interaction_score  ·  Keys/constraints relied on: watch_history_recent_idx,
 *   rating_content_idx, content_similarity_pair_key, maturity_of()
 * Transaction: no  ·  Idempotent: yes (read)
 * Edge cases: "unseen" = no watch_history row and no rating for the profile; rows with no items are
 *   dropped (a new profile has no continue-watching or because-you-liked); "strongest" genre/person
 *   = highest stage-2 affinity; with only onboarding picks the top-rated reason is the "You picked …"
 *   one and genre-picks says "You picked <Genre> during setup.", otherwise "You watch a lot of <Genre>.";
 *   `scores` is the stage-1 map (anchors need score >= 3).
 * Throws: nothing.
 * Called by: getHomeFeed
 * Mock today: returns { hero: null, rows: [] } (getHomeFeed builds its fixed slices itself).
 */
export async function buildHomeRows(
  ranked: RankedCandidate[],
  profile: Profile,
  scores: InteractionScores,
): Promise<HomeBuild> {
  // TODO: implement
  void ranked;
  void profile;
  void scores;
  return { hero: null, rows: [] };
}

/**
 * Stage 5 — persist the ranked picks in `recommendation` and drop the stale ones.
 *
 * What is stored: the titles shown in the personalised shelves (top-picks, more-with-person,
 * top-rated-genre, genre-picks). continue-watching, trending and because-you-liked are not stored
 * (the last is rebuilt from content_similarity per request, anchor included). A title in several
 * shelves is stored once, under the first of them in row order. relevance_score = the candidate's
 * blended score.
 *
 * Steps (one transaction):
 *   1. Upsert each picked title: row_type, relevance_score, generated_at = now(). rec_status is
 *      NOT in the DO UPDATE list, so it survives a refresh: DISMISSED stays DISMISSED (stage 3 keeps
 *      it out), CLICKED/WATCHED keep their history. Policy choice: a title re-ranked after the
 *      profile ignored it stays SHOWN; if the team wants "re-shown" to reset CLICKED → SHOWN, add
 *      `rec_status = CASE WHEN recommendation.rec_status = 'CLICKED' THEN 'SHOWN' ELSE recommendation.rec_status END`.
 *   2. Delete the rows this refresh no longer ranks (not DISMISSED, which must persist).
 * SQL:
 *   INSERT INTO recommendation (profile_id, content_id, row_type, relevance_score, generated_at)
 *   VALUES ($1, $2, $3, $4, now()), …
 *   ON CONFLICT (profile_id, content_id)
 *   DO UPDATE SET row_type = EXCLUDED.row_type,
 *                 relevance_score = EXCLUDED.relevance_score,
 *                 generated_at = now();                         -- rec_status deliberately left alone
 *   DELETE FROM recommendation
 *    WHERE profile_id = $1 AND generated_at < $refreshStartedAt AND rec_status <> 'DISMISSED';
 * Tables: recommendation  ·  Keys/constraints relied on: PK (profile_id, content_id),
 *   recommendation_rank_idx, FKs to profile and content (ON DELETE CASCADE)
 * Transaction: yes (db.transaction)  ·  Idempotent: yes (ON CONFLICT upsert; reruns only move generated_at)
 * Edge cases: empty `ranked` and `rows` → only the delete runs (a profile whose picks all vanished);
 *   no reason / source_content_id columns exist (computed, see the file header).
 * Throws: nothing of its own.
 * Called by: getHomeFeed
 * Mock today: does nothing (persists nothing).
 */
export async function storeRecommendations(
  profileId: number,
  ranked: RankedCandidate[],
  rows: HomeRow[],
): Promise<void> {
  // TODO: implement
  void profileId;
  void ranked;
  void rows;
}

/**
 * Refreshes content_similarity (the item-item kNN). Run nightly by a scheduled job, not per request.
 *
 * Steps:
 *   1. REFRESH MATERIALIZED VIEW CONCURRENTLY — readers keep using the old data meanwhile (needs
 *      the unique index content_similarity_pair_key).
 * SQL:
 *   REFRESH MATERIALIZED VIEW CONCURRENTLY content_similarity;
 * Tables: content_similarity (built from interaction_score)  ·  Keys/constraints relied on:
 *   content_similarity_pair_key (a CONCURRENTLY refresh requires a unique index)
 * Transaction: no (the statement is atomic but cannot run inside a transaction block)  ·
 *   Idempotent: yes
 * Edge cases: a first-ever refresh with CONCURRENTLY needs the view populated once without it
 *   (`REFRESH MATERIALIZED VIEW content_similarity;`), done by the seed.
 * Throws: nothing of its own.
 * Called by: nothing yet — the nightly cron endpoint/job (scheduling is part of the open
 *   refresh-policy decision).
 * Mock today: does nothing.
 */
export async function refreshContentSimilarity(): Promise<void> {
  // TODO: implement
}
