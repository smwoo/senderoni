# In-page product tours

Tours run at `/tutorial/[tourId]/[stepId]` inside the app shell. The page uses Alex Morgan's sample data and the same profile heading, tabs, sidebar layouts, list rows, and charts as the app. A spotlight outlines one control and dims the surrounding demo content. The short guide has its own column at the app's desktop breakpoint and its own row below the demo on smaller screens. It must never cover the demo; spotlight dimming must stay inside the demo pane.

## Add a step or feature

1. Add a step to `PRODUCT_TOUR_STEPS` in `lib/product-tour-navigation.ts`: a stable `id`, `section`, `title`, short `description`, `target`, and `introducedInVersion`. Keep each callout to one explanation. Do not repeat its text inside the demo.
2. Add `data-tour-target="your-target"` to the relevant control or small group in the feature view. Avoid targeting a whole page or a long list. Targets must be visible and unique within the view; do not select them by CSS classes or translated text.
3. Render the section in the feature's page component. `ProductTourPageProps` supplies its section, the active `steps`, and `href(stepId)` for links that preserve the replay destination. Reuse the app's layouts and display components. Keep demo controls local and never pass sample IDs to real links or mutation components.
4. For a separate tour, register its metadata in `lib/product-tour.ts`, steps in `PRODUCT_TOUR_STEPS`, and a lazy page loader in `components/product-tours/registry.ts`. The existing route layout handles the rest. An optional quick action beside the invitation belongs in `quick-actions.tsx`.

The Journal tour covers Log, journal filters, Sends sorting, project history, Analytics, climber discovery, friend requests, Feed, and privacy. The sample Log control is a visual reference in the full tour, with no click action or popover. First-time invitations include an ordinary Log button. Update invitations and update demos omit both Log controls.

Demo profile tabs use the app's order: Journal, Sends, Feed, Friends, Projects,
Analytics, then the tour-only Account section. Lesson order remains in the catalog.
Discovery uses a separate Search surface, with the same Search climbs / Search
areas / Search climbers selector and result-row components as the app. Search is
not a profile tab. The lesson starts in Search climbers; category changes, form
submission, sample results, and friend requests stay local. Its View your feed link
opens the feed lesson while preserving full/update mode and the exit destination.
Next, Back, and the lesson chooser connect Search with the profile lessons.
The Friends lesson uses the shared section navigation and request badge for its
All friends / Requests controls. Demo selections use local callbacks, with no URLs
or writes. Accepting or declining the sample request clears both sample badges;
the signed-in account's real count remains separate.

The sample request buttons use `FriendshipActionButton`, including the same
confirmation dialogs as real cancellation, decline, and removal. Their callbacks
only change demo state. The real account avatar uses a dot for incoming requests,
and Account links to the Requests list; My Journal has no notification badge.

## Navigation and overlays

The URL owns the current step. `parseProductTourNavigation` applies the same allowlist and duplicate-parameter rules to server and client inputs. Build links with named options, for example `productTourPath(tour.id, { stepId, from: "journal", mode: "updates" })`. `resolveProductTour` owns invitation eligibility, the active steps, and the fallback from an acknowledged update to full replay; use it for both invitations and playback. Invitation copy is selected by `getProductTourInvitationCopy`. Next, Back, profile tabs, the All tutorials menu, refresh, and browser history all resolve through the same step catalog. The persistent route layout loads the feature once and suspends the mobile installation helper while mounted. Each section's local demo state resets when leaving that section.

The guide and demo are separate, nonmodal regions. The demo scrolls independently and has a tab stop for keyboard scrolling. The step heading receives focus, Escape exits, and the close button is always available. Each step shows its explanation directly. Back, Next, and All tutorials stay outside the guide's scrolling text area.

The frame fits below the app header and responds to changes in the visual viewport. New targets scroll into view with space for nearby results. Expanded controls are revealed with the smallest necessary scroll. The target outline and dimming follow scrolling and are clipped to the demo pane, so they cannot draw over the guide or app navigation. The spotlight does not intercept clicks. Missing or offscreen targets hide the spotlight while the guide stays usable.

Exit returns to Account for Account replay and otherwise to the user's Journal. These destinations are derived from the authenticated account, not arbitrary return URLs. Finishing saves completion and opens the user's Journal. The route is authenticated, rejects unknown tour/step IDs, and is not indexable.

## Sample account

`lib/product-tour-demo.ts` defines Alex Morgan's browser-only fixtures. Journal entries are the source for sends, projects, and analytics; analytics use the production calculation. No database demo account is needed. Negative sample IDs must never enter entity links, real forms, or actions. The only tour mutation is saving the authenticated user's dismissal/completion status. `PrivacyFields` is shared with Account: its three journal audiences and profile switch use local state callbacks in the tutorial, while `PrivacyControls` owns real saving and error handling. The privacy lesson explains mutual friendships and the journal audience for send notes. Keep the shared fields free of actions.

## Progress and replay

`user_product_tours` stores a version and dismissed/completed status for each user and tour. Existing atomic updates prevent stale tabs from downgrading completed or newer progress. An invitation appears on the owner's Journal when that version has not been dismissed or completed. Account always offers replay; replay does not clear saved progress. Closing a tour does not mark it complete. Loading and completion failures have retry controls.

To add lessons after release, bump the tour's `version` and set each new step's `introducedInVersion` to that version. For a substantial change to an existing lesson, set its `updatedInVersion` to the new version while keeping its ID and introduction version. Copy edits do not need a bump.

The journal tour is currently version 2. Version 1 introduced Journal, Sends, Projects, Analytics, and Account privacy. Version 2 adds `find-climbers`, `friend-requests`, and `feed`, and substantially updates the existing `account` lesson for the Friends journal audience. Older completed/dismissed progress produces four update lessons; first-time visits and Account replay include all nine. `climber-search-preview.tsx` and `social-tour-previews.tsx` use local search, request, acceptance, removal, and feed filter state with fictional people from `lib/product-tour-demo.ts`. They use shared display components without linking sample profiles or calling actions.

An account that completed or dismissed an older version gets a **What's new** invitation containing only lessons introduced or substantially updated since that saved version. Users who missed several releases see all the additions in catalog order. First-time users see the full tour, including existing accounts that have no tour progress. A version bump without any changed lessons does not produce an invitation.

Update links use `?mode=updates`. The authenticated user's saved version selects the lessons; it is never taken from the URL. Next, Back, the step chooser, counters, and demo section links use that subset. Demo pages should derive section navigation from the supplied `steps`, using the first active step in each section. Refresh and sign-in preserve update mode. A link to an old step in update mode moves to the first eligible step. Already-acknowledged update links fall back to full replay.

**Full tour** switches to all lessons, and Account replay always shows the complete tour. Finishing or dismissing the update saves the current tour version using the existing progress action. Exiting partway through does not acknowledge the update or track individual steps. Adding a separate tour ID tracks progress independently and needs no schema change.

## Verify changes

- Check invitations, Account replay, Exit, Finish, direct links, refresh, and browser Back/Forward.
- Check each target at desktop and phone widths in both themes, including scroll, keyboard focus, Escape, and short viewports. The guide and demo must not overlap, including when the step chooser or a demo disclosure is open.
- Exercise filters, sorting, project disclosure, chart explanation, and privacy toggles. Check that no sample data or settings reach the real account.
- Test first-time, completed, dismissed, skipped-version, revised-step, and single-step update cases. Check that update navigation stays within its subset and Account replay includes every lesson.
- Test step/route validation and positioning logic. Keep the existing persistence tests. Run `pnpm check` and the Cloudflare production build before updating the PR.
