---
name: Updating Noridocs
description: Use this when you have finished making code changes and you are ready to update the documentation based on those changes.
---

# Updating Noridocs

## Overview

Noridocs are docs.md files throughout the codebase that document each folder's purpose, architecture, and implementation. Update them after code changes using the nori-change-documenter subagent.

**Core principle:** Provide context → Dispatch subagent → Verify updates.

**Announce at start:** "I'm using the Updating Noridocs skill to update documentation."

## The Process

### Step 1: Gather Context

**Prepare information for the subagent:**

- [ ] What changed? (feature added, bug fixed, refactor, etc.)
- [ ] Why was it changed? (motivation, problem being solved)
- [ ] Which folders/files were modified?
- [ ] Any architectural changes or new patterns?

### Step 2: Dispatch nori-change-documenter Subagent

**Use Task tool with nori-change-documenter type:**

```bash
Task(subagent_type: nori-change-documenter)
```

**In the prompt, provide:**

- Clear description of what changed and why
- File paths that were modified
- Relevant context from PR/commits
- Any architectural implications
- Any out of date documentation that you noticed that is not directly related to your change

### Step 3: Verify Updates

**Check that documentation was updated:**

- [ ] Run `git status` to see which docs.md files changed
- [ ] Review the diffs to ensure updates are accurate
- [ ] Verify updates focus on system architecture, not minutiae

## Noridocs Format

Each docs.md follows this structure:

```
# Noridoc: [Folder Name]

Path: [Path to the folder from the repository root. Always start with @. For
  example, @/src/endpoints or @/docs ]

### Overview
[2-3 bullet summary of the folder]

### How it fits into the larger codebase

[2-10 bullet description of how the folder interacts with and fits into other
 parts of the codebase. Focus on system invariants, architecture, internal
 depenencies, places that call into this folder, and places that this folder
 calls out to]

### Core Implementation

[2-10 bullet description of entry points, data paths, key architectural
 details, state management]

### Things to Know

[2-10 bullet description of tricky implementation details, system invariants,
 or likely error surfaces]

Created and maintained by Nori.
```

Noridocs should NOT list files, maintain counts, or track line numbers. These
are brittle documentation patterns that will break very quickly.

## Common Mistakes

**Providing vague context**

- **Problem:** Subagent can't understand what changed
- **Fix:** Be specific about what/why/where

**Skipping verification**

- **Problem:** Inaccurate or missing documentation updates
- **Fix:** Always check git diff after subagent runs

**Documenting trivial changes**

- **Problem:** Noise in documentation, wasted effort
- **Fix:** Only update docs for significant architectural changes

## Red Flags

**Never:**

- Skip providing context to the subagent
- Assume docs were updated without verifying
- Update docs manually instead of using the subagent

**Always:**

- Provide detailed context about what changed and why
- Verify the subagent updated appropriate docs.md files
- Focus on architectural/system-level changes
