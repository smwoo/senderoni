# Friends, shared journals, and activity feed

Issue [#121](https://github.com/jasperlin451/betabook/issues/121) helps climbers keep
up with friends and climbing partners. The social model is mutual friendship:
one request, one acceptance, one connection shared by both people.

## Relationship model

`friendships` stores one canonical unordered pair: `user_id < friend_id`, with
`requested_by`, `status` (`pending` or `accepted`), and `created_at`. Its primary key
prevents duplicate or reversed pairs, both endpoints and the requester reference
users with cascading deletion, and checks enforce valid status and membership.
The schema is introduced by migration `0035_magenta_stryfe.sql`.

1. Add friend sends a request to a public profile. Private climbers can send requests.
2. Duplicate or crossed requests retain the original requester. Crossing a request
   does not silently accept it.
3. Only the recipient can accept or decline. Only the sender can cancel.
4. Both people become friends when the request is accepted. Their activity appears
   in each other's feed, subject to their privacy settings.
5. Either participant can remove the friendship. This deletes the whole connection
   and both people lose Friends-only access. Reconnecting requires fresh acceptance.

Removing a friend, declining a request, and cancelling a sent request require a
confirmation dialog naming the other person and explaining the result. Keeping
the friend/request or pressing Escape leaves it unchanged. Failed writes keep the
dialog open for retry. Add friend and Accept request remain single-click actions.
Tour examples use the same confirmation controls with local callbacks.

All mutations authenticate, validate IDs, scope writes to the session's pair, and
return `ActionResult`. Creation uses the per-user `FRIENDSHIP_RATE_LIMITER` at
30 requests/minute. SQL constraints and conditional writes handle concurrent
requests and stale controls. A cancelled or removed request cannot be accepted.

## Privacy

| Journal audience | Owner | Accepted friend | Pending request / stranger / anonymous |
| ---------------- | ----- | --------------- | -------------------------------------- |
| Only me          | Yes   | No              | No                                     |
| Friends          | Yes   | Yes             | No                                     |
| Public           | Yes   | Yes             | Yes                                    |

A private profile overrides this table: its profile, sends, journal, and analytics
are owner-only. Friendships persist when a profile is made private, but grant no
exception. Participants may see each other's basic name/avatar in their private
Friends list; private identities have no profile link. This lets them respond to
requests or remove connections without revealing private history. A new request
also emails the recipient with the requester's name, including private requesters;
the email contains no journal content or private-profile link. Lists and
request counts are visible only to their own authenticated participant.

The journal audience applies to past and future entries and every send note,
including the original ascent note mirrored between sends and journal entries.
Public-profile send facts, ratings, dates, and anonymous aggregates remain visible.
Projects and exports remain owner-only. Audience changes never accept requests.

`canViewUser` controls profile visibility. `canReadJournal` authorizes pages and
metadata using `journalVisibleSql`, the same predicate used inside journal,
send-note, analytics, and feed reads. Journal queries accept an owner ID and
viewer ID, with no caller-supplied privacy snapshot, so stale page props cannot
preserve access after a friendship ends or privacy changes.

## Feed and discovery

The feed reads both sides of accepted friendships, excludes private profiles, and
groups activity by climber and date. Dated sends and non-ascent journal entries
produce send/repeat/session/training totals without double-counting ascents.
Each day has at most three previews with notes truncated to 240 characters;
counts include the whole day. Undated sends do not create feed events.

A single SQL statement computes eligibility, totals, and previews on the same
snapshot. Cursor pagination returns 20 days at a time ordered by date and author.
The All/Sends filter and exact-day profile links preserve authorization. This
release includes entries from before the friendship began and computes the feed at read time.

Public display-name search is case-insensitive and prefix-based, with exact matches
first. It requires a search term, escapes wildcard characters, excludes private
profiles and the current user, and returns only identity plus the viewer's
relationship state. Share-profile links help people find climbing partners.

## Frontend

- The owner's Journal, Sends, Feed, Friends, Projects, and Analytics share one
  profile header and tab bar. Feed and Friends are hidden on other climbers' profiles.
- `/feed` shows friends' eligible activity. `/friends` has All friends and Requests
  tabs. Requests includes incoming and outgoing requests, with Accept/Decline or
  Cancel controls respectively.
- Incoming requests add a count to the Friends and Requests tabs. The account
  avatar and mobile menu get a small dot; My Journal has no badge. Account offers
  Review friend requests when requests are waiting, linking directly to the
  Requests tab. Zero counts are hidden; outgoing
  requests are excluded. A shared client store lazily fetches `/api/friends?view=count`
  after sign-in, refreshes after mutations and navigation, and checks on focus and
  every minute while visible. It clears immediately on account changes and ignores
  stale responses. The endpoint is session-scoped and returns no requester identities.
- Search and profile headers use the same Add friend / request / Remove friend
  component. Controls wrap below names on mobile.
- Account has three journal audiences: Only me, Friends, Public. Save failures show
  an accessible error and retain the previous setting.
- API routes use `Cache-Control: private, no-store`. Social routes and profile
  views are noindex. Viewer boundaries discard stale content after account changes
  and refresh permissions when returning to a profile or connection list.
- Feed and Friends fill the width beneath the profile tabs. Feed cards use two
  columns on desktop and three on wide screens, preserving chronological order
  across each row. Friends uses two columns on desktop. Both remain single-column
  on phones; introductory copy keeps a readable line length.

New friend requests send a plain-text email through the existing Resend service.
Only the winning `INSERT ... ON CONFLICT DO NOTHING` sends it, so duplicate and
crossed requests do not create duplicate emails. Names and addresses come from
the database; the sender's address and climbing history are not included. The
link uses `BETTER_AUTH_URL` and preserves the Requests tab through sign-in.
Delivery is awaited and provider errors are logged without undoing the saved
request. There is no automatic delivery retry. Cancellation/decline followed by
a fresh request can send another email. Seeding and tour demos send nothing.

Already delivered content cannot be recalled. Live permission revocation, public
friend lists, acceptance emails, push notifications, blocking, and ranked suggestions
are outside this release.

**Tutorial decision:** release version 2 of the existing tour with three new lessons:
finding climbers, accepting mutual friend requests, and reading/filtering the feed.
Mark the existing privacy lesson as updated in version 2 while preserving its ID
and introduction version. People who completed or dismissed version 1 get four
What's new lessons; first-time visitors and Account replay get all nine. Sample
search, requests, acceptance, removal, feed filters, and privacy controls use local
state and shared display primitives; sample identities never reach links or actions.
The same version 2 lessons now show Feed and Friends in the profile tab order and
All friends / Requests navigation. Sample request badges clear on acceptance or
decline. This refines the same unreleased feature, so it does not need another
version bump.
The existing friend-requests lesson also mentions email notifications; this adds
no demo action or tour step and remains part of version 2.

Update invitations and demo headers omit Log controls. Discovery now opens on
Search, using the app's Search climbs / Search areas / Search climbers selector
and result rows, rather than appearing inside Friends. Its controls operate on
local fixtures; the View your feed link opens the feed lesson. Search stays outside
the profile tab bar. The full tour retains the original Log lesson. These changes
refine the same unreleased version 2 and preserve all step IDs and saved progress.

## Synthetic data and validation

`pnpm seed --social` creates both directions of accepted-connection scenarios,
incoming/outgoing requests, a private requester, each journal audience, and a
climber with no relationships. Climbers 13 and 14 acknowledged version 1 (completed
and dismissed), climber 15 completed version 2, and climber 16 has no tour progress.
It preserves the development account's history, privacy choices, and tour progress.
See the account matrix in [README.md](../README.md).
`pnpm test:seed-social /path/to/copy.sqlite` checks mutual visibility, request
states, private/public examples, mixed days, empty feed, and idempotency.

Initial action and journal checks exposed 11 failures for missing mutual persistence,
access, and feed behavior before implementation. For focused sensitivity checks,
`pnpm exec vitest run db/queries/friendships.test.ts db/queries/journal-audiences.test.ts`
failed 6 tests when reverse-direction SQL reads were temporarily disabled. Restoring
the exact production files made all 8 pass. No deliberate regression remains.
`pnpm test:seed-social /tmp/betabook-mutual-seed.sqlite` first failed because expected
friendships were absent, then passed after the generator used the mutual model.

The scale fixture covers 25 friends, 30 days each, and a 300-entry day, asserting
bounded previews, exact counts, cursor ordering, and indexed author reads. This
is a local query-plan/behavior test, not a production D1 load benchmark.

Final checks passed: `pnpm check` (lint, format, dead-code analysis, type checking,
and 1,222 tests across 90 files) and `pnpm exec opennextjs-cloudflare build`.
The clean migration and social fixtures were applied locally.

The [independent code review](social-feature-review.md) covers the complete change,
the removal of an obsolete journal permission API, and a fresh migration/seed run
in an isolated database. Its cleanup removed four obsolete pure-predicate tests
and moved audience checks onto the real D1 authorization query.

Browser verification on `pnpm dev` covered request creation through discovery,
persistence on reload, cancellation, decline, acceptance from the recipient,
visibility of the same accepted connection from the sender, and removal from the
other account. Removing the connection hid the Friends-only journal note and
removed the friend from both lists while keeping public send facts visible.
The 390px mobile request list had no horizontal overflow. Desktop controls,
tutorial replay/exit, selector focus, and the three-audience demo were checked;
demo changes did not alter the real account. The development account's original
Only me audience and all synthetic request states were restored afterward.

Authenticated HTTP checks against the local app passed for the exact synthetic
friend/request identities, participant-scoped APIs, all three audiences,
accepted-only feed contents, and anonymous send-note redaction. The Cloudflare production bundle builds successfully; interactive checks used
local synthetic accounts.

Version 2 tour checks followed red–green:
`pnpm exec vitest run lib/product-tour-navigation.test.ts actions/product-tour.test.ts`
first failed five tests because the social update lessons and version 2 progress
were missing. After the update, those files plus the invitation, validation, and
tutorial route tests passed all 40 tests. The synthetic checker first failed for
missing tour progress scenarios, then passed after the generator added them.

Browser checks covered the four-step invitation after version 1 completion,
sample requests/acceptance/removal, All/Sends filtering, Friends privacy and the
private-profile override, refresh and browser Back, step focus, Escape to Account,
version 2 completion, invitation suppression, and full nine-step Account replay.
Phone (390px) and desktop (1200px) views and both themes were inspected; the mobile
chooser had no horizontal overflow or guide/demo overlap. A before/after database
comparison confirmed demo controls changed no real friendships, privacy settings,
journal entries, or sends. Authenticated HTTP checks also verified the dismissed
version 1, completed version 2, and first-time invitations against the actual app.
Synthetic progress was restored after verification; dev's settings and progress
were preserved.

Profile-tab and request-count tests followed red–green:
`pnpm exec vitest run components/profile-tabs.test.tsx app/social-api.test.ts`
first failed three tests for the missing owner tabs and count endpoint, then passed
all seven. Temporarily disabling the stale-response guard made three of ten
`lib/friend-request-count.test.ts` tests fail for account switching, signing out,
and accepting a request while an older count was in flight. Restoring the guard
made all ten pass. The combined focused run, also including
`app/users-journal.test.tsx`, passed all 24 tests.

Browser checks verified active Journal/Sends/Feed tabs, owner-only social tabs,
incoming-only badges changing from 2 to 1 to hidden after accept/decline, and the
mobile menu dot clearing. The profile strip scrolls within a 390px page without
page overflow. Light and dark layouts and the active underline were checked.
The version 2 sample request tabs, badges, acceptance/removal, feed filters,
Account exit, and phone/desktop layouts were exercised. A database comparison
confirmed sample interactions changed no friendships, privacy settings, journal
entries, or sends. Synthetic requests were restored with `pnpm seed --social`;
`pnpm test:seed-social /tmp/betabook-tabs-seed.sqlite` passed on a disposable copy.

Request email checks followed red–green. `pnpm exec vitest run actions/friendships.test.ts`
failed eight tests because no email was sent, then passed all 17 after implementation.
The tests exercise the real action, migrated D1, and email formatter, replacing only
the Resend transport and request environment. They cover both pair orderings, private
requesters, database-sourced recipient addresses, exact plain-text content and links,
concurrent duplicates, crossed requests, new requests after cancellation/decline,
authorization failures, provider rejection/network errors, and local console delivery.
`pnpm exec vitest run app/friends/page.test.tsx` then exposed a Requests link losing
its query during sign-in (one failure); preserving that destination made all three
pass. The combined run with the tour navigation tests passed all 42 tests.

Browser verification sent one request from dev to synthetic climber 5, observed the
single console email, and confirmed a reload sent no duplicate. Following its link
while signed out preserved the Requests tab through sign-in and displayed Dev User's
request to the recipient. Declining restored climber 5's empty fixture. The updated
lesson fits at 390px and 1200px; its sample request and acceptance controls sent no
email. The browser was returned to dev. Local delivery uses console mode; automated
tests check the Resend call without sending to a real inbox.

Presentation checks followed red–green. The new tutorial rendering tests first
failed nine assertions for the old Log controls and discovery inside Friends;
the focused tutorial/navigation/invitation/search run then passed all 40 tests.
Header tests first failed twice for the count beside My Journal; after moving the
notification to the account dot, the combined header/tutorial/request-count run
passed all 48 tests. These tests include first-time/full replay and stale account
counts, not only the update state.

In the browser, cancelling the seeded request to Clementina Mohr initially deleted
it without a dialog. After the fix, opening the dialog and choosing Keep request
left it pending; explicitly confirming cancelled it. The exact synthetic row was
restored after both checks. Decline and removal use the same shared confirmation
control. Layout and tutorial demo interactions are verified against the local app;
production email transport remains covered by boundary mocks rather than live mail.

Final presentation checks used the version 1 synthetic account in a separate app
browser session: the invitation had no Log shortcut, the tour began at 1 of 4 on
Search, and all four update demos omitted Log. Search submission/empty results,
request confirmation, sample acceptance/removal, feed filtering, refresh, browser
Back, heading focus, Escape, and full nine-step Account replay were exercised.
The full replay retained its original Log target. A database comparison confirmed
that the demo interactions changed no friendships, privacy settings, tour progress,
journal entries, or sends. The browser was restored to dev afterward.

At 1600px, Feed and Friends each used the full 1280px content width under the tabs;
Feed showed three columns and Friends two. At 390px, Friends and the update tour
had no horizontal overflow. The account dot's Review friend requests link opened
the Requests tab. Screenshots document the wider layouts, removal confirmation,
and the update discovery lesson on desktop and phone.
