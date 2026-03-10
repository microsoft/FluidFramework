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
