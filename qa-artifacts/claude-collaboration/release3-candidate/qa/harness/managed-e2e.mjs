// Composes scripts/managed-sms-qa-check.mjs setup (from --repo) with managed-tail.part, runs it inside the repo's scripts/ dir, deletes it.
import { readFileSync, writeFileSync, rmSync } from "node:fs"; import { join, dirname } from "node:path"; import { pathToFileURL, fileURLToPath } from "node:url";
const repo = process.argv[process.argv.indexOf("--repo") + 1], here = dirname(fileURLToPath(import.meta.url));
const setup = readFileSync(join(repo, "scripts/managed-sms-qa-check.mjs"), "utf8"), cut = setup.indexOf("\nawait check(");
const out = join(repo, "scripts", `.r3qa-managed-${process.pid}.mjs`); writeFileSync(out, setup.slice(0, cut) + "\n" + readFileSync(join(here, "managed-tail.part"), "utf8"));
try { await import(pathToFileURL(out).href); } finally { rmSync(out, { force: true }); }
