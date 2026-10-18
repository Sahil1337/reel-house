# Reelhouse

A Netflix-style streaming app built for a DBMS course project. You can browse films and series, keep a
list, rate titles, resume where you left off, manage profiles and a subscription, and get a Home page
that explains why each row is there.

**What's real today**

| Part                                                              | Status                                                   |
| ----------------------------------------------------------------- | -------------------------------------------------------- |
| Sign-in, sign-out, sessions                                       | Real (mock user file, signed cookie)                     |
| Viewing activity: progress, History, My List, ratings, title page | Real, on PostgreSQL (Neon)                               |
| Home recommendations                                              | Real, on PostgreSQL, with a "Why these picks?" explainer |
| Billing and payments (Razorpay)                                   | Real, needs Razorpay test keys                           |
| Users, profiles, catalogue, admin                                 | Mock services: correct shapes, nothing saved yet         |
| Video playback                                                    | Simulated                                                |

## Run it

```bash
npm install
cp .env.example .env      # fill in the values below
npm run db:migrate        # only for a new or reset database
npm run db:seed           # load the demo data (resets every table)
npm run dev               # http://localhost:3000
```

`.env` needs `DATABASE_URL` (Neon), `SESSION_SECRET` (optional in dev, a built-in one is used with a
warning), `TMDB_API_KEY` (admin import and `import:tmdb`) and the three `RAZORPAY_*` keys (payments).

