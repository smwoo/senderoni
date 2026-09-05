/** The one card surface: a lifted secondary panel at the surface radius.
 * Every card in the app composes from here so a radius or surface change
 * lands everywhere at once instead of in nine hand-written copies. */
const CARD_CLASS = "rounded-surface bg-surface-secondary";

/** Card paddings: `sm` for dense stat cards and expanded filter panels,
 * `md` for forms and settings, `fluid` for wide analytics cards that need
 * room on desktop but not on a phone. */
export const CARD_PADDING = {
  sm: "p-4",
  md: "p-6",
  fluid: "p-4 sm:p-6",
} as const;

export function cardClass(padding: keyof typeof CARD_PADDING = "md"): string {
  return `${CARD_CLASS} ${CARD_PADDING[padding]}`;
}

/** Narrow centered card for auth/account-style single-purpose pages. */
export const FORM_CARD_CLASS = `mx-auto flex max-w-sm flex-col gap-4 ${cardClass("md")}`;

/** Full-width surface card for entity forms. */
export const SURFACE_CARD_CLASS = `flex flex-col gap-4 ${cardClass("md")}`;
