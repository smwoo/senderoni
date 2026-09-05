/** Stable application binding contract. `wrangler types` remains useful for
 * auditing the complete platform surface, but builds and tests must not
 * depend on a gitignored, machine-local generated file. */
interface CloudflareEnv {
  DB: D1Database;
  CONTACT_RATE_LIMITER: RateLimit;
  JOURNAL_RATE_LIMITER: RateLimit;
  FRIENDSHIP_RATE_LIMITER: RateLimit;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  RESEND_API_KEY: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

declare namespace Cloudflare {
  interface Env {
    DB: CloudflareEnv["DB"];
    CONTACT_RATE_LIMITER: CloudflareEnv["CONTACT_RATE_LIMITER"];
    JOURNAL_RATE_LIMITER: CloudflareEnv["JOURNAL_RATE_LIMITER"];
    FRIENDSHIP_RATE_LIMITER: CloudflareEnv["FRIENDSHIP_RATE_LIMITER"];
    BETTER_AUTH_URL: CloudflareEnv["BETTER_AUTH_URL"];
    BETTER_AUTH_SECRET: CloudflareEnv["BETTER_AUTH_SECRET"];
    RESEND_API_KEY: CloudflareEnv["RESEND_API_KEY"];
    GOOGLE_CLIENT_ID?: CloudflareEnv["GOOGLE_CLIENT_ID"];
    GOOGLE_CLIENT_SECRET?: CloudflareEnv["GOOGLE_CLIENT_SECRET"];
  }
}
