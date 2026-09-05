"use client";

import { ListBox, Select, useTheme } from "@heroui/react";

import { Skeleton } from "@/components/ui/skeleton";
import { useMounted } from "@/hooks/use-mounted";
import { syncThemeColorMeta } from "@/lib/theme-color";

/** The full three-option theme picker, on /account only. It lives apart from
 * ThemeSwitch because the root layout imports that one: sharing a module put
 * `Select` and `ListBox` — neither of which the header uses — into the bundle
 * every route loads. No lazy loading needed, just its own file. */
export function ThemeSelect() {
  // `theme` is only known client-side, so we gate on `mounted` to keep the
  // server/first-client render identical and avoid a hydration mismatch,
  // matching the pattern in auth-nav.tsx. Crucially, useTheme's own useState
  // initializer already reads localStorage ("heroui-theme" — the same key the
  // blocking script in app/layout.tsx resolves pre-paint) with a "system"
  // fallback, so `theme` holds the real value from the very first client
  // render: once the select appears it shows the right value immediately,
  // never a "System" placeholder that swaps after mount.
  const mounted = useMounted();
  const { theme, setTheme } = useTheme("system");

  if (!mounted) {
    // Same footprint as the trigger below (w-28, min-h-9, rounded-inset) so
    // the account card's geometry doesn't shift when the select mounts.
    return <Skeleton rounded="rounded-inset" className="h-9 w-28" />;
  }

  return (
    <Select
      aria-label="Theme"
      selectedKey={theme}
      onSelectionChange={(key) => {
        setTheme(String(key));
        syncThemeColorMeta(String(key));
      }}
    >
      <Select.Trigger className="w-28">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id="light">Light</ListBox.Item>
          <ListBox.Item id="dark">Dark</ListBox.Item>
          <ListBox.Item id="system">System</ListBox.Item>
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
