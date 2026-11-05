# AI-enabled Codespace

The AI-enabled devcontainer profile provides a Codespace pre-configured with AI CLI tooling on top of the standard Fluid Framework development environment.

## Creating the Codespace

You can use a [direct link](https://github.com/codespaces/new?hide_repo_select=true&%3Bref=main&%3Brepo=203843667&%3Bskip_quickstart=true&%3Bmachine=xLargePremiumLinux&%3Bdevcontainer_path=.devcontainer%2Fdevcontainer.json&%3Bgeo=UsWest&__prettifying=true) or follow these steps:

1. Navigate to the repository on GitHub and initiate the codespace creation workflow
2. Click the `...` button and select **New with options...**, then pick from "Dev container configuration"
3. Choose your branch
4. Keep the default **AI-enabled** configuration (defaults to 32 CPUs / 64 GB RAM)
5. Create the Codespace

## Differences from Standard Profile

The AI-enabled profile includes everything in the Standard profile, plus:

| Addition                | Purpose                                                   |
| ----------------------- | --------------------------------------------------------- |
| Agency CLI              | Run GitHub Copilot agents from the terminal               |
| Agency profiles         | Load Nori and FF OCE plugins from `.agency/plugins/`      |
| GitHub CLI (`gh`)       | Pre-installed for PR workflows and SSH access             |
| SSH daemon              | Enables remote terminal connection via `gh codespace ssh` |
| Agent aliases           | Shell shortcuts for common AI commands                    |
| Higher compute defaults | 32 CPUs / 64 GB RAM vs. 16 CPUs / 64 GB                   |

## Connecting via SSH

Connect to a running AI-enabled Codespace from your local terminal:

```bash
gh codespace ssh
```

This enables running AI agents from your local terminal while the Codespace provides compute and repository context.

## Getting Started

Once your Codespace is running, see [GETTING_STARTED.md](../../../.devcontainer/GETTING_STARTED.md) for setup instructions, available aliases, custom MCP server usage, and more.

The `flub ai` recommendation assistant can ask questions and select an alias.
It cannot run shell commands, read or write repository files, or invoke MCP services.
The user must confirm the recommendation before the launcher executes it.
See [Copilot CLI commands and customization](Copilot-CLI-Slash-Commands.md) for skill discovery, runtime support, model selection, and permissions.
