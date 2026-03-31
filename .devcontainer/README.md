# Codespaces configurations

This repo includes multiple Codespaces/devcontainer profiles under `.devcontainer/` so you can pick a setup based on your workflow.

| Profile | File | Best for |
| --- | --- | --- |
| `Standard` | `.devcontainer/devcontainer.json` | Full-repo development, heavier tasks, and broad day-to-day work. |
| `Lightweight (Review/Docs)` | `.devcontainer/lightweight/devcontainer.json` | Docs, API review, and focused edits with lower compute requirements. |
| `AI-enabled` | `.devcontainer/ai-agent/devcontainer.json` | AI-agent-assisted workflows with additional default CLI tooling. |

## Selecting a profile in Codespaces

When creating a new Codespace from GitHub:

1. Open the **Create codespace** flow.
2. Choose the repository branch.
3. Under **Configuration**, choose the desired devcontainer profile.
4. Create the Codespace.

You can always create a new Codespace with a different profile when switching workflows.

## First-run onboarding

Each profile provides a welcome experience when you first open a codespace:

- **Terminal welcome message** — A profile-specific welcome message appears in the first terminal with key commands and monorepo orientation. These are the `first-run-notice.txt` files in each profile directory.
- **AI-enabled extras** — The AI-enabled profile additionally opens a Getting Started guide (`GETTING_STARTED.md`) in the editor via `customizations.codespaces.openFiles` and auto-starts an interactive [CodeTour](https://github.com/microsoft/codetour) walkthrough of the AI tooling.

## Lifecycle hooks

The devcontainer lifecycle hooks are structured for prebuild optimization:

| Hook | Purpose | Runs in prebuild? |
| --- | --- | --- |
| `onCreateCommand` | Node.js setup (nvm install, corepack enable) | Yes |
| `postCreateCommand` | Welcome notice (all profiles); AI tooling setup (AI-enabled only) | Yes |

Heavy setup work runs in `onCreateCommand` so it is captured by Codespace prebuilds, making the user-connect experience faster.
