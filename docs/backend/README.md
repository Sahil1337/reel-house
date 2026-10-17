# Reelhouse backend: shared guide

Everything the three of us need to agree on before (and while) we replace the stub service bodies
with real PostgreSQL code. Read this file first, then your own file:

| Who   | File                                                                           | Services you own                                                                           |
| ----- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **A** | [person-a-catalogue-admin.md](person-a-catalogue-admin.md)                     | `catalog.service`, `admin.service`                                                         |
| **B** | [person-b-accounts-billing-payments.md](person-b-accounts-billing-payments.md) | `users.service`, `profiles.service`, `billing.service`, `payments.service`, auth hardening |
| **C** | [person-c-activity-recommendations.md](person-c-activity-recommendations.md)   | `activity.service`, `recommendations.service`                                              |

The schema itself is [`../schema/SCHEMA.md`](../schema/SCHEMA.md) (source of truth for tables, constraints, ranking
formulas and the payment flow). The Drizzle schema in `src/server/db/schema/` and the two migrations in
`drizzle/` already implement it.

## Table of contents

1. [Architecture](#1-architecture)
2. [Setup, step by step](#2-setup-step-by-step)
3. [Conventions](#3-conventions)
4. [Testing routes with curl](#4-testing-routes-with-curl)
5. [Route to service index](#5-route-to-service-index)
6. [How `src/server/mocks` works today](#6-how-srcservermocks-works-today)
7. [Phase 1 schema checklist](#7-phase-1-schema-checklist)
8. [Branches, PRs, shared files, review rules, timeline](#8-branches-prs-shared-files-review-rules-timeline)
9. [Open decisions](#9-open-decisions)

---

## 1. Architecture

### 1.1 Request flow

```
Server component (page)   ──► serverApi.*  (src/lib/api/server.ts, "server-only") ─┐
                               fetches http://<host>/api/... with the request's cookies │
Client component          ──► api.*        (src/lib/api/client.ts)  ────────────────┤
                                                                                    ▼
                                      src/app/api/**/route.ts     (HTTP contract in the top comment)
                                        1. guard    requireUser / requireOwnedProfile / requireAdmin / getSelectedProfile
                                        2. validate parseBody(request, zodSchema) / parseId(...) / parseWith(...)
                                        3. call     one function from src/server/services/*.service.ts
                                        4. respond  Response.json(...)  — catch (e) { return handleError(e) }
                                                                                    ▼
                                      src/server/services/*.service.ts   (business rules + SQL)
                                                                                    ▼
                                      src/server/db  (Drizzle + node-postgres Pool)  ──►  Neon PostgreSQL
```

- Pages and components never import `src/server/**` and never read `data/`. They only go through the API.
  (`serverApi` exists so server components don't need a browser; it still hits the same routes, so the
  session cookie and the `profileId` cookie are checked exactly like a browser request.)
- A route stays thin: guard, validate, call one service function, return JSON. If you are about to write
  SQL in a route, it belongs in a service.
- Services are plain async functions with typed inputs and outputs from `src/types`. They never touch
  `Request`/`Response`. They throw typed errors (below), never `Response`.

### 1.2 Typed errors become HTTP

`src/server/errors/index.ts` (import `@/server/errors`) defines the only errors services should throw:

| Class                                                        | Status | Use for                                                         | Example                                                                               |
| ------------------------------------------------------------ | ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `ValidationError(message, code?)`                            | 422    | input breaks a rule the route's zod schema can't express        | fewer than 3 genres; series progress without an episode                               |
| `UnauthorizedError(message = "Sign in to continue.", code?)` | 401    | no valid session                                                | `requireUser`                                                                         |
| `ForbiddenError(message = "You can't do that.", code?)`      | 403    | signed in but not allowed                                       | `requireAdmin` ("Admins only.")                                                       |
| `NotFoundError(message = "Not found.", code?)`               | 404    | row missing **or belongs to someone else** (never reveal which) | `getOwnedProfile`, unknown title                                                      |
| `ConflictError(message, code?)`                              | 409    | uniqueness/state rule                                           | email taken; `PROFILE_LIMIT`; last profile                                            |
| `ServiceError(message, status, code?)`                       | any    | the base class, for the rest                                    | Razorpay: 503 `PAYMENTS_NOT_CONFIGURED`, 502 gateway failure, 400 `INVALID_SIGNATURE` |

`handleError(error)` in `src/app/api/_lib/http.ts` turns a `ServiceError` into
`Response.json({ error, code? }, { status })`. Anything else is `console.error`-ed and becomes
`500 { error: "Something went wrong. Try again." }`. The message of a `ServiceError` is shown to the user
as is, so keep it short and safe.

Route-level statuses that do not come from services: `parseBody` throws 400 `INVALID_JSON` (body is not
JSON) and 422 (zod issue message); `parseId` throws 404 (a non-numeric path id cannot match a row).

### 1.3 Folder map (final tree)

```
data/
  tmdb/                  TMDB snapshot (genres, people, movies, series, meta) — written by scripts/import-tmdb.mts
  mock/                  hand-written accounts + activity (users, profiles, plans, subscriptions, payments,
                         watch-history, my-list, ratings) — read by src/server/mocks and by the seed
docs/
  SCHEMA.md              the schema (source of truth)
  backend/               this guide + one file per person
drizzle/                 0000_schema.sql, 0001_functions_and_views.sql, meta/  (migrations; commit them)
drizzle.config.ts
scripts/
  import-tmdb.mts        TMDB -> data/tmdb (already works)
src/
  app/                   routes + pages
    api/_lib/            route-only helpers: auth.ts (guards), http.ts (handleError, parseBody, parseWith, parseId),
                         tmdb.ts (TMDB client + error mapping for the admin routes)
    api/**/route.ts      the HTTP contract of every endpoint (top comment) + a thin handler
  components/            ui/ + one folder per feature
  hooks/                 use-media-query.ts, use-progress-sync.ts
  lib/                   CLIENT-SAFE code (no secrets, no database)
    api/                 client.ts (api.*), server.ts (serverApi.*, "server-only")
    constants/index.ts   SESSION_COOKIE, PROFILE_COOKIE, MAX_PROFILES, ONBOARDING_MIN_GENRES,
                         COMPLETED_THRESHOLD, AVATAR_KEYS, ...
    content/             maturity.ts, progress.ts (isCompleted)
    cookies/             profile-cookie.ts
    format/index.ts      formatEpisodeCode, formatCurrency, ...
    razorpay/checkout.ts browser side of Razorpay Checkout
    sql/                 import-title.ts (buildImportScript), literal.ts, highlight.ts
    tmdb/                catalog.ts, client.ts, types.ts (shared with scripts/import-tmdb.mts)
    ui/ utils/           segmented-control.ts; cn()
    validation/          auth.ts (signIn/signUp zod schemas), profile.ts (profileSchema)
  server/                SERVER-ONLY code
    auth/                password.ts (scrypt), session.ts (cookie), session-token.ts (HMAC token; proxy.ts uses it too)
    db/                  index.ts (db), schema/{enums,accounts,billing,catalog,activity,recommendations,index}.ts,
                         seed/ (the seed script, already written; `npm run db:seed`)
    errors/index.ts      ServiceError and subclasses
    mocks/               catalog.ts, db.ts, types.ts   TEMPORARY — see section 6
    services/            users, profiles, catalog, activity, recommendations, billing, payments, admin (.service.ts)
    session/             current-session.ts (getCurrentUser, requireUser, requireProfile ... for server pages)
  types/                 one file per domain + index.ts barrel; mirrors the tables
  proxy.ts               Next.js route guard (page requests only; /api is skipped)
```

### 1.4 What is real and what is a stub today

| Piece                                                                                 | State                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in / sign-out / `GET /api/auth/me` route logic                                   | **Real**: signed cookie `session=<userId>.<HMAC-SHA256>` (`SESSION_SECRET`), scrypt hashing and `timingSafeEqual` verification. The _lookups_ behind them (`findUserCredentialsByEmail`, `findUserById`) are still mock-backed (Person B)                                     |
| `src/proxy.ts`, route guards in `src/app/api/_lib/auth.ts`                            | Real; they call `findUserById` / `getOwnedProfile` which are stubs                                                                                                                                                                                                            |
| `GET /api/admin/tmdb/search`, `GET /api/admin/tmdb/:type/:tmdbId`                     | **Real** live TMDB calls (`TMDB_API_KEY`) and real SQL-preview generation (`src/lib/sql/import-title.ts`); only `markInCatalog` / `findCatalogueId` (database lookups) are stubs                                                                                              |
| `src/server/db` (Drizzle schema, `db`), `drizzle/` migrations 0000 and 0001, the seed | **Real and already applied to Neon**: tables, enums, `maturity_of()`, `interaction_score`, `content_similarity` exist and the database is **seeded**; nothing queries them yet (the services still return mocks), so a service can read real rows the moment you implement it |
| Every other service function                                                          | **Stub**: `// TODO: implement`, returns mock data from `src/server/mocks`, persists nothing                                                                                                                                                                                   |
| `payments.service` Razorpay functions                                                 | Stub: no network call, `keyId: null` so the UI skips Checkout                                                                                                                                                                                                                 |

### 1.5 The mock rule

- `@/server/mocks/*` is imported **only by `src/server/services/*.service.ts`** (never by routes, pages
  or `_lib`). `grep -rn "server/mocks" src` must show only services (and the mocks folder itself).
- When you make a function real, remove its `getMockDb` / `find*` / `to*` imports from the service file
  (keep them while other functions in the same file are still mocks).
- **When no service imports `@/server/mocks`, delete `src/server/mocks/` and the "TEMPORARY" mentions in
  the README.** That is the last commit of the backend phase.
- `payments.service.ts` imports no mocks (it never touched data).

---

## 2. Setup, step by step

**Quick start for a teammate** (the Neon project already has the migrations applied and the seeded
data, so nothing needs creating):

1. Get a `DATABASE_URL` for **your own Neon branch** (2.1; ask whoever owns the Neon project to create the branch, or create it from `main` yourself).
2. `cp .env.example .env` and fill it in (2.2): at least `DATABASE_URL`, `SESSION_SECRET`; `TMDB_API_KEY` for the admin pages; the three `RAZORPAY_*` values only for Person B.
3. `npm install`.
4. `npm run dev`. Services you implement can query real rows immediately.
5. Only if you **reset or break your branch**: `npm run db:migrate` (schema) then `npm run db:seed` (data; it resets the tables first, so re-running always gives the same known state).

The sections below explain each step and the tooling behind it.

### 2.1 Neon (hosted PostgreSQL)

1. Sign up at <https://neon.tech> and **Create project** (Postgres 16 or newer; `UNIQUE NULLS NOT DISTINCT`
   needs 15+). Pick the region closest to you. The default branch is `main`.
2. **One branch per teammate.** In the console: _Branches -> Create branch_, parent `main`, names such as
   `dev-a`, `dev-b`, `dev-c` (CLI: `neonctl branches create --name dev-a`). A branch is a copy-on-write
   fork of the parent's schema **and data**, so once `main` has the migrations and the seed, a new branch
   starts fully populated. Reset a branch from its parent when you have broken it (_Branch -> Reset from
   parent_).
3. `main` is the shared baseline (migrated and seeded). Only merge-ready schema changes are applied to it, by the person
   merging the PR (section 8.3).
4. Connection string: console -> _Connect_ -> pick the **branch** and database. Two flavours:

   |                    | Host looks like                      | Use for                                                                                                          |
   | ------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
   | Pooled (PgBouncer) | `ep-xxx-pooler.region.aws.neon.tech` | the running app (`DATABASE_URL`)                                                                                 |
   | Direct             | `ep-xxx.region.aws.neon.tech`        | `drizzle-kit migrate`, the seed script, anything long-lived or using session features (`LISTEN`, advisory locks) |

   Keep `?sslmode=require` on the string. Transactions work through the pooler (a transaction pins one
   backend connection), but if a migration or the seed hangs or fails on the pooled string, paste the
   direct string into `DATABASE_URL` for that command. Keep `Pool({ max })` small (10 today) so the pooler
   and the free tier's connection limit are not exhausted.

### 2.2 Environment variables

Copy `.env.example` to `.env` (git-ignored). Names are exact:

| Variable                  | Used by                                                      | Notes                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | `src/server/db/index.ts`, `drizzle.config.ts`                | your **own** Neon branch. Not yet listed in `.env.example`: add it (`DATABASE_URL=`) in the first schema PR                                                 |
| `SESSION_SECRET`          | `src/server/auth/session-token.ts`                           | HMAC key of the session cookie. Optional in dev (insecure built-in secret + warning), **required in production** (throws). Generate: `openssl rand -hex 32` |
| `TMDB_API_KEY`            | `src/app/api/_lib/tmdb.ts`, `scripts/import-tmdb.mts`        | v4 read token or v3 key. Only the admin import and the snapshot script need it                                                                              |
| `RAZORPAY_KEY_ID`         | `payments.service` (Orders API, `keyId` sent to the browser) | **Test mode** key (`rzp_test_...`)                                                                                                                          |
| `RAZORPAY_KEY_SECRET`     | `payments.service` (basic auth, Checkout signature)          | server only, never returned by any route                                                                                                                    |
| `RAZORPAY_WEBHOOK_SECRET` | `payments.service` (`verifyWebhookSignature`)                | the secret you type when creating the webhook in the Razorpay dashboard                                                                                     |

Nothing else is read from the environment (`NODE_ENV` is set by Next). Never commit `.env`, never put
live Razorpay keys in it.

### 2.3 Dependencies

`package.json` already contains what the pinned design needs (check with `npm ls drizzle-orm pg drizzle-kit`).
From scratch the commands are:

```bash
npm install drizzle-orm pg
npm install -D drizzle-kit @types/pg
npm install -D tsx          # runs the seed (src/server/db/seed); already added with the seed
```

The driver is plain `pg` (node-postgres) over a `Pool`, which supports interactive transactions
(`db.transaction`), `SELECT ... FOR UPDATE` and `REFRESH MATERIALIZED VIEW`. (Neon's HTTP driver
`@neondatabase/serverless` + `drizzle-orm/neon-http` does **not** support interactive transactions, which
is why we do not use it.)

### 2.4 `drizzle.config.ts` (already in the repo)

```ts
import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env file: DATABASE_URL must come from the environment
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
```

`casing: "snake_case"` means a TypeScript key `passwordHash` is the column `password_hash` with no
`varchar("password_hash")` repeated. The same `casing` option is passed to `drizzle()` in `db/index.ts`.

### 2.5 Schema layout (`src/server/db/schema/`)

| File                 | Contents                                                                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enums.ts`           | `userRole`, `maturityLevel` (declared order KIDS < TEEN < ADULT), `contentType`, `creditRole`, `subscriptionStatus`, `paymentMode`, `paymentStatus`, `recStatus`                                                                 |
| `accounts.ts`        | `users`, `profile`, `profileGenrePreference` (+ relations)                                                                                                                                                                       |
| `billing.ts`         | `subscriptionPlan`, `subscription`, `payment`                                                                                                                                                                                    |
| `catalog.ts`         | `genre`, `content`, `contentGenre`, `season`, `episode`, `person`, `contentCredit`                                                                                                                                               |
| `activity.ts`        | `watchHistory`, `myList`, `rating`                                                                                                                                                                                               |
| `recommendations.ts` | `recommendation`, plus `interactionScore` (`pgView(...).existing()`) and `contentSimilarity` (`pgMaterializedView(...).existing()`). `.existing()` means the view is only _declared_ for typing; its SQL lives in migration 0001 |
| `index.ts`           | barrel re-exporting all of the above                                                                                                                                                                                             |

Table object names (camelCase TS) -> tables: `users`, `profile`, `profileGenrePreference`
(`profile_genre_preference`), `subscriptionPlan` (`subscription_plan`), `subscription`, `payment`, `genre`,
`content`, `contentGenre`, `season`, `episode`, `person`, `contentCredit`, `watchHistory`, `myList`,
`rating`, `recommendation`.

Named constraints you will need in `ON CONFLICT ON CONSTRAINT` or error handling:
`users_email_key` (index on `lower(email)`), `profile_user_name_key` (index on `(user_id, lower(name))`),
`subscription_one_active_per_user` (partial unique index), `payment_transaction_ref_key` (UNIQUE on `transaction_ref`), `content_title_type_release_key`,
`person_name_dob_key`, `season_content_number_key`, `episode_season_number_key`,
`watch_history_profile_content_episode_key`, `content_similarity_pair_key`.

### 2.6 The client (`src/server/db/index.ts`, already in the repo)

```ts
import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
// cached on globalThis so dev hot reload does not open a new pool per reload
const globalForDb = globalThis as unknown as { __reelhouseDb?: Database };

function createDb(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set. Add the Neon connection string to .env (see .env.example).");
  const pool = new Pool({ connectionString, max: 10 });
  return drizzle(pool, { schema, casing: "snake_case" });
}
export const db: Database = /* lazy Proxy: nothing connects until the first query */;
export * from "./schema";
```

Usage in a service:

```ts
import { and, eq, sql } from "drizzle-orm";
import { db, profile } from "@/server/db"; // schema tables are re-exported from "@/server/db"

const rows = await db.select().from(profile).where(eq(profile.userId, userId)).orderBy(profile.profileId);
await db.transaction(async (tx) => {
  /* tx.insert(...), tx.execute(sql`...`) */
});
const result = await db.execute(sql`SELECT ... WHERE profile_id = ${profileId}`); // result.rows
```

Rule of thumb: use the query builder for simple CRUD (typed, camelCase for free); use ``sql`...` `` /
`db.execute` for the SQL that the service comments spell out (CTEs, `FILTER`, `unnest`, window functions,
`FOR UPDATE`). Both are fine; copy the commented SQL, do not re-derive it.

The raw pool is `db.$client` (a `pg.Pool`), used where you need `$n` placeholders verbatim or one dedicated
connection (`const client = await db.$client.connect(); try { ... } finally { client.release(); }`), for
example `importTitle`. Server-only: the `"server-only"` import makes importing `@/server/db` from a client
component a build error.

### 2.7 Migrations workflow

Existing migrations: `drizzle/0000_schema.sql` (tables, enums, constraints, indexes generated by
drizzle-kit) and `drizzle/0001_functions_and_views.sql` (custom: `maturity_of()`, the `interaction_score`
view, the `content_similarity` materialized view and its unique index). `drizzle/meta/` is drizzle-kit's
bookkeeping; commit it.

Daily commands:

| Task                                                     | Command                                          |
| -------------------------------------------------------- | ------------------------------------------------ |
| Generate SQL from schema changes                         | `npm run db:generate` (= `drizzle-kit generate`) |
| Apply pending migrations to the branch in `DATABASE_URL` | `npm run db:migrate` (= `drizzle-kit migrate`)   |
| Browse data                                              | `npm run db:studio` (= `drizzle-kit studio`)     |
| Reset and re-seed the branch in `DATABASE_URL` (see 2.8) | `npm run db:seed`                                |

`db:generate`, `db:migrate`, `db:studio` and `db:seed` are npm scripts in `package.json`. The seed runs
through `tsx` because the schema files import each other without file extensions (`from "./enums"`), which
plain `node` type-stripping rejects; `tsx` also resolves the `@/*` alias from `tsconfig.json`.

The loop for any schema change:

1. Edit `src/server/db/schema/*.ts` (and `docs/schema/SCHEMA.md`, and `src/types/*` if an API shape changes) in one PR.
2. `npm run db:generate`. **Read the generated SQL** before applying. Check: `NULLS NOT DISTINCT` is
   present on the three natural keys, partial index `WHERE` clauses, expression indexes (`lower(...)`),
   `GENERATED ALWAYS AS IDENTITY`, CHECK constraints, `ON DELETE` actions.
3. Anything drizzle-kit does not emit correctly goes into a **custom migration**:
   `npx drizzle-kit generate --custom --name=<what>` creates an empty `NNNN_<what>.sql`; write plain SQL
   there (separate statements with `--> statement-breakpoint`). Typical contents: functions
   (`maturity_of`), views and materialized views, `CREATE EXTENSION`, triggers, indexes with expressions
   or `NULLS NOT DISTINCT` that the generator mangles. Views you create by hand are declared in the schema
   with `.existing()` so the generator does not try to create them again.
4. `npm run db:migrate` on **your** branch, test, commit the schema, the SQL and `drizzle/meta/`.
5. Never edit a migration that has been merged; add a new one.
6. Two people generating a migration in parallel produce clashing numbers and `_journal.json` edits. Rule:
   a schema PR is merged before the next one is generated; if you collide, delete your generated
   `NNNN_*.sql` and snapshot, rebase onto `main`, and run `db:generate` again.

Migration `0002_fix_subscription_check` (applied) enables the `unaccent` extension used by
`searchContent` and relaxes `subscription_dates_check` so a never-paid checkout can be CANCELLED
without dates (see section 7.3).

### 2.8 The seed (already done)

The seed script lives in `src/server/db/seed/` and runs with `npm run db:seed` (through `tsx`). It is
**finished and has been run on Neon**: the shared database already contains the migrations and the seeded
data, so there is no seed task in anyone's checklist.

What it loads:

- **Catalogue from `data/tmdb`**: genres, people, 300 movies + 200 series, their genre links, cast and
  directors (`content_credit`), seasons and episodes.
- **Accounts and activity from `data/mock`**: `users` (including the scrypt hashes already stored in
  `users.json`: demo@reelhouse.dev / demo1234 and admin@reelhouse.dev / admin1234), `profile`,
  `profile_genre_preference`, `subscription_plan`, `subscription`, `payment`, `watch_history`, `my_list`,
  `rating`.

How it resolves references: TMDB ids exist only in memory. Mock rows reference a title as
`{ contentType, tmdbId }`, an episode as `seasonNumber` + `episodeNumber`, a genre pick by genre name; the
seed matches those to the snapshot, inserts by natural key and keeps the returned ids in maps (insert
order: genre, person, content, content_genre, content_credit, season, episode, users, profile,
profile_genre_preference, subscription_plan, subscription, payment, watch_history, my_list, rating).
`content_similarity` is refreshed at the end so the kNN view is populated.

It **resets the tables before inserting**: all 17 tables are truncated with `RESTART IDENTITY CASCADE`,
then everything is inserted **in one transaction** (a failure leaves the database unchanged), so
re-running `npm run db:seed` always gives the same clean, known state. Identity ids are never inserted
explicitly: rows are inserted, ids read back with `RETURNING`, and snapshot/mock keys are mapped to them in
memory. Because it inserts in the same order as `src/server/mocks` assigns ids (genres in snapshot =
alphabetical order, movies before series, mock users/profiles/subscriptions/payments by their file ids,
history by `watched_at`), the ids normally match the mock layer's; the curl examples in section 4 rely on
that, so confirm with a quick query if something looks off. No `recommendation` rows are created (the
pipeline generates them later). Run it on your own Neon branch only; it destroys whatever you inserted by hand.

To change demo data, edit `data/mock/*.json` and re-run the seed. To make a new password hash for
`users.json`:
`node -e "const c=require('crypto');const s=c.randomBytes(16);console.log('scrypt\$'+s.toString('hex')+'\$'+c.scryptSync('demo1234',s,64).toString('hex'))"`.

---

## 3. Conventions

### 3.1 Service contracts

- A service function takes ids/validated input and returns the exact shape in `src/types` (camelCase,
  ISO strings, numbers). Routes never reshape service results beyond wrapping (`{ items }`, `{ profile }`).
- **Validation split:** the route validates _shape_ (zod: types, ranges, trimming, enums, `parseId`);
  the service validates _rules that need the database_ (exists, owned, limit, unique, belongs to) and
  throws a typed error. Services still defensively clamp (e.g. `progressPercent`) where the CHECK is only a backstop.
- A service never trusts the caller for money or ownership: prices come from `subscription_plan`, ownership
  from `user_id`/`profile_id` predicates.
- Keep one place per rule: weights in `WEIGHTS` (recommendations), thresholds in `@/lib/constants`
  (`MAX_PROFILES`, `ONBOARDING_MIN_GENRES`, `COMPLETED_THRESHOLD`), reasons in `REASONS`.

### 3.2 Database errors to typed errors

`pg` errors carry `code` (SQLSTATE) and `constraint`. Drizzle 0.45 wraps them in a `DrizzleQueryError`
whose `cause` is the original error, so look at both:

```ts
function pgError(error: unknown): { code?: string; constraint?: string } {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  return { code: e?.code ?? e?.cause?.code, constraint: e?.constraint ?? e?.cause?.constraint };
}
// 23505 unique_violation -> ConflictError   (users_email_key -> "That email is already registered.")
// 23503 foreign_key_violation -> NotFoundError("Title not found.")  (unknown content_id on my_list/rating)
// 23514 check_violation -> ValidationError  (should be unreachable if validation is right; log it)
```

Put the helper in one shared file (suggestion: `src/server/db/errors.ts`, added by a PR everyone sees),
not copied three times.

### 3.3 Transactions

Use `db.transaction(async (tx) => { ... })` and run **every** statement of the unit on `tx`. Rule: a
transaction wraps any group of writes that must be all-or-nothing or any check-then-write that
concurrency could break. Single statements need none.

| Function                           | Why a transaction                                  | Lock                                                            |
| ---------------------------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| `createUser`                       | users row + first profile together                 | none (unique index decides races)                               |
| `createProfile`                    | count < 5 and insert must not race                 | `SELECT user_id FROM users WHERE user_id = $1 FOR UPDATE` first |
| `deleteProfile`                    | count > 1 and delete must not race                 | same users-row lock                                             |
| `saveGenrePreferences`             | delete picks + insert picks + stamp `onboarded_at` | none                                                            |
| `createPendingSubscription`        | cancel earlier PENDING + insert new                | none                                                            |
| `recordCapturedPayment`            | payment insert + subscription state change         | `SELECT ... FROM subscription ... FOR UPDATE`                   |
| `recordProgress`                   | upsert + `rec_status` update                       | none                                                            |
| `storeRecommendations`             | upserts + stale delete                             | none                                                            |
| `importTitle`                      | the whole title or nothing                         | dedicated client, `BEGIN`/`COMMIT` statements                   |
| `getContentDetail`, `getDashboard` | optional: one consistent snapshot                  | `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`               |

`REFRESH MATERIALIZED VIEW CONCURRENTLY` cannot run inside a transaction block: call it on `db` directly.

### 3.4 Auth helpers and ownership

`src/app/api/_lib/auth.ts` (they throw typed errors; routes wrap in `try/catch -> handleError`):

| Helper                                                               | Behaviour                                                                                                                                                         |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requireUser(): Promise<User>`                                       | session cookie -> `findUserById`; 401 when missing, tampered, or the user no longer exists                                                                        |
| `requireAdmin(): Promise<User>`                                      | `requireUser`, then 403 `"Admins only."` unless `role === "ADMIN"`                                                                                                |
| `requireOwnedProfile(profileId: string): Promise<{ user, profile }>` | `requireUser`, parse id (bad id -> 404), `getOwnedProfile(user.userId, id)` (**404, never 403**, for another user's profile)                                      |
| `getSelectedProfile(): Promise<Profile \| null>`                     | the `profileId` cookie, only if it belongs to the signed-in user; `null` otherwise. Catalogue routes use `profile?.maturityLevel ?? null` for the maturity filter |

Ownership rule: every query that touches user data filters by the owner. Profile-scoped tables by
`profile_id` (already proven owned by `requireOwnedProfile` before the service runs); account tables by
`user_id`. A row that exists but is not yours is reported exactly like a missing row.

### 3.5 Idempotency

| Operation                    | Mechanism                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Add to My List               | `INSERT ... ON CONFLICT (profile_id, content_id) DO NOTHING`                                                              |
| Rate                         | `INSERT ... ON CONFLICT (profile_id, content_id) DO UPDATE SET value, rated_at = now()`                                   |
| Progress                     | `INSERT ... ON CONFLICT (profile_id, content_id, episode_id) DO UPDATE` (`NULLS NOT DISTINCT` so movies conflict too)     |
| Remove from My List / rating | `DELETE` (deleting nothing is success)                                                                                    |
| Payment webhook / verify     | `INSERT payment ... ON CONFLICT (transaction_ref) DO NOTHING`; no row returned = already processed                        |
| Failed payment               | same, status `FAILED`                                                                                                     |
| TMDB import                  | every statement is an upsert on a natural key                                                                             |
| Seed                         | truncates first, so a re-run always ends in the same state                                                                |
| `storeRecommendations`       | upsert on `(profile_id, content_id)`; `rec_status` deliberately not overwritten                                           |
| Not idempotent by design     | `createUser`, `createProfile`, `createPendingSubscription`, `removeHistoryEntry` (2nd call is 404), `createRazorpayOrder` |

### 3.6 Money

- DB: `NUMERIC(10,2)` in **rupees** (`subscription_plan.price_monthly`, `payment.amount`).
- Drizzle returns `numeric` columns as **strings** (and raw `pg` does for `numeric`/`bigint`/`COUNT`).
  Rule: convert with `Number(...)` at the service boundary, never later; the API and `src/types`
  carry rupees as `number` (e.g. `399`). Cast in SQL where convenient: `COUNT(*)::int`, `SUM(amount)::numeric`
  then `Number()`.
- Razorpay speaks **paise integers**. Convert once: `paise = Math.round(Number(priceMonthly) * 100)`;
  store `payment.amount` as `(paise / 100).toFixed(2)` (a string for the numeric column) or in SQL as
  `$paise::numeric / 100`. **Never** write `$paise / 100` with an integer parameter: PostgreSQL does integer
  division and `39900 / 100` is fine but `39950 / 100` silently truncates; always cast to numeric first.
- Compare amounts in paise (integers), never as floats.

### 3.7 Timestamps and dates

- All timestamps are `TIMESTAMPTZ`, stored and computed in UTC (`now()`), and sent through the API as ISO
  8601 strings (`2026-10-18T08:40:00.000Z`). Drizzle `timestamp({ withTimezone: true })` (mode `date`)
  gives `Date`: use `.toISOString()` at the service boundary.
- Raw `db.execute` timestamps may arrive as strings in PostgreSQL text format
  (`2026-10-18 08:40:00+00`) because the driver is configured to leave date types unparsed. Normalise
  with `new Date(value).toISOString()`. Suggested shared helper `toIso(value: Date | string | null)`.
- `DATE` columns (`release_date`, `date_of_birth`) are plain `YYYY-MM-DD` strings; drizzle's `date()`
  default mode is `string`. Do not wrap them in `new Date` (time zones would shift them).
- "One month" for subscriptions is `now() + interval '1 month'` computed in SQL.

### 3.8 Enums

- PostgreSQL `pgEnum`s with upper-case values, the same strings as `src/types` (`"MOVIE"`, `"ADULT"`,
  `"ACTIVE"`, `"UPI"`, ...). Order of `maturity_level` is meaningful (`KIDS < TEEN < ADULT`), so
  `maturity_of(c.age_rating) <= $level` works. Adding a value: change `enums.ts` and generate a migration
  (`ALTER TYPE ... ADD VALUE` cannot run in a transaction block with other statements; drizzle-kit handles it).
- If you add or rename a value, change `src/types` in the same PR.

### 3.9 Naming

- Tables singular snake_case (`watch_history`) except `users`; columns snake_case; TypeScript keys camelCase;
  `casing: "snake_case"` in `drizzle.config.ts` and in `drizzle()` converts. Raw SQL always uses snake_case;
  alias to camelCase (`AS "onboardingCompleted"`) when the row is returned as-is.
- Service files `<domain>.service.ts` export plain functions; no classes.
- Row mapping: one small `mapX(row)` function per entity in the service file (snake_case row ->
  `src/types` shape) so the conversion (`Number`, `toISOString`) lives in one place.

---

## 4. Testing routes with curl

All routes are under `http://localhost:3000` after `npm run dev`. Start from a freshly seeded branch:
ids below assume a fresh `npm run db:seed` (users 1 = demo, 2 = admin; profiles 1 Riya (ADULT), 2 Kabir (TEEN),
3 Mini (KIDS, onboarding not done); plans 1 Matinee 179, 2 Feature 399, 3 Premiere 599).

### 4.1 Cookie jar

```bash
BASE=http://localhost:3000
# sign in as the demo user; the jar keeps the httpOnly `session` cookie
curl -c jar -H 'content-type: application/json' \
  -d '{"email":"demo@reelhouse.dev","password":"demo1234"}' $BASE/api/auth/sign-in

curl -b jar $BASE/api/auth/me                              # session only
# the profile cookie is a plain cookie the browser sets; send it next to the jar for maturity filtering
curl -b jar -b 'profileId=3' "$BASE/api/content?limit=5"   # Mini (KIDS): only maturity_of(...) = 'KIDS' titles
# or keep both in one variable
J=(-b jar -b 'profileId=1')
curl "${J[@]}" $BASE/api/genres
# admin
curl -c jar-admin -H 'content-type: application/json' \
  -d '{"email":"admin@reelhouse.dev","password":"admin1234"}' $BASE/api/auth/sign-in
curl -b jar-admin $BASE/api/admin/dashboard
```

`-b` may be repeated (a file and a literal). Add `-i` to see status and headers, `| jq` to pretty-print.
Sign-in clears `profileId`, so always pass it again (or any `profileId` you want).

### 4.2 Example call per route

| Route                                  | Example (after the sign-in above)                                                                                                                                         | Expect                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `POST /api/auth/sign-up`               | `curl -H 'content-type: application/json' -d '{"name":"Test User","email":"t@x.dev","phone":null,"password":"password1"}' $BASE/api/auth/sign-up`                         | 201 `{user}`; again -> 409                                        |
| `POST /api/auth/sign-in`               | see 4.1                                                                                                                                                                   | 200 + Set-Cookie; wrong password -> 401                           |
| `POST /api/auth/sign-out`              | `curl -b jar -X POST $BASE/api/auth/sign-out -i`                                                                                                                          | 204                                                               |
| `GET /api/auth/me`                     | `curl -b jar $BASE/api/auth/me`                                                                                                                                           | 200 `{user}` / 401                                                |
| `GET /api/plans`                       | `curl $BASE/api/plans`                                                                                                                                                    | 3 plans, cheapest first                                           |
| `GET /api/account`                     | `curl -b jar $BASE/api/account`                                                                                                                                           | `{user, subscription}`                                            |
| `GET /api/account/subscriptions`       | `curl -b jar $BASE/api/account/subscriptions`                                                                                                                             | paid history, newest first                                        |
| `GET /api/account/payments`            | `curl -b jar $BASE/api/account/payments`                                                                                                                                  | 8 payments (FAILED included)                                      |
| `POST /api/account/subscriptions`      | `curl -b jar -H 'content-type: application/json' -d '{"planId":3}' $BASE/api/account/subscriptions`                                                                       | 201 `CheckoutOrder`; unknown plan 404; `{"planId":"x"}` 422       |
| `POST /api/payments/verify`            | `curl -b jar -H 'content-type: application/json' -d '{"razorpay_order_id":"order_x","razorpay_payment_id":"pay_x","razorpay_signature":"bad"}' $BASE/api/payments/verify` | 400 `INVALID_SIGNATURE` (real impl)                               |
| `POST /api/payments/webhook`           | signed body, see Person B's file (openssl snippet)                                                                                                                        | 200 `{}` / 400                                                    |
| `GET /api/profiles`                    | `curl -b jar $BASE/api/profiles`                                                                                                                                          | 3 profiles                                                        |
| `POST /api/profiles`                   | `curl -b jar -H 'content-type: application/json' -d '{"name":"Dev","avatar":"star","maturityLevel":"TEEN"}' $BASE/api/profiles`                                           | 201; 6th -> 409 `PROFILE_LIMIT`; same name -> 409                 |
| `GET/PATCH/DELETE /api/profiles/1`     | `curl -b jar -X PATCH -H 'content-type: application/json' -d '{"name":"Riya S"}' $BASE/api/profiles/1`; profile 99 or another user's -> 404                               | 200 / 204 / 404 / 409 (last profile)                              |
| `GET/PUT /api/profiles/3/onboarding`   | `curl -b jar -X PUT -H 'content-type: application/json' -d '{"genreIds":[1,2,3]}' $BASE/api/profiles/3/onboarding`                                                        | 200 `{profile}` with `onboardingCompleted: true`; 2 genres -> 422 |
| `GET /api/genres`                      | `curl $BASE/api/genres`                                                                                                                                                   | alphabetical                                                      |
| `GET /api/content`                     | `curl "${J[@]}" "$BASE/api/content?q=nolan&type=MOVIE&genre=1&limit=10"`                                                                                                  | `{items}`                                                         |
| `GET /api/content/:id`                 | `curl "${J[@]}" $BASE/api/content/1`                                                                                                                                      | `{content}`; `/api/content/999999` -> 404                         |
| `GET /api/content/:id/similar`         | `curl "${J[@]}" $BASE/api/content/1/similar`                                                                                                                              | up to 12                                                          |
| `GET /api/profiles/1/home`             | `curl -b jar $BASE/api/profiles/1/home`                                                                                                                                   | `HomeFeed`; profile of another user -> 404                        |
| `POST /api/profiles/1/progress`        | `curl -b jar -H 'content-type: application/json' -d '{"contentId":1,"episodeId":null,"progressPercent":95}' $BASE/api/profiles/1/progress`                                | 200 `{entry}`; a series without `episodeId` -> 422                |
| `GET /api/profiles/1/history`          | `curl -b jar $BASE/api/profiles/1/history`                                                                                                                                | newest first                                                      |
| `DELETE /api/profiles/1/history/3`     | `curl -b jar -X DELETE $BASE/api/profiles/1/history/3 -i`                                                                                                                 | 204; again -> 404                                                 |
| `GET/POST /api/profiles/1/my-list`     | `curl -b jar -H 'content-type: application/json' -d '{"contentId":2}' $BASE/api/profiles/1/my-list`                                                                       | 201 `{contentId, inMyList:true}`; repeat -> 201                   |
| `DELETE /api/profiles/1/my-list/2`     | `curl -b jar -X DELETE $BASE/api/profiles/1/my-list/2`                                                                                                                    | 200 `{contentId, inMyList:false}`                                 |
| `PUT/DELETE /api/profiles/1/ratings/2` | `curl -b jar -X PUT -H 'content-type: application/json' -d '{"value":5}' $BASE/api/profiles/1/ratings/2`                                                                  | 200 `{rating}`; `{"value":6}` -> 422                              |
| `GET /api/profiles/1/titles/2`         | `curl -b jar $BASE/api/profiles/1/titles/2`                                                                                                                               | `{inMyList, rating, resume}`                                      |
| `GET /api/admin/dashboard`             | `curl -b jar-admin $BASE/api/admin/dashboard`                                                                                                                             | 9 widgets; demo user -> 403, signed out -> 401                    |
| `GET /api/admin/tmdb/search`           | `curl -b jar-admin "$BASE/api/admin/tmdb/search?q=dune&type=movie"`                                                                                                       | live TMDB results with `alreadyInCatalog`                         |
| `GET /api/admin/tmdb/:type/:tmdbId`    | `curl -b jar-admin $BASE/api/admin/tmdb/movie/438631`                                                                                                                     | preview + `statements`                                            |
| `POST /api/admin/content/import`       | `curl -b jar-admin -H 'content-type: application/json' -d '{"type":"movie","tmdbId":438631}' $BASE/api/admin/content/import`                                              | 201 `created:true`; again 200 `created:false`                     |

Also check every guarded route **without** a cookie (401) and with a profile id that belongs to another
account (404), and every write route twice (idempotency).

---

## 5. Route to service index

Guards: **none** = public; **U** = `requireUser`; **P** = `requireOwnedProfile(:profileId)`; **A** = `requireAdmin`;
**S** = `getSelectedProfile` (optional maturity filter). Status codes list what the route's contract documents
(plus 401 for guarded routes). Owner = who implements the service function.

| Method | Path                                          | Guard            | Calls                                                                                          | Status codes                                | Owner |
| ------ | --------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------- | ----- |
| POST   | `/api/auth/sign-in`                           | none             | `findUserCredentialsByEmail`, `verifyPassword`, `startSession`                                 | 200, 400, 401                               | B     |
| POST   | `/api/auth/sign-up`                           | none             | `hashPassword`, `createUser`                                                                   | 201, 409, 422                               | B     |
| POST   | `/api/auth/sign-out`                          | none             | `endSession`                                                                                   | 204                                         | B     |
| GET    | `/api/auth/me`                                | U                | `findUserById` (via `requireUser`)                                                             | 200, 401                                    | B     |
| GET    | `/api/plans`                                  | none             | `listPlans`                                                                                    | 200                                         | B     |
| GET    | `/api/account`                                | U                | `getActiveSubscription`                                                                        | 200, 401                                    | B     |
| GET    | `/api/account/subscriptions`                  | U                | `listSubscriptions`                                                                            | 200, 401                                    | B     |
| POST   | `/api/account/subscriptions`                  | U                | `getPlan`, `createPendingSubscription`, `createRazorpayOrder`                                  | 201, 401, 404, 409, 422, 502, 503           | B     |
| GET    | `/api/account/payments`                       | U                | `listPayments`                                                                                 | 200, 401                                    | B     |
| POST   | `/api/payments/verify`                        | U                | `verifyPaymentSignature`, `fetchPayment`, `recordCapturedPayment`                              | 200, 400, 401, 422, 502, 503                | B     |
| POST   | `/api/payments/webhook`                       | none (signature) | `verifyWebhookSignature`, `parseWebhookEvent`, `recordFailedPayment` / `recordCapturedPayment` | 200, 400, 500                               | B     |
| GET    | `/api/profiles`                               | U                | `listProfiles`                                                                                 | 200, 401                                    | B     |
| POST   | `/api/profiles`                               | U                | `createProfile`                                                                                | 201, 401, 409, 422                          | B     |
| GET    | `/api/profiles/:profileId`                    | P                | `getOwnedProfile`                                                                              | 200, 401, 404                               | B     |
| PATCH  | `/api/profiles/:profileId`                    | P                | `updateProfile`                                                                                | 200, 401, 404, 409, 422                     | B     |
| DELETE | `/api/profiles/:profileId`                    | P                | `deleteProfile` (+ clears `profileId` cookie)                                                  | 204, 401, 404, 409                          | B     |
| GET    | `/api/profiles/:profileId/onboarding`         | P                | `getGenrePreferences`                                                                          | 200, 401, 404                               | B     |
| PUT    | `/api/profiles/:profileId/onboarding`         | P                | `saveGenrePreferences`                                                                         | 200, 401, 404, 422                          | B     |
| GET    | `/api/genres`                                 | none             | `listGenres`                                                                                   | 200                                         | A     |
| GET    | `/api/content`                                | S                | `searchContent`                                                                                | 200                                         | A     |
| GET    | `/api/content/:contentId`                     | none             | `getContentDetail`                                                                             | 200, 404                                    | A     |
| GET    | `/api/content/:contentId/similar`             | S                | `getSimilarTitles`                                                                             | 200, 404                                    | A     |
| GET    | `/api/admin/dashboard`                        | A                | `getDashboard`                                                                                 | 200, 401, 403                               | A     |
| GET    | `/api/admin/tmdb/search`                      | A                | TMDB live + `markInCatalog`                                                                    | 200, 400, 401, 403, 502, 503                | A     |
| GET    | `/api/admin/tmdb/:type/:tmdbId`               | A                | TMDB live + `findCatalogueId` + `buildImportScript`                                            | 200, 400, 401, 403, 404, 502, 503           | A     |
| POST   | `/api/admin/content/import`                   | A                | (TODO fetch title) + `importTitle`                                                             | 201, 200, 400, 401, 403, 404, 500, 502, 503 | A     |
| GET    | `/api/profiles/:profileId/home`               | P                | `getHomeFeed`                                                                                  | 200, 401, 404                               | C     |
| POST   | `/api/profiles/:profileId/progress`           | P                | `recordProgress`                                                                               | 200, 401, 404, 422                          | C     |
| GET    | `/api/profiles/:profileId/history`            | P                | `listHistory`                                                                                  | 200, 401, 404                               | C     |
| DELETE | `/api/profiles/:profileId/history/:historyId` | P                | `removeHistoryEntry`                                                                           | 204, 401, 404                               | C     |
| GET    | `/api/profiles/:profileId/my-list`            | P                | `listMyList`                                                                                   | 200, 401, 404                               | C     |
| POST   | `/api/profiles/:profileId/my-list`            | P                | `addToMyList`                                                                                  | 201, 401, 404, 422                          | C     |
| DELETE | `/api/profiles/:profileId/my-list/:contentId` | P                | `removeFromMyList`                                                                             | 200, 401, 404                               | C     |
| PUT    | `/api/profiles/:profileId/ratings/:contentId` | P                | `rateTitle`                                                                                    | 200, 401, 404, 422                          | C     |
| DELETE | `/api/profiles/:profileId/ratings/:contentId` | P                | `removeRating`                                                                                 | 204, 401, 404                               | C     |
| GET    | `/api/profiles/:profileId/titles/:contentId`  | P                | `getTitleActivity`                                                                             | 200, 401, 404                               | C     |

Notes: `/api/**` is skipped by `src/proxy.ts`, so API routes answer 401 themselves. The old
`GET /api/profiles/:profileId/onboarding/candidates` route was removed (onboarding is genre picks only).
`/api/auth/*` routes keep their current code; only the service lookups behind them change.

---

## 6. How `src/server/mocks` works today

`src/server/mocks/{db.ts, catalog.ts, types.ts}` is the **temporary** in-memory database the stubs read.
It is loaded **once per server process** (lazy singleton `getMockDb()`; a restart or a Next dev hot reload
rebuilds it) from two folders under `data/`:

- `data/tmdb`: `genres.json` (18), `people.json` (~2.9k), `movies.json` (300), `series.json` (200 with seasons
  and episodes), `meta.json` (counts + attribution). Written by `npm run import:tmdb`; do not edit by hand.
- `data/mock`: `users`, `profiles` (with `genrePreferences` by genre **name**), `plans`, `subscriptions`,
  `payments`, `watch-history`, `my-list`, `ratings`. Hand-written, field names = `src/types` camelCase.

### 6.1 Id assignment (`catalog.ts`, `buildCatalog`)

| Entity                   | Rule                                                                                                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `genreId`                | genres sorted alphabetically by `name` (`localeCompare`), ids `1..18` (Action = 1)                                                                                                                                                                       |
| `personId`               | `people.json` order, `1..n`                                                                                                                                                                                                                              |
| `contentId`              | all movies in snapshot order, then all series in snapshot order, `1..500`                                                                                                                                                                                |
| `seasonId` / `episodeId` | one running counter across all series: seasons in series order then `seasonNumber`; episodes in that order then `episodeNumber`. **Season 0 ("Specials") and seasons with no episodes are skipped**                                                      |
| Content fields           | `durationMinutes` only for `MOVIE` (null for series); `cast` sorted by `order`; unknown `personTmdbId`/genre ids are silently dropped; `directors` follow `directorIds` order; `maturityLevel` comes from the snapshot (same mapping as `maturity_of()`) |
| Ids in `data/mock` rows  | `userId`, `profileId`, `subscriptionId`, `paymentId`, `historyId` are taken **from the files** (not assigned)                                                                                                                                            |

### 6.2 Natural-key resolution (`db.ts`)

Mock rows never carry app ids for titles. They reference:

- a title as `TitleRef { contentType, tmdbId }` -> `catalog.findByTmdb(contentType, tmdbId)`
  (map keyed `"MOVIE:438631"`); TMDB ids are unique only per type;
- an episode as `seasonNumber` + `episodeNumber` -> found inside that content's seasons;
- a profile's genre picks as genre **names** -> `catalog.genreByName`.

Every reference is checked at load: an unknown title, genre, season or episode **throws at load**
(`data/mock/watch-history.json: no SERIES with tmdbId ... in data/tmdb.`), so a typo fails loudly on the
first request. `catalog.findByKey(contentType, title, releaseDate)` implements the content natural key
(used by admin `markInCatalog` / `findCatalogueId`).

### 6.3 What else to know

- Password hashes live in a separate `passwordHashByUserId` map: `User` objects never carry them;
  `findUserCredentials(email)` (case-insensitive) is the only way to read one.
- `watchHistory` is kept in file order = newest first.
- Read-only: nothing in the stubs writes; mutations "succeed" but a reload shows the same data. Every
  request in every process sees the same rows.
- TMDB ids exist only inside this module and the snapshot; no route or response ever contains one (the
  database has no TMDB id column either).
- Helpers `toSummary`, `toHistoryItem`, `withPlan`, `findUser`, `findProfile`, `findContent` shape rows
  like the real services must.

### 6.4 Migrating off it

Because the seed reproduces the same ids, a service can switch to SQL while its neighbours
still read the mock, **as long as you test with seeded rows** (user 1, profiles 1-3). Rows created through
a real function (a new profile) do not exist in the mock and vice versa, so a half-migrated call chain
(e.g. real `createProfile` + mock `getOwnedProfile`) will 404 on the new row until the other function is
real too. The delete-the-folder rule is in section 1.5.

---

## 7. Phase 1 schema checklist

Phase 1 is done together, before anyone starts Phase 2. The design is `../schema/SCHEMA.md`.

### 7.1 Decided

- [x] 17 tables, 1 view, 1 materialized view; CONTENT_CAST + CONTENT_DIRECTOR merged into `content_credit` (`role` = `ACTOR` / `DIRECTOR`); extra tables `profile_genre_preference`, `recommendation`
- [x] `users` as the table name (`user` is reserved), with `role` (`USER` / `ADMIN`)
- [x] Surrogate keys `INT GENERATED ALWAYS AS IDENTITY`; natural keys are UNIQUE (`email` case-insensitively; `content (title, content_type, release_date)` and `person (name, date_of_birth)` as `NULLS NOT DISTINCT`)
- [x] TMDB ids are **not** stored; import and seed find rows by natural keys
- [x] `watch_history`: one row per (profile, title, episode), `episode_id` nullable, `UNIQUE NULLS NOT DISTINCT`
- [x] **Dropped `watch_history.completed`**: completed means `progress_percent >= 90` (SQL) / `isCompleted()` with `COMPLETED_THRESHOLD` (TS)
- [x] **`recommendation` re-keyed**: PK `(profile_id, content_id)`; **dropped `recommendation_id`, `source_content_id`, `reason`**. Reason strings are computed in `buildHomeRows`; the "Because you liked X" anchor is computed from `content_similarity` and returned as `HomeRow.anchor`; `rec_status` is the feedback loop
- [x] **Dropped `profile.preferred_language`** (no language data in the catalogue to filter on)
- [x] **Explicitly kept:** `profile.onboarded_at` (NULL until onboarding is done; `Profile.onboardingCompleted` = `onboarded_at IS NOT NULL`), `payment.gateway_order_id`, `subscription.created_at`, `season.name`, `watch_history.content_id` on episode rows (also stored for episodes, which makes the unique key and the per-title aggregates cheap)
- [x] Maturity derived with `maturity_of(content.age_rating)`, never stored; `age_rating` limited by CHECK to the US certificate codes
- [x] Payments: Razorpay; `subscription` = the order's local counterpart (PENDING until captured), `payment` = one row per attempt, idempotent on `transaction_ref`
- [x] Billing foreign keys `ON DELETE RESTRICT`; everything profile-scoped `ON DELETE CASCADE`
- [x] Drizzle ORM + `drizzle-kit` migrations on Neon, `pg` Pool driver
- [x] Drizzle schema (`src/server/db/schema/*.ts`), `drizzle.config.ts`, first migration `0000_schema.sql`, custom migration `0001_functions_and_views.sql`, client `src/server/db/index.ts`
- [x] Ranking by weighted score (signals -> candidates -> blend), no trained model (pending the teacher's confirmation, below)

### 7.2 Still open (from SCHEMA.md "Still open")

- [ ] Review every table, constraint and index in `SCHEMA.md` together (all three, once)
- [ ] `recommendation` refresh policy and `content_similarity` refresh cadence (recommended default in section 9, item 1)
- [ ] Weighted ranking (current plan) vs a small trained model: check with the teacher
- [ ] Short column names (current) or the domain's exact names (`SCHEMA.md` "Domain names -> column names")
- [x] The Neon database has the migrations and the seed applied (re-run with `npm run db:migrate` / `npm run db:seed` on your own branch if you reset it)

### 7.3 Found while writing this plan (fix in the Phase 1 PR)

- [x] **`subscription_dates_check` relaxed** (migration `0002`): `CHECK ((status IN ('PENDING','CANCELLED') AND start_date IS NULL AND end_date IS NULL) OR (start_date IS NOT NULL AND end_date > start_date))`, so cancelling an unpaid PENDING checkout is allowed; `billing.ts` and `SCHEMA.md` match
- [x] **`unaccent` extension** created by migration `0002` (`CREATE EXTENSION IF NOT EXISTS unaccent`)
- [ ] `payment_mode` only covers CARD / UPI / NET_BANKING / WALLET; Razorpay also reports `emi`, `paylater`, `cardless_emi`. Decide: extend the enum or ignore those events (current text: ignore + log)
- [ ] Indexes the admin dashboard comment suggests as data grows: `payment (payment_date DESC)`, `payment (status, payment_date)`, `subscription (plan_id, status)`, `watch_history (content_id)`; `watch_history (profile_id, content_id)` is already covered by the unique key
- [ ] Optional `pg_trgm` GIN index on `content.title` / `person.name` if `ILIKE '%q%'` gets slow (500 titles do not need it)
- [ ] Known limits enforced in the API, optionally with triggers: only `SERIES` content has seasons; `watch_history.episode_id` must belong to `content_id`; at most 5 profiles per user
- [x] `.env.example` has `DATABASE_URL` (Neon connection string)
- [ ] Expiry of ACTIVE subscriptions past `end_date` (who flips them to EXPIRED): section 9
- [ ] Suggested shared helpers (pg error mapping, `toIso`): section 3

---

## 8. Branches, PRs, shared files, review rules, timeline

### 8.1 Branches and PRs

- `main` is always deployable and migrated. Each person works on a feature branch
  (`feat/catalogue-admin`, `feat/accounts-billing`, `feat/activity-recs`; Phase 1 on `feat/schema`) and
  uses **their own Neon branch** (`DATABASE_URL`).
- Small PRs into `main`, ideally one service function (or one route group) per PR, each with the curl
  commands used to verify it in the description. One reviewer from the other two (rotate), who runs the
  curl checks against their own Neon branch.
- A function is "done" only when its checklist item in the person file is ticked (section "Definition of
  done" there): SQL as specified, typed errors, mock import removed for that function, curl checks pass.
- Rebase on `main` before opening the PR; do not merge your own PR without a review.

### 8.2 Shared files (change only through a PR everyone sees)

| Files                                                              | Rule                                                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `src/server/db/**` (schema, client) and `drizzle/**`               | Schema PRs are serialised (section 2.7). The schema owner is whoever opened the PR; all three review                     |
| `docs/schema/SCHEMA.md`                                            | Updated in the same PR as the schema change                                                                              |
| `src/server/errors/index.ts`                                       | New error classes only by agreement                                                                                      |
| `src/app/api/_lib/*` (`auth.ts`, `http.ts`, `tmdb.ts`)             | Route-wide behaviour: all three review                                                                                   |
| `src/types/*`                                                      | A response shape change updates the type, the route's top comment, `src/lib/api/*` and the frontend usage in the same PR |
| `src/lib/constants/index.ts`, `src/lib/content/*`, `src/lib/sql/*` | Shared with the UI; review by someone not the author                                                                     |
| `package.json` / lockfile                                          | One dependency PR at a time (avoid lockfile conflicts)                                                                   |
| Route top comments                                                 | They _are_ the HTTP contract: change code and comment together                                                           |

### 8.3 Review rules

Reviewers check, in order: (1) matches the service JSDoc / this guide (SQL, errors, transaction,
idempotency); (2) every query filters by owner; (3) no `Response`/HTTP in services, no SQL in routes;
(4) money/time/enums conventions (section 3); (5) mock import removed, nothing else broken (`npm run lint`,
`npm run build`); (6) curl evidence in the PR. Whoever merges a schema PR applies the migration to the shared
`main` Neon branch and tells the others to `db:migrate`.

### 8.4 Suggested timeline

| When                    | Who   | What                                                                                                                                                |
| ----------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Day 1 (together, 2-3 h) | A+B+C | Section 7: review `SCHEMA.md` and the open items in 7.3, create the per-person Neon branches (migrations and seed are already applied on `main`)    |
| Day 1-2                 | B, C  | Create your Neon branches from the already-seeded `main`; read your specs and start writing code against the seeded ids                             |
| Day 2-5                 | A     | catalogue reads (`listGenres`, `getContentDetail`, `searchContent`), then admin (`markInCatalog`, `findCatalogueId`, `getDashboard`, `importTitle`) |
| Day 2-5                 | B     | `findUserById`, `findUserCredentialsByEmail`, `createUser`, `listProfiles`/`getOwnedProfile`, profile CRUD, onboarding, plans/account reads         |
| Day 2-5                 | C     | `activity.service` (my list, ratings, progress, history, title activity), then `interaction_score` checks                                           |
| Day 6-8                 | B     | Razorpay: order, verify, webhook, test-mode run with a tunnel; auth hardening                                                                       |
| Day 6-9                 | C     | recommendation pipeline stage by stage; `content_similarity` refresh; refresh policy                                                                |
| Day 6-8                 | A     | `getSimilarTitles` (needs C's `content_similarity` data), index/perf pass, dashboard polish                                                         |
| Day 9-10                | all   | integration: UI flows end to end, delete `src/server/mocks`, README cleanup, report/demo script                                                     |

---

## 9. Open decisions

Each has a recommended default; implement the default unless the team decides otherwise.

1. **Recommendation refresh policy** (`shouldRefreshRecommendations`). Options: after every activity write; on Home load when stale; nightly. _Default (as written in the service):_ regenerate on Home load when the newest `generated_at` is older than 15 minutes **or** older than the profile's latest activity (`greatest(max(watched_at), max(rated_at), max(added_at), onboarded_at)`). If a mid-binge profile reruns the pipeline too often, drop the `watch_history` term and keep ratings/My List/onboarding only. Owner: C.
2. **`content_similarity` refresh.** _Default:_ `REFRESH MATERIALIZED VIEW CONCURRENTLY content_similarity` after the seed and nightly. First ever refresh must be non-concurrent (`REFRESH MATERIALIZED VIEW content_similarity;`) on a populated view. Mechanism: an npm script now (`db:refresh-similarity`), a CRON_SECRET-guarded route for Vercel Cron if/when deployed. Nothing calls `refreshContentSimilarity()` yet. Owner: C.
3. **Ranking model:** weighted blend (current) vs a small trained model: confirm with the teacher; no code depends on the answer yet.
4. **Column names:** keep the short snake_case names (current) or switch to the domain's exact ones.
5. **Sessions:** stateless signed cookie (today) vs a `session` table (revocation, sign-out everywhere, expiry). Default: keep the cookie for the demo; add the table only if time allows. Owner: B.
6. **Password hashing:** keep Node scrypt (acceptable, no dependency, `timingSafeEqual`) with a tunable cost, or move to argon2id/bcrypt; either way keep the stored format versioned (`scrypt$...` prefix lets both coexist). Owner: B.
7. **Same-plan checkout:** the route documents "409 already ACTIVE on that plan (unless renewing)"; `createPendingSubscription` treats the same plan as a **renewal** (returns the ACTIVE row, no 409). Default: renewal; update the route comment. Owner: B.
8. **Subscription expiry:** nothing flips ACTIVE rows past `end_date` to EXPIRED. Default: lazy expiry inside `getActiveSubscription` (`UPDATE ... SET status='EXPIRED' WHERE user_id = $1 AND status='ACTIVE' AND end_date < now()` before the select) or treat `end_date < now()` as no plan; a nightly job is optional. Owner: B.
9. **Plan change proration:** a capture on a new plan cancels the old ACTIVE row at `now()` (remaining days are lost). Default: accept for the project; document it.
10. **Refunds:** `payment_status` has REFUNDED but no code path writes it (`refund.processed` is not handled). Default: out of scope; the admin can refund in the Razorpay dashboard.
11. **Unsupported payment methods** (`emi`, `paylater`): ignore + log vs extend `payment_mode`. Default: ignore + log.
12. **Abandoned checkouts:** PENDING rows are cancelled at the user's next checkout. Optional cleanup of stale PENDING rows older than a day.
13. **`DISMISSED` has no writer.** No route lets a user dismiss a recommendation; `rec_status` only moves SHOWN -> CLICKED -> WATCHED today. Default: leave `DISMISSED` unused in the UI, keep the filter.
14. **CLICKED on title-page view:** a write on a GET. Default: no; `recordProgress` already covers the player.
15. **Full sync on re-import:** re-imports add and refresh but never remove stale genres/credits. Default: keep additive; for a full sync `DELETE FROM content_genre / content_credit WHERE content_id = $1` right after the content upsert, inside the transaction.
16. **Consistent snapshots:** `getContentDetail` and `getDashboard` may run in `REPEATABLE READ READ ONLY`. Default: plain queries (no one writes the catalogue at the same moment in the demo).
17. **Shared helpers location** (pg error mapping, `toIso`, `toNumber`): propose `src/server/db/helpers.ts` in the Phase 1 PR.
