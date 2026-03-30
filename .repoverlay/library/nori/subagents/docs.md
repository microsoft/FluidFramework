# Noridoc: subagents (senior-swe)

Path: @/src/cli/features/claude-code/profiles/config/senior-swe/subagents

### Overview

This directory contains subagent definitions inlined directly in the senior-swe profile. Subagents are specialized AI assistants that can be invoked via the Task tool for focused work like documentation, codebase analysis, and web research. Each subagent is defined in a `.md` file with YAML frontmatter specifying constrained tool access and instructions.

### How it fits into the larger codebase

These subagent .md files are copied to ~/.claude/agents/ during profile installation by @/src/cli/features/claude-code/profiles/subagents/loader.ts. The main agent invokes these subagents using the Task tool with a subagent_type parameter. Files with `paid-` prefix are tier-gated: for paid users the prefix is stripped, for free users they are skipped entirely.

### Core Implementation

Each subagent file uses YAML frontmatter with `tools` (constrained tool list) and `model: inherit`. Documentation subagents (nori-initial-documenter, nori-change-documenter) implement a **two-pass documentation workflow**:
1. **Top-Down Pass**: Creates initial docs.md files by understanding architecture and working downward
2. **Bottom-Up Pass**: Verifies accuracy by identifying leaf directories and working upward, correcting any inaccuracies

Codebase analysis subagents (nori-codebase-analyzer, nori-codebase-locator, nori-codebase-pattern-finder) provide focused research capabilities that can run in parallel.

### Things to Know

**Self-contained**: All subagents are inlined directly in this profile directory. No mixin composition or inheritance.

**Documentation subagent constraints**: Documentation subagents have strict constraints - they must NEVER suggest improvements, critique implementation, or evaluate code quality. They are "documentarians not critics".

**Two-pass documentation**: The two-pass approach (top-down then bottom-up) is mandatory for nori-initial-documenter to ensure both architectural context and accurate implementation details.

**Anti-brittle documentation**: Subagents follow anti-brittle guidelines - no exhaustive lists, no numeric counts, no line numbers. Focus on "why" over "what/how".

Created and maintained by Nori.
