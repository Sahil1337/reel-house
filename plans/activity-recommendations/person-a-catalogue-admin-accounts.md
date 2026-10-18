# Plan: Catalogue, Admin & Accounts (Person A: Tejasva)

This is the implementation plan for Person A (Tejasva) on the Reelhouse DBMS project.
It translates the specification from [`docs/backend/person-a-catalogue-admin-accounts.md`](../docs/backend/person-a-catalogue-admin-accounts.md)
into structured, sequential implementation phases following the exact architectural conventions, SQL patterns, and
criteria of the repository.

---

## 1. Repository Criteria & Architecture Rules

Every implementation in this plan must adhere strictly to the established system rules:

1. **Layer Separation & Boundaries**:
   - **Routes stay thin**: `src/app/api/**/route.ts` only guards, parses/validates with Zod, calls **one** service function, and returns JSON. No SQL in routes.
   - **Services hold business logic & SQL**: `src/server/services/*.service.ts` are pure async functions accepting/returning types from `src/types`. Services never touch Next.js `Request` or `Response`.
   - **Typed Errors become HTTP**: Throw only typed errors from `@/server/errors`:
     - `ValidationError(message)` -> `422 Unprocessable Entity`
     - `UnauthorizedError(message)` -> `401 Unauthorized`
     - `ForbiddenError(message)` -> `403 Forbidden`
     - `NotFoundError(message)` -> `404 Not Found` (used also when a resource belongs to another user)
     - `ConflictError(message, code?)` -> `409 Conflict` (unique constraints, state limits)
2. **SQL Execution Style**:
   - Use Drizzle's raw SQL template tag: `db.execute<RowType>(sql\`...\`)` or `tx.execute(...)` inside `db.transaction(...)`.
   - Column values come back in `snake_case`; explicitly map them to camelCase TypeScript interfaces.
   - Values are bound parameterized via `${param}` (never string-concatenated).
   - Enums must be cast explicitly: `${level}::maturity_level`.
   - Arrays/lists use `= ANY(${sql.param(ids)})`.
   - Catch Postgres error codes from Drizzle query errors via `(err as { cause?: { code?: string } }).cause?.code`:
     - `23505`: Unique constraint violation -> throw `ConflictError`
     - `23503`: Foreign key violation -> throw `NotFoundError` or `ValidationError`
3. **Maturity & Dynamic Derivation**:
   - Maturity is **never stored**. Catalogue queries must filter using `maturity_of(c.age_rating) <= ${maturityLevel}::maturity_level` (enum order `KIDS < TEEN < ADULT`, NULL certificate treated as `TEEN`).
   - If `maturityLevel` is `null` (no profile selected), the filter is omitted.

---

## 2. Phase-by-Phase Roadmap

```
Phase 1: Accounts, Profiles & Guards [COMPLETED]
  ├── 1.1 users.service.ts           (findUserById, findUserCredentialsByEmail) [DONE]
  ├── 1.2 profiles.service.ts        (listProfiles, getOwnedProfile) [DONE]
  ├── 1.3 Swap Auth Guards           (src/app/api/_lib/auth.ts -> real DB queries) [DONE]
  ├── 1.4 Sign-up Flow               (createUser transaction + session start) [DONE]
  ├── 1.5 Profile CRUD & Limits      (createProfile, updateProfile, deleteProfile) [DONE]
  └── 1.6 Onboarding Genre Picks     (getGenrePreferences, saveGenrePreferences) [DONE]
           │
           ▼
Phase 2: Content Catalogue Reads [COMPLETED]
  ├── 2.1 listGenres                 (Simplest catalogue query) [DONE]
  ├── 2.2 getContentDetail           (Content metadata, genres, cast, crew, seasons, episodes) [DONE]
  ├── 2.3 searchContent              (Maturity filter, unaccent ILIKE search, ranking) [DONE]
  └── 2.4 getSimilarTitles           (Shared-genre self-join with recent watch tie-break) [DONE]
           │
           ▼
Phase 3: Admin Dashboard & Live Ingestion
  ├── 3.1 Natural Key Matchers       (markInCatalog, findCatalogueId)
  ├── 3.2 Admin Dashboard            (9 analytical widget queries)
  └── 3.3 TMDB Import Transaction    (Multi-table atomic ingestion in dependency order)
           │
           ▼
Phase 4: Admin Content Management
  ├── 4.1 listContentForAdmin        (Paginated catalog table with subquery counts)
  ├── 4.2 getContentDeletionImpact   (Blast radius cascade preview)
  ├── 4.3 deleteContent              (Cascade deletion)
  └── 4.4 updateContent              (Metadata update with conflict detection)
           │
           ▼
Phase 5: Auth Hardening & Cleanup
  ├── 5.1 Auth Hardening             (Dummy hash timing attack mitigation)
  └── 5.2 Cleanup & Validation       (Purge mock imports, lint, build check)
```

