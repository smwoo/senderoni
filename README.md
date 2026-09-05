# Betabook

[Betabook](https://betabook.ca) is a climbing logbook and community crag database for bouldering, sport, and trad climbing.

- Search climbs and explore the area hierarchy, with community ratings and suggested grades.
- Log ascents, repeats, climb sessions, and training in a journal with notes and tags.
- Track open projects and view send history, grade progression, and activity analytics.
- Import and export sends as CSV, and control profile and journal visibility separately.
- Contribute areas, climbs, and descriptions; structural changes go through moderation by admins assigned to the affected areas.
- Learn the logging workflow through an interactive Journal tutorial.

Built with Next.js 16 App Router, React 19, TypeScript, HeroUI, and Tailwind CSS. OpenNext runs the app on Cloudflare Workers; Cloudflare D1 stores data through Drizzle ORM. Better Auth handles email/password and optional Google sign-in, and Resend delivers email.

## Local development

Use **Node.js 24** (also used in CI) and the pnpm version pinned in [`package.json`](package.json). The local scripts use Node's TypeScript support and `node:sqlite`.

```bash
pnpm install --frozen-lockfile
pnpm setup
pnpm dev
```

Open [localhost:3000](http://localhost:3000). Sign in with **`dev@example.com` / `password`** to try the journal, imports, and account settings.

`pnpm setup` copies `.dev.vars.example` if `.dev.vars` is missing, migrates a new local database, and runs the seed script. It preserves an existing environment file and existing climbs, but resets the default development account's name and password on every run.

**For an existing checkout, apply new migrations explicitly:** setup skips the migration step when a local database already exists.

```bash
pnpm db:migrate:local
```

Stop the dev server before running local database scripts and restart it afterwards so it sees the updated data. Local D1 state lives under `.wrangler/state/` and is separate from production.

### Environment and authentication

[`next.config.ts`](next.config.ts) initializes local Cloudflare bindings for `next dev`. [`.dev.vars.example`](.dev.vars.example) documents the local overrides for [`wrangler.jsonc`](wrangler.jsonc):

- `BETTER_AUTH_URL` must match the local server URL, including its port. Without the override, auth links use the production URL.
- `BETTER_AUTH_SECRET` signs sessions; the example value is for local development.
- Leave `RESEND_API_KEY` empty to print emails, including verification/reset links and friend requests, in the dev server console. Email/password sign-up requires verification; seeded accounts are already verified.
- Google sign-in is enabled only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. The example file lists callback URLs.

[`cloudflare-env.d.ts`](cloudflare-env.d.ts) is the checked-in application binding contract. Keep it aligned with binding and environment changes. `pnpm cf-typegen` generates the full Workers types for inspection; builds and tests do not depend on that gitignored output.

### Sample data

`pnpm seed` creates 400 areas, 5,000 climbs, and 50 synthetic climbers by default, plus sends and journal history covering ascents, repeats, projects, and training. Synthetic accounts start at `climber1@example.com` and use `password` unless a different password is supplied when generating them.

Synthetic climbers repeat these privacy settings in account-number order, so `--users 3` covers every case:

| Account                | Profile and sends | Journal |
| ---------------------- | ----------------- | ------- |
| `climber1@example.com` | Public            | Public  |
| `climber2@example.com` | Private           | Private |
| `climber3@example.com` | Public            | Private |

Each account has journal history to exercise visibility as its owner, another climber, or a signed-out visitor. Projects remain owner-only for every account. Seeding preserves the development account's privacy preferences.

```bash
pnpm seed --email me@example.com --password local-password --name "Local Climber"
pnpm seed --areas 50 --climbs 500 --users 3 --seed 7 --force
pnpm seed --social                       # add feed scenarios to an existing local seed
```

Fresh seeds include mutual friends, incoming/outgoing friend requests, and all
three journal audiences. `pnpm seed --social` refreshes these scenarios without
regenerating climbs or removing the development account's logs or privacy settings.
It resets relationships and journal tour progress for synthetic accounts, while
preserving connections between other accounts and dev's tour progress. Repeating
it does not duplicate activity.

| Account                                         | Social scenario                                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `dev@example.com`                               | Seven friends, one outgoing request, and two incoming requests                           |
| `climber1@example.com`, `climber2@example.com`  | Friends of dev with public journals                                                      |
| `climber3@example.com`                          | Friend with an Only me journal; send facts remain public, notes stay private             |
| `climber4@example.com`                          | Friend with a private profile; hidden from discovery and feeds, name only in Friends     |
| `climber5@example.com`                          | No relationships in either direction, for the empty-feed flow                            |
| `climber6@example.com`, `climber7@example.com`  | Friends journals; dev initiated one connection and the other climber initiated the other |
| `climber8@example.com`                          | Dev's outgoing request; Friends journal inaccessible until accepted                      |
| `climber9@example.com`, `climber11@example.com` | Incoming requests from a private and a public profile respectively                       |
| `climber10@example.com`                         | No connection to dev; Friends journal inaccessible                                       |
| `climber12@example.com`                         | Friend of dev with an Only me journal                                                    |
| `climber13@example.com`                         | Completed tour version 1; gets four What's new lessons                                   |
| `climber14@example.com`                         | Dismissed tour version 1; gets four What's new lessons                                   |
| `climber15@example.com`                         | Completed tour version 2; no invitation, full replay in Account                          |
| `climber16@example.com`                         | No tour progress; gets the full nine-lesson tour                                         |

Use the seeded password (`password` by default). The full set requires at least
16 synthetic users. Eight authors have a mixed-activity day on September 1, 2026;
very small climb datasets may lack room for that extra day. Dev's feed includes
only accepted friends whose profiles are public. Select **Friends** in Account
when testing shared access to the development account's journal. Friend requests
can be managed independently of the journal audience.

To check request badges, open **Friends → Requests** as dev. The Friends and
Requests tabs should each show **2**, excluding dev's outgoing request. Accepting
one incoming request and declining the other should change both badges to **1**,
then hide them. The mobile menu dot should also disappear. `climber5@example.com`
has no badge. Counts load after the page renders and refresh after handling a
request, navigation, and returning to the app. Run `pnpm seed --social` to restore
these scenarios after testing.

To check request emails locally, leave `RESEND_API_KEY` empty and send a new
request from dev to `climber5@example.com`. The server console should show one
email for that account, naming Dev User and linking to `/friends?view=requests`.
Reloading should keep the request without another email. Cancel it afterward to
restore the empty-feed fixture. The seed script writes directly to the database
and never sends email; the product tour's sample controls also send nothing.

Journal audiences protect every send note, including mirrored ascent notes.
Public-profile send facts and anonymous community aggregates retain their existing
visibility. See [the implementation notes](docs/friends-feed-plan.md) for the
privacy matrix and friendship lifecycle.

To check social seeding against a disposable copy of a migrated, default-seeded
SQLite database, run `pnpm test:seed-social /path/to/copy.sqlite`.

The account is upserted on every run, preserving its ID. Sample data is generated only when there are no climbs or when `--force` is passed. **`--force` clears local areas, climbs, sends, journal entries, and synthetic climbers before reseeding**, including logs on the development account. A fixed seed and size reproduce the same sample history.

To exercise moderation, grant the local admin role:

```bash
pnpm promote-admin dev@example.com
```

The role alone grants no area access. Admins also need rows in `admin_area_scopes`, each covering an area and its descendants. There is no assignment UI; grants are inserted directly into the local database. See the [moderation schema](drizzle/schema/moderation.ts) and [scope checks](lib/moderation.ts). The review queue is at `/admin/requests`.

### Worktrees

Once Husky hooks are installed, [`.husky/post-checkout`](.husky/post-checkout) runs dependency installation and setup for a new worktree. It skips ordinary branch switches and environments with `CI` or `BETABOOK_SKIP_BOOTSTRAP` set. If bootstrap fails, run the local development commands above in that worktree.

## Development checks

```bash
pnpm check                                # lint, formatting, dead code, types, tests
pnpm test -- lib/journal.test.ts           # focused test run
pnpm exec opennextjs-cloudflare build      # production Workers build used by CI
```

Tests are colocated with the code in `actions/`, `app/`, `components/`, `db/`, and `lib/`. Vitest runs in the Cloudflare Workers pool and applies all D1 migrations through [`test/apply-migrations.ts`](test/apply-migrations.ts). Its entrypoint is [`test/worker.ts`](test/worker.ts), so tests need neither seeded local data nor a production build.

| Command                             | Purpose                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm lint` / `pnpm lint:fix`       | Type-aware Oxlint checks / automatic fixes                                    |
| `pnpm format` / `pnpm format:check` | Oxfmt formatting / verification                                               |
| `pnpm deadcode`                     | Knip unused code and dependency checks                                        |
| `pnpm deadcode:prod`                | Extra audit excluding test and development entrypoints; separate from `check` |
| `pnpm typecheck`                    | Next route type generation and TypeScript checking                            |
| `pnpm test`                         | Full Vitest suite                                                             |
| `pnpm db:generate`                  | Generate migrations from `drizzle/schema/`                                    |
| `pnpm db:migrate:local`             | Apply migrations to local D1                                                  |
| `pnpm preview`                      | Build and preview the Cloudflare Workers bundle locally                       |

The pre-commit hook formats staged files; the pre-push hook runs `pnpm check`. See [AGENTS.md](AGENTS.md) for architecture, data invariants, and the required red–green test workflow. Tutorial implementation guidance lives in [docs/product-tours.md](docs/product-tours.md).

## Deployment

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs the checks and a Cloudflare production build on pull requests. Pushes to `main`, or manual workflow runs on `main`, also apply remote D1 migrations and deploy in the `smwoo/betabook` repository.

For a manual deployment, mirror the build–migrate–deploy order:

```bash
pnpm check
pnpm exec opennextjs-cloudflare build
pnpm db:migrate:remote
pnpm exec opennextjs-cloudflare deploy
```

`pnpm deploy` is a build-and-deploy shortcut; it does **not** apply migrations. Migrations must stay compatible with the currently deployed worker because the schema changes before the new worker is live.

CI deployment uses the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Runtime credentials (`BETTER_AUTH_SECRET`, `RESEND_API_KEY`, and optional Google OAuth credentials) are Worker secrets configured with `pnpm exec wrangler secret put <NAME>`. Hosting, D1, rate-limit bindings, and the public auth URL are configured in [`wrangler.jsonc`](wrangler.jsonc); use your own Cloudflare resources when hosting a fork.

## License

[MIT](LICENSE).
