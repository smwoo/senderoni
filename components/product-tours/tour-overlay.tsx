"use client";

import { Button, buttonVariants } from "@heroui/react";
import { ArrowLeft, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";

import { useTourTarget } from "@/components/product-tours/use-tour-target";
import { AppLink } from "@/components/ui/app-link";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/action-result";
import type { ProductTourStepDefinition } from "@/lib/product-tour-navigation";
import { signInUrl } from "@/lib/sign-in-redirect";

import styles from "@/components/product-tours/tour-layout.module.css";

type TourOverlayProps = {
  steps: readonly ProductTourStepDefinition[];
  index: number;
  page: RefObject<HTMLDivElement | null>;
  href: (id: string) => string;
  exit: () => void;
  finish: () => void;
  pending: boolean;
  error: string | null;
  fullTourHref?: string;
};

export function TourOverlay({
  steps,
  index,
  page,
  href,
  exit,
  finish,
  pending,
  error,
  fullTourHref,
}: TourOverlayProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [showSteps, setShowSteps] = useState(false);
  const step = steps[index];
  const highlight = useTourTarget(step.target, page);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [step.id]);
  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented && !pending) {
        event.preventDefault();
        exit();
      }
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [exit, pending]);
  return (
    <>
      {highlight && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-20 overflow-hidden rounded-inset"
          style={{
            left: highlight.viewport.left,
            top: highlight.viewport.top,
            width: highlight.viewport.width,
            height: highlight.viewport.height,
          }}
        >
          <div
            className="absolute rounded-inset border-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
            style={{
              left: highlight.rect.left - highlight.viewport.left,
              top: highlight.rect.top - highlight.viewport.top,
              width: highlight.rect.width,
              height: highlight.rect.height,
            }}
          />
        </div>
      )}
      <div
        role="region"
        aria-label="Product tour"
        className={`${styles.guide} ${showSteps ? styles.chooser : ""} flex min-h-40 shrink-0 flex-col gap-3 rounded-surface border border-foreground/30 bg-surface p-3 text-foreground`}
      >
        <div className="flex shrink-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-xs text-muted">
              {index + 1} of {steps.length} · {step.section}
            </span>
            <h2 ref={heading} tabIndex={-1} className="mt-1 text-base font-semibold outline-none">
              {step.title}
            </h2>
          </div>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label="Exit tour"
            onPress={exit}
            isDisabled={pending}
          >
            <X aria-hidden className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto">
          {!showSteps && <p className="text-sm leading-relaxed">{step.description}</p>}
          {showSteps && (
            <nav aria-label="Tutorial steps" className="mt-2 flex flex-col gap-1">
              {steps.map((entry, i) => (
                <AppLink
                  key={entry.id}
                  href={href(entry.id)}
                  aria-current={entry.id === step.id ? "step" : undefined}
                  className="rounded-inset px-2 py-2 text-sm text-foreground hover:bg-surface-secondary"
                >
                  {i + 1}. {entry.title}
                </AppLink>
              ))}
            </nav>
          )}
          {error && (
            <div role="alert" className="mt-2 flex flex-col gap-2 text-sm">
              <p className="text-danger">{error}</p>
              {error === SESSION_EXPIRED_MESSAGE ? (
                <AppLink href={signInUrl(href(step.id))}>Sign in to finish</AppLink>
              ) : (
                <p>Try finishing again.</p>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2">
          {index > 0 ? (
            <AppLink
              href={href(steps[index - 1].id)}
              aria-label={`Previous: ${steps[index - 1].title}`}
              className="flex items-center gap-1 text-sm text-foreground"
            >
              <ArrowLeft aria-hidden className="size-4" />
              Back
            </AppLink>
          ) : (
            <span />
          )}
          <Button
            size="sm"
            variant="secondary"
            className="px-2 text-xs"
            aria-expanded={showSteps}
            onPress={() => setShowSteps(!showSteps)}
          >
            {fullTourHref ? "New tutorials" : "All tutorials"}
          </Button>
          {index === steps.length - 1 ? (
            <Button size="sm" className="text-xs" onPress={finish} isDisabled={pending}>
              {pending ? "Finishing…" : fullTourHref ? "Done" : "Finish tour"}
            </Button>
          ) : (
            <AppLink
              href={href(steps[index + 1].id)}
              className={buttonVariants({ size: "sm" })}
              aria-label={`Next: ${steps[index + 1].title}`}
            >
              Next
            </AppLink>
          )}
        </div>
        {fullTourHref && (
          <AppLink href={fullTourHref} className="text-xs text-foreground underline">
            Full tour
          </AppLink>
        )}
      </div>
    </>
  );
}
