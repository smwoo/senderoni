# Social feature code review

Reviewed the complete working-tree change against `71e11dd`, including untracked
files, on September 5, 2026. An independent subagent reviewed the implementation
and then rechecked the cleanup described below. The main agent separately audited
privacy callers, obsolete APIs, migrations, and synthetic data.

## Result

No remaining actionable correctness or privacy defects were identified. The
implementation uses mutual friendships throughout. The review found no remaining
one-way follow model, compatibility adapter, abandoned social route, or dependency
on an intermediate version of the feature.

One cleanup finding was fixed: `canViewJournal` remained as an unused production
export, while journal queries still accepted a `JournalOwner` object containing
privacy settings they no longer used. Those APIs and their obsolete tests were
removed. All callers now pass owner and viewer IDs; the SQL predicate reads current
privacy settings and friendship state. The audience tests now exercise the real
`canReadJournal` query against D1. Documentation was updated to describe that
authorization path.

## Scope

- **Relationships:** canonical unordered pairs, both endpoint orderings, incoming
  and outgoing requests, duplicate and crossed requests, concurrent writes,
  recipient-only acceptance/decline, sender-only cancellation, removal by either
  friend, and account deletion cascades.
- **Privacy:** Only me/Friends/Public audiences, private-profile overrides,
  pending requests, removed friends, journal pages and pagination, analytics,
  send-note redaction, climb pages, metadata, owner-only projects and exports.
- **Feed and discovery:** both sides of accepted friendships, eligible authors,
  mixed send/journal days, bounded previews, counts, cursor ordering, exact-day
  links, public name search, and private identities in participant-only lists.
- **Frontend:** owner tabs, requests navigation, lazy incoming counts, mutation
  refresh, stale responses, account changes, session boundaries, and request email
  destinations surviving sign-in.
- **Integration:** email deduplication and provider failures, environment bindings,
  version 2 product lessons, demo isolation, synthetic scenarios, SQL migration,
  and documentation. Source searches included tracked and untracked files.

## Verification

- The independent reviewer ran 10 focused files: **80 tests passed**. Its second
  pass found no defects in the cleanup or missed callers.
- To check the strengthened audience assertions, `canReadJournal` was temporarily
  made to deny every viewer. `pnpm exec vitest run db/queries/journal-audiences.test.ts`
  failed three tests as expected. The production code was restored immediately.
- The focused green run covered journal audiences, journal privacy and pagination,
  feed reads, journal mutations, page rendering, project ownership, audience APIs,
  and profile visibility: **133 tests passed across nine files**.
- `pnpm check` passed: lint, formatting, regular dead-code analysis, type checking,
  and **1,206 tests across 88 files**. The count decreased by four because the
  obsolete pure-predicate tests were removed.
- `pnpm exec opennextjs-cloudflare build` passed and produced the Workers bundle.
- `pnpm deadcode:prod` still reports 22 unused exports. Running the same audit in
  an isolated copy of base commit `71e11dd` produced the same 22 symbol/file pairs;
  this change introduces none. That separate audit does not pass on the base.
- An empty, isolated D1 database applied all **36 migrations** through Wrangler,
  then ran the actual full seed script: 400 areas, 5,000 climbs, 51 climbers,
  16,616 sends, 45,442 journal entries, and 157 friendships/requests. The social
  synthetic checker passed, including idempotency. SQLite integrity and foreign
  key checks passed, and there were no follow-related schema objects. This did
  not modify the shared development database.

The existing browser and email verification is recorded in
[the feature plan](friends-feed-plan.md). This review's cleanup changes internal
query contracts only, so the version 2 product lessons remain unchanged.

Production email delivery and production-scale D1 latency were not tested in this
review. Email tests replace the external transport; the feed scale test checks
query behavior and plans locally. A successful build does not establish those
production properties.
