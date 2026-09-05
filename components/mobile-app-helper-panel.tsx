"use client";

import { Button } from "@heroui/react";
import { Download, MoreVertical, Mountain, Share, X } from "lucide-react";

import { detectMobileBrowser, detectMobilePlatform } from "@/lib/mobile-detection";

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** The callout's actual markup, split from the shell that decides whether to
 * show it. The shell is in the root layout and so is on every route, while
 * this renders only on a mobile browser that hasn't dismissed it — keeping
 * the two apart takes the icons and `Button` off every other page. The shell
 * preloads it on idle, so the 1s reveal timer never waits on a fetch. */
export function MobileAppHelperPanel({
  installPrompt,
  onDismiss,
  onNativeInstall,
}: {
  installPrompt: BeforeInstallPromptEvent | null;
  onDismiss: () => void;
  onNativeInstall: () => void;
}) {
  const platform = detectMobilePlatform();
  const detectedBrowser = detectMobileBrowser();
  const isIOS = platform === "ios";

  return (
    <aside
      aria-label="Add Betabook to Home Screen"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md rounded-surface border border-border bg-surface-secondary p-4 shadow-2xl ring-1 ring-border/50 backdrop-blur-md sm:inset-x-auto sm:right-6 sm:bottom-6 sm:max-w-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-inset border border-accent/30 bg-accent/15 text-accent">
            <Mountain className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Add to Home Screen</h3>
            <p className="text-xs text-foreground/80">
              {isIOS ? "Create an iOS app shortcut" : "Create an Android app shortcut"}
            </p>
          </div>
        </div>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label="Dismiss shortcut helper"
          className="size-7 shrink-0 text-muted hover:text-foreground"
          onPress={onDismiss}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="mt-3 rounded-inset border border-border/70 bg-surface-tertiary/70 p-3.5 text-xs leading-relaxed text-foreground">
        {isIOS ? (
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-foreground">
              {detectedBrowser === "chrome"
                ? "Add shortcut in Chrome for iOS:"
                : "Add shortcut in Safari or Chrome for iOS:"}
            </p>
            <ol className="flex flex-col gap-2 pl-4 text-foreground/90">
              <li className="list-decimal marker:font-semibold marker:text-accent">
                Tap the <span className="font-semibold text-foreground">Share</span> button (
                <Share className="inline size-3.5 align-text-bottom text-accent" />) in the address
                bar or menu.
              </li>
              <li className="list-decimal marker:font-semibold marker:text-accent">
                Scroll down and tap{" "}
                <span className="font-semibold text-foreground">
                  &quot;Add to Home Screen&quot;
                </span>
                .
              </li>
              <li className="list-decimal marker:font-semibold marker:text-accent">
                Tap <span className="font-semibold text-foreground">Add</span> in the top-right
                corner.
              </li>
            </ol>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-foreground">Add shortcut in Chrome for Android:</p>
            <ol className="flex flex-col gap-2 pl-4 text-foreground/90">
              <li className="list-decimal marker:font-semibold marker:text-accent">
                Tap the <span className="font-semibold text-foreground">menu</span> (
                <MoreVertical className="inline size-3.5 align-text-bottom text-accent" />) in the
                top-right corner of Chrome.
              </li>
              <li className="list-decimal marker:font-semibold marker:text-accent">
                Tap{" "}
                <span className="font-semibold text-foreground">
                  &quot;Install and create shortcut&quot;
                </span>{" "}
                (or{" "}
                <span className="font-semibold text-foreground">
                  &quot;Add to Home screen&quot;
                </span>
                ).
              </li>
              <li className="list-decimal marker:font-semibold marker:text-accent">
                Tap <span className="font-semibold text-foreground">Install</span> or{" "}
                <span className="font-semibold text-foreground">Add</span> to place it on your home
                screen.
              </li>
            </ol>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {installPrompt && !isIOS ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              className="px-3.5 text-xs font-medium"
              onPress={onDismiss}
            >
              Dismiss
            </Button>
            <Button
              size="sm"
              variant="primary"
              className="gap-1.5 px-4 text-xs font-semibold"
              onPress={onNativeInstall}
            >
              <Download className="size-4" />
              Install and create shortcut
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="primary"
            className="px-5 text-xs font-semibold"
            onPress={onDismiss}
          >
            Got it
          </Button>
        )}
      </div>
    </aside>
  );
}
