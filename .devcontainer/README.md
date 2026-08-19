# Codespaces configurations

This repo includes two Codespaces/devcontainer profiles:

| Profile | File | Best for |
| --- | --- | --- |
| `AI-enabled` (default) | `.devcontainer/devcontainer.json` | Full-repo development and AI-agent-assisted workflows with additional CLI tooling. |
| `Standard` | `.devcontainer/standard/devcontainer.json` | Full-repo development without the additional AI tooling or container permissions. |

## Selecting a profile in Codespaces

The root `AI-enabled` profile is selected when you create a Codespace with the default settings.
To use the Standard profile:

1. Open the **Create codespace** flow.
2. Choose the repository branch.
3. Under **Configuration**, choose `Standard`.
4. Create the Codespace.

You can create a new Codespace with the other profile when switching workflows.

## First-run onboarding

Both profiles display a profile-specific welcome message in the first terminal.
The AI-enabled profile also opens `GETTING_STARTED.md` in the editor and installs the agent launchers.

### Launcher compatibility files

The files under `.devcontainer/ai-agent/` are compatibility copies for older `flub` versions.
Keep them synchronized with the root launcher assets until AB#80968 is resolved.

## Lifecycle hooks

The devcontainer lifecycle hooks are structured for prebuild optimization:

| Hook | Purpose | Runs in prebuild? |
| --- | --- | --- |
| `onCreateCommand` | Node.js setup and `flub` installation for AI-enabled | Yes |
| `postCreateCommand` | Welcome notice or AI tooling setup | Yes |
| `postStartCommand` | bwrap/sandbox setup for AI-enabled | No |

Heavy setup work runs in `onCreateCommand` so it is captured by Codespace prebuilds, making the user-connect experience faster.

## Prebuild configuration

The default AI-enabled profile uses the **"on configuration change"** trigger.
GitHub detects changes to the root `.devcontainer/devcontainer.json` and its referenced `Dockerfile`, but not to files those configs depend on, such as scripts in `scripts/codespace-setup/`.

The nested Standard profile runs prebuilds **once a week**.
[GitHub does not support configuration-change triggers for `devcontainer.json` files in subdirectories of `.devcontainer`](https://docs.github.com/en/codespaces/prebuilding-your-codespaces/configuring-prebuilds#configuring-prebuilds), so changes to Standard are picked up by its next scheduled run.

To investigate triggers or update Standard immediately, use JIT elevation to obtain repository administrator access, then open [Settings > Codespaces](https://github.com/microsoft/FluidFramework/settings/codespaces).
A prebuild can be manually triggered from its configuration menu.

### The default profile's `prebuild-version` comment

The root `.devcontainer/devcontainer.json` contains a `// prebuild-version: N` comment.
**Bump this value whenever you change files in `scripts/codespace-setup/`** and your PR doesn't already modify the root `devcontainer.json` or its `Dockerfile`.
This forces the default AI-enabled prebuild to regenerate.

A CI check (`devcontainer-prebuild-check.yml`) enforces this requirement.
The scheduled Standard profile does not use a version-bump comment.
