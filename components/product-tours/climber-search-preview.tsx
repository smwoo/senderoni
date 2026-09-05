"use client";

import { Button, SearchField } from "@heroui/react";
import { useState } from "react";

import { FriendshipActionButton } from "@/components/friendship-action-button";
import { SearchModeSwitch, type SearchMode } from "@/components/search-mode-switch";
import { AppLink } from "@/components/ui/app-link";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { UserAvatar } from "@/components/ui/user-avatar";
import { TOUR_DEMO_SEARCH_RESULTS } from "@/lib/product-tour-demo";

/** Search, category changes, and requests use fictional data without navigation or writes. */
export function DemoClimberSearch({ feedHref }: { feedHref: string }) {
  const [mode, setMode] = useState<SearchMode>("climber");
  const [query, setQuery] = useState("Riley");
  const [search, setSearch] = useState("Riley");
  const [requested, setRequested] = useState(false);
  const result = TOUR_DEMO_SEARCH_RESULTS[mode];
  const found = search && result.name.toLowerCase().startsWith(search.toLowerCase());
  const label = mode === "climber" ? "Climber name" : mode === "climb" ? "Climb name" : "Area name";

  return (
    <section
      aria-label="Search"
      data-tour-target="friend-search"
      className="flex max-w-2xl flex-col gap-6"
    >
      <h1 className="sr-only">Search {mode}s</h1>
      <SearchModeSwitch
        mode={mode}
        onSelect={(next) => {
          if (next === mode) return;
          setMode(next);
          setQuery("");
          setSearch("");
        }}
      />
      {mode === "climber" && (
        <p className="text-sm text-muted">
          Search by name to find a climbing partner and send a friend request.
        </p>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(query.trim());
        }}
      >
        <SearchField
          aria-label={label}
          value={query}
          onChange={setQuery}
          className="w-full sm:max-w-sm"
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input maxLength={100} placeholder={`Search ${mode}s by name…`} />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>
      {mode === "climber" && <AppLink href={feedHref}>View your feed</AppLink>}
      {found ? (
        <ListRow
          leading={mode === "climber" ? <UserAvatar name={result.name} size="sm" /> : undefined}
          title={result.name}
          subtitle={
            mode === "climber" ? (requested ? "Waiting for a reply" : undefined) : result.detail
          }
          stackActionsOnMobile
          actions={
            mode === "climber" ? (
              <FriendshipActionButton
                action={requested ? "cancel" : "add"}
                name={result.name}
                onPress={(complete) => {
                  setRequested(!requested);
                  complete();
                }}
              />
            ) : undefined
          }
        />
      ) : (
        <EmptyState
          message={
            search
              ? `No ${mode}s found.${mode === "climber" ? " Private profiles aren't listed." : ""}`
              : mode === "climber"
                ? "Find a friend or climbing partner by name."
                : `Search for ${mode === "area" ? "an area" : "a climb"} by name.`
          }
        />
      )}
    </section>
  );
}
