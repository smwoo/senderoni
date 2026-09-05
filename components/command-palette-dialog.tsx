"use client";

import { Kbd, Modal } from "@heroui/react";
import { clsx } from "clsx";
import { Search } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { AreaSuggestionRow } from "@/components/area-search-field";
import { RouteSuggestionRow } from "@/components/route-search-field";
import { EYEBROW_CLASS } from "@/components/ui/eyebrow";
import { useModifierLabels } from "@/hooks/use-platform";
import { useTypeahead } from "@/hooks/use-typeahead";
import {
  fetchAreaSuggestions,
  fetchRouteSuggestions,
  type AreaSuggestion,
  type RouteSuggestion,
} from "@/lib/search-suggestions";
import { areaHref, climbHref } from "@/lib/slug";

type PaletteEntry = {
  key: string;
  href: string;
  /** Plain text for the active-row accessibility announcement. */
  text: string;
  content: React.ReactNode;
};

type PaletteSection = {
  heading: string;
  entries: PaletteEntry[];
  divider?: boolean;
};

function SearchAllRow({
  entity,
  query,
  shortcut,
}: {
  entity: string;
  query: string;
  /** Null before the platform is known on mount. */
  shortcut?: string | null;
}) {
  return (
    <span className="flex w-full items-center justify-between gap-3">
      <span className="truncate">
        Search all {entity} for <span className="font-medium">{query}</span>
      </span>
      {shortcut && <Kbd className="shrink-0">{shortcut}</Kbd>}
    </span>
  );
}

function routeEntry(route: RouteSuggestion): PaletteEntry {
  return {
    key: `route-${route.id}`,
    href: climbHref(route.id, route.name),
    text: route.name,
    content: <RouteSuggestionRow route={route} />,
  };
}

function areaEntry(area: AreaSuggestion): PaletteEntry {
  return {
    key: `area-${area.id}`,
    href: areaHref(area.id, area.name),
    text: area.name,
    content: <AreaSuggestionRow area={area} />,
  };
}

/** Keep overlay dependencies out of the provider's eagerly loaded bundle.
 * The provider owns open state and preloads this module on idle. */
export function PaletteDialog({
  isOpen,
  onOpenChange,
  scopeAreaId,
  scopeAreaName,
  onNavigate,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  scopeAreaId?: number;
  scopeAreaName?: string;
  onNavigate: (href: string) => void;
}) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      {/* Top-anchored: a palette that opens under the pointer reads as a
       * dropdown from the trigger, not a takeover of the page. Nearly
       * flush to the top on phones — the input takes focus on open, so
       * the on-screen keyboard claims the bottom half and every 10vh
       * spent above the field is a result the thumb can't see. */}
      <Modal.Container placement="top" size="lg" className="pt-4 sm:pt-[10vh]">
        <Modal.Dialog aria-label="Search Betabook">
          {/* No `key` on open state: the modal keeps its children
           * mounted through the exit animation, so remounting on close
           * would blank the query and results mid-fade and re-fire
           * autoFocus inside the closing dialog. The overlay already
           * unmounts this subtree between opens, which is what gives
           * each session its fresh empty state. */}
          <PaletteBody
            scopeAreaId={scopeAreaId}
            scopeAreaName={scopeAreaName}
            onNavigate={onNavigate}
          />
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

