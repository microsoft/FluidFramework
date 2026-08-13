# Getting Started with AI-Enabled Codespace

This codespace is pre-configured for AI-agent-assisted development of the Fluid Framework. It includes [agency](https://aka.ms/agency), GitHub Copilot CLI, GitHub CLI, and SSH access.

> For full documentation, see [AI-enabled Codespace](../../docs/content/Development-Environment/AI-enabled-Codespace.md).

## First-time Setup

Agency is installed automatically the first time you run `start`, `dev`, `copilot`, or `oce` - watch for a browser authentication popup.
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

## Copilot Launchers

These shell functions are available in all terminal sessions. `dev` is the recommended launcher for most Fluid Framework development.

| Launcher | Command | Purpose |
|---|---|---|
| `dev` | `agency copilot --profile nori ... -- -i "/yolo auto"` | Copilot CLI configured for Fluid Framework feature work, testing, and debugging |
| `copilot` | `agency copilot` | Copilot CLI without an FF-specific profile or default MCP servers |
| `oce` | `agency copilot --profile ff-oce ... -- --agent ff-oce:ff-oce -i "/yolo auto"` | Copilot CLI configured for on-call engineer workflows |

> [!NOTE]
> A separately installed `claude` executable may also be available in the Codespace.
> It is not an FF-managed launcher and does not use the profiles or default MCP servers described above.

### Custom MCP Servers

The `dev` launcher includes ADO, WorkIQ, and EngHub MCP servers by default.
You can also launch an agent with your own combination of MCP servers using the `--mcp` flag.
Stack as many as you need (and watch for browser authentication popups).

```bash
# Copilot with the Kusto MCP server
copilot --mcp 'kusto --service-uri https://kusto.aria.microsoft.com'

# FF development profile with an additional MCP server
dev --mcp 'sharepoint'
```

> [!IMPORTANT]
> The **Kusto** MCP server must only be used with **Copilot CLI** for compliance reasons.

> Run `agency mcp --help` to see all available MCP servers and their options.

## More Information

- [AI-enabled Codespace documentation](../../docs/content/Development-Environment/AI-enabled-Codespace.md) — Full documentation for this codespace profile
- [DEV.md](../../DEV.md) — Development setup, build commands, and workflow guide
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — Contribution guidelines
- [FluidFramework.com](https://fluidframework.com) — Documentation and API reference
