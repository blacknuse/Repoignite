#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTarget } from "./target.js";
import { analyze } from "./analyze.js";
import { doctor, formatCommand, runCommand } from "./run.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(await fs.readFile(path.join(here, "../package.json"), "utf8"));

function help() {
  return `RepoIgnite ${pkg.version}

Usage:
  repoignite <path-or-github-url> [options]

Options:
  --json       print the detected run plan as JSON
  --doctor     check whether inferred executables exist
  --write      write .repoignite/plan.json in a local target
  --install    execute the inferred dependency installation command
  --run        execute the inferred start command
  --trust      required before executing code cloned from a remote repository
  --help
  --version

Safe default: RepoIgnite only inspects files and prints a plan.`;
}

function parse(argv) {
  const o = { json: false, doctor: false, write: false, install: false, run: false, trust: false, target: null };
  for (const a of argv) {
    if (a === "--json") o.json = true;
    else if (a === "--doctor") o.doctor = true;
    else if (a === "--write") o.write = true;
    else if (a === "--install") o.install = true;
    else if (a === "--run") o.run = true;
    else if (a === "--trust") o.trust = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--version" || a === "-V") o.version = true;
    else if (a.startsWith("-")) throw new Error(`unknown option: ${a}`);
    else if (!o.target) o.target = a;
    else throw new Error(`unexpected argument: ${a}`);
  }
  return o;
}

function human(plan, doc = null) {
  console.log();
  console.log(`RepoIgnite ${pkg.version}`);
  console.log(`target      ${plan.target}`);
  console.log(`confidence  ${plan.confidence.toUpperCase()}`);
  console.log(`stack       ${plan.stack.map(x => x.kind).join(", ") || "unknown"}`);
  console.log(`install     ${formatCommand(plan.install) ?? "not inferred"}`);
  console.log(`start       ${formatCommand(plan.start) ?? "not inferred"}`);
  console.log(`services    ${plan.services.join(", ") || "none detected"}`);
  if (plan.environment.exampleKeys.length) {
    console.log(`env example ${plan.environment.exampleKeys.join(", ")}`);
  }
  if (plan.environment.missingFromExample.length) {
    console.log(`env missing ${plan.environment.missingFromExample.join(", ")}`);
  }
  if (doc) {
    console.log("doctor");
    for (const x of doc) console.log(`  ${x.available ? "OK " : "MISS"} ${x.command}`);
  }
  if (plan.warnings.length) {
    console.log("warnings");
    for (const x of plan.warnings) console.log(`  - ${x}`);
  }
  console.log();
}

let opt;
try { opt = parse(process.argv.slice(2)); }
catch (e) { console.error(e.message); console.error(help()); process.exit(2); }

if (opt.help) { console.log(help()); process.exit(0); }
if (opt.version) { console.log(pkg.version); process.exit(0); }
if (!opt.target) { console.error(help()); process.exit(2); }

let target;
try { target = await resolveTarget(opt.target); }
catch (e) { console.error(`target error: ${e.message}`); process.exit(2); }

try {
  const plan = await analyze(target.path, target.label);
  const doc = opt.doctor ? doctor(plan) : null;
  if (opt.json) console.log(JSON.stringify({ ...plan, doctor: doc }, null, 2));
  else human(plan, doc);

  if (opt.write) {
    if (target.remote) throw new Error("--write is only supported for local targets");
    const outDir = path.join(target.path, ".repoignite");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, "plan.json"), JSON.stringify(plan, null, 2) + "\n");
  }

  if ((opt.install || opt.run) && target.remote && !opt.trust) {
    throw new Error("refusing to execute code from a remote repository without --trust");
  }
  if (opt.install) {
    if (!plan.install) throw new Error("no install command inferred");
    const code = await runCommand(plan.install, target.path);
    if (code !== 0) process.exitCode = code;
  }
  if (opt.run && !process.exitCode) {
    if (!plan.start) throw new Error("no start command inferred");
    const code = await runCommand(plan.start, target.path);
    process.exitCode = code;
  }
} catch (e) {
  console.error(`repoignite: ${e.message}`);
  process.exitCode = 2;
} finally {
  await target.cleanup();
}
