import { spawn, spawnSync } from "node:child_process";

export function formatCommand(parts) {
  if (!parts) return null;
  return parts.map(x => /[\s"']/u.test(x) ? JSON.stringify(x) : x).join(" ");
}

export function commandAvailable(command) {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(probe, [command], { stdio: "ignore", shell: false });
  return result.status === 0;
}

export function doctor(plan) {
  const commands = new Set();
  if (plan.install?.[0]) commands.add(plan.install[0]);
  if (plan.start?.[0]) commands.add(plan.start[0]);
  return [...commands].map(command => ({ command, available: commandAvailable(command) }));
}

export function runCommand(parts, cwd) {
  return new Promise((resolve, reject) => {
    if (!parts?.length) return reject(new Error("no command to run"));
    const child = spawn(parts[0], parts.slice(1), {
      cwd,
      shell: false,
      stdio: "inherit",
      env: process.env
    });
    child.on("error", reject);
    child.on("close", code => resolve(code ?? 1));
  });
}
