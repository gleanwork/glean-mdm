# AGENTS.md

Agent instructions for `@gleanwork/glean-mdm`. Human-facing documentation lives in `README.md`; this file is the entry point for AI coding agents working in this repository.

## Development

Runtime is **Bun** (version pinned in `mise.toml`). See `README.md` for the full workflow.

- Install dependencies: `bun install`
- Run the CLI from source: `bun run src/index.ts -- --help` (e.g. `bun run src/index.ts -- run --dry-run --user $(whoami)`)
- Run tests: `bunx vitest run`
- Build cross-platform binaries: `./build.sh`

## Skills

This repository ships an agent skill at `skills/SKILL.md` that teaches a consuming AI how to use `@gleanwork/glean-mdm` correctly. It is distributed via `skills.sh`.

When working in this repository, consult `skills/SKILL.md` and keep it accurate as the public API changes.
