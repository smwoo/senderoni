import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Repairs the HTML entity artifacts left in the database by earlier imports:
 * `climbs.name` ("Jekyll &amp Hyde") and `sends.comment` ("I&rsquo;ve").
 *
 *   pnpm backfill:entities            # dry run against production
 *   pnpm backfill:entities --apply    # dry run, then write
 *   pnpm backfill:entities --local    # rehearse against .wrangler
 *
 * Every run first writes to `--out` (default `./backfill-out`): a `.sql` of
 * the UPDATEs, a `.rollback.sql` restoring every previous value, and a `.csv`
 * of before/after, per pass. Each statement carries the old value in its WHERE
 * clause, so the script is idempotent and a row edited by someone else between
 * the dry run and the apply is skipped rather than overwritten.
 *
 * The two passes need different rules. Names dropped their closing semicolon
 * ("&amp"), which `decodeHtmlEntities` deliberately won't touch; comments carry
 * proper entities, which is exactly what it does handle.
 *
 * Before running this against production:
 *
 * - Climb names are a moderation-gated field. This writes to the table
 *   directly and leaves no moderation record, which is the right call for
 *   repairing an encoding artifact and the wrong one for a rename.
 * - `climbs_fts_after_update` fires on `UPDATE OF name`, so search follows
 *   automatically. No reindex step.
 * - `updated_at` is left alone: this is a repair, not a user edit, and bumping
 *   it would reorder every "recently updated" surface.
 */
import { decodeHtmlEntities } from "../lib/html-entities.ts";
import { hasUnhandledEntity, repairClimbName } from "./climb-name-entities.ts";
import { requireLocalDb } from "./d1-local.ts";

type ClimbRow = { id: number; name: string };
/** A send plus the journal entry that mirrors it, if it has one. */
type SendRow = {
  id: number;
  comment: string;
  journalId: number | null;
  journalBody: string | null;
};
type Change = { id: number; before: string; after: string };

/** Strict, because the default target is production: a mistyped "-local" that
 * parsed as "not local" would write production while the operator believed
 * they were rehearsing. Anything unrecognized stops the run. */
function parseArgs(argv: string[]) {
  let apply = false;
  let local = false;
  let outDir = "backfill-out";
  for (const arg of argv) {
    if (arg === "--apply") apply = true;
    else if (arg === "--local") local = true;
    else if (arg.startsWith("--out=")) {
      outDir = arg.slice("--out=".length);
      if (!outDir) throw new Error("--out= needs a directory");
    } else {
      throw new Error(`Unrecognized argument "${arg}". Usage: [--apply] [--local] [--out=<dir>]`);
    }
  }
  return { apply, local, outDir };
}

const { apply, local, outDir } = parseArgs(process.argv.slice(2));

/** Statements per file. D1 executes a file as one batch, so this keeps any
 * single request modest and makes a partial failure easy to locate. */
const CHUNK_SIZE = 500;
const PAGE_SIZE = 500;
const PREVIEW_LIMIT = 15;

const WRANGLER = path.join("node_modules", ".bin", "wrangler");

