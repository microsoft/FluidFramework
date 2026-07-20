# AI-enabled Codespace

The AI-enabled devcontainer profile provides a Codespace pre-configured with AI CLI tooling on top of the standard Fluid Framework development environment.

## Creating the Codespace

You can use a [direct link](https://github.com/codespaces/new?hide_repo_select=true&%3Bref=main&%3Brepo=203843667&%3Bskip_quickstart=true&%3Bmachine=xLargePremiumLinux&%3Bdevcontainer_path=.devcontainer%2Fai-agent%2Fdevcontainer.json&%3Bgeo=UsWest&__prettifying=true) or follow these steps:

1. Navigate to the repository on GitHub and initiate the codespace creation workflow
2. Click the `...` button and select **New with options...**, then pick from "Dev container configuration"
3. Choose your branch
4. Expand **Dev container configuration** and select **AI-enabled** (defaults to 32 CPUs / 64 GB RAM)
5. Create the Codespace

## Differences from Standard Profile

The AI-enabled profile includes everything in the Standard profile, plus:

| Addition                | Purpose                                                   |
| ----------------------- | --------------------------------------------------------- |
| Agency CLI              | Run AI agents (Claude, GitHub Copilot) from terminal      |
| Repoverlay              | Overlay system for context files (agents, skills)         |
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

Once your Codespace is running, see [GETTING_STARTED.md](../../../.devcontainer/ai-agent/GETTING_STARTED.md) for setup instructions, available aliases, custom MCP server usage, and more.
