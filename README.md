# Reelhouse

A Netflix-style streaming app built for a DBMS course project: browse films and series,
keep a list, rate titles, resume where you left off, manage profiles and a subscription,
and get a home page whose every row explains why it's there.

This repository is the **frontend plus a stubbed backend**. Sign-in, sign-out and sessions are
real; the rest of the backend (database, business logic) is intentionally not written yet:
the route handlers in `src/app/api` are thin and final, and the services behind them in
`src/server/services` return correctly-shaped mock data while documenting, in their JSDoc,
exactly what the real implementation must do. Video playback is simulated.

## Run it

```bash
npm install
cp .env.example .env      # set SESSION_SECRET (optional in dev: a built-in dev secret is used, with a warning)
npm run dev               # http://localhost:3000
```

Sign in with **demo@reelhouse.dev / demo1234** (the account of Riya Sharma). Sign-up is still a
mock ("Demo mode"): it validates the form, then sends you to sign in with the demo account. Sign-up
creates only the account; plans are bought from the account page through Razorpay (see
[Payments](#payments-razorpay)).
The demo account has three profiles:

| Profile | Maturity | State                                               |
| ------- | -------- | --------------------------------------------------- |
| Riya    | Adult    | history, My List, ratings, onboarding done          |
| Kabir   | Teen     | a little history, onboarding done                   |
| Mini    | Kids     | onboarding not done yet — opens the onboarding flow |

**Admin:** sign in with **admin@reelhouse.dev / admin1234** (role `ADMIN`, no profiles) and you land on
`/admin`. Admins who also have profiles get an "Admin" entry in the profile menu. See
[Admin panel](#admin-panel).

## Scripts

| Script                        | What it does                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `npm run dev`                 | Start the dev server (Turbopack)                                                                        |
| `npm run build` / `npm start` | Production build / serve it                                                                             |
| `npm run lint`                | ESLint (flat config, `eslint-config-next`)                                                              |
| `npm run import:tmdb`         | Re-download the catalogue into `data/tmdb/` (needs `TMDB_API_KEY`, see `.env.example`; ~5,000 requests) |

## How data flows

```
page (server component) ──► src/lib/api/server.ts ──┐
client component ─────────► src/lib/api/client.ts ──┴──► src/app/api/**/route.ts
                                                         (thin: guard → parse → service → HTTP)
                                                                      │
                                                                      ▼
                                                  src/server/services/*.service.ts
                                          (JSDoc = the implementation spec; mock bodies today)
                                                                      │
                                                                      ▼
                                       src/server/mocks/ ──► data/        (later: Drizzle ──► Neon PostgreSQL)
                                        (temporary JSON loader)
```

- **Every page gets its data through the API routes.** Server components call
  `serverApi.*` (`src/lib/api/server.ts`), which fetches the same routes with the incoming
  request's host and cookies; the browser-side `api.*` (`src/lib/api/client.ts`) is the only place
  that calls `fetch('/api/...')`. Pages and components never read `data/` or `src/server/mocks/` directly.
- **Client components use TanStack Query.** Hooks in `src/hooks/queries/` (`catalog`, `activity`,
  `profiles`, `billing`, `auth`, `admin`) wrap `api.*` as `useQuery` / `useMutation`, so components
  never call `api` themselves. Optimistic mutations (My List, ratings, history removal) roll back in
  `onError`, invalidate their keys on success and call `router.refresh()` so server-rendered data stays
  in sync. The `QueryClient` is created once per browser session in
  `src/components/providers/query-provider.tsx` (mounted in the root layout), and every query key
  comes from the typed factory in `src/lib/api/query-keys.ts`.
- **Routes are thin.** Each handler does the same four things: a guard, `parseBody` / `parseId`,
  one service call, and an HTTP response. Services throw typed errors (`src/server/errors`:
  `NotFoundError`, `ConflictError`, `ValidationError`, …); `handleError` in `src/app/api/_lib/http.ts`
  turns them into the status and JSON body, so no route builds an error response by hand.
  `src/app/api/_lib/http.ts` also holds `parseBody` (JSON + zod, 400/422) and `parseId`.
- **Sign-in** (`POST /api/auth/sign-in`) checks the email and password against
  `data/mock/users.json` (scrypt hashes, `src/server/auth/password.ts`) and sets an httpOnly
  `session` cookie, `<userId>.<HMAC-SHA256 signature>` keyed by `SESSION_SECRET`
  (`src/server/auth/session-token.ts`, cookie helpers in `src/server/auth/session.ts`).
  `POST /api/auth/sign-out` clears it and the profile cookie; `GET /api/auth/me` returns the
  signed-in user.
- **Guards, in three layers:** `src/proxy.ts` sends signed-out visitors of app pages to
  `/sign-in?next=…` (and signed-in visitors of `/sign-in`/`/sign-up` to `/profiles`); server
  pages call `requireUser()` / `requireProfile()` (`src/server/session/current-session.ts`), which go
  through `GET /api/auth/me`; and the account/profile API routes use the guards in
  `src/app/api/_lib/auth.ts`, which throw typed errors (401 without a session, 404 for profiles that
  aren't the user's) and look the user and profile up through the `users` and `profiles` services.
- **Admins** are users with `role = 'ADMIN'`. `/admin/**` pages go through the proxy (session) and
  then `requireAdmin()` in the admin layout, which sends signed-in non-admins to `/profiles`; every
  `/api/admin/**` route calls `requireAdmin()` from `src/app/api/_lib/auth.ts` (401 signed out, 403 not
  an admin). After sign-in without a `next` page, admins land on `/admin`.
- **The current profile** is the `profileId` cookie (`src/lib/cookies/profile-cookie.ts`), set in the
  browser by the "Who's watching?" picker. It's honoured only if that profile belongs to the
  signed-in user; otherwise pages redirect to `/profiles`.
- **Mutations** (My List, ratings, playback progress, history removal, profiles, onboarding)
  call the real endpoints and update the UI optimistically with a toast. The mock services persist
  nothing, so a reload shows the mock data again. Plan purchases go through Razorpay Checkout
  (see [Payments](#payments-razorpay)).

### The API-stub convention

The full implementation guide (who builds what, the shared Drizzle/Neon setup, per-person task
lists) is in [`docs/backend/README.md`](docs/backend/README.md).

The backend is split into a **contract** (the routes) and a **spec** (the services):

1. **Routes keep only the HTTP contract.** The header comment of each file in `src/app/api` gives the
   endpoint, the request and response shapes and the status codes, plus a one-line **`Calls:`** list
   naming the guard and services it uses, in order. Nothing else lives there, so a route never changes
   when the backend becomes real.
2. **The "functions to write" spec lives in the service JSDoc.** `src/server/services` has one
   `<domain>.service.ts` per concern: `users`, `profiles`, `catalog`, `activity`, `recommendations`,
   `billing`, `payments`, `admin` (plus `admin-content` and `admin-billing` for the admin content, plan and subscription tools). Every exported function documents its steps, SQL, the tables and
   keys it relies on, transaction and idempotency notes, edge cases (unique keys, upserts, cascades,
   the 90% "completed" rule, maturity filtering, …), what it throws, who calls it, and what the mock
   does today. `recommendations.service.ts` documents the whole home-feed pipeline: interaction
   signals and their weights → candidate generation (genre/people affinity, item-item kNN, a
   popularity prior from our own watch history) → the 0.5 / 0.3 / 0.2 ranking blend with maturity and
   "already finished" filters → the home rows and their `reason` strings.
3. **The bodies are mocks.** Each function returns data of the right shape through
   `src/server/mocks/` (a lookup by id at most) and carries a `// TODO: implement`. Search ignores
   the query, the home feed is fixed slices of the catalogue, and writes return a plausible success.

`@/server/mocks` may only be imported from `src/server/services`. When a service is real, replace its
bodies (keeping the signatures and thrown errors); when every service is real, **delete
`src/server/mocks/`**. The routes and the frontend need no changes. The auth routes' comments list what
to harden later (bcrypt/argon2, rate limiting, a session table instead of the stateless cookie).

To add or change a mock user's password, generate a hash with the one-liner in
`src/server/auth/password.ts` and paste it into `data/mock/users.json`.

## Admin panel

`/admin` (sidebar shell from the component kit) has five pages. Every write shows the PostgreSQL it
runs, and the services behind them are mocks, so writes update the screen optimistically and say so in
their toast ("Demo data — not saved until the backend is implemented"):

- **Dashboard**: stat tiles (users, active subscriptions, titles, episodes, revenue this month), recent
  payments, most-watched titles, genre distribution and subscriptions by plan. Every widget has a
  **SQL** button that opens the exact PostgreSQL query it's meant to run, with a one-line explanation
  and its result rows. One route, `GET /api/admin/dashboard`, returns `{ widgets: { [key]: { data,
sql, explanation } } }`; the SQL strings live in `src/server/services/admin.service.ts` because they're what your backend will run.
  Today the data is counted from the mock rows.
- **Import from TMDB**: search TMDB as you type (movies or series), pick a result and preview exactly
  what an import stores: the content row, genres, cast and directors with photos, seasons and episodes,
  and the row count per table. Below the preview is the SQL the import runs, statement by statement
  (BEGIN, the upserts in dependency order, COMMIT), each with a short explanation and the values filled in,
  with copy buttons for each statement and for the whole transaction. "Import" calls
  `POST /api/admin/content/import`, whose service persists nothing yet.
- **Content** (`/admin/content`): every title with poster, type, year, age rating, genres and the
  season / episode counts for series; search, type and genre filters and server-side pagination
  (`GET /api/admin/content`). **Remove** opens a confirmation that lists what the delete cascades to
  (`GET /api/admin/content/:id/impact`: genre links, credits, seasons, episodes, watch history, My List,
  ratings and recommendations) and the `DELETE FROM content WHERE content_id = $1` that does it
  (`DELETE /api/admin/content/:id`, 204). **Edit details** changes title, description, release date, age
  rating and artwork (`PATCH /api/admin/content/:id`; 409 when the title, type and release date clash).
- **Plans** (`/admin/plans`): plans with price, video quality, device limit and subscriber count. Add and
  edit dialogs (`POST /api/admin/plans`, `PATCH /api/admin/plans/:id`) validate with zod and show the
  `INSERT … RETURNING` / `UPDATE … WHERE plan_id` as you type; a price change never rewrites past
  `payment.amount`. Delete (`DELETE /api/admin/plans/:id`) is refused with 409 while any subscription
  references the plan (`ON DELETE RESTRICT`).
- **Subscriptions** (`/admin/subscriptions`): all subscriptions joined with user and plan, filtered by
  status and user email (`GET /api/admin/subscriptions?status=&q=&page=`). Row actions **Cancel**
  (ACTIVE → CANCELLED, `end_date = now()`), **Extend** (add months to `end_date`) and **Change plan**
  (an admin override: no payment is recorded, the new price applies from the next renewal) go through
  `PATCH /api/admin/subscriptions/:id`, each with its SQL and the constraints it respects (one ACTIVE per
  user, the dates CHECK).

Unlike the mock services, the two TMDB routes (`GET /api/admin/tmdb/search`, `GET /api/admin/tmdb/:type/:tmdbId`)
make **real** TMDB calls with `TMDB_API_KEY` from `.env`. They use the same client and mappers as the import
script (`src/lib/tmdb/`), so a title previewed in the admin has the same shape as one in `data/tmdb/`.
The SQL text comes from `src/lib/sql/import-title.ts` (pure string building, no database).

## Payments (Razorpay)

Plans are bought on `/account`: pick a plan → `POST /api/account/subscriptions` (Razorpay order) →
Razorpay Checkout (card, UPI, net banking, wallets) → its success handler posts to
`POST /api/payments/verify` → the page polls `GET /api/account` for the new plan. Razorpay also
reports every attempt to `POST /api/payments/webhook`. The full design is "Payment flow" in
[`docs/schema/SCHEMA.md`](docs/schema/SCHEMA.md).

**All three routes are backed by mock services** like the rest of the API: `src/server/services/payments.service.ts`
documents the functions to write (`createRazorpayOrder`, `verifyPaymentSignature`, `verifyWebhookSignature`,
`parseWebhookEvent`, `recordFailedPayment`, `recordCapturedPayment`, …). Only the frontend is built (the browser
side is `src/lib/razorpay/checkout.ts` + `src/components/account/change-plan.tsx`): while the checkout
stub returns `keyId: null`, the account page skips Razorpay Checkout and goes straight to the
"payment received" state; once the route returns a real order and key id, Checkout opens.

When you implement them: use Razorpay **Test Mode** keys (Dashboard → Account & Settings → API Keys)
in `.env`, pay with Razorpay's [test cards](https://razorpay.com/docs/payments/payments/test-card-details/)
or [test UPI ids](https://razorpay.com/docs/payments/payments/test-upi-details/), and for webhooks
locally use a tunnel ([Razorpay suggests zrok](https://razorpay.com/docs/webhooks/validate-test/)) with
the events `payment.captured` and `payment.failed`. Never put live keys in `.env`.

## SQL naming

The full design (tables, constraints, ER diagram, normalisation notes) is in
[`docs/schema/SCHEMA.md`](docs/schema/SCHEMA.md). The service JSDoc, the dashboard queries and the generated
import SQL all use its names, so keep them in step if the schema changes:

- **PostgreSQL**, singular snake_case tables, except `users` (`user` is reserved): `users`,
  `profile`, `subscription_plan`, `subscription`, `payment`, `content`, `genre`,
  `content_genre`, `season`, `episode`, `person`, `content_credit` (cast and directors, told
  apart by `role`), `watch_history`, `my_list`, `rating`, `profile_genre_preference`,
  `recommendation`.
- **Columns** are the snake_case of the field names in `src/types` (`contentId` → `content_id`).
  Maturity isn't stored: queries derive it with `maturity_of(content.age_rating)`, a SQL function
  over the certificate code.
- **Natural keys** the import upserts on: `content (title, content_type, release_date)` and
  `person (name, date_of_birth)` (both `UNIQUE NULLS NOT DISTINCT`), `genre (name)`,
  `season (content_id, season_number)`, `episode (season_id, episode_number)`. The database stores
  no TMDB ids; they only live in `data/tmdb/` and the admin's TMDB routes.
- **Enums** (`content_type`, `maturity_level`, `credit_role`, `user_role`, statuses, payment
  modes) use upper-case strings, the same as `src/types` where the API exposes them.

## The `data/` folder

```
data/
  tmdb/     real TMDB snapshot written by scripts/import-tmdb.mts — don't edit by hand
            genres.json (18) · people.json (~2.9k) · movies.json (300) · series.json (200,
            up to 5 seasons each, with episodes) · meta.json (counts, import time, attribution)
  mock/     hand-written account and activity rows, named after the planned tables:
            users · profiles · plans · subscriptions · payments · watch-history · my-list · ratings
```

Field names mirror the planned database columns in camelCase, matching `src/types`. Mock rows
reference titles by their snapshot entry `{ "contentType": "MOVIE" | "SERIES", "tmdbId": … }` and
episodes by `seasonNumber` + `episodeNumber`. Those TMDB ids are matched to `data/tmdb` entries in
memory and never stored: app ids (`contentId`, `episodeId`, `genreId`, …) are assigned when
`src/server/mocks/db.ts` loads the files, the way identity columns are when seeding. The database seed
(`src/server/db/seed/`, `npm run db:seed`) loads the same files into Neon, inserting each title by its natural key. Profile genre preferences are listed by genre name. Every reference is checked at
load time, so a typo fails loudly. Image fields are full `https://image.tmdb.org/…` URLs,
rendered through `next/image`.

## Folder structure

One folder per concern. `src/lib` is **client-safe** (importable from anywhere); `src/server` is
**server-only** (services, auth, errors, the mock loader). Nothing sits loose at the top of either.

```
data/                      tmdb/ snapshot + mock/ JSON (see above)
drizzle/                   SQL migrations (being added)
scripts/import-tmdb.mts    TMDB → data/tmdb importer (caches responses in .cache/, git-ignored); shares src/lib/tmdb
docs/                      SCHEMA.md (database design), backend/ (implementation guide)
src/
  app/
    (marketing)/           landing page
    (auth)/                sign-in, sign-up (account only)
    (app)/                 signed-in area (layout calls requireUser)
      profiles/            who's watching + manage profiles
      onboarding/          cold start: pick at least 3 genres
      watch/[contentId]/   mock player (?episode=)
      (shell)/             pages with the top nav: browse, browse/genre/[genreId], search,
                           title/[contentId], my-list, history, account
    admin/                 admin panel (layout calls requireAdmin): dashboard, import, content, plans, subscriptions
    api/                   thin REST routes: guard → parse → service → HTTP
      _lib/auth.ts         requireUser / requireOwnedProfile / requireAdmin guards (throw typed errors)
      _lib/http.ts         handleError (typed error → response), parseBody, parseWith, parseId
      _lib/tmdb.ts         TMDB client access for the admin TMDB routes
      account/ admin/ auth/ content/ genres/ plans/ profiles/
      payments/            verify (Checkout's success handler), webhook (Razorpay events)
  components/
    ui/                    coss ui primitives (on Base UI)
    admin/                 admin shell, dashboard widgets, import / content / plans / subscriptions, SQL code block
    account/ auth/ browse/ content/ layout/ library/ marketing/
    onboarding/ player/ profiles/ search/ title/
    providers/             query-provider (TanStack QueryClientProvider)
  hooks/                   use-media-query (sidebar), use-progress-sync (player)
    queries/               TanStack Query hooks per domain (catalog, activity, profiles, billing, auth, admin)
  lib/                     CLIENT-SAFE
    api/                   client.ts (browser `api.*`), server.ts (`serverApi.*`, server-only), query-keys.ts
    constants/             app-wide constants (cookie names, avatars, thresholds)
    content/               maturity rules, watch-progress helpers
    cookies/               profile-cookie (browser side of the profileId cookie)
    format/                date / duration / price formatting
    razorpay/              checkout.ts: browser side, Checkout types and option helpers
    sql/                   SQL text for display: import script, admin content / plan / subscription statements, literal inlining, highlighter
    tmdb/                  TMDB client + TMDB → snapshot mappers (shared with the import script)
    ui/                    segmented-control class helpers
    utils/                 cn() and friends (what `@/lib/utils` resolves to)
    validation/            zod form schemas: auth.ts (sign-in, sign-up), profile.ts, admin.ts (content, plans, subscriptions: forms and routes)
  server/                  SERVER-ONLY
    auth/                  password hashing (scrypt), signed session token, session cookie
    db/                    Drizzle: index.ts exports `db`, schema/ per area (being added)
    errors/                typed errors (NotFoundError, ConflictError, …) mapped by api/_lib/http.ts
    mocks/                 TEMPORARY: loads data/ for the services; only services import it; delete with the real backend
    services/              one <domain>.service.ts each: users, profiles, catalog, activity,
                           recommendations, billing, payments, admin
    session/               current-session.ts: requireUser / requireProfile / requireAdmin for pages
  types/                   domain types (mirror the planned schema)
  proxy.ts                 route guard (no session → /sign-in?next=…); Next.js requires it at src/ root
```

---

This product uses the TMDB API but is not endorsed or certified by TMDB.
