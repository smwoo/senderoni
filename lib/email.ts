import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Resend } from "resend";

const FROM = "Betabook <noreply@betabook.ca>";

// Cloudflare Email Routing forwards this to the maintainer's inbox, so the
// address here is the whole configuration — nothing to set per environment.
const CONTACT_TO = "hello@betabook.ca";

async function getResend() {
  const { env } = await getCloudflareContext({ async: true });
  return env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
}

/** The site's own origin, for links in emails that aren't auth links.
 *
 * better-auth builds its verification/reset URLs from this same value, so
 * there's no second thing to configure — and a preview deployment's emails
 * point at the preview rather than at production. */
async function getBaseUrl() {
  const { env } = await getCloudflareContext({ async: true });
  return env.BETTER_AUTH_URL.replace(/\/$/, "");
}

/** Escape display names in HTML greetings.
 *
 * The two auth helpers below interpolate a better-auth-generated URL and
 * nothing else. Contact, moderation, and friend request emails use plain text. */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendVerificationEmail(to: string, url: string) {
  const resend = await getResend();
  if (!resend) {
    console.log(`[dev] verification link for ${to}: ${url}`);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Verify your Betabook email",
    html: `<p>Click the link below to verify your email address:</p><p><a href="${url}">${url}</a></p>`,
  });
}

export async function sendResetPasswordEmail(to: string, url: string) {
  const resend = await getResend();
  if (!resend) {
    console.log(`[dev] reset password link for ${to}: ${url}`);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Reset your Betabook password",
    html: `<p>Click the link below to reset your password:</p><p><a href="${url}">${url}</a></p>`,
  });
}

/** Sent once, when an account's email verification lands.
 *
 * Verification is the moment the account becomes usable — every signed-in
 * surface is behind `requireEmailVerification` — and better-auth drops the
 * user back on /sign-in with no orientation. This is that orientation.
 *
 * Like sendContactEmail and unlike the two helpers above, this surfaces a
 * Resend failure rather than swallowing it: there is no "resend welcome"
 * button anywhere, so the caller is the only thing that can notice. See
 * lib/welcome-email.ts for what it does with that.
 */
export async function sendWelcomeEmail(to: string, name: string) {
  const resend = await getResend();
  const base = await getBaseUrl();

  const html = [
    `<p>Hi ${escapeHtml(name)},</p>`,
    `<p>Your email is verified — welcome to Betabook, a climbing logbook and crag database for keeping the routes you've climbed and the places you climbed them.</p>`,
    `<p>Somewhere to start:</p>`,
    `<ul>`,
    `<li><a href="${base}/account/import">Import your logbook</a> — already tracking sends somewhere else? Export a CSV and bring the whole history across.</li>`,
    // No /areas or /climbs index exists to link to — browsing starts from the
    // search on the home page — so this is the one link that covers both.
    `<li><a href="${base}">Log your first send</a> — search for a climb and record the ascent.</li>`,
    `</ul>`,
    `<p>Betabook is free, ad-free, and open source. Questions or corrections: <a href="${base}/contact">get in touch</a>.</p>`,
  ].join("");

  if (!resend) {
    console.log(`[dev] welcome email for ${to}:\n${html}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "Welcome to Betabook",
    html,
  });

  if (error) throw new Error(`Resend rejected the welcome email: ${error.message}`);
}

/** Names stay in plain text. The requests page requires sign-in and exposes no
 * journal content; it also works when the requester has a private profile. */
export async function sendFriendRequestEmail(to: string, requesterName: string) {
  const resend = await getResend();
  const base = await getBaseUrl();
  const text = [
    `${requesterName} sent you a friend request on Betabook.`,
    "",
    "Accept or decline the request:",
    `${base}/friends?view=requests`,
  ].join("\n");

  if (!resend) {
    console.log(`[dev] friend request email for ${to}:\n${text}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "New friend request on Betabook",
    text,
  });
  if (error) throw new Error(`Resend rejected the friend request email: ${error.message}`);
}

/** A message from the public /contact form.
 *
 * Sent from noreply@ — the only DKIM-signed sender for betabook.ca — with
 * the visitor's address as Reply-To, so hitting reply in a mail client
 * addresses them rather than a mailbox nobody reads.
 *
 * Unlike the two helpers above this one surfaces a Resend failure. Those are
 * fire-and-forget side effects of an auth flow with a "resend" button behind
 * them; this one is the entire point of the visitor's click, and reporting
 * success for a message that never left would be a lie they can't detect.
 */
export async function sendContactEmail(opts: { replyTo: string; subject: string; text: string }) {
  const resend = await getResend();
  if (!resend) {
    console.log(
      `[dev] contact message to ${CONTACT_TO}, reply to ${opts.replyTo}\n${opts.subject}\n\n${opts.text}`,
    );
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to: CONTACT_TO,
    replyTo: opts.replyTo,
    subject: opts.subject,
    // Plain text, not html: three visitor-supplied strings go into this body
    // and `text` has nothing to escape.
    text: opts.text,
  });

  // Resend returns its errors rather than throwing them. A plain Error, not
  // an ActionError, so the action boundary logs it to the Worker logs and
  // shows the visitor the generic message instead of Resend's internals.
  if (error) throw new Error(`Resend rejected the contact message: ${error.message}`);
}

/** Sent when an admin approves or rejects a change request — the requester's
 * only way to learn what happened, since the queue itself is admin-only.
 * Fired only on the final decision: intermediate coverage approvals on a
 * multi-area request aren't news the requester can act on.
 *
 * Plain text, not html, like sendContactEmail: `name`, `summary`/`details`
 * (built from area/climb names and payload fields, which are free text — see
 * lib/moderation.ts's describeChangeRequest), and `note` (an admin's typed
 * rejection reason) are all user-controlled, and `text` has nothing to
 * escape. */
export async function sendChangeRequestDecisionEmail(
  to: string,
  opts: {
    name: string;
    summary: string;
    details: string[];
    decision: "approved" | "rejected";
    note?: string | null;
    href: string | null;
  },
) {
  const resend = await getResend();
  const base = await getBaseUrl();

  const lines = [
    `Hi ${opts.name},`,
    "",
    `An admin has ${opts.decision} your request: ${opts.summary}`,
  ];
  if (opts.details.length > 0) lines.push("", ...opts.details.map((detail) => `- ${detail}`));
  if (opts.note) lines.push("", `Note from the admin: ${opts.note}`);
  if (opts.href) lines.push("", `${base}${opts.href}`);
  const text = lines.join("\n");

  if (!resend) {
    console.log(`[dev] change request ${opts.decision} email for ${to}:\n${text}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `Your change request was ${opts.decision}`,
    text,
  });

  if (error) {
    throw new Error(`Resend rejected the change request decision email: ${error.message}`);
  }
}
