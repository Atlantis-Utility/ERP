// Pushes .env.local into the linked Vercel project's Production environment.
//
// Prerequisites — both are interactive browser flows, run them first:
//   npx vercel login
//   npx vercel link
//
// Usage:
//   node push-env-to-vercel.mjs                      # dry run, prints what it would do
//   node push-env-to-vercel.mjs --apply              # actually pushes
//   node push-env-to-vercel.mjs --only GDMS_API_ID,GDMS_SECRET_KEY --apply
//
// Existing variables are updated rather than duplicated. NEXT_PUBLIC_APP_URL is
// skipped by default: locally it is http://localhost:3000, and shipping that to
// production would point every review-request email link and OAuth redirect at
// the developer's own machine. Set it in the Vercel dashboard to the real
// deployment URL, or pass --include-app-url if .env.local already holds it.

import fs from "node:fs";
import { spawnSync } from "node:child_process";

const APPLY = process.argv.includes("--apply");
const REPLACE_ALL = process.argv.includes("--replace-all");
const INCLUDE_APP_URL = process.argv.includes("--include-app-url");
const TARGET = "production";

// --only KEY1,KEY2 restricts the run to specific variables, so rotating one
// credential doesn't rewrite the other two dozen.
const onlyArg = process.argv[process.argv.indexOf("--only") + 1];
const ONLY = process.argv.includes("--only") && onlyArg
  ? new Set(onlyArg.split(",").map((s) => s.trim()).filter(Boolean))
  : null;

const SKIP = new Set(INCLUDE_APP_URL ? [] : ["NEXT_PUBLIC_APP_URL"]);

function parseEnv(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      // Strip surrounding quotes; Vercel stores the literal value.
      const value = l.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
      return [l.slice(0, i).trim(), value];
    });
}

function vercel(args, input) {
  return spawnSync("npx", ["vercel", ...args], {
    input,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

if (!fs.existsSync(".vercel/project.json")) {
  console.error("Not linked. Run `npx vercel login` then `npx vercel link` first.");
  process.exit(1);
}

// --replace-all wipes Production first. Only ever run after a backup, because
// it deletes variables that exist in Vercel but not in .env.local — anything
// added straight in the dashboard has no other copy.
if (REPLACE_ALL) {
  if (!APPLY) {
    console.log("--replace-all: would back up production, then delete every variable before pushing\n");
  } else {
    const backup = `.env.production.backup-${new Date().toISOString().slice(0, 10)}`;
    console.log(`Backing up production to ${backup} …`);
    const pull = vercel(["env", "pull", backup, "--environment=production", "--yes"]);
    if (pull.status !== 0) {
      console.error("Backup failed, refusing to delete anything:\n" + (pull.stderr || ""));
      process.exit(1);
    }
    const existing = parseEnv(backup).map(([k]) => k);
    const localKeys = new Set(parseEnv(".env.local").map(([k]) => k));
    const orphans = existing.filter((k) => !localKeys.has(k));
    if (orphans.length) {
      console.log(`\n  ${orphans.length} variable(s) exist in production but NOT in .env.local:`);
      for (const k of orphans) console.log(`    ${k}`);
      console.log("  They are in the backup file. Re-add anything still needed.\n");
    }
    for (const key of existing) {
      const res = vercel(["env", "remove", key, TARGET, "--yes"]);
      console.log(`  ${res.status === 0 ? "deleted" : "FAILED "} ${key}`);
    }
    console.log();
  }
}

let vars = parseEnv(".env.local");
if (ONLY) {
  const found = new Set(vars.map(([k]) => k));
  for (const k of ONLY) if (!found.has(k)) console.error(`  WARNING ${k} is not in .env.local`);
  vars = vars.filter(([k]) => ONLY.has(k));
}
console.log(`${vars.length} variables in .env.local, target: ${TARGET}`);
if (!APPLY) console.log("DRY RUN — re-run with --apply to push\n");

let pushed = 0;
let skipped = 0;
let failed = 0;

for (const [key, value] of vars) {
  if (SKIP.has(key)) {
    console.log(`  skip    ${key}  (environment-specific, set it by hand)`);
    skipped++;
    continue;
  }
  if (!APPLY) {
    console.log(`  would push  ${key}`);
    continue;
  }

  // `add` fails when the variable already exists, so fall back to `update`.
  // Variables marked Sensitive in Vercel can't be updated in place either —
  // that's the usual reason the dashboard refuses an edit — so the last resort
  // is delete-then-recreate.
  let res = vercel(["env", "add", key, TARGET], value);
  let verb = "added";
  if (res.status !== 0) {
    res = vercel(["env", "update", key, TARGET, "--yes"], value);
    verb = "updated";
  }
  if (res.status !== 0) {
    vercel(["env", "remove", key, TARGET, "--yes"]);
    res = vercel(["env", "add", key, TARGET], value);
    verb = "replaced";
  }

  if (res.status === 0) {
    console.log(`  ${verb.padEnd(7)} ${key}`);
    pushed++;
  } else {
    // Never echo the value — only the key and the reason.
    console.error(`  FAILED  ${key}: ${(res.stderr || "").trim().split("\n").pop()}`);
    failed++;
  }
}

if (APPLY) {
  console.log(`\ndone — ${pushed} pushed, ${skipped} skipped, ${failed} failed`);
  console.log("Redeploy for the new values to take effect: npx vercel --prod");
}
