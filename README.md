# RepoIgnite

> **Git clone without the setup archaeology.**

RepoIgnite inspects an unfamiliar repository and answers the first boring
question: **how is this thing supposed to run?**

It does not execute anything by default.

```text
$ repoignite .

RepoIgnite 1.0.0
target      .
confidence  HIGH
stack       node
install     npm install
start       npm run dev
services    postgres
env example DATABASE_URL, PORT
```

## Why

A surprising amount of repository evaluation starts with the same scavenger
hunt: runtime version, package manager, install command, launch command,
required environment variables, database, and whether Docker is actually
expected.

RepoIgnite turns those clues into a small, auditable launch plan.

## Quick start

Node.js 20+ is required. There are no runtime dependencies.

```bash
npm link
repoignite .
```

Public GitHub repositories can be inspected directly:

```bash
repoignite https://github.com/owner/repo
```

Remote repositories are shallow-cloned into a temporary directory and removed
after inspection.

## Commands

```bash
repoignite . --json
repoignite . --doctor
repoignite . --write
repoignite . --install
repoignite . --run
```

`--install` and `--run` execute commands. A remote repository additionally
requires `--trust`:

```bash
repoignite https://github.com/owner/repo --run --trust
```

That friction is intentional. RepoIgnite is a setup assistant, not a sandbox.

## Detection

The first release understands common signals for:

- Node.js: `package.json`, lockfiles, `packageManager`, common scripts
- Python: `requirements.txt`, `pyproject.toml`, `app.py`, `main.py`, `manage.py`
- Go: `go.mod`, root or `cmd/*` entrypoints
- Rust: `Cargo.toml`
- Docker Compose
- `.env.example`, `.env.sample`, `.env.template`
- common environment-variable reads in JavaScript/TypeScript/Python

It prefers evidence over guesswork. If a safe start command cannot be inferred,
it says so.

## Security boundary

Inspection is static. RepoIgnite does not load project modules, run package
scripts, or install dependencies unless you explicitly ask it to.

`--trust` is not a security guarantee. It only prevents accidental execution of
a freshly cloned repository.

## Development

```bash
npm run check
npm test
node src/cli.js ./examples/node-app
```

## License

MIT
