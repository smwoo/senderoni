<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working on Betabook

Betabook is a climbing logbook and crag database built with Next.js 16 App Router, React 19, HeroUI, Tailwind CSS, Cloudflare Workers/OpenNext, D1/Drizzle, and Better Auth. Read [README.md](README.md) for setup, local accounts, scripts, and deployment. `package.json` and the config files are the source of truth for tooling.

## Code map

| Location                                                      | Responsibility                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `app/`                                                        | Server page loaders, metadata, layouts, and API route handlers                                                     |
| `app/areas/[id]/[[...slug]]/`, `app/climbs/[id]/[[...slug]]/` | Entity pages with canonical name slugs                                                                             |
| `app/users/[id]/`                                             | Profile, Journal, Sends, Projects, and Analytics views                                                             |
| `app/account/`, `app/admin/requests/`, `app/tutorial/`        | Account/import, moderation queue, and guided tutorials                                                             |
| `actions/`                                                    | Account, area, climb, send, journal, import, moderation, and tour mutations; shared write/revalidation helpers     |
| `components/`                                                 | Feature UI; `ui/` holds primitives, with `journal/`, `import/`, `admin/`, and `product-tours/` for larger features |
| `hooks/`                                                      | Reusable client hooks for navigation, filtering, pagination, and platform behavior                                 |
| `db/client.ts`, `db/queries/`                                 | D1 client factory and read queries                                                                                 |
| `drizzle/schema/`, `drizzle/migrations/`                      | Schema definitions and SQL migrations; `db/schema.ts` re-exports the schema                                        |
| `lib/`                                                        | Domain validation/calculations and shared server services, including auth, email, and moderation                   |
| `scripts/`                                                    | Local setup, seeding, database discovery, and admin promotion                                                      |
| `test/`                                                       | Workers test entrypoint, migrations, fixtures, and reset helpers; tests live beside the code                       |

## Boundaries and conventions

- Pages and route handlers load data through `db/queries`; components receive it as props or fetch the app's API routes. Components must not import database clients, queries, or schemas at runtime. Type-only imports are allowed.
- User mutations normally enter through `"use server"` modules in `actions/`, exported through `@/actions`. Validate inputs, authenticate with `requireSession()`, enforce ownership/permissions, and return `Promise<ActionResult<T>>` via `toActionResult`. Internal helpers may throw `ActionError`; unexpected errors must stay generic to the client. Navigate on the client after success rather than throwing `redirect`/`notFound` inside that wrapper.
- `lib/contact-action.ts` is the existing public, unauthenticated action; it uses bot checks and a rate limiter. Better Auth owns its own API mutations. Do not assume every write is in `actions/` or requires a session.
- `actions/` must not depend on `app/` or `components/`. `db/` and `lib/` must not depend on `app/`, `components/`, or `actions/`. `lib/` is not entirely pure: auth, email, account cleanup, and moderation helpers perform server work. Keep pure calculations separate from those services.
- `components/ui/` must not import feature components. Reuse its primitives and the existing HeroUI/Tailwind tokens in `app/globals.css`.
- Import boundaries, cycles, duplicates, and relative-parent imports are checked by [`oxlint.config.ts`](oxlint.config.ts). Use `@/` for cross-directory imports; sibling imports are allowed.
- Keep `middleware.ts` on the edge runtime: its comment documents why renaming it to `proxy.ts` breaks the current OpenNext build. Its cookie check is only a navigation shortcut; pages, API routes, and actions still need real authorization.
- Respect the browser targets in `package.json` and the library baseline in `tsconfig.json`. New built-in JavaScript APIs are not automatically polyfilled.

## Data rules to preserve

- **Sends and journal entries:** `sends` has one row per user/climb, including undated sends. `journal_entries` records climb sessions and training; `isAscent` distinguishes the original dated ascent from repeats. The original ascent mirrors the send's date and comment, while repeats do not add another send or rating. Keep writes consistent through `actions/journal-sync.ts`, `actions/send-statements.ts`, and atomic D1 batches. Check the SQL guards and `db/journal-send-sync.test.ts` when changing logging, imports, or merges.
- **Privacy:** `canViewUser` in `lib/user-visibility.ts` controls profile visibility. Journal queries take owner/viewer IDs and read current permissions in SQL; do not pass cached privacy snapshots. A private profile is visible only to its owner. Journal audiences are Only me, Friends, and Public. Friends requires an accepted mutual relationship in `friendships`; pending requests grant no access. Use `canReadJournal` for current page/metadata authorization and the same `journalVisibleSql` predicate inside data reads so stale props cannot bypass removal. Send notes, including mirrored ascent notes, use the journal audience everywhere; public send facts and anonymous aggregates retain profile visibility. Projects and exports are owner-only. A friend request reveals the requester's name/avatar to its recipient's private Friends list, even for a private requester; it grants no access to that person's private profile or history. Both participants can see an accepted connection; either can remove it.
- **Moderation:** signed-in users can create areas/climbs and edit descriptions immediately. Names, climb discipline/grade, deletion, moves, reparenting, and merges use `actions/moderation.ts` and `lib/moderation.ts`. Admin role alone is insufficient: grants in `admin_area_scopes` cover subtrees, and operations spanning areas need coverage for every affected area. Preserve scope checks, self-review restrictions, and validation at application time.
- **Database-managed state:** migrations own FTS synchronization, send aggregates, area cycle guards, and journal/send invariants. Do not replace these with partial application-side updates. Account deletion has explicit cleanup in `lib/account.ts` to preserve aggregates. Use the existing revalidation helpers in `actions/revalidation.ts` for affected send and journal views.

