import fs from "node:fs/promises";
import path from "node:path";

async function exists(root, rel) {
  try { await fs.access(path.join(root, rel)); return true; } catch { return false; }
}

async function readText(root, rel) {
  try { return await fs.readFile(path.join(root, rel), "utf8"); } catch { return null; }
}

async function readJson(root, rel) {
  const text = await readText(root, rel);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function envKeys(text) {
  if (!text) return [];
  const out = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m) out.add(m[1]);
  }
  return [...out].sort();
}

async function scanReferencedEnv(root) {
  const out = new Set();
  const queue = [root];
  const skip = new Set([".git", "node_modules", "dist", "build", ".venv", "venv", "vendor"]);
  let visited = 0;

  while (queue.length && visited < 1500) {
    const dir = queue.shift();
    let entries = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!skip.has(e.name)) queue.push(full);
        continue;
      }
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (![".js",".mjs",".cjs",".ts",".tsx",".py",".go",".rs"].includes(ext)) continue;
      visited += 1;
      let text;
      try {
        const st = await fs.stat(full);
        if (st.size > 512 * 1024) continue;
        text = await fs.readFile(full, "utf8");
      } catch { continue; }

      const patterns = [
        /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
        /process\.env\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\]/g,
        /(?:os\.)?getenv\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g,
        /os\.environ\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\]/g
      ];
      for (const re of patterns) {
        for (const m of text.matchAll(re)) out.add(m[1]);
      }
    }
  }
  return [...out].sort();
}

function chooseNodeManager(pkg, files) {
  const declared = typeof pkg?.packageManager === "string" ? pkg.packageManager : null;
  const pm = declared ? declared.split("@")[0] : null;
  if (pm && ["pnpm","yarn","npm","bun"].includes(pm)) return { name: pm, declared };

  if (files.has("pnpm-lock.yaml")) return { name: "pnpm", declared: null };
  if (files.has("yarn.lock")) return { name: "yarn", declared: null };
  if (files.has("bun.lock") || files.has("bun.lockb")) return { name: "bun", declared: null };
  return { name: "npm", declared: null };
}

function nodeCommands(pkg, managerInfo, files) {
  const manager = managerInfo.name;
  const scripts = pkg?.scripts ?? {};
  const preferred = ["dev", "start", "serve", "preview"];
  const chosen = preferred.find(k => typeof scripts[k] === "string");
  const install =
    manager === "npm" ? [manager, files.has("package-lock.json") ? "ci" : "install"] :
    manager === "pnpm" ? [manager, "install", ...(files.has("pnpm-lock.yaml") ? ["--frozen-lockfile"] : [])] :
    manager === "yarn" ? (() => {
      const major = Number(managerInfo.declared?.match(/@(\d+)/)?.[1] ?? 1);
      return [manager, "install", ...(files.has("yarn.lock") ? [major >= 2 ? "--immutable" : "--frozen-lockfile"] : [])];
    })() :
    [manager, "install"];
  let start = null;
  if (chosen) {
    if (manager === "npm") start = ["npm", "run", chosen];
    else if (manager === "yarn") start = ["yarn", chosen];
    else start = [manager, "run", chosen];
  }
  return { install, start, script: chosen };
}

async function detectMainInCmd(root) {
  const cmd = path.join(root, "cmd");
  let dirs;
  try { dirs = await fs.readdir(cmd, { withFileTypes: true }); } catch { return null; }
  for (const d of dirs) {
    if (d.isDirectory() && await exists(root, path.join("cmd", d.name, "main.go"))) {
      return `./cmd/${d.name}`;
    }
  }
  return null;
}

