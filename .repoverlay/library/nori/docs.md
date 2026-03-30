# Noridoc: senior-swe

Path: @/src/cli/features/claude-code/profiles/config/senior-swe

### Overview

Self-contained profile for general-purpose software engineering. Contains all skills, subagents, and slash commands directly inlined. Features dual-mode operation: "copilot" mode for interactive pair programming with frequent checkpoints, and "full-send" mode for highly autonomous operation with fewer checkpoints. This is the default profile for Nori.

### How it fits into the larger codebase

This is one of the built-in profiles shipped with Nori at @/src/cli/features/claude-code/profiles/config/. During installation, the profiles loader (@/src/cli/features/claude-code/profiles/loader.ts) copies this entire directory to `~/.nori/profiles/senior-swe/`. Feature sub-loaders then read from this location:
- Skills are copied to `~/.claude/skills/` by @/src/cli/features/claude-code/profiles/skills/loader.ts
- Subagents are copied to `~/.claude/agents/` by @/src/cli/features/claude-code/profiles/subagents/loader.ts
- Slash commands are copied to `~/.claude/commands/` by @/src/cli/features/claude-code/profiles/slashcommands/loader.ts
- CLAUDE.md is processed and written by @/src/cli/features/claude-code/profiles/claudemd/loader.ts

### Core Implementation

**Profile Content**: This profile directory contains:
- `CLAUDE.md` - Dual-mode workflow instructions (copilot vs full-send)
- `profile.json` - Metadata with name, description, and `"builtin": true`
- `skills/` - All SWE skills inlined (TDD, debugging, git-worktrees, brainstorming, writing-plans, etc.)
- `subagents/` - All subagents inlined (documentation, codebase analysis, web research)
- `slashcommands/` - Profile-specific slash commands

**Dual-mode operation**:
- **Copilot mode**: Interactive pair programming with frequent checkpoints. Asks for approval at each major step.
- **Full-send mode**: Highly autonomous operation. Creates plan, gets approval, then executes independently until completion.

**Paid content**: Skills and subagents with `paid-` prefix (e.g., `paid-recall/`, `paid-memorize/`) are tier-gated.

### Things to Know

**Self-contained architecture**: All profile content is inlined directly in this directory. There is no mixin composition or inheritance - this profile is complete as-is.

**Default profile**: This is the default profile used when no profile is explicitly configured.

**Template placeholders**: The CLAUDE.md and skill files use placeholders like `{{skills_dir}}` that are substituted with actual paths during installation.

**Profile preservation**: Once copied to `~/.nori/profiles/senior-swe/`, this profile is never overwritten during subsequent installs.

Created and maintained by Nori.
