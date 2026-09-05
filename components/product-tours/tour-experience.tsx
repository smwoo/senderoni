"use client";

import { Button } from "@heroui/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { saveProductTourStatus } from "@/actions";
import { PRODUCT_TOUR_LOADERS } from "@/components/product-tours/registry";
import { TourOverlay } from "@/components/product-tours/tour-overlay";
import type { ProductTourPage } from "@/components/product-tours/types";
import { useTourFrame } from "@/components/product-tours/use-tour-frame";
import { AppLink } from "@/components/ui/app-link";
import { GENERIC_ERROR_MESSAGE } from "@/lib/action-result";
import { suspendMobileHelper } from "@/lib/mobile-helper-suspension";
import type { ProductTourDefinition } from "@/lib/product-tour";
import {
  PRODUCT_TOUR_STEPS,
  resolveProductTour,
  parseProductTourNavigation,
  productTourExitPath,
  productTourPath,
} from "@/lib/product-tour-navigation";

import styles from "@/components/product-tours/tour-layout.module.css";

export function TourExperience({
  userId,
  tour,
  savedVersion,
  children,
}: {
  userId: string;
  tour: ProductTourDefinition;
  savedVersion: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { steps, navigation } = resolveProductTour(PRODUCT_TOUR_STEPS[tour.id], {
    version: tour.version,
    savedVersion,
    navigation: parseProductTourNavigation({
      from: searchParams.getAll("from"),
      mode: searchParams.getAll("mode"),
    }),
  });
  const { from } = navigation;
  const updates = navigation.mode === "updates";
  const routeKey = `${pathname}:${from}:${updates}`;
  const index = steps.findIndex((step) => pathname.endsWith(`/${step.id}`));
  const [Page, setPage] = useState<ProductTourPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<{ path: string; message: string } | null>(null);
  const completion = useRef(0);
  const [pending, startTransition] = useTransition();
  const page = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const height = useTourFrame(frame);
  const exitPath = productTourExitPath(userId, from);
  function exit() {
    router.replace(exitPath);
  }
  function href(id: string) {
    return productTourPath(tour.id, { ...navigation, stepId: id });
  }
  const firstPath = href(steps[0].id);

  useEffect(() => {
    if (index < 0 && PRODUCT_TOUR_STEPS[tour.id].some((step) => pathname.endsWith(`/${step.id}`))) {
      router.replace(firstPath);
    }
  }, [index, pathname, tour.id, router, firstPath]);

  useEffect(() => suspendMobileHelper(), []);
  useEffect(
    () => () => {
      completion.current += 1;
    },
    [routeKey],
  );
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const loaded = await PRODUCT_TOUR_LOADERS[tour.id]();
        if (active) setPage(() => loaded);
      } catch {
        if (active) setFailed(true);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [tour, attempt]);

  function finish() {
    completion.current += 1;
    const request = completion.current;
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveProductTourStatus(tour.id, tour.version, "completed");
        if (request !== completion.current) return;
        if (!result.ok) {
          setError({ path: routeKey, message: result.error });
          return;
        }
        router.replace(`/users/${userId}/journal`);
      } catch {
        if (request === completion.current)
          setError({ path: routeKey, message: GENERIC_ERROR_MESSAGE });
      }
    });
  }

  if (index < 0) return children;
  return (
    <div ref={frame} style={{ height }} className="flex h-[80dvh] flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-secondary px-4 py-3 text-sm">
        <span className="font-medium">
          Demo account · {updates ? "What's new" : "Product tour"}
        </span>
        <AppLink href={exitPath} className="text-foreground underline">
          Exit tour
        </AppLink>
      </div>
      {failed ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p>Couldn't load the tour.</p>
          <Button
            onPress={() => {
              setFailed(false);
              setAttempt(attempt + 1);
            }}
          >
            Try again
          </Button>
        </div>
      ) : Page ? (
        <div className={styles.layout}>
          {/* The scroll region needs a tab stop so keyboard users can scroll the demo. */}
          {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex */}
          <div
            ref={page}
            role="region"
            aria-label="Demo profile"
            tabIndex={0}
            className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain rounded-lg p-2 focus-visible:status-focused"
          >
            <Page
              key={steps[index].section}
              section={steps[index].section}
              mode={navigation.mode}
              href={href}
              steps={steps}
            />
          </div>
          {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
          <TourOverlay
            key={`${updates}:${steps[index].id}`}
            steps={steps}
            index={index}
            page={page}
            href={href}
            exit={exit}
            finish={finish}
            pending={pending}
            error={error?.path === routeKey ? error.message : null}
            fullTourHref={updates ? productTourPath(tour.id, { from, mode: "full" }) : undefined}
          />
        </div>
      ) : (
        <p role="status">Loading your tour…</p>
      )}
      {children}
    </div>
  );
}
