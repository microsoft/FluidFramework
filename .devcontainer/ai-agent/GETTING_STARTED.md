# Getting Started with AI-Enabled Codespace

This codespace is pre-configured for AI-agent-assisted development of the Fluid Framework. It includes [agency](https://aka.ms/agency), [repoverlay](https://github.com/tylerbutler/repoverlay), GitHub CLI, and SSH access.

> For full documentation, see the [AI-enabled Codespace wiki page](https://github.com/microsoft/FluidFramework/wiki/AI%E2%80%90enabled-Codespace).

## First-time Setup

Agency is installed automatically the first time you run `dev`, `claude`, or any agent alias - watch for a browser authentication popup.
If automatic installation fails, you can install agency manually via `pnpm install:agency`.

> [!NOTE]
> Agency installation is supported in **VS Code** (desktop or SSH).
> It may not work in a browser-based Codespace because the OAuth redirect requires a local browser and authentication may not complete correctly.

> [!TIP]
> After creating a new AI-enabled Codespace you may be prompted to authenticate several times.
> It may seem excessive, but is expected - just keep clicking through each prompt until they stop.

## Quick Start

If dependencies are not installed yet or you need to reinstall them:

```bash
pnpm install

# Build everything
pnpm build

# Build only a specific package and its dependencies
pnpm fluid-build .
```

## Not sure which agent to use?

Run `start` — an interactive assistant that asks what you want to do and launches the right agent for you.

## AI Agent Aliases

These aliases are available in all terminal sessions (after installing agency):

### Claude

| Alias | Command | Purpose |
|---|---|---|
| `dev` | `repoverlay switch --copy nori && agency claude ... -- --model opus` | Launch Claude optimized for feature work and debugging |
| `claude` | `repoverlay remove --all && agency claude ... -- --model opus` | General purpose Claude Code agent |

### Copilot

| Alias | Command | Purpose |
|---|---|---|
| `copilot` | `agency copilot` | Standard GitHub Copilot |
| `oce` | `repoverlay switch --copy ff-oce && agency copilot -- --agent ff-oce` | On-Call Engineer workflows |

### Custom MCP Servers

The built-in aliases include at least ADO, WorkIQ, and EngHub MCP servers.
You can also launch an agent with your own combination of MCP servers using the `--mcp` flag.
Stack as many as you need (and watch for browser authentication popups).

```bash
# Copilot with the Kusto MCP server
copilot --mcp 'kusto --service-uri https://kusto.aria.microsoft.com'

# Claude with an additional MCP server
claude --mcp 'sharepoint'
```

> [!IMPORTANT]
> The **Kusto** MCP server must only be used with **Copilot**, not Claude, for compliance reasons.

> Run `agency mcp --help` to see all available MCP servers and their options.

### Utility

| Alias | Command | Purpose |
|---|---|---|
| `ai-reset` | `repoverlay remove --all` | Remove all repoverlay overlays and reset to clean state |

## More Information

- [AI-enabled Codespace wiki](https://github.com/microsoft/FluidFramework/wiki/AI%E2%80%90enabled-Codespace) — Full documentation for this codespace profile
- [DEV.md](../../DEV.md) — Development setup, build commands, and workflow guide
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — Contribution guidelines
- [FluidFramework.com](https://fluidframework.com) — Documentation and API reference
