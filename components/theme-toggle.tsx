"use client";

import { Button, useTheme } from "@heroui/react";
import { Monitor, Moon, Sun } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useMounted } from "@/hooks/use-mounted";
import { syncThemeColorMeta } from "@/lib/theme-color";

const THEME_CYCLE = ["light", "dark", "system"] as const;
type ThemeName = (typeof THEME_CYCLE)[number];

const THEME_ICON: Record<ThemeName, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/** Compact header theme control: one icon button cycling light → dark →
 * system. The full three-option Select stays on /account (ThemeToggle
 * below) for anyone who wants to pick directly. */
export function ThemeSwitch() {
  const mounted = useMounted();
  const { theme, setTheme } = useTheme("system");

  if (!mounted) {
    // Same footprint and shape as the icon button below — HeroUI clamps a
    // button's radius to a pill — so the header neither shifts nor pops.
    return <Skeleton rounded="rounded-full" className="size-9" />;
  }

  const current: ThemeName = THEME_CYCLE.includes(theme as ThemeName)
    ? (theme as ThemeName)
    : "system";
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
  const Icon = THEME_ICON[current];

  return (
    <Button
      isIconOnly
      variant="ghost"
      size="sm"
      aria-label={`Theme: ${current}. Switch to ${next}.`}
      onPress={() => {
        setTheme(next);
        syncThemeColorMeta(next);
      }}
    >
      <Icon className="size-4" />
    </Button>
  );
}
