import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

/**
 * Fills the local database with a sign-in account and synthetic areas, climbs,
 * climbers and ticks.
 *
 *   pnpm seed                               # dev@example.com + 400 areas, 5000 climbs, 50 climbers
 *   pnpm seed --areas 50 --climbs 500 --users 3
 *   pnpm seed --email me@example.com --password hunter2 --name Jasper
 *   pnpm seed --seed 7                      # a different, still repeatable set
 *   pnpm seed --force                       # regenerate climbs that already exist
 *
 * Everyone signs in with `password` unless --password says otherwise.
 *
 * The account is upserted on every run, keeping its id — and so its ticks — so
 * this doubles as a password reset. Climbs are only generated when there are
 * none, or with --force, so re-running is safe.
 *
 * Deterministic for a given --seed, so two checkouts asked for the same numbers
 * hold the same rows and a bug reproduces off the same ids.
 */
import { faker } from "@faker-js/faker";
import { hashPassword } from "better-auth/crypto";

import { requireLocalDb } from "./d1-local.ts";
import { seedSocialData } from "./seed-social.ts";

// Ordinals into BOULDER_HUECO (VB–V17) and ROPE_YDS (5.0–5.15d) in lib/grades.
// Duplicated rather than imported: lib/ is reached through the `@/` alias, which
// bare `node scripts/…` does not resolve.
const MAX_GRADE = { boulder: 18, sport: 33, trad: 33 } as const;
const TYPES = ["boulder", "sport", "trad"] as const;
const DEFAULT_PASSWORD = "password";

type ClimbType = (typeof TYPES)[number];
type Climb = { id: number; type: ClimbType; grade: number | null };
type DatedSend = { userId: string; climbId: number; dateSent: string; comment: string | null };

const JOURNAL_END_DATE = "2026-09-01";
const TRAINING_TAGS = [
  "indoor",
  "gym",
  "technique",
  "hangboard",
  "strength",
  "mobility",
  "conditioning",
  "endurance",
];

const args = process.argv.slice(2);
const text = (name: string, fallback: string) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : (args[at + 1] ?? fallback);
};
const flag = (name: string, fallback: number) => {
  const at = args.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const value = Number(args[at + 1]);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name} needs a positive integer, got ${args[at + 1] ?? "nothing"}`);
  }
  return value;
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}

/** Mid-grades are the bulk of any crag; the extremes are rare. */
function bellGrade(max: number): number {
  const rolls = faker.number.int({ min: 0, max }) + faker.number.int({ min: 0, max });
  return Math.round(rolls / 2);
}

async function main() {
  const areaCount = flag("areas", 400);
  const climbCount = flag("climbs", 5000);
  const userCount = flag("users", 50);
  faker.seed(flag("seed", 1));

  // better-auth lowercases the email before looking it up, but `user.email` is
  // unique under SQLite's default case-sensitive collation, so a row stored
  // with capitals could never be signed into.
  const email = text("email", "dev@example.com").trim().toLowerCase();
  const password = text("password", DEFAULT_PASSWORD);
  const name = text("name", "Dev User");

  // Both are enforced at sign-in, where failing them is an opaque 401 rather
  // than an error pointing back here. `dev@localhost` is the easy mistake:
  // better-auth's validator wants a TLD.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`Not a valid email address: ${email}`);
  }
  if (password.length < 8) {
    throw new Error("--password must be at least 8 characters (better-auth's minimum).");
  }

  // scrypt is deliberately slow, so hash once and share it across every account.
  const passwordHash = await hashPassword(password);

  const db = new DatabaseSync(requireLocalDb());
  let open = false;
  try {
    db.exec("pragma foreign_keys = on");

    const existing = (db.prepare("select count(*) c from climbs").get() as { c: number }).c;
    const regenerate = existing === 0 || args.includes("--force");

    db.exec("begin");
    open = true;

    upsertAccount(db, { email, name, passwordHash });

    if (regenerate) {
      if (existing > 0) clear(db);
      const areaIds = insertAreas(db, areaCount);
      const climbs = insertClimbs(db, climbCount, areaIds);
      const userIds = insertUsers(db, userCount, passwordHash);
      const sendCount = insertSends(db, userIds, climbs);
      const journalCount = insertJournalEntries(db, userIds, climbs);
      console.log(
        `Seeded ${areaCount.toLocaleString()} areas, ${climbCount.toLocaleString()} climbs, ` +
          `${userIds.length} climbers, ${sendCount.toLocaleString()} ticks and ` +
          `${journalCount.toLocaleString()} journal entries.`,
      );
    } else {
      console.log(`Left ${existing.toLocaleString()} existing climbs alone (--force regenerates).`);
    }

    if (regenerate || args.includes("--social")) {
      const viewer = db.prepare("SELECT id FROM user WHERE email = ?").get(email) as { id: string };
      const socialCount = seedSocialData(db, viewer.id);
      console.log(
        `Added ${socialCount} friendships and requests and refreshed synthetic social scenarios.`,
      );
    }

    db.exec("commit");
    open = false;

    console.log(`Sign in as ${email} with \`${password}\` at http://localhost:3000/sign-in`);
    console.log("Restart `pnpm dev`: it holds its D1 handle open.");
  } catch (error) {
    // Rolling back when nothing began throws over the error worth reading.
    if (open) db.exec("rollback");
    throw error;
  } finally {
    db.close();
  }
}