/** Remount on open to reset the previous search. */
function PaletteBody({
  scopeAreaId,
  scopeAreaName,
  onNavigate,
}: {
  scopeAreaId?: number;
  scopeAreaName?: string;
  onNavigate: (href: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const keys = useModifierLabels();
  const listId = useId();
  const optionIdPrefix = useId();
  const activeRef = useRef<HTMLLIElement | null>(null);

  const scopedFetcher = useCallback(
    (q: string, signal: AbortSignal) => fetchRouteSuggestions(q, signal, { areaId: scopeAreaId }),
    [scopeAreaId],
  );
  const routeFetcher = useCallback(
    (q: string, signal: AbortSignal) => fetchRouteSuggestions(q, signal),
    [],
  );
  const areaFetcher = useCallback(
    (q: string, signal: AbortSignal) => fetchAreaSuggestions(q, signal),
    [],
  );

  const scoped = useTypeahead(query, scopedFetcher, {
    enabled: scopeAreaId != null,
    scope: String(scopeAreaId ?? ""),
  });
  const routes = useTypeahead(query, routeFetcher);
  const areas = useTypeahead(query, areaFetcher);

  const trimmed = query.trim();
  const searchAllHref = `/?mode=climb&name=${encodeURIComponent(trimmed)}`;
  const isPending = scoped.isPending || routes.isPending || areas.isPending;

  const sections = useMemo((): PaletteSection[] => {
    if (!trimmed) return [];

    const result: PaletteSection[] = [];

    // Deduplicate only visible scoped results; hidden results must remain reachable globally.
    const showScoped = Boolean(scopeAreaName) && scoped.items.length > 0;
    const scopedIds = new Set(showScoped ? scoped.items.map((route) => route.id) : []);

    if (showScoped) {
      result.push({ heading: `In ${scopeAreaName}`, entries: scoped.items.map(routeEntry) });
    }
    const globalRoutes = routes.items.filter((route) => !scopedIds.has(route.id));
    if (globalRoutes.length > 0) {
      result.push({ heading: "Routes", entries: globalRoutes.map(routeEntry) });
    }
    if (areas.items.length > 0) {
      result.push({ heading: "Areas", entries: areas.items.map(areaEntry) });
    }

    result.push({
      heading: "",
      divider: true,
      entries: [
        {
          key: "search-all-routes",
          href: searchAllHref,
          text: `Search all routes for ${trimmed}`,
          content: <SearchAllRow entity="routes" query={trimmed} shortcut={keys?.modEnter} />,
        },
        {
          key: "search-all-areas",
          href: `/?mode=area&name=${encodeURIComponent(trimmed)}`,
          text: `Search all areas for ${trimmed}`,
          content: <SearchAllRow entity="areas" query={trimmed} />,
        },
      ],
    });

    return result;
  }, [trimmed, scoped.items, routes.items, areas.items, scopeAreaName, searchAllHref, keys]);

  const entries = useMemo(() => sections.flatMap((section) => section.entries), [sections]);

  // Track selection by row key because asynchronous results can reorder the list.
  // Reset during render on a new query to avoid painting a stale highlight.
  const [prevTrimmed, setPrevTrimmed] = useState(trimmed);
  if (prevTrimmed !== trimmed) {
    setPrevTrimmed(trimmed);
    setActiveKey(null);
  }

  const foundIndex = activeKey == null ? -1 : entries.findIndex((e) => e.key === activeKey);
  const activeIndex = foundIndex === -1 ? 0 : foundIndex;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (trimmed) onNavigate(searchAllHref);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (entries.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveKey(entries[(activeIndex + step + entries.length) % entries.length].key);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const entry = entries[activeIndex];
      if (entry) onNavigate(entry.href);
    }
  }

  let optionIndex = -1;

  return (
    // min-h-0 lets the flex child shrink so the list can scroll inside the modal.
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-separator px-4 py-3">
        <Search className="size-4 shrink-0 text-muted" aria-hidden />
        <input
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- modal search input focuses on mount
          autoFocus
          type="text"
          role="combobox"
          aria-expanded={entries.length > 0}
          aria-controls={listId}
          aria-activedescendant={
            entries[activeIndex] ? `${optionIdPrefix}-${entries[activeIndex].key}` : undefined
          }
          aria-label="Search routes and areas"
          autoComplete="off"
          placeholder="Search routes and areas…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
        />
        <Kbd className="hidden shrink-0 sm:inline-flex">Esc</Kbd>
      </div>

      <ul
        id={listId}
        role="listbox"
        aria-label="Search results"
        className="max-h-[50vh] overflow-y-auto p-2"
      >
        {sections.map((section) => (
          <li
            key={section.heading || "actions"}
            role="presentation"
            className={clsx(section.divider && "mt-2 border-t border-separator pt-2")}
          >
            {section.heading && (
              <p className={clsx("px-2 pt-3 pb-1", EYEBROW_CLASS)}>{section.heading}</p>
            )}
            <ul role="presentation">
              {section.entries.map((entry) => {
                optionIndex += 1;
                const index = optionIndex;
                const isActive = index === activeIndex;
                return (
                  <li
                    key={entry.key}
                    id={`${optionIdPrefix}-${entry.key}`}
                    role="option"
                    aria-selected={isActive}
                    ref={isActive ? activeRef : undefined}
                    onMouseMove={() => setActiveKey(entry.key)}
                    onClick={() => onNavigate(entry.href)}
                    className={clsx(
                      "cursor-pointer rounded-inset px-2 py-2 text-sm",
                      isActive && "bg-surface-secondary",
                    )}
                  >
                    {entry.content}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}

        {entries.length === 0 && (
          <li role="presentation" className="px-2 py-6 text-center text-sm text-muted">
            {!trimmed ? "Search routes and areas…" : isPending ? "Searching…" : "Nothing found."}
          </li>
        )}
      </ul>

      <div className="hidden items-center gap-4 border-t border-separator px-4 py-2 text-xs text-muted sm:flex">
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd> open
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↑↓</Kbd> move
        </span>
        {keys && (
          <span className="flex items-center gap-1.5">
            <Kbd>{keys.modEnter}</Kbd> search all
          </span>
        )}
      </div>
    </div>
  );
}
