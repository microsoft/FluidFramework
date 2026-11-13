# GitHub Copilot CLI Slash Commands

GitHub Copilot CLI provides built-in slash commands for common development workflows.

- `/ask` — ask a side question without adding it to the main conversation history
- `/review` — review the current changes
- `/plan <request>` — create an implementation plan
- `/chronicle` — explore session history and insights

Run `/help` in Copilot CLI for the complete list supported by the installed version.

## Repository Skills and Runtime Support

The repository's reusable workflows are in `.github/skills/`.
Ask Copilot to use a skill by name, for example: "Use the `ci-readiness-check` skill."
In Copilot CLI, `/skills list` shows discovered skills, `/skills info <name>` shows their source, and `/skills reload` refreshes them.
The built-in `/review` command and the repository's `review` skill are separate entry points; name the skill explicitly when you want the repository workflow.

Repository-wide guidance is in `.github/copilot-instructions.md`.
Path-specific guidance is in `.github/instructions/*.instructions.md`, with `applyTo` patterns.
Copilot CLI also discovers the service-specific `server/gitrest/CLAUDE.md` and `server/historian/CLAUDE.md` files.
Do not assume that every IDE or cloud surface loads those legacy filenames; consult [custom instruction support](https://docs.github.com/en/copilot/reference/custom-instructions-support).

Agency profiles in `agency.toml` load plugins from `.agency/plugins/`.
Their profile-provided tools and skills are not guaranteed to exist in a plain Copilot CLI, cloud, IDE, or desktop session.
Use the active runtime's tool and skill catalog rather than inventing missing tools.
Keep OCE write confirmations and the Kusto CLI-only compliance restriction in place.

## Models and Permissions

Use `/model` for a CLI session's model, or `copilot --model <available-model>` when starting a session.
Check the installed CLI's model picker and `copilot help config`; availability depends on the account, policy, and runtime.
Do not infer model support from a newer model's name or copy model fields into skill frontmatter.
Respect a model explicitly selected by the user.
Repository CLI settings and custom agent model choices do not configure every Copilot surface.

Use `/permissions` to inspect or change CLI permission mode.
Autopilot controls continuation, not permission to execute every tool.
The Codespace `dev` and `oce` launchers use `/yolo auto` to select the AI-driven automatic permission classifier.
This does not replace the repository's workflow approvals or the OCE agent's confirmation before writes.
The separate `flub ai` recommendation assistant remains restricted to asking questions and proposing a launcher.

For current behavior, consult [CLI commands](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference), [CLI skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills), and [custom agent configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration).
Verify commands against `copilot --help` and `copilot help commands` before changing launchers or automation.