**Demo login:** `demo@reelhouse.dev` / `demo1234` (Riya Sharma's account, with three profiles):

| Profile | Maturity | State                                                    |
| ------- | -------- | -------------------------------------------------------- |
| Riya    | Adult    | history, My List, ratings, onboarding done               |
| Kabir   | Teen     | a little history, onboarding done                        |
| Mini    | Kids     | onboarding not done yet, so it opens the onboarding flow |

**Admin login:** `admin@reelhouse.dev` / `admin1234` (role `ADMIN`, no profiles) lands on `/admin`.
Admins who also have profiles get an "Admin" entry in the profile menu.

Sign-up is still a mock ("Demo mode"): it checks the form, then sends you to sign in with the demo
account. It only creates an account; plans are bought later from the account page.

## Scripts

| Script                            | What it does                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `npm run dev`                     | Dev server (Turbopack)                                                                   |
| `npm run build` / `npm start`     | Production build / serve it                                                              |
| `npm run lint`                    | ESLint                                                                                   |
| `npm run format` / `format:check` | Prettier                                                                                 |
| `npm run db:migrate`              | Apply the SQL migrations in `drizzle/`                                                   |
| `npm run db:generate`             | Create a migration from schema changes                                                   |
| `npm run db:seed`                 | Reset every table and load the demo data from `data/`                                    |
| `npm run db:clear-activity`       | Empty watch history, My List and ratings only (test from a clean start)                  |
| `npm run db:studio`               | Browse the database in Drizzle Studio                                                    |
| `npm run import:tmdb`             | Re-download the catalogue into `data/tmdb/` (needs `TMDB_API_KEY`, about 5,000 requests) |

If the dev server shows an error for code that is clearly fixed (for example after a big merge), stop it,
run `rm -rf .next/dev` and start it again; Turbopack's dev cache can hold an old copy of a file.

## How data flows

```
page (server component) ──► src/lib/api/server.ts ──┐
client component ─────────► src/lib/api/client.ts ──┴──► src/app/api/**/route.ts
                                                         guard → parse → service → HTTP
                                                                      │
                                                                      ▼
                                                  src/server/services/*.service.ts
                                                                      │
                                     ┌────────────────────────────────┴───────────────┐
                                     ▼                                                ▼
                     Drizzle ──► PostgreSQL on Neon                 src/server/mocks/ ──► data/
                     (real services)                                (services not built yet)
```

- **Pages only get data through the API routes.** Server components use `serverApi.*`; the browser uses
  `api.*`, the only code that calls `fetch('/api/...')`. Nothing outside the services reads `data/` or
  the mocks.
- **Client components use TanStack Query.** Hooks live in `src/hooks/queries/`, and every query key comes
  from `src/lib/api/query-keys.ts`. My List, ratings and history removal update the screen right away and
  roll back if the request fails.
- **Routes are thin.** Each one does a guard, `parseBody` / `parseId`, one service call and a response.
  Services throw typed errors (`NotFoundError`, `ConflictError`, `ValidationError`, …), and `handleError`
  turns them into the status code and JSON.
- **Sign-in** checks `data/mock/users.json` (scrypt hashes) and sets an httpOnly `session` cookie,
  `<userId>.<HMAC-SHA256 signature>`, signed with `SESSION_SECRET`. Sign-out clears it;
  `GET /api/auth/me` returns the signed-in user. To change a mock password, make a hash with the
  one-liner in `src/server/auth/password.ts` and paste it into `users.json`.
- **Guards work in three layers:**
  1. `src/proxy.ts` sends signed-out visitors to `/sign-in?next=…` (and signed-in visitors of the sign-in
     pages to `/profiles`).
  2. Server pages call `requireUser()` / `requireProfile()`.
  3. API routes use the guards in `src/app/api/_lib/auth.ts`: 401 without a session, 404 for a profile that
     isn't yours.
- **Admins** are users with `role = 'ADMIN'`. Admin pages check `requireAdmin()` (non-admins go to
  `/profiles`), and every `/api/admin/**` route answers 401 when signed out and 403 for non-admins.
- **The current profile** is the `profileId` cookie set by the "Who's watching?" picker. It only counts if
  the profile belongs to the signed-in user.

### How the backend is organised

The full implementation guide (who builds what, Drizzle and Neon setup, per-person task lists) is in
[`docs/backend/README.md`](docs/backend/README.md).

1. **Routes are the HTTP contract.** The comment at the top of each `src/app/api` file gives the endpoint,
   request, response and status codes, plus a `Calls:` line naming the guard and services. Routes don't
   change when a service becomes real.
2. **Services are the spec.** `src/server/services` has one `<domain>.service.ts` per area: `users`,
   `profiles`, `catalog`, `activity`, `recommendations`, `billing`, `payments`, `admin`, `admin-content`,
   `admin-billing`. A function that isn't built yet documents its steps, SQL, tables, edge cases and errors
   in its comment, and returns mock data with a `// TODO: implement`.
3. **Mocks are temporary.** Only services may import `@/server/mocks`. When a service is real, replace its
   bodies (same signatures and errors); when all of them are, delete `src/server/mocks/`. The auth route
   comments list what to harden later (bcrypt/argon2, rate limiting, a session table).

## Recommendations

Home has a hero, **Continue watching**, **Top picks** and one row each for the profile's two favourite
genres. Everything is computed on each visit; nothing is stored.

1. **Genre taste.** The `genre_taste` view turns what a profile did into points per genre: watched
   (0 to 1 by progress), rated ((stars − 3) / 2), on My List (+0.5), and +1 for each genre picked during
   onboarding.
2. **Score.** Every title the profile hasn't watched, rated or saved, and that suits its maturity level,
   scores `SUM(taste of its genres) ÷ √(number of genres)`. Ties go to the newest title.
3. **Rows.** The best scores fill Top picks (the first one is the hero); the genre rows use the same score
   within one genre. No title appears twice.

New profiles must pick at least three genres, so they get personal picks straight away. The
**Why these picks?** button on Home shows the whole calculation for the current profile. The code is in
`src/server/services/recommendations.service.ts`; the build guide is
[`plans/activity-recommendations/plan.md`](plans/activity-recommendations/plan.md).

## Admin panel

`/admin` has five pages. Every write shows the PostgreSQL it runs. The admin services are still mocks,
so writes update the screen and say "Demo data — not saved until the backend is implemented".

- **Dashboard:** tiles (users, active subscriptions, titles, episodes, revenue this month), recent
  payments, most-watched titles, genre mix and subscriptions per plan. Each widget has a **SQL** button
  showing its query, a one-line explanation and the rows. All of it comes from `GET /api/admin/dashboard`.
- **Import from TMDB:** search TMDB as you type, pick a title and preview everything an import would store
  (content, genres, cast and directors, seasons and episodes, row counts per table), followed by the import
  transaction statement by statement with copy buttons. The search and preview make **real** TMDB calls
  with `TMDB_API_KEY`; saving (`POST /api/admin/content/import`) is a mock.
- **Content:** every title with search, type and genre filters and paging. **Remove** first lists what the
  delete takes with it (genre links, credits, seasons, episodes, watch history, My List, ratings) and shows
  the `DELETE`. **Edit details** changes title, description, release date, age rating and artwork (409 if
  it clashes with another title).
- **Plans:** price, video quality, device limit and subscriber count, with add and edit dialogs. A price
  change never rewrites past payments. Deleting a plan someone uses is refused (409).
- **Subscriptions:** every subscription with its user and plan, filtered by status and email. **Cancel**,
  **Extend** and **Change plan** each show their SQL and the rules they respect (one active subscription
  per user, valid dates).

## Payments (Razorpay)

Plans are bought on `/account`:

1. Picking a plan calls `POST /api/account/subscriptions`, which creates a Razorpay order.
2. Razorpay Checkout opens (card, UPI, net banking, wallets).
3. On success it posts to `POST /api/payments/verify`, and the page polls `GET /api/account` for the new
   plan.

Razorpay also reports every attempt to `POST /api/payments/webhook`. The full design is "Payment flow" in
[`docs/schema/SCHEMA.md`](docs/schema/SCHEMA.md); the code is `src/server/services/payments.service.ts`
(server) and `src/lib/razorpay/checkout.ts` with `src/components/account/change-plan.tsx` (browser).

Use Razorpay **Test Mode** keys in `.env` (Dashboard → Account & Settings → API Keys), pay with the
[test cards](https://razorpay.com/docs/payments/payments/test-card-details/) or
[test UPI ids](https://razorpay.com/docs/payments/payments/test-upi-details/), and test webhooks locally
through a tunnel ([Razorpay suggests zrok](https://razorpay.com/docs/webhooks/validate-test/)) with the
events `payment.captured` and `payment.failed`. Never put live keys in `.env`.

## Database

The full design (tables, constraints, ER diagram, normalisation notes) is in
[`docs/schema/SCHEMA.md`](docs/schema/SCHEMA.md). The migrations in `drizzle/` are
`0000_schema.sql` (tables and the `maturity_of()` function), `0001_genre_taste_view.sql` and
`0002_drop_recommendation.sql`.

- **16 tables**, singular snake_case except `users` (`user` is reserved): `users`, `profile`,
  `profile_genre_preference`, `subscription_plan`, `subscription`, `payment`, `content`, `genre`,
  `content_genre`, `season`, `episode`, `person`, `content_credit` (cast and directors, told apart by
  `role`), `watch_history`, `my_list`, `rating`. Plus one view, `genre_taste`.
- **Columns** are the snake_case of the field names in `src/types` (`contentId` → `content_id`).
- **Maturity isn't stored.** Queries work it out with `maturity_of(content.age_rating)`.
- **Natural keys** used for upserts: `content (title, content_type, release_date)` and
  `person (name, date_of_birth)` (both `UNIQUE NULLS NOT DISTINCT`), `genre (name)`,
  `season (content_id, season_number)`, `episode (season_id, episode_number)`. No TMDB ids are stored;
  they only exist in `data/tmdb/` and the admin's TMDB routes.
- **Enums** (`content_type`, `maturity_level`, `credit_role`, `user_role`, statuses, payment modes) are
  upper-case strings, as in `src/types`.

## The `data/` folder

```
data/
  tmdb/   real TMDB snapshot written by scripts/import-tmdb.mts (don't edit by hand):
          genres.json (18) · people.json (~2.9k) · movies.json (300) ·
          series.json (200, up to 5 seasons each, with episodes) · meta.json (counts, attribution)
  mock/   hand-written demo accounts and activity:
          users · profiles · plans · subscriptions · payments · watch-history · my-list · ratings
```

- Field names match `src/types` (camelCase). Mock rows point at titles as
  `{ "contentType": "MOVIE" | "SERIES", "tmdbId": … }` and at episodes by season and episode number;
  profile genre picks use the genre name.
- App ids (`contentId`, `episodeId`, …) are assigned when the files load, the way identity columns are,
  and every reference is checked so a typo fails loudly.
- `npm run db:seed` loads the same files into Neon (titles by their natural key), and the mock services
  read them directly. Images are full `https://image.tmdb.org/…` URLs shown through `next/image`.

## Folder structure

`src/lib` is **client-safe** (importable anywhere); `src/server` is **server-only**. One folder per concern,
nothing loose at the top of either.

```
data/                      tmdb/ snapshot + mock/ JSON (see above)
drizzle/                   SQL migrations (0000 schema, 0001 genre_taste view, 0002 drop recommendation)
scripts/import-tmdb.mts    TMDB → data/tmdb importer (caches responses in .cache/, git-ignored)
plans/                     build guides (activity-recommendations/plan.md)
docs/                      schema/ (SCHEMA.md, diagrams), backend/ (implementation guide)
src/
  app/
    (marketing)/           landing page
    (auth)/                sign-in, sign-up
    (app)/                 signed-in area (layout calls requireUser)
      profiles/            who's watching + manage profiles
      onboarding/          cold start: pick at least 3 genres
      watch/[contentId]/   simulated player (?episode=)
      (shell)/             pages with the top nav: browse, browse/genre/[genreId], search,
                           title/[contentId], my-list, history, account
    admin/                 admin panel (layout calls requireAdmin)
    api/                   thin REST routes: guard → parse → service → HTTP
      _lib/                auth.ts (guards), http.ts (handleError, parseBody, parseId), tmdb.ts
      account/ admin/ auth/ content/ genres/ plans/ profiles/ payments/
  components/
    ui/                    coss ui primitives (on Base UI)
    browse/                Home rows, hero, the "Why these picks?" explainer (explainer/)
    admin/ account/ auth/ content/ layout/ library/ marketing/ onboarding/ player/ profiles/ search/ title/
    providers/             TanStack Query provider
  hooks/                   use-media-query, use-progress-sync (player)
    queries/               TanStack Query hooks: catalog, activity, recommendations, profiles, billing,
                           auth, admin
  lib/                     CLIENT-SAFE
    api/                   client.ts (browser `api.*`), server.ts (`serverApi.*`), query-keys.ts
    constants/ content/ cookies/ format/ razorpay/ sql/ tmdb/ ui/ utils/
    validation/            zod schemas: auth, profile, admin
  server/                  SERVER-ONLY
    auth/                  password hashing (scrypt), signed session token, session cookie
    db/                    Drizzle: index.ts (`db`), schema/, queries/ (shared reads), seed/
    errors/                typed errors, turned into responses by api/_lib/http.ts
    mocks/                 TEMPORARY loader of data/ for the services not built yet
    services/              one <domain>.service.ts per area
    session/               requireUser / requireProfile / requireAdmin for pages
  types/                   domain types (mirror the schema)
  proxy.ts                 route guard (no session → /sign-in?next=…); Next.js requires it at src/
```

---

This product uses the TMDB API but is not endorsed or certified by TMDB.