/**
 * Derived from the email, not faker: faker is seeded, so it hands out the same
 * uuid on every run and a second account would collide on user.id.
 */
function idFor(value: string): string {
  const h = createHash("sha256").update(value).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * Idempotent on email: a re-run rotates the password and name but keeps the
 * user id, and so their ticks.
 */
function upsertAccount(
  db: DatabaseSync,
  { email, name, passwordHash }: { email: string; name: string; passwordHash: string },
) {
  db.prepare(
    "insert into user (id, name, email, email_verified) values (?, ?, ?, 1)" +
      " on conflict (email) do update set name = excluded.name, email_verified = 1," +
      " updated_at = cast(unixepoch('subsecond') * 1000 as integer)",
  ).run(idFor(email), name, email);

  const id = (db.prepare("select id from user where email = ?").get(email) as { id: string }).id;
  db.prepare(
    "insert into account (id, account_id, provider_id, user_id, password, updated_at)" +
      " select ?, ?, 'credential', ?, ?, cast(unixepoch('subsecond') * 1000 as integer)" +
      " where not exists (select 1 from account where user_id = ? and provider_id = 'credential')",
  ).run(idFor(`${email}:credential`), id, id, passwordHash, id);
  db.prepare(
    "update account set password = ?, updated_at = cast(unixepoch('subsecond') * 1000 as integer)" +
      " where provider_id = 'credential' and user_id = ?",
  ).run(passwordHash, id);
}

/**
 * areas.parent_id is ON DELETE RESTRICT, so a bare `delete from areas` fails on
 * the first parent. Deleting deepest-first is what makes it terminate.
 */
function clear(db: DatabaseSync) {
  db.exec("delete from journal_entries");
  db.exec("delete from sends");
  db.exec("delete from climbs");
  // Their emails are unique, so a re-seed would collide. Sends and accounts
  // cascade. Anyone else — the dev user — is left alone.
  db.exec("delete from user where email like 'climber%@example.com'");
  while ((db.prepare("select count(*) c from areas").get() as { c: number }).c > 0) {
    db.exec(
      "delete from areas where id not in (select parent_id from areas where parent_id is not null)",
    );
  }
  // Without this the next seed's ids continue from the old high-water mark.
  db.exec("delete from sqlite_sequence where name in ('areas', 'climbs')");
}

/** Regions hold crags hold sectors; climbs hang off the leaves. */
function insertAreas(db: DatabaseSync, count: number): number[] {
  const insert = db.prepare("insert into areas (parent_id, name, description) values (?, ?, ?)");

  const regionCount = Math.max(1, Math.round(count * 0.06));
  const cragCount = Math.max(1, Math.round(count * 0.24));

  const regions: number[] = [];
  const crags: number[] = [];
  const leaves: number[] = [];

  for (let i = 0; i < count; i += 1) {
    let parent: number | null = null;
    let name: string;

    if (i < regionCount) {
      name = `${faker.location.state()} ${faker.helpers.arrayElement(["Range", "Region", "Highlands", "Basin"])}`;
    } else if (i < regionCount + cragCount) {
      parent = faker.helpers.arrayElement(regions);
      name = `${faker.location.street().replace(/\s+(Street|Road|Avenue|Lane|Drive)$/, "")} ${faker.helpers.arrayElement(["Crag", "Canyon", "Wall", "Bluff", "Boulders"])}`;
    } else {
      parent = faker.helpers.arrayElement(crags);
      name = `${faker.word.adjective()} ${faker.helpers.arrayElement(["Slab", "Cave", "Arete", "Face", "Block", "Roof"])}`;
    }

    const id = insert.run(parent, title(name), maybeDescription()).lastInsertRowid as number;
    if (i < regionCount) regions.push(id);
    else if (i < regionCount + cragCount) crags.push(id);
    else leaves.push(id);
  }

  // With very small --areas there may be no third tier to hang climbs from.
  return leaves.length > 0 ? leaves : crags.length > 0 ? crags : regions;
}

function insertClimbs(db: DatabaseSync, count: number, areaIds: number[]): Climb[] {
  const insert = db.prepare(
    "insert into climbs (area_id, name, type, grade, description) values (?, ?, ?, ?, ?)",
  );
  const climbs: Climb[] = [];
  for (let i = 0; i < count; i += 1) {
    const type: ClimbType = faker.helpers.arrayElement(TYPES);
    // A real database has ungraded projects in it.
    const grade = faker.datatype.boolean(0.95) ? bellGrade(MAX_GRADE[type]) : null;
    const id = insert.run(
      faker.helpers.arrayElement(areaIds),
      title(`${faker.word.adjective()} ${faker.word.noun()}`),
      type,
      grade,
      maybeDescription(),
    ).lastInsertRowid as number;
    climbs.push({ id, type, grade });
  }
  return climbs;
}

/** Verified accounts with a repeatable mix of profile and journal privacy. */
function insertUsers(db: DatabaseSync, count: number, passwordHash: string): string[] {
  const insertUser = db.prepare(
    "insert into user (id, name, email, email_verified, is_private, journal_visibility)" +
      " values (?, ?, ?, 1, ?, ?)",
  );
  const insertAccount = db.prepare(
    "insert into account (id, account_id, provider_id, user_id, password, updated_at)" +
      " values (?, ?, 'credential', ?, ?, cast(unixepoch('subsecond') * 1000 as integer))",
  );

  // Anyone already here — the account upserted above — should get ticks too, so
  // their profile is not the one empty page in the app.
  const existingRows = db.prepare("select id, name from user").all() as {
    id: string;
    name: string;
  }[];
  const existing = existingRows.map((r) => r.id);
  // Faker's name pool repeats well within a few hundred draws, and
  // user_name_unique_idx compares NOCASE — suffix repeats with the loop
  // index (unique per run) so seeding never trips the index.
  const usedNames = new Set(existingRows.map((r) => r.name.toLowerCase()));

  for (let i = 0; i < count; i += 1) {
    const id = faker.string.uuid();
    let name = faker.person.fullName();
    if (usedNames.has(name.toLowerCase())) name = `${name} ${i + 1}`;
    usedNames.add(name.toLowerCase());
    // Positional, not faker.internet.email(): unique by construction, and
    // `user.email` is unique under a case-sensitive collation.
    // Cycle through public journals, fully private accounts, and public
    // profiles with private journals, even in a small --users 3 dataset.
    // Keep this independent of faker so existing ids and history stay stable.
    const privacyCase = i % 3;
    insertUser.run(
      id,
      name,
      `climber${i + 1}@example.com`,
      privacyCase === 1 ? 1 : 0,
      privacyCase === 0 ? "public" : "private",
    );
    insertAccount.run(faker.string.uuid(), id, id, passwordHash);
    existing.push(id);
  }
  return existing;
}

function insertSends(db: DatabaseSync, userIds: string[], climbs: Climb[]): number {
  const insert = db.prepare(
    "insert into sends (user_id, climb_id, ascent_style, date_sent, rating," +
      " suggested_grade, grade_feel, comment) values (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  let total = 0;

  for (const userId of userIds) {
    // Long-tailed on purpose: most climbers log a season, a few log years, and
    // a flat distribution gives every profile the same shape to look at.
    const wanted = faker.helpers.weightedArrayElement([
      { weight: 6, value: () => faker.number.int({ min: 20, max: 200 }) },
      { weight: 3, value: () => faker.number.int({ min: 200, max: 600 }) },
      { weight: 1, value: () => faker.number.int({ min: 600, max: 1200 }) },
    ])();
    // arrayElements samples without replacement, which is what keeps this
    // inside the (user_id, climb_id) unique index.
    const ticked = faker.helpers.arrayElements(
      climbs,
      Math.min(Math.max(climbs.length - 2, 0), wanted),
    );
    for (const climb of ticked) {
      insert.run(
        userId,
        climb.id,
        faker.helpers.weightedArrayElement([
          { weight: 6, value: "redpoint" },
          { weight: 3, value: "flash" },
          { weight: 1, value: "onsight" },
        ]),
        // Imported ticks often have no date at all.
        faker.datatype.boolean(0.9)
          ? faker.date.between({ from: "2021-01-01", to: "2026-09-01" }).toISOString().slice(0, 10)
          : null,
        faker.datatype.boolean(0.75) ? faker.number.int({ min: 2, max: 5 }) : null,
        climb.grade !== null && faker.datatype.boolean(0.25)
          ? clamp(climb.grade + faker.number.int({ min: -1, max: 1 }), MAX_GRADE[climb.type])
          : null,
        faker.helpers.weightedArrayElement([
          { weight: 6, value: "solid" },
          { weight: 2, value: "high" },
          { weight: 2, value: "low" },
        ]),
        faker.datatype.boolean(0.3) ? faker.lorem.sentence() : null,
      );
      total += 1;
    }
  }
  return total;
}

function insertJournalEntries(db: DatabaseSync, userIds: string[], climbs: Climb[]): number {
  const insert = db.prepare(
    "insert into journal_entries (user_id, climb_id, kind, sent, is_ascent, entry_date, body, tags)" +
      " values (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const datedSends = db
    .prepare(
      "select user_id userId, climb_id climbId, date_sent dateSent, comment" +
        " from sends where date_sent is not null",
    )
    .all() as DatedSend[];
  const climbsById = new Map(climbs.map((climb) => [climb.id, climb]));
  const sendsByUser = new Map<string, DatedSend[]>();
  for (const send of datedSends) {
    const userSends = sendsByUser.get(send.userId) ?? [];
    userSends.push(send);
    sendsByUser.set(send.userId, userSends);
  }
  let total = 0;

  const add = ({
    userId,
    climbId = null,
    kind = "session",
    sent = false,
    isAscent = false,
    entryDate,
    body = null,
    tags = null,
  }: {
    userId: string;
    climbId?: number | null;
    kind?: "session" | "training";
    sent?: boolean;
    isAscent?: boolean;
    entryDate: string;
    body?: string | null;
    tags?: string[] | null;
  }) => {
    insert.run(
      userId,
      climbId,
      kind,
      Number(sent),
      Number(isAscent),
      entryDate,
      body,
      tags && JSON.stringify(tags),
    );
    total += 1;
  };

  for (const send of datedSends) {
    const climb = climbsById.get(send.climbId);

    for (const entryDate of randomDates(
      faker.number.int({ min: 1, max: 3 }),
      shiftDate(send.dateSent, -180),
      shiftDate(send.dateSent, -1),
    )) {
      add({
        userId: send.userId,
        climbId: send.climbId,
        entryDate,
        body: maybeJournalBody(),
        tags: climb ? journalTags(tagsForClimb(climb)) : null,
      });
    }

    add({
      userId: send.userId,
      climbId: send.climbId,
      sent: true,
      isAscent: true,
      entryDate: send.dateSent,
      body: send.comment,
      tags: climb ? journalTags(tagsForClimb(climb)) : null,
    });
  }

  for (const userId of userIds) {
    const userSends = sendsByUser.get(userId) ?? [];
    const sentClimbIds = new Set(userSends.map((send) => send.climbId));
    const repeatCandidates = userSends.filter((send) => send.dateSent <= JOURNAL_END_DATE);

    for (const send of faker.helpers.arrayElements(
      repeatCandidates,
      Math.min(3, repeatCandidates.length),
    )) {
      const climb = climbsById.get(send.climbId);
      add({
        userId,
        climbId: send.climbId,
        sent: true,
        entryDate: randomDate(send.dateSent, JOURNAL_END_DATE),
        body: maybeJournalBody(),
        tags: journalTags(["repeat", ...(climb ? tagsForClimb(climb) : [])]),
      });
    }

    const projectCandidates = climbs.filter((climb) => !sentClimbIds.has(climb.id));
    const projects = faker.helpers.arrayElements(
      projectCandidates,
      Math.min(2, projectCandidates.length),
    );
    for (const [projectIndex, climb] of projects.entries()) {
      const sessionDates = randomDates(projectIndex === 0 ? 5 : 3, "2026-03-01", JOURNAL_END_DATE);
      for (const entryDate of sessionDates) {
        add({
          userId,
          climbId: climb.id,
          entryDate,
          body: faker.lorem.sentences({ min: 1, max: 2 }),
          tags: journalTags(["project", ...tagsForClimb(climb)]),
        });
      }
    }

    for (const entryDate of randomDates(4, "2026-05-01", JOURNAL_END_DATE)) {
      add({
        userId,
        kind: "training",
        entryDate,
        body: faker.lorem.sentences({ min: 1, max: 2 }),
        tags: journalTags(TRAINING_TAGS),
      });
    }
  }

  return total;
}

function tagsForClimb(climb: Climb): string[] {
  if (climb.type === "boulder") return ["power", "technical", "compression"];
  if (climb.type === "sport") return ["endurance", "technical", "pumpy"];
  return ["crack", "technical", "gear"];
}

function journalTags(values: string[]): string[] | null {
  if (!faker.datatype.boolean(0.7)) return null;
  return faker.helpers.arrayElements(values, { min: 1, max: Math.min(3, values.length) });
}

function maybeJournalBody(): string | null {
  return faker.datatype.boolean(0.65) ? faker.lorem.sentences({ min: 1, max: 3 }) : null;
}

function randomDate(from: string, to: string): string {
  return faker.date.between({ from, to }).toISOString().slice(0, 10);
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function randomDates(count: number, from: string, to: string): string[] {
  const dates = new Set<string>();
  while (dates.size < count) dates.add(randomDate(from, to));
  return [...dates].sort();
}

function title(value: string): string {
  return value.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function maybeDescription(): string | null {
  return faker.datatype.boolean(0.4) ? faker.lorem.sentence() : null;
}
