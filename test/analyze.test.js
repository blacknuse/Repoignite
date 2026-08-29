import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyze } from "../src/analyze.js";
import { isGithubUrl } from "../src/target.js";

test("detects a Node project and chooses the dev script", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "repoignite-"));
  try {
    await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({
      scripts: { dev: "node server.js" },
      engines: { node: ">=20" }
    }));
    await fs.writeFile(path.join(dir, "package-lock.json"), "{}");
    const plan = await analyze(dir, dir);
    assert.deepEqual(plan.install, ["npm", "ci"]);
    assert.deepEqual(plan.start, ["npm", "run", "dev"]);
    assert.equal(plan.confidence, "high");
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("detects Python entrypoint", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "repoignite-"));
  try {
    await fs.writeFile(path.join(dir, "requirements.txt"), "flask\n");
    await fs.writeFile(path.join(dir, "app.py"), "print('ok')\n");
    const plan = await analyze(dir, dir);
    assert.deepEqual(plan.start, ["python", "app.py"]);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("finds env references absent from .env.example", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "repoignite-"));
  try {
    await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ scripts: { start: "node app.js" } }));
    await fs.writeFile(path.join(dir, "app.js"), "console.log(process.env.SECRET_TOKEN, process.env.PORT)\n");
    await fs.writeFile(path.join(dir, ".env.example"), "PORT=3000\n");
    const plan = await analyze(dir, dir);
    assert.deepEqual(plan.environment.missingFromExample, ["SECRET_TOKEN"]);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("GitHub URL validation is narrow", () => {
  assert.equal(isGithubUrl("https://github.com/owner/repo"), true);
  assert.equal(isGithubUrl("http://github.com/owner/repo"), false);
  assert.equal(isGithubUrl("https://example.com/owner/repo"), false);
});


test("rejects GitHub subpage URLs as clone targets", () => {
  assert.equal(isGithubUrl("https://github.com/owner/repo/issues/1"), false);
  assert.equal(isGithubUrl("https://github.com/owner/repo.git"), true);
});

test("uses Yarn classic lockfile semantics when no modern version is declared", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "repoignite-"));
  try {
    await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({
      scripts: { start: "node app.js" }
    }));
    await fs.writeFile(path.join(dir, "yarn.lock"), "");
    const plan = await analyze(dir, dir);
    assert.deepEqual(plan.install, ["yarn", "install", "--frozen-lockfile"]);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
