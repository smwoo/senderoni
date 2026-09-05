/**
 * The repair rule for the HTML entity artifacts in `climbs.name`, kept out of
 * the runner so the logic that rewrites production names is unit-tested.
 *
 * `lib/html-entities.ts` can't be reused: it requires the closing semicolon,
 * and this corruption drops it ("Jekyll &amp Hyde").
 */

/** `&amp;`, or a bare `&amp` not followed by another name character, so
 * "Jekyll &amp Hyde" is repaired while "&ampersand" and "&amp3" are not. The
 * semicolon form is tried first: otherwise the bare alternative matches inside
 * it and leaves the `;` behind. */
const AMP_ARTIFACT = /&amp;|&amp(?![A-Za-z0-9_])/g;

/** Some exporters encode twice ("&amp;amp;"); the cap stops a name genuinely
 * written "&amp;amp;amp;…" from unravelling indefinitely. */
const MAX_PASSES = 3;

/** Entity-shaped text this rule doesn't claim, terminated or not — the
 * semicolon is optional precisely because dropping it is the corruption we're
 * chasing. Two letters minimum keeps "R&D" and "AT&T" out; that still admits a
 * bare "&Word", which is the right way to be wrong for a list a human reads. */
const OTHER_ENTITY = /&[A-Za-z]{2,};?|&#\d+;?|&#[Xx][0-9A-Fa-f]+;?/;

export function repairClimbName(name: string): string {
  if (!name.includes("&")) return name;
  let repaired = name;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const next = repaired.replace(AMP_ARTIFACT, "&");
    if (next === repaired) break;
    repaired = next;
  }
  return repaired;
}

/** Whether a name still holds entity-shaped text after repair — the operator's
 * signal that another rule is needed before the data is clean. */
export function hasUnhandledEntity(name: string): boolean {
  return OTHER_ENTITY.test(repairClimbName(name));
}
