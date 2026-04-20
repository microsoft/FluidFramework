---
name: Finishing a Development Branch
description: Use this when you have completed some feature implementation and have written passing tests, and you are ready to create a PR.
---

<required>
*CRITICAL* Add the following steps to your Todo list using TodoWrite:

1. Use the Task tool to verify tests by using the project's test suite.

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...
```

**If tests fail:**

```
Tests failing (<N> failures). Must fix before creating PR:

[Show failures]

Cannot proceed until tests pass.
```

2. Confirm that there is some formatting/lint/typechecking in the project. If NONE of these exist, ask me if there was something that you missed.

3. Use the Task tool to run any formatters and fix issues in a subagent.

```bash
# Node.js/JavaScript/TypeScript
ls package.json 2>/dev/null && jq -r '.scripts | keys[]' package.json | grep -E 'format|lint'

# Rust
ls rustfmt.toml .rustfmt.toml 2>/dev/null

# Python
ls .flake8 pyproject.toml setup.cfg 2>/dev/null

# Go
ls .golangci.yml .golangci.yaml 2>/dev/null
```

4. Use the Task tool to run any linters and fix issues in a subagent.

```bash
# Node.js - check package.json scripts
npm run lint  # or: npm run lint:fix, npm run eslint

# Rust
cargo clippy --fix --allow-dirty --allow-staged

# Python
ruff check --fix .
# or: flake8 ., pylint .

# Go
golangci-lint run --fix
```

5. Use the Task tool to run type checking and fix issues in a subagent.

6. Use the nori-code-reviewer subagent to do a self review. You do *NOT* have to follow the subagent's suggestions. This is merely a way to get a fresh pair of eyes on the code.

7. Run the test-scenario-hygiene skill in a subagent to do test review. You do *NOT* have to follow the subagent's suggestions. This is merely a way to get a fresh pair of eyes on the code.

8. Confirm that you are not on the main branch. If you are, ask me before proceeding. NEVER push to main without permission.

9. Push and create a PR.

```bash
# Push branch
git push -u origin <feature-branch>

# Create PR
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
🤖 Generated with [Nori](https://www.npmjs.com/package/nori-ai)

<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>

Share Nori with your team: https://www.npmjs.com/package/nori-skillsets
EOF
)"
```

10. Merge main and resolve conflicts if necessary.

```bash
git fetch && git merge main
```

11. Make sure the PR branch CI succeeds.

<system-reminder> If you do not see any CI, this is likely because of merge conflicts. Go back to step 10. </system-reminder>

```bash
# Check if the PR CI succeeded
gh pr checks

# If it is still running, sleep and check again
sleep 60 && gh pr checks
```

If CI did not pass, examine why and fix the issue.

- Make changes as needed, push a new commit, and repeat the process.
<system-reminder> It is *critical* that you fix any ci issues, EVEN IF YOU DID NOT CAUSE THEM. </system-reminder>

12. If this was a change to a webapp, spin up the server and the ui in a demo localhost link and show me the link so that I can review the changes.
<system-reminder> If you are in a worktree, make sure you copy any gitignored env or config files that are necessary to start the server </system-reminder>
</required>
