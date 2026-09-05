import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function allowFriendshipWrite(key: string): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  const limiter: RateLimit | undefined = env.FRIENDSHIP_RATE_LIMITER;
  if (!limiter) {
    console.warn("FRIENDSHIP_RATE_LIMITER is not bound — allowing the write unthrottled");
    return true;
  }
  return (await limiter.limit({ key })).success;
}

/** True while `key` is still under the /contact limit set in wrangler.jsonc.
 *
 * Its own module rather than a helper inside the action, so tests can stub
 * the decision without also having to stand in for `getCloudflareContext`.
 * Miniflare implements the binding for real, so `next dev` and `vitest`
 * throttle the same way a deployed Worker does — with per-process counters
 * instead of per-colo ones.
 */
export async function allowContactSubmission(key: string): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });

  // Widened: `wrangler types` declares the binding non-optional, but a
  // Worker deployed before it landed would still be missing it, and a
  // TypeError here would reach a visitor as "Something went wrong" — worse
  // than an unthrottled submit, which the honeypot still filters.
  const limiter: RateLimit | undefined = env.CONTACT_RATE_LIMITER;
  if (!limiter) {
    console.warn("CONTACT_RATE_LIMITER is not bound — allowing the submission unthrottled");
    return true;
  }

  const { success } = await limiter.limit({ key });
  return success;
}

export async function allowJournalWrite(key: string): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });

  const limiter: RateLimit | undefined = env.JOURNAL_RATE_LIMITER;
  if (!limiter) {
    console.warn("JOURNAL_RATE_LIMITER is not bound — allowing the write unthrottled");
    return true;
  }

  const { success } = await limiter.limit({ key });
  return success;
}