export async function analyze(root, label = root) {
  const names = new Set();
  try {
    for (const e of await fs.readdir(root)) names.add(e);
  } catch {}

  const plan = {
    target: label,
    root,
    stack: [],
    confidence: "low",
    install: null,
    start: null,
    environment: { exampleKeys: [], referencedKeys: [], missingFromExample: [] },
    services: [],
    warnings: [],
    reasons: []
  };

  const pkg = await readJson(root, "package.json");
  if (pkg) {
    const managerInfo = chooseNodeManager(pkg, names);
    const commands = nodeCommands(pkg, managerInfo, names);
    const manager = managerInfo.name;
    plan.stack.push({ kind: "node", manager, engine: pkg.engines?.node ?? null });
    plan.install = commands.install;
    plan.start = commands.start;
    plan.reasons.push(`package.json found; package manager: ${manager}`);
    if (commands.script) plan.reasons.push(`selected "${commands.script}" script as the launch command`);
  }

  if (names.has("compose.yaml") || names.has("compose.yml") ||
      names.has("docker-compose.yml") || names.has("docker-compose.yaml")) {
    plan.stack.push({ kind: "docker-compose" });
    if (!plan.start) plan.start = ["docker", "compose", "up"];
    plan.services.push("docker-compose");
    plan.reasons.push("Compose file found");
  }

  if (names.has("pyproject.toml") || names.has("requirements.txt")) {
    plan.stack.push({ kind: "python" });
    if (!plan.install && names.has("requirements.txt")) {
      plan.install = ["python", "-m", "pip", "install", "-r", "requirements.txt"];
    }
    if (!plan.start) {
      if (names.has("manage.py")) plan.start = ["python", "manage.py", "runserver"];
      else if (names.has("app.py")) plan.start = ["python", "app.py"];
      else if (names.has("main.py")) plan.start = ["python", "main.py"];
    }
    plan.reasons.push("Python project marker found");
  }

  if (names.has("go.mod")) {
    plan.stack.push({ kind: "go" });
    if (!plan.start) {
      if (names.has("main.go")) plan.start = ["go", "run", "."];
      else {
        const cmd = await detectMainInCmd(root);
        if (cmd) plan.start = ["go", "run", cmd];
      }
    }
    plan.reasons.push("go.mod found");
  }

  if (names.has("Cargo.toml")) {
    plan.stack.push({ kind: "rust" });
    if (!plan.start) plan.start = ["cargo", "run"];
    plan.reasons.push("Cargo.toml found");
  }

  const envFiles = [".env.example", ".env.sample", ".env.template"];
  for (const f of envFiles) {
    const text = await readText(root, f);
    if (text) {
      plan.environment.exampleKeys = [...new Set([
        ...plan.environment.exampleKeys,
        ...envKeys(text)
      ])].sort();
    }
  }
  plan.environment.referencedKeys = await scanReferencedEnv(root);
  const examples = new Set(plan.environment.exampleKeys);
  plan.environment.missingFromExample =
    plan.environment.referencedKeys.filter(x => !examples.has(x));

  const composeText = [
    await readText(root, "compose.yaml"),
    await readText(root, "compose.yml"),
    await readText(root, "docker-compose.yml"),
    await readText(root, "docker-compose.yaml")
  ].filter(Boolean).join("\n").toLowerCase();

  const deps = JSON.stringify({
    ...(pkg?.dependencies ?? {}),
    ...(pkg?.devDependencies ?? {})
  }).toLowerCase();

  if (/postgres|postgresql|pg\b/.test(composeText + deps)) plan.services.push("postgres");
  if (/redis/.test(composeText + deps)) plan.services.push("redis");
  if (/mysql|mariadb/.test(composeText + deps)) plan.services.push("mysql");
  plan.services = [...new Set(plan.services)];

  if (!plan.start) {
    plan.warnings.push("No safe launch command could be inferred.");
  }
  if (plan.environment.missingFromExample.length) {
    plan.warnings.push(
      `${plan.environment.missingFromExample.length} referenced environment variable(s) are absent from env example files.`
    );
  }

  const score =
    (pkg ? 2 : 0) +
    (plan.start ? 3 : 0) +
    (plan.install ? 1 : 0) +
    (plan.stack.length ? 1 : 0);
  plan.confidence = score >= 6 ? "high" : score >= 3 ? "medium" : "low";
  return plan;
}
