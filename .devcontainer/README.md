# Codespaces configurations

This repo includes multiple Codespaces/devcontainer profiles under `.devcontainer/` so you can pick a setup based on your workflow.

| Profile | File | Best for |
| --- | --- | --- |
| `Standard` | `.devcontainer/devcontainer.json` | Full-repo development, heavier tasks, and broad day-to-day work. |
| `Lightweight (Review/Docs)` | `.devcontainer/lightweight/devcontainer.json` | Docs, API review, and focused edits with lower compute requirements. |
| `AI-enabled` | `.devcontainer/ai-agent/devcontainer.json` | AI-agent-assisted workflows with additional default CLI tooling. |
| `AI-enabled (Insiders)` | `.devcontainer/ai-agent-insiders/devcontainer.json` | AI-enabled plus the `flub ai` launcher command (builds the flub CLI from source). |

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
| `postCreateCommand` | Welcome notice (all profiles); AI tooling setup (AI-enabled profiles) | Yes |
| `postStartCommand` | bwrap/sandbox setup (AI profiles only) | No |

Heavy setup work runs in `onCreateCommand` so it is captured by Codespace prebuilds, making the user-connect experience faster.

## Prebuild configuration

Prebuilds use the **"on configuration change"** trigger, which only fires when `devcontainer.json` or the referenced `Dockerfile` changes. It does **not** detect changes to files those configs depend on, such as scripts in `scripts/codespace-setup/`.

### The `prebuild-version` comment

Each `devcontainer.json` contains a `// prebuild-version: N` comment. **Bump this value whenever you change files in `scripts/codespace-setup/`** and your PR doesn't already modify a `devcontainer.json` or the `Dockerfile` — this ensures a prebuild-triggering file is modified, which forces a rebuild.

A CI check (`devcontainer-prebuild-check.yml`) enforces this: PRs that modify `scripts/codespace-setup/**` without also modifying a `devcontainer.json` or the `Dockerfile` will fail.

## AI-enabled vs. AI-enabled (Insiders)

Insiders is a superset of the base AI-enabled profile. The only differences in the insiders `devcontainer.json` are:

- **`name`** — `"AI-enabled (Insiders)"`
- **`onCreateCommand`** — chains `install-flub.sh` after `on-create.sh` to build and link the `flub` CLI
- **`codespaces.openFiles`** — points to the insiders copy of `GETTING_STARTED.md`
- **`features`** *(temporary)* — insiders includes `azure-cli` and `mise` as a preview. Promote to the base profile (or remove) once we decide whether they belong by default.

Everything else (Dockerfile, runArgs, extensions, setup scripts, host requirements) is identical.

### Shared vs. duplicated files

The devcontainer spec does not support config inheritance, so `devcontainer.json` is duplicated across the two profiles. Content files use a **fallback** pattern instead: the `flub ai` command searches `ai-agent-insiders/` first, then falls back to `ai-agent/`. This means files can be placed in one of two ways:

| Strategy | Where to put the file | When to use |
| --- | --- | --- |
| **Shared** | `ai-agent/` only | File is identical for both profiles. Insiders inherits it via fallback. |
| **Overridden** | Both `ai-agent/` and `ai-agent-insiders/` | File differs between profiles (e.g. the insiders version mentions `flub ai`). |

Current layout:

| File | `ai-agent/` | `ai-agent-insiders/` | Notes |
| --- | --- | --- | --- |
| `devcontainer.json` | yes | yes | Must exist in both (no inheritance in spec). |
| `launcher-prompt.md` | yes | — | Shared. Insiders finds it via fallback. |
| `GETTING_STARTED.md` | yes | yes | Overridden. Insiders version adds the `flub ai` section. |
| `first-run-notice.txt` | yes | yes | Overridden. Insiders version adds the `flub ai` line. |

### Maintenance rules

- **Shared config changes** (extensions, features, runArgs, host requirements, etc.) must be applied to both `devcontainer.json` files.
- **Shared content** (like `launcher-prompt.md`) should live in `ai-agent/` only. Do not duplicate it into insiders — the fallback handles it.
- **To promote an insiders feature to the base profile**, copy the relevant lines from the insiders files into the `ai-agent/` versions, then delete the insiders overrides so they fall back to the now-updated shared copy.
- **To remove an insiders override**, just delete the file from `ai-agent-insiders/`. The `flub ai` command will find the `ai-agent/` fallback automatically.