function wrangler(argv: string[]): string {
  return execFileSync(WRANGLER, argv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** `wrangler d1 execute --json` prints an array of per-statement results.
 * Anchored to a line that starts the array, so a bracketed preamble (a
 * `[WARNING]` line, an update notice) can't be mistaken for the payload. */
function query<T>(sql: string): T[] {
  if (local) {
    const db = new DatabaseSync(requireLocalDb(), { readOnly: true });
    const rows = db.prepare(sql).all() as T[];
    db.close();
    return rows;
  }
  const raw = wrangler(["d1", "execute", "DB", "--remote", "--json", "--command", sql]);
  const start = raw.search(/^\s*\[/m);
  if (start === -1) throw new Error(`Expected JSON from wrangler, got:\n${raw}`);
  let parsed: { results?: T[] }[];
  try {
    parsed = JSON.parse(raw.slice(start)) as { results?: T[] }[];
  } catch (cause) {
    throw new Error(`Could not parse wrangler output:\n${raw}`, { cause });
  }
  return parsed.flatMap((r) => r.results ?? []);
}

/**
 * Proves, before anything is written, that the script is talking to the
 * database the operator thinks it is. `d1 info` names the database the `DB`
 * binding resolves to; the counts come back through the same query path the
 * passes use, so a broken binding or a stale auth token fails here rather than
 * halfway through an apply. Empty counts are the tell that it's the wrong one.
 */
function describeTarget(): void {
  if (local) {
    console.log(`target: local sqlite ${requireLocalDb()}`);
  } else {
    const raw = wrangler(["d1", "info", "DB", "--json"]);
    const info = JSON.parse(raw.slice(raw.search(/[[{]/))) as {
      name?: string;
      uuid?: string;
    };
    console.log(`target: PRODUCTION D1 "${info.name ?? "?"}" (${info.uuid ?? "?"})`);
  }
  const [counts] = query<{ climbs: number; sends: number; journal: number }>(
    `SELECT (SELECT COUNT(*) FROM climbs) AS climbs,
            (SELECT COUNT(*) FROM sends) AS sends,
            (SELECT COUNT(*) FROM journal_entries) AS journal`,
  );
  if (!counts) throw new Error("Connected, but the probe query returned no rows.");
  console.log(
    `connected: ${counts.climbs.toLocaleString()} climbs, ` +
      `${counts.sends.toLocaleString()} sends, ${counts.journal.toLocaleString()} journal entries`,
  );
}

/** Pages by id so a large result never depends on one oversized response.
 * `sql` must contain `$AFTER` and order by id. */
function readPaged<T extends { id: number }>(sql: string): T[] {
  const rows: T[] = [];
  let after = 0;
  for (;;) {
    const page = query<T>(sql.replace("$AFTER", String(after)));
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    after = page[page.length - 1].id;
  }
}

/** SQL string literal quoting, which doubles `'`. NULL has no literal form
 * here, so comparisons against it need `IS NULL` instead. */
const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
const sqlValue = (value: string | null) => (value === null ? "NULL" : quote(value));
const matches = (column: string, value: string | null) =>
  value === null ? `${column} IS NULL` : `${column} = ${quote(value)}`;

/** CSV field quoting, which doubles `"` — not the SQL quoting above. */
const csvField = (value: string) => `"${value.replace(/"/g, '""')}"`;

/** Clears one pass's artifacts from an earlier run, so a small run can't leave
 * a big run's extra `.002`/`.003` chunks behind for someone to replay.
 *
 * Only called by a pass that has something to write: a run that finds nothing
 * must leave the previous run's rollback in place, or confirming the apply
 * worked would destroy the means of undoing it. */
function clearPreviousArtifacts(dir: string, prefix: string): void {
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir)) {
    if (file.startsWith(`${prefix}.`)) rmSync(path.join(dir, file));
  }
}

function writeChunks(dir: string, base: string, lines: string[]): string[] {
  const files: string[] = [];
  for (let i = 0; i * CHUNK_SIZE < lines.length; i += 1) {
    const chunk = lines.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const suffix = lines.length > CHUNK_SIZE ? `.${String(i + 1).padStart(3, "0")}` : "";
    const file = path.join(dir, `${base}${suffix}.sql`);
    writeFileSync(file, `${chunk.join("\n")}\n`);
    files.push(file);
  }
  return files;
}

function writeCsv(dir: string, base: string, changes: Change[]): void {
  const rows = changes.map((c) => `${c.id},${csvField(c.before)},${csvField(c.after)}`);
  writeFileSync(path.join(dir, `${base}.csv`), `${["id,before,after", ...rows].join("\n")}\n`);
}

function preview(changes: Change[]): void {
  for (const c of changes.slice(0, PREVIEW_LIMIT)) {
    console.log(`  ${c.id}  ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`);
  }
  if (changes.length > PREVIEW_LIMIT) {
    console.log(`  …and ${changes.length - PREVIEW_LIMIT} more (see the CSV)`);
  }
}

function climbNamePass(dir: string): string[] {
  const rows = readPaged<ClimbRow>(
    `SELECT id, name FROM climbs WHERE name LIKE '%&%' AND id > $AFTER ORDER BY id LIMIT ${PAGE_SIZE}`,
  );
  const changes: Change[] = [];
  const unhandled: ClimbRow[] = [];
  for (const row of rows) {
    const after = repairClimbName(row.name);
    if (after !== row.name) changes.push({ id: row.id, before: row.name, after });
    if (hasUnhandledEntity(row.name)) unhandled.push(row);
  }

  console.log(`\nclimb names: ${rows.length} contain "&", ${changes.length} to repair`);
  preview(changes);
  if (changes.length === 0) {
    console.log("  no changes; any existing climb-names.* files left in place");
    return [];
  }

  clearPreviousArtifacts(dir, "climb-names");
  const forward = writeChunks(
    dir,
    "climb-names",
    changes.map(
      (c) =>
        `UPDATE climbs SET name = ${quote(c.after)} WHERE id = ${c.id} AND ${matches("name", c.before)};`,
    ),
  );
  writeChunks(
    dir,
    "climb-names.rollback",
    changes.map(
      (c) =>
        `UPDATE climbs SET name = ${quote(c.before)} WHERE id = ${c.id} AND ${matches("name", c.after)};`,
    ),
  );
  writeCsv(dir, "climb-names", changes);

  if (unhandled.length > 0) {
    const file = path.join(dir, "climb-names.unhandled.csv");
    const body = unhandled.map((r) => `${r.id},${csvField(r.name)}`);
    writeFileSync(file, `${["id,name", ...body].join("\n")}\n`);
    console.log(
      `  ${unhandled.length} name(s) hold an entity shape this rule does not repair, ` +
        `so they are not fully cleaned — see ${file}`,
    );
  }
  return forward;
}

/**
 * `send_journal_update_guard` aborts an `UPDATE OF comment ON sends` whose new
 * comment doesn't already equal the body of the earliest sent journal entry, so
 * the mirror has to be rewritten first. Emitting the pair in the other order
 * fails outright rather than silently diverging.
 */
function sendCommentPass(dir: string): string[] {
  const rows = readPaged<SendRow>(
    `SELECT s.id AS id, s.comment AS comment,
            (SELECT j.id FROM journal_entries j
              WHERE j.user_id = s.user_id AND j.climb_id = s.climb_id AND j.sent = 1
              ORDER BY j.entry_date, j.id LIMIT 1) AS journalId,
            (SELECT j.body FROM journal_entries j
              WHERE j.user_id = s.user_id AND j.climb_id = s.climb_id AND j.sent = 1
              ORDER BY j.entry_date, j.id LIMIT 1) AS journalBody
       FROM sends s
      WHERE s.comment LIKE '%&%' AND s.id > $AFTER
      ORDER BY s.id LIMIT ${PAGE_SIZE}`,
  );

  const changes: Change[] = [];
  const forward: string[] = [];
  const rollback: string[] = [];
  for (const row of rows) {
    const after = decodeHtmlEntities(row.comment);
    if (after === row.comment) continue;
    changes.push({ id: row.id, before: row.comment, after });
    if (row.journalId !== null) {
      forward.push(
        `UPDATE journal_entries SET body = ${quote(after)} WHERE id = ${row.journalId} AND ${matches("body", row.journalBody)};`,
      );
      rollback.push(
        `UPDATE journal_entries SET body = ${sqlValue(row.journalBody)} WHERE id = ${row.journalId} AND body = ${quote(after)};`,
      );
    }
    forward.push(
      `UPDATE sends SET comment = ${quote(after)} WHERE id = ${row.id} AND comment = ${quote(row.comment)};`,
    );
    rollback.push(
      `UPDATE sends SET comment = ${quote(row.comment)} WHERE id = ${row.id} AND comment = ${quote(after)};`,
    );
  }

  console.log(`\nsend comments: ${rows.length} contain "&", ${changes.length} to repair`);
  preview(changes);
  if (changes.length === 0) {
    console.log("  no changes; any existing send-comments.* files left in place");
    return [];
  }

  clearPreviousArtifacts(dir, "send-comments");
  const files = writeChunks(dir, "send-comments", forward);
  writeChunks(dir, "send-comments.rollback", rollback);
  writeCsv(dir, "send-comments", changes);
  return files;
}

function applyFiles(files: string[]): void {
  for (const [i, file] of files.entries()) {
    console.log(`Applying ${file} (${i + 1}/${files.length})…`);
    if (local) {
      const db = new DatabaseSync(requireLocalDb());
      db.exec(readFileSync(file, "utf8"));
      db.close();
    } else {
      wrangler(["d1", "execute", "DB", "--remote", `--file=${file}`, "--yes"]);
    }
  }
}

function main(): void {
  describeTarget();
  console.log(apply ? "mode: APPLY — changes will be written" : "mode: dry run — nothing written");
  mkdirSync(outDir, { recursive: true });
  const forward = [...climbNamePass(outDir), ...sendCommentPass(outDir)];

  console.log(`\nWrote ${forward.length} statement file(s) and rollbacks to ${outDir}/`);
  if (forward.length === 0) {
    console.log("Nothing to apply.");
    return;
  }
  if (!apply) {
    console.log("Dry run. Re-run with --apply to write these changes.");
    return;
  }
  applyFiles(forward);
  console.log("Done. Roll back with the .rollback.sql files.");
}

main();
