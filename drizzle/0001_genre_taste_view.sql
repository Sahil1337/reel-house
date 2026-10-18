-- Genre taste: one row per (profile, genre) the profile likes, scored from 4 signals on a 0–1 scale.
-- Read it per profile:  SELECT * FROM genre_taste WHERE profile_id = $1 ORDER BY taste_score DESC;
CREATE VIEW genre_taste AS
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
