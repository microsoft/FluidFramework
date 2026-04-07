# Getting Started with AI-Enabled Codespace

This codespace is pre-configured for AI-agent-assisted development of the Fluid Framework. It includes [agency](https://aka.ms/agency), [repoverlay](https://github.com/tylerbutler/repoverlay), GitHub CLI, and SSH access.

> For full documentation, see the [AI-enabled Codespace wiki page](https://github.com/microsoft/FluidFramework/wiki/AI%E2%80%90enabled-Codespace).

## First-time Setup

Agency **must** be installed manually after the Codespace starts. Run `pnpm install:agency` in the terminal — this requires Azure authentication and will open a browser window for sign-in.

Then open a **new terminal** for the agent aliases to be available.

## Quick Start

If dependencies are not installed yet or you need to reinstall them:

```bash
pnpm install

# Build everything
pnpm build

# Build only a specific package and its dependencies
pnpm fluid-build .
```

## AI Agent Aliases

These aliases are available in all terminal sessions (after installing agency):

### Claude

| Alias | Command | Purpose |
|---|---|---|
| `claude` | `repoverlay switch ff-claude && agency claude` | Default Claude Code model |
| `haiku` | `repoverlay switch ff-claude && agency claude -- --model haiku` | Fastest, cheapest option |
| `sonnet` | `repoverlay switch ff-claude && agency claude -- --model sonnet` | Balanced capabilities |
| `opus` | `repoverlay switch ff-claude && agency claude -- --model opus` | Most capable model |
| `nori` | `repoverlay switch nori && agency claude` | Switch to nori overlay and launch Claude |

### Copilot

| Alias | Command | Purpose |
|---|---|---|
| `copilot` | `agency copilot` | Standard GitHub Copilot |
| `copilot-ado` | `agency copilot --mcp 'ado --org fluidframework'` | Azure DevOps integration |
| `copilot-kusto` | `agency copilot --mcp 'kusto ...'` | Telemetry queries |
| `copilot-oce` | `repoverlay switch ff-oce && copilot -- --agent ff-oce` | On-Call Engineer workflows |
| `copilot-work` | `agency copilot --mcp 'workiq'` | WorkIQ integration |

### Utility

| Alias | Command | Purpose |
|---|---|---|
| `ai-reset` | `repoverlay remove --all` | Remove all repoverlay overlays and reset to clean state |

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
| Agent aliases | Shell shortcuts for common AI commands |
| Higher compute | 32 CPUs / 64 GB RAM (vs 16 CPUs for Standard) |

## More Information

- [AI-enabled Codespace wiki](https://github.com/microsoft/FluidFramework/wiki/AI%E2%80%90enabled-Codespace) — Full documentation for this codespace profile
- [DEV.md](../../DEV.md) — Development setup, build commands, and workflow guide
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — Contribution guidelines
- [FluidFramework.com](https://fluidframework.com) — Documentation and API reference
