import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export function isGithubUrl(value) {
  try {
    const u = new URL(value);
    const parts = u.pathname.split("/").filter(Boolean);
    return u.protocol === "https:" && u.hostname === "github.com" &&
      parts.length === 2 && parts[0].length > 0 && parts[1].replace(/\.git$/, "").length > 0;
  } catch {
    return false;
  }
}

function exec(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(
      new Error(stderr.trim() || `${command} exited with code ${code}`)
    ));
  });
}

export async function resolveTarget(input) {
  if (!isGithubUrl(input)) {
    const local = path.resolve(input);
    const stat = await fs.stat(local);
    if (!stat.isDirectory()) throw new Error(`not a directory: ${local}`);
    return { path: local, label: input, remote: false, cleanup: async () => {} };
  }

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "repoignite-"));
  const repo = path.join(tmp, "repo");
  try {
    await exec("git", ["clone", "--depth", "1", "--quiet", "--", input, repo]);
  } catch (error) {
    await fs.rm(tmp, { recursive: true, force: true });
    throw error;
  }
  return {
    path: repo,
    label: input,
    remote: true,
    cleanup: () => fs.rm(tmp, { recursive: true, force: true })
  };
}
