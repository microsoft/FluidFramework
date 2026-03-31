# Getting Started with AI-Enabled Codespace

This codespace is pre-configured for AI-agent-assisted development of the Fluid Framework. It includes [agency](https://aka.ms/agency), [repoverlay](https://github.com/tylerbutler/repoverlay), GitHub CLI, and SSH access.

> For full documentation, see the [AI-enabled Codespace wiki page](https://github.com/microsoft/FluidFramework/wiki/AI%E2%80%90enabled-Codespace).

## First-time Setup

After creating a new AI-enabled Codespace, expect up to a dozen authentication prompts. This is excessive but anticipated — continue clicking through each prompt until they conclude.

Agency may need to be installed manually after the Codespace starts:

```bash
pnpm install:agency
```

## Quick Start

```bash
# Install dependencies (if not already done by prebuild)
pnpm install

# Build everything
pnpm build

# Build only a specific package and its dependencies
fluid-build .
```

## AI Agent Aliases

These aliases are available in all terminal sessions:

### Claude

| Alias | Command | Purpose |
|---|---|---|
| `claude` | `agency claude` | Default Claude Code model |
| `haiku` | `agency claude --model haiku` | Fastest, cheapest option |
| `sonnet` | `agency claude --model sonnet` | Balanced capabilities |
| `opus` | `agency claude --model opus` | Most capable model |
| `nori` | `repoverlay switch nori && agency claude` | Switch to nori overlay and launch Claude |

### Copilot

| Alias | Command | Purpose |
|---|---|---|
| `copilot` | `agency copilot` | Standard GitHub Copilot |
| `copilot-ado` | `agency copilot --mcp 'ado --org fluidframework'` | Azure DevOps integration |
| `copilot-kusto` | `agency copilot --mcp 'kusto ...'` | Telemetry queries |
| `copilot-oce` | `repoverlay switch ff-oce && copilot-kusto` | On-Call Engineer workflows |
| `copilot-work` | `agency copilot --mcp 'workiq'` | WorkIQ integration |

## Connecting via SSH

Access a running AI-enabled Codespace from your local terminal:

```bash
gh codespace ssh
```

This enables running AI agents locally while the Codespace provides computing power and repository context.

## What's Different from Standard?

| Addition | Purpose |
|---|---|
| Agency CLI | Run AI agents (Claude, GitHub Copilot) from terminal |
| Repoverlay | Overlay system for context files (agents, skills) |
| GitHub CLI (`gh`) | Pre-installed for PR workflows and SSH access |
| SSH daemon | Enables `gh codespace ssh` connections |
| ADO Codespaces Auth | Authenticate to Azure DevOps |
| Agent aliases | Shell shortcuts for common AI commands |
| Higher compute | 32 CPUs / 64 GB RAM (vs 16 CPUs for Standard) |

## Monorepo Structure

| Directory | Contents |
|---|---|
| `packages/` | Core Fluid Framework packages organized by area (DDS, runtime, loader, drivers, etc.) |
| `server/` | Routerlicious server components |
| `build-tools/` | Internal build tooling, release infrastructure, and ESLint configs |
| `examples/` | Example applications, benchmarks, and integration samples |
| `experimental/` | Experimental packages not yet promoted to stable |
| `common/` | Shared build config and utilities |
| `docs/` | Documentation source files |

## Key Development Commands

```bash
# Run tests for the current package
pnpm test

# Run tests across the whole repo
pnpm test -r

# Lint
pnpm lint

# Check formatting
pnpm format:check
```

## Development Workflow

1. **Find the package** you want to work on under `packages/`, `server/`, or `build-tools/`.
2. **Build it** with `fluid-build .` from the package directory — this builds only that package and its dependencies.
3. **Run tests** with `pnpm test` from the package directory.
4. **Use an AI agent** (`claude`, `nori`, or `copilot`) to help with development tasks.

## Useful Links

- [AI-enabled Codespace wiki](https://github.com/microsoft/FluidFramework/wiki/AI%E2%80%90enabled-Codespace) — Full documentation for this codespace profile
- [FluidFramework.com](https://fluidframework.com) — Documentation and API reference
- [DEV.md](../../DEV.md) — Detailed development setup guide
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — Contribution guidelines
- [PACKAGES.md](../../PACKAGES.md) — Full package listing and organization