Edit schema definitions in `drizzle/schema/`, then use `pnpm db:generate` and inspect the SQL. Some indexes and triggers exist only in handwritten migrations, so the TypeScript schema is not a complete description of the database. Add new migrations under `drizzle/migrations/` and keep them compatible with the running worker; CI applies them before deployment. Run `pnpm db:migrate:local` after pulling or adding migrations: `pnpm setup` does not migrate an existing database.

Keep `wrangler.jsonc`, `.dev.vars.example`, and the checked-in `cloudflare-env.d.ts` aligned when changing bindings or environment variables. Generated `worker-configuration.d.ts` is optional for local validation and must not become a build prerequisite.

## Routes and metadata

- Build entity links with `areaHref` / `climbHref` from `lib/slug.ts`; IDs identify records and the optional slug is normalized by the route.
- Decide whether each new page should be indexable. Use `pageMetadata` and the title/description builders in `lib/seo.ts` for indexable pages so canonical, Open Graph, and Twitter metadata stay complete.
- Auth pages, new-entry forms, session-gated routes, and all user-profile views must be `robots: { index: false }`. Filter/search variants of otherwise indexable pages should be noindex when query parameters are present, as on `app/page.tsx`.
- Entity pages render `JsonLd` with at least breadcrumbs, using the builders in `lib/seo.ts`. Do not add `AggregateRating` or `Review` markup. Extend `lib/seo.test.ts` for new builders.
- Add new crawlable entity types to `app/sitemap.ts` with count and paginated query helpers. The sitemap index route is `/sitemap-index.xml`. API responses get `X-Robots-Tag: noindex` from `next.config.ts`; `robots.txt` is managed outside the repo at Cloudflare.

## Product tutorials

For each user-facing feature or workflow change, decide whether to update an existing lesson, add a step, create a tour, or leave tutorials unchanged. Record the choice and reason in the plan or PR, and fix any lesson made inaccurate by the change.

Read [docs/product-tours.md](docs/product-tours.md) before changing a tutorial. It covers registration, stable step IDs and targets, versioned updates, navigation, layout, and verification. Reuse the app's display components and `lib/product-tour-demo.ts` fixtures; sample controls stay local and sample IDs must never reach real links or writes. Keep the guide separate from the demo and confine spotlight dimming to the demo pane. Verify navigation/replay, keyboard focus, mobile layout, and that demo interactions do not change account data.

## Testing and validation

- Follow red–green for behavior changes: write a focused test, observe a failure caused by the missing/incorrect behavior, implement the fix, then confirm green. Syntax, import, setup, and unrelated failures do not count as red.
- When adding or strengthening tests for existing behavior, temporarily introduce a targeted production regression and observe the expected failure, then restore the code and confirm green. Never leave the deliberate regression in the diff.
- Exercise real behavior and assert specific results, identities, state changes, or required side effects. Avoid fixture-only assertions, implementation copies, source-text checks, and mocks that replace the subject. Collection assertions must establish the expected records are present; empty loops or `every()` are insufficient.
- Cover relevant boundaries and failures, especially authorization, privacy, and persistence. Await asynchronous work and verify rejected writes leave state unchanged. Keep mocks at external boundaries and each test independent with its own preconditions; use `test/fixtures.ts` and `test/reset-db.ts` where appropriate.
- Tests run in the Cloudflare Workers pool with real migrated D1 through `test/worker.ts` and `test/apply-migrations.ts`. No production bundle or local seed is required. Run a focused file with `pnpm test -- path/to/file.test.ts`.
- Record the focused red and green commands and outcomes in the work summary or PR. Do not claim red–green from a passing-only run. Documentation-only edits need formatting and reference checks, not artificial runtime tests.

Before committing, run `pnpm check` (lint, format check, dead code, typecheck, and tests). `pnpm deadcode:prod` is a separate audit for exports retained only by development/test entrypoints. Use `pnpm format` to fix formatting. The pre-commit hook formats staged files and the pre-push hook runs `pnpm check`.

For changes affecting runtime code, dependencies, routes, or Cloudflare configuration, also verify `pnpm exec opennextjs-cloudflare build`, which CI runs after its checks. Use `pnpm preview` when the behavior needs testing in the built Workers bundle. See [README.md](README.md) for the complete command guide.
