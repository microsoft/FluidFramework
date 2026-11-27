---
name: using-git-worktrees
description: Use this whenever you need to create an isolated workspace.
---

<required>
*CRITICAL* Add the following steps to your Todo list using TodoWrite:

0. Check whether the runtime already supplied an isolated worktree.
   If so, reuse it; do not create a nested worktree or edit another checkout.
   Honor the user's chosen worktree path and branch name.
   Use the runtime's branch-management tools when it owns the worktree.
   Continue with only the setup and validation needed for the task.

1. Find the worktrees directory.

- Check existing directories using the Bash tool: `ls -d .worktrees 2>/dev/null`
- If not found, ask me for permission to create a .worktrees directory
- If given permission, create `.worktrees`.

2. Verify .gitignore before creating a worktree using the Bash tool:

```bash
# Check if directory pattern in .gitignore
grep -q "^\.worktrees/$" .gitignore || grep -q "^worktrees/$" .gitignore
```

- If not found, add the appropriate line to the .gitignore immediately.

3. Create the worktree

- Come up with a good branch name based on the request.
- Create the worktree with the Bash tool: `git worktree add ".worktrees/$BRANCH_NAME" -b "$BRANCH_NAME"`
- cd into the newly created path with the Bash tool: `cd $path`

4. Read the repository instructions and manifests before running project setup.
   Use the declared package manager and the affected workspace.
   In Fluid Framework, use pnpm, and install `build-tools/` from that separate workspace.
   Install dependencies only when required for the selected validation and missing, or after dependency changes.

```bash
# Node.js
if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; fi

# Rust
if [ -f Cargo.toml ]; then cargo build; fi

# Python
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f pyproject.toml ]; then poetry install; fi

# Go
if [ -f go.mod ]; then go mod download; fi
```

- If there is no obvious project setup, you _MUST_ ask me.

5. Run the smallest relevant existing tests to establish a baseline.
   A clean Git status does not mean tests pass.

```bash
# Examples - use project-appropriate command
pnpm test:mocha
cargo test
pytest
go test ./...
```

**If tests fail:** Report failures, ask whether to proceed or investigate.

**If tests pass:** Report ready.

6. Report Location

```
New working directory: <full-path>
Tests passing (<N> tests, 0 failures)
All commands and tools will now refer to: <full-path>
```

7. Understand that you are now in a new working directory. Your Bash tool instructions from here on out should refer to the worktree directory, NOT your original directory. This is ABSOLUTELY CRITICAL.

</required>

# Maintaining Working Directory in Worktree

CRITICAL: Once you create and enter a worktree, you must stay within
it for the entire session.

Rules:

1. Never use cd .. from within a worktree - It will eventually take
   you outside the worktree boundary
2. Always use absolute paths for commands - Use npm run lint from
   within the worktree, not cd .. && npm run lint
3. If you need to run root-level commands, use the full worktree path:
   <bad-example>
   cd .. && npm run lint
   </bad-example>
   <good-example>
   npm run lint # (from worktree root)
   </good-example>

<good-example>
cd /home/$USER/code/project/.worktrees/branch-name && npm run lint
</good-example>

4. Verify your location frequently:

```bash
pwd  # Should show .worktrees/branch-name in path
git branch  # Should show * on your feature branch, not main
```

5. If you accidentally exit the worktree:

- Immediately recognize it (check if you're on main branch)
- Navigate back: cd /full/path/to/.worktrees/your-branch
- Verify: git branch should show your branch, not main

Red Flags:

- Running git status and seeing "On branch main" when you should be on a feature branch
- Running pwd and NOT seeing .worktrees/ in the path
- Any cd .. command while in a worktree

# Quick Reference

| Situation                   | Action                     |
| --------------------------- | -------------------------- |
| `.worktrees/` exists        | Use it (verify .gitignore) |
| `.worktrees/` does not exist | Check repository instructions → Ask user |
| Directory not in .gitignore | Add it immediately         |
| Tests fail during baseline  | Report failures + ask      |
| No package.json/Cargo.toml  | Skip dependency install    |

# Common Mistakes

**Skipping .gitignore verification**

- **Problem:** Worktree contents get tracked, pollute git status
- **Fix:** Always grep .gitignore before creating project-local worktree

**Assuming directory location**

- **Problem:** Creates inconsistency, violates project conventions
- **Fix:** Follow priority: runtime/user-selected worktree > existing directory > repository instructions > ask

**Missing project installation**

- **Problem:** Tests and lint will fail, breaking the project
- **Fix:** Restore missing dependencies in the affected workspace when needed for validation

**Proceeding with failing tests**

- **Problem:** Can't distinguish new bugs from pre-existing issues
- **Fix:** Report failures, get explicit permission to proceed

**Hardcoding setup commands**

- **Problem:** Breaks on projects using different tools
- **Fix:** Auto-detect from project files (package.json, etc.)

# Example Workflow

```
You: I'm using the Using Git Worktrees skill to set up an isolated workspace.

[Check .worktrees/ - exists]
[Verify .gitignore - contains .worktrees/]
[Create worktree: git worktree add .worktrees/auth -b feature/auth]
[Run pnpm install --frozen-lockfile if dependencies are missing]
[Run the selected package tests - 47 passing]

Worktree ready at myproject/.worktrees/auth
Tests passing (47 tests, 0 failures)
Ready to implement auth feature
```

# Red Flags

**Never:**

- Create worktree without .gitignore verification (project-local)
- Skip baseline test verification
- Proceed with failing tests without asking
- Assume directory location when ambiguous
- Skip repository instructions

**Always:**

- Follow directory priority: runtime/user selection > existing > repository instructions > ask
- Verify .gitignore for project-local
- Auto-detect and run project setup
- Verify clean test baseline