---

## 3. Detailed Phase Breakdown

### Phase 1: Accounts, Profiles & Auth Guards (Priority Day 1–2)
*Goal: Provide real session verification and profile ownership checks for the entire platform.*

#### 1.1 `src/server/services/users.service.ts`
- **`findUserById(userId: number): Promise<User | null>`**:
  - `SELECT user_id, name, email, phone, role, created_at FROM users WHERE user_id = $1;`
  - Explicit column selection ensures `password_hash` is never returned.
  - Returns `null` if no row found.
- **`findUserCredentialsByEmail(email: string)`**:
  - `SELECT user_id, name, email, phone, role, created_at, password_hash FROM users WHERE lower(email) = lower($1);`
  - Case-insensitive search using index `users_email_key`.
  - Splits output into `{ user: User, passwordHash: string }`.

#### 1.2 `src/server/services/profiles.service.ts`
- **`listProfiles(userId: number): Promise<Profile[]>`**:
  - `SELECT profile_id, user_id, name, avatar, maturity_level, (onboarded_at IS NOT NULL) AS onboarding_completed FROM profile WHERE user_id = $1 ORDER BY profile_id;`
- **`getOwnedProfile(userId: number, profileId: number): Promise<Profile>`**:
  - `SELECT profile_id, user_id, name, avatar, maturity_level, (onboarded_at IS NOT NULL) AS onboarding_completed FROM profile WHERE profile_id = $1 AND user_id = $2;`
  - If no row matches, throws `NotFoundError("Profile not found.")`. (Never reveals existence of another user's profile).

#### 1.3 Swap Auth Guards in `src/app/api/_lib/auth.ts`
- Replace mock invocations with real service calls:
  - `requireUser()` -> calls real `findUserById(userId)`
  - `requireAdmin()` -> checks `user.role === "ADMIN"`
  - `requireOwnedProfile(profileId)` -> calls real `getOwnedProfile(user.userId, id)`
  - `getSelectedProfile()` -> uses `getOwnedProfile(userId, profileId)`
- Verify all mock imports in `src/app/api/_lib/auth.ts` are removed.
- *Milestone Check*: Yash (B) and Sahil (C) can now safely execute against real auth guards.

#### 1.4 Sign-Up Transaction & Session Initiation
- **`createUser(input: NewUser): Promise<User>`**:
  - Run inside `db.transaction(async (tx) => ...)`:
    1. Insert into `users` (`name`, `email`, `password_hash`, `phone`, `role = 'USER'`) returning user columns. Catch unique violation `23505` on `users_email_key` -> throw `ConflictError("An account with that email already exists.", "EMAIL_TAKEN")`.
    2. Insert first default profile into `profile`: `name = input.name.slice(0, 24)`, `avatar = 'clapper'`, `maturity_level = 'ADULT'`.
- Wire `src/app/api/auth/sign-up/route.ts` to issue the session cookie and redirect to `/profiles`.

#### 1.5 Profile CRUD & Invariants
- **`createProfile(userId, input)`**:
  - Check profile count `< 5` (`MAX_PROFILES`); if at limit throw `ConflictError(..., "PROFILE_LIMIT")`.
  - Insert into `profile`. Catch `23505` (`profile_user_name_key`) -> throw `ConflictError(..., "NAME_TAKEN")`.
- **`updateProfile(userId, profileId, changes)`**:
  - Verify ownership with `getOwnedProfile`.
  - Update `name`, `avatar`, and `maturity_level`. Handle duplicate name `23505`.
- **`deleteProfile(userId, profileId)`**:
  - Count account profiles: if `<= 1`, throw `ConflictError("Can't delete your only profile.", "LAST_PROFILE")`.
  - `DELETE FROM profile WHERE profile_id = $1 AND user_id = $2;` (cascades to watch history, list, ratings).
  - Clear `profileId` cookie if the active profile was deleted.

#### 1.6 Onboarding Genre Preferences
- **`getGenrePreferences(profileId: number): Promise<number[]>`**:
  - `SELECT genre_id FROM profile_genre_preference WHERE profile_id = $1;`
- **`saveGenrePreferences(profileId: number, genreIds: number[]): Promise<void>`**:
  - Validate minimum 3 genres (`ONBOARDING_MIN_GENRES`).
  - Transaction:
    1. Verify profile exists.
    2. `DELETE FROM profile_genre_preference WHERE profile_id = $1;`
    3. Bulk insert genre IDs: `INSERT INTO profile_genre_preference (profile_id, genre_id) VALUES ...`
    4. `UPDATE profile SET onboarded_at = now() WHERE profile_id = $1;`
  - *Milestone Check*: Unblocks Sahil's cold-start recommendation algorithm.

---

### Phase 2: Content Catalogue Reads
*Goal: Provide fast, maturity-filtered search, detail, and similarity queries.*

#### 2.1 `listGenres(): Promise<Genre[]>`
- `SELECT genre_id, name FROM genre ORDER BY name;`

#### 2.2 `getContentDetail(contentId: number): Promise<ContentDetail>`
- Execute coordinated queries:
  1. Main content row: `SELECT content_id, content_type, title, description, release_date, duration_minutes, age_rating, maturity_of(age_rating) AS maturity_level, poster_url, backdrop_url FROM content WHERE content_id = $1;` -> throws `NotFoundError("Title not found.")` if missing.
  2. Genres: `SELECT g.genre_id, g.name FROM content_genre cg JOIN genre g ON g.genre_id = cg.genre_id WHERE cg.content_id = $1 ORDER BY g.name;`
  3. Cast: `SELECT p.person_id, p.name, p.date_of_birth, p.photo_url, cc.character_name FROM content_credit cc JOIN person p ON p.person_id = cc.person_id WHERE cc.content_id = $1 AND cc.role = 'ACTOR' ORDER BY cc.credit_order;`
  4. Directors: `SELECT p.person_id, p.name, p.date_of_birth, p.photo_url FROM content_credit cc JOIN person p ON p.person_id = cc.person_id WHERE cc.content_id = $1 AND cc.role = 'DIRECTOR' ORDER BY cc.credit_order;`
  5. Seasons & Episodes (if series):
     - `SELECT season_id, content_id, season_number, name, release_date FROM season WHERE content_id = $1 ORDER BY season_number;`
     - `SELECT episode_id, season_id, episode_number, title, description, release_date, duration_minutes, still_url FROM episode WHERE season_id = ANY($seasonIds) ORDER BY episode_number;`
  6. Assemble nested `ContentDetail` model.

#### 2.3 `searchContent(query: ContentSearch): Promise<ContentSummary[]>`
- Dynamic query builder using `sql` fragments:
  - **Maturity Filter**: `${maturityLevel ? sql\`AND maturity_of(c.age_rating) <= ${maturityLevel}::maturity_level\` : sql\`\`}`
  - **Type Filter**: `${type ? sql\`AND c.content_type = ${type}::content_type\` : sql\`\`}`
  - **Genre Filter**: `${genreId ? sql\`AND EXISTS (SELECT 1 FROM content_genre cg WHERE cg.content_id = c.content_id AND cg.genre_id = ${genreId})\` : sql\`\`}`
  - **Search Term `q`**:
    - Escape wildcards `%`, `_`, `\` in query string.
    - Match title or credits: `(unaccent(c.title) ILIKE unaccent($q) OR EXISTS (SELECT 1 FROM content_credit cc JOIN person p ON p.person_id = cc.person_id WHERE cc.content_id = c.content_id AND unaccent(p.name) ILIKE unaccent($q)))`
  - **Ranking**:
    - Priority: Exact title match (4) > Title prefix match (3) > Title contains (2) > Person name match (1).
    - Tie-break: Popularity prior (`COUNT(DISTINCT profile_id)` from `watch_history` in last 30 days) > `release_date DESC`.
  - Correlated JSON subquery for genres: `COALESCE((SELECT json_agg(json_build_object('genreId', g.genre_id, 'name', g.name)) FROM content_genre cg JOIN genre g ON g.genre_id = cg.genre_id WHERE cg.content_id = c.content_id), '[]'::json) AS genres`.

#### 2.4 `getSimilarTitles(contentId, maturityLevel, limit)`
- Query overlapping genres with self-join on `content_genre`:
  ```sql
  WITH target_genres AS (
    SELECT genre_id FROM content_genre WHERE content_id = $targetId
  ),
  popularity AS (
    SELECT content_id, COUNT(DISTINCT profile_id) AS viewers
    FROM watch_history WHERE watched_at > now() - interval '30 days'
    GROUP BY content_id
  )
  SELECT c.*, COUNT(cg.genre_id) AS shared_genres,
         COALESCE(p.viewers, 0) AS recent_viewers
  FROM content c
  JOIN content_genre cg ON cg.content_id = c.content_id
  JOIN target_genres tg ON tg.genre_id = cg.genre_id
  LEFT JOIN popularity p ON p.content_id = c.content_id
  WHERE c.content_id != $targetId
    AND (${maturityLevel ? sql`maturity_of(c.age_rating) <= ${maturityLevel}::maturity_level` : sql`true`})
  GROUP BY c.content_id, p.viewers
  ORDER BY shared_genres DESC, recent_viewers DESC, c.release_date DESC NULLS LAST
  LIMIT $limit;
  ```

---

### Phase 3: Admin Dashboard & Live Ingestion
*Goal: Provide platform analytics and reliable TMDB content ingestion.*

#### 3.1 Natural Key Matchers
- **`markInCatalog(items: TmdbSearchResult[])`**:
  - Match via `(title, content_type, release_date)` against `content`.
  - Returns `inCatalog: boolean` flag for each item.
- **`findCatalogueId(type, tmdbTitle)`**:
  - Returns existing `content_id` if title is already in the database.

#### 3.2 `getDashboard(): Promise<AdminDashboard>`
- Execute the 9 analytical SQL queries in parallel (`Promise.all`):
  1. `totalUsers`: `SELECT COUNT(*) FROM users;`
  2. `activeSubscriptions`: `SELECT COUNT(*) FROM subscription WHERE status = 'ACTIVE';`
  3. `totalTitles`: `SELECT COUNT(*) FROM content;`
  4. `totalEpisodes`: `SELECT COUNT(*) FROM episode;`
  5. `revenueThisMonth`: `SELECT COALESCE(SUM(amount), 0) FROM payment WHERE status = 'SUCCESS' AND payment_date >= date_trunc('month', now());`
  6. `recentPayments`: Last 5 payments joined with user and plan details.
  7. `mostWatchedTitles`: Top 5 titles by unique viewer count over last 30 days.
  8. `genreDistribution`: Titles count per genre via `content_genre`.
  9. `subscriptionsByPlan`: Subscription counts grouped by `subscription_plan`.

#### 3.3 `importTitle(input: ImportTitleInput): Promise<ImportTitleResult>`
- Atomic multi-table insertion in `db.transaction(async (tx) => ...)`:
  1. Upsert `content`:
     ```sql
     INSERT INTO content (content_type, title, description, release_date, duration_minutes, age_rating, poster_url, backdrop_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (title, content_type, release_date) DO UPDATE
     SET description = EXCLUDED.description, duration_minutes = EXCLUDED.duration_minutes,
         age_rating = EXCLUDED.age_rating, poster_url = EXCLUDED.poster_url, backdrop_url = EXCLUDED.backdrop_url
     RETURNING content_id, (xmax = 0) AS created;
     ```
  2. Connect `content_genre`:
     - Upsert missing `genre` rows if any.
     - Insert into `content_genre (content_id, genre_id)` ON CONFLICT DO NOTHING.
  3. Upsert `person` & `content_credit`:
     - Upsert each person: `ON CONFLICT (name, date_of_birth) DO UPDATE SET photo_url = COALESCE(EXCLUDED.photo_url, person.photo_url) RETURNING person_id`.
     - Insert `content_credit (content_id, person_id, role, character_name, credit_order)` ON CONFLICT DO NOTHING.
  4. If series, insert `season` and `episode`:
     - Upsert season: `ON CONFLICT (content_id, season_number) DO UPDATE ... RETURNING season_id`.
     - Upsert episode: `ON CONFLICT (season_id, episode_number) DO UPDATE ...`.

---

### Phase 4: Admin Content Management
*Goal: Allow full administrative visibility, cascade previews, editing, and deletion.*

#### 4.1 `listContentForAdmin(filters: AdminContentFilters)`
- Paginated search with `total` count.
- Includes season and episode counts using correlated subqueries:
  ```sql
  SELECT c.content_id, c.title, c.content_type, c.release_date, c.age_rating, c.poster_url,
    COALESCE((SELECT json_agg(json_build_object('genreId', g.genre_id, 'name', g.name)) FROM content_genre cg JOIN genre g ON g.genre_id = cg.genre_id WHERE cg.content_id = c.content_id), '[]'::json) AS genres,
    CASE WHEN c.content_type = 'SERIES' THEN (SELECT COUNT(*) FROM season s WHERE s.content_id = c.content_id) END AS season_count,
    CASE WHEN c.content_type = 'SERIES' THEN (SELECT COUNT(*) FROM episode e JOIN season s ON s.season_id = e.season_id WHERE s.content_id = c.content_id) END AS episode_count
  FROM content c
  WHERE c.title ILIKE $1 ESCAPE '\'
    AND ($type IS NULL OR c.content_type = $type)
    AND ($genreId IS NULL OR EXISTS (SELECT 1 FROM content_genre cg WHERE cg.content_id = c.content_id AND cg.genre_id = $genreId))
  ORDER BY c.title, c.content_id
  LIMIT $limit OFFSET $offset;
  ```

#### 4.2 `getContentDeletionImpact(contentId: number): Promise<ContentDeletionImpact>`
- Single query returning counts of affected rows across child tables:
  ```sql
  SELECT c.content_id, c.title, c.content_type,
    (SELECT COUNT(*) FROM content_genre WHERE content_id = c.content_id) AS content_genre_count,
    (SELECT COUNT(*) FROM content_credit WHERE content_id = c.content_id) AS content_credit_count,
    (SELECT COUNT(*) FROM season WHERE content_id = c.content_id) AS season_count,
    (SELECT COUNT(*) FROM episode e JOIN season s ON s.season_id = e.season_id WHERE s.content_id = c.content_id) AS episode_count,
    (SELECT COUNT(*) FROM watch_history WHERE content_id = c.content_id) AS watch_history_count,
    (SELECT COUNT(*) FROM my_list WHERE content_id = c.content_id) AS my_list_count,
    (SELECT COUNT(*) FROM rating WHERE content_id = c.content_id) AS rating_count,
    (SELECT COUNT(*) FROM recommendation WHERE content_id = c.content_id) AS recommendation_count
  FROM content c WHERE c.content_id = $1;
  ```

#### 4.3 `deleteContent(contentId: number): Promise<void>`
- `DELETE FROM content WHERE content_id = $1;` (Postgres `ON DELETE CASCADE` cleans up all references).
- If no rows affected, throw `NotFoundError("Title not found.")`.

#### 4.4 `updateContent(contentId: number, input: UpdateContentInput)`
- Update title, description, releaseDate, ageRating, etc.
- Catch unique violation `23505` (`content_title_type_release_key`) -> throw `ConflictError("Another title with this name, type and release date already exists.", "CONTENT_EXISTS")`.

---

### Phase 5: Hardening, Polish & Verification
*Goal: Ensure security, performance, and clean codebase state.*

1. **Auth Hardening**:
   - In `findUserCredentialsByEmail`, if no user is found, execute a dummy password comparison with `timingSafeEqual` to equalize execution time and prevent user enumeration timing attacks.
2. **Purge Mock Dependencies**:
   - Remove imports of `@/server/mocks/*` across `users.service.ts`, `profiles.service.ts`, `catalog.service.ts`, `admin.service.ts`, and `admin-content.service.ts`.
3. **End-to-End Validation**:
   - Sign up a new user -> verifies user + profile creation in Neon.
   - Run Mini's onboarding -> verify `profile_genre_preference` insertion.
   - Browse catalog with Kids vs. Adult profile -> verify maturity filtering.
   - Run `/admin` dashboard -> verify widget metrics.
   - Run TMDB import -> verify transaction atomicity.
   - Check `npm run lint` and `npm run build`.
