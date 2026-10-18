WITH
  watched AS (
    SELECT content_id, profile_id, MAX(progress_percent) AS progress
    FROM watch_history
    WHERE profile_id = 1
    GROUP BY content_id, profile_id
  )
SELECT
  p.profile_id,
  p.name AS profile,
  g.genre_id,
  g.name AS genre,
  SUM(
    CASE
      WHEN w.progress < 10 THEN 0
      WHEN w.progress < 30 THEN 0.25
      WHEN w.progress < 50 THEN 0.50
      WHEN w.progress < 80 THEN 0.75
      ELSE 1.0
    END
  ) AS preference_score
FROM
  watched AS w
  JOIN content_genre AS cg ON cg.content_id = w.content_id
  JOIN genre AS g ON g.genre_id = cg.genre_id
  JOIN profile AS p ON p.profile_id = w.profile_id   -- taste is per profile, not per user
GROUP BY p.profile_id, p.name, g.genre_id, g.name
ORDER BY p.profile_id, preference_score DESC;


-- Genre taste view: every profile's score per genre (filter by profile when reading it).
-- Source of truth: drizzle/0001_genre_taste_view.sql. Copy any change here into a new migration.
CREATE OR REPLACE VIEW genre_taste AS
WITH
  watched AS (                              -- one row per (profile, title): a series has a row per episode
    SELECT profile_id, content_id, MAX(progress_percent) AS progress
    FROM watch_history
    GROUP BY profile_id, content_id
  ),
  genre_points AS (                         -- points per genre, one block per signal
    -- 1. watch history: how far the profile got in each title, given to each of its genres
    SELECT w.profile_id, cg.genre_id, 'watch' AS source,
           CASE
             WHEN w.progress < 10 THEN 0
             WHEN w.progress < 30 THEN 0.25
             WHEN w.progress < 50 THEN 0.50
             WHEN w.progress < 80 THEN 0.75
             ELSE 1.0
           END AS points
    FROM watched AS w
    JOIN content_genre AS cg ON cg.content_id = w.content_id

    UNION ALL
    -- 2. ratings: 5★ +1, 4★ +0.5, 3★ 0, 2★ -0.5, 1★ -1, given to each of the title's genres
    SELECT r.profile_id, cg.genre_id, 'rating', (r.value - 3) / 2.0
    FROM rating AS r
    JOIN content_genre AS cg ON cg.content_id = r.content_id

    UNION ALL
    -- 3. My List: +0.5 for each saved title, given to each of its genres
    SELECT m.profile_id, cg.genre_id, 'my_list', 0.5
    FROM my_list AS m
    JOIN content_genre AS cg ON cg.content_id = m.content_id

    UNION ALL
    -- 4. onboarding picks: +1 to the picked genre (already a genre, so no join)
    SELECT profile_id, genre_id, 'pick', 1.0
    FROM profile_genre_preference
  )
SELECT
  gp.profile_id,
  g.genre_id,
  g.name AS genre,
  ROUND(COALESCE(SUM(gp.points) FILTER (WHERE gp.source = 'watch'),   0), 2) AS watch_score,
  ROUND(COALESCE(SUM(gp.points) FILTER (WHERE gp.source = 'rating'),  0), 2) AS rating_score,
  ROUND(COALESCE(SUM(gp.points) FILTER (WHERE gp.source = 'my_list'), 0), 2) AS my_list_score,
  ROUND(COALESCE(SUM(gp.points) FILTER (WHERE gp.source = 'pick'),    0), 2) AS pick_score,
  ROUND(SUM(gp.points), 2) AS taste_score   -- the total: what ranking uses
FROM genre_points AS gp
JOIN genre AS g ON g.genre_id = gp.genre_id
GROUP BY gp.profile_id, g.genre_id, g.name
HAVING SUM(gp.points) > 0;                  -- genres the profile dislikes or never touched drop out


-- Read one profile from the view:
SELECT genre, watch_score, rating_score, my_list_score, pick_score, taste_score
FROM genre_taste
WHERE profile_id = 1
ORDER BY taste_score DESC;


-- Top picks: titles the profile hasn't watched, rated or saved, scored from its genre taste.
-- score = SUM(taste of the title's genres) / SQRT(number of genres it has)
--   SUM alone: a title wins just by having many genres (6-genre series beat everything).
--   AVG alone: extra genres you like don't help (Drama-only beats Drama + Sci-Fi).
--   ÷ √n: every liked genre still adds to the score, but each extra one adds less.
SELECT
  c.content_id,
  c.title,
  ROUND(SUM(COALESCE(t.taste_score, 0)) / SQRT(COUNT(*)::numeric), 2) AS score,
  COUNT(*) AS genres,
  string_agg(g.name, ', ' ORDER BY g.name) AS genre_list
FROM
  content AS c
  JOIN content_genre AS cg ON cg.content_id = c.content_id  -- one row per (title, genre)
  JOIN genre AS g ON g.genre_id = cg.genre_id
  LEFT JOIN genre_taste AS t ON t.genre_id = cg.genre_id    -- a genre with no taste counts as 0
                            AND t.profile_id = 1
WHERE
  maturity_of(c.age_rating) <= (SELECT maturity_level FROM profile WHERE profile_id = 1)
  AND NOT EXISTS (SELECT 1 FROM watch_history AS w WHERE w.profile_id = 1 AND w.content_id = c.content_id)
  AND NOT EXISTS (SELECT 1 FROM rating        AS r WHERE r.profile_id = 1 AND r.content_id = c.content_id)
  AND NOT EXISTS (SELECT 1 FROM my_list       AS m WHERE m.profile_id = 1 AND m.content_id = c.content_id)
GROUP BY c.content_id, c.title, c.release_date
ORDER BY score DESC, c.release_date DESC NULLS LAST        -- ties: newest first
LIMIT 6;
