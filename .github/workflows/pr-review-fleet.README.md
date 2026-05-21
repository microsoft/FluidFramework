# Fleet Review Workflow System

Four workflows compose the PR fleet review system:

| Workflow | Role |
| --- | --- |
| [`pr-review-auto-route.yml`](./pr-review-auto-route.yml) | Sizes the PR and posts a proposal comment with reviewer checkboxes |
| [`pr-review-confirm.yml`](./pr-review-confirm.yml) | Watches the proposal comment; dispatches the fleet when the author ticks "Start review" |
| [`pr-review-dispatch.yml`](./pr-review-dispatch.yml) | Label-driven alternate entry point — stages PR context as an artifact |
| [`pr-review-fleet.yml`](./pr-review-fleet.yml) | Runs the fleet of reviewer agents in parallel, consolidates results, posts the report |

> `pr-changeset-review.yml` is unrelated — it's Vale linting on changeset files.

## 1. `pr-review-auto-route.yml` — Sizer + Proposal

- **Trigger:** `pull_request_target` on `opened` / `reopened` / `synchronize` (base branches `main`, `next`, `release/**`).
- **Permissions:** `contents: read`, `pull-requests: write`.
- **Context:** Runs from the **base branch** with a write token + secrets. Critical security invariant: never checks out the PR head; only diffs against it for stats (lines / files / packages). This is what makes it safe to use `pull_request_target` for fork PRs.
- **What it does:** Computes a recommended fleet tier (1 / 3 / 5 reviewers) from thresholds on lines, files, and packages, then posts a **sticky comment** (`<!-- pr-review-confirm -->` marker) with pre-checked reviewer checkboxes and a "Start review" checkbox. On `synchronize` it carries forward prior toggles and short-circuits if "Start review" is already checked. Skips entirely if the `fleet-review` label is set (label flow takes precedence).

### Sizing thresholds

| Tier | Reviewers | Rule |
| --- | --- | --- |
| small | 1 | ≤ 100 lines **and** ≤ 5 files **and** ≤ 1 package |
| large | 5 | > 500 lines **or** > 30 files **or** > 5 packages |
| medium | 3 | everything else |

"Packages" = distinct top-level dirs under `packages/`, `experimental/`, `examples/`.

## 2. `pr-review-confirm.yml` — Human Toggle → Dispatch

- **Trigger:** `issue_comment` `edited`.
- **Permissions:** `contents: read`, `pull-requests: write`, **`actions: write`** (required so `gh workflow run` can dispatch the fleet — without it the API 403s).
- **Activation guard (`if:`):** must be a PR comment, sender is a `User` (blocks bot self-loops), comment was authored by `github-actions[bot]`, contains the `<!-- pr-review-confirm -->` marker, and the "Start review" checkbox transitioned **unchecked → checked**.
- **Trust check:** Uses `actions-cool/check-user-permission` to require `write` on the *acting user* (the comment author is the bot, so `author_association` is meaningless here).
- **What it does:** Fetches the PR's current `head_sha` / `base_ref` from the API (not from any pinned artifact — handles force-pushes between proposal and toggle), parses selected reviewer checkboxes, calls `gh workflow run pr-review-fleet.yml` with explicit `pr_number`, `reviewers`, `head_sha`, `base_ref` inputs. Then resets the "Start review" checkbox so a single tick re-runs it next time.

## 3. `pr-review-dispatch.yml` — Label Path

- **Trigger:** `pull_request` `labeled` (label must be `fleet-review`).
- **Permissions:** `contents: read` only — it just stages context.
- **What it does:** Writes `{pr_number, head_sha, base_ref}` to `dispatch/params.json` and uploads it as the `dispatch-params` artifact. No fleet trigger from here — the fleet workflow's `workflow_run` listener picks it up.

## 4. `pr-review-fleet.yml` — The Reviewer Fleet

- **Triggers:** `workflow_run` on completion of "PR Review Fleet Dispatcher", **or** `workflow_dispatch` (manual / from the confirm workflow). The `workflow_run` path only proceeds if the dispatcher succeeded.
- **Permissions:** `contents: read`, `pull-requests: write`, `actions: read` (to download the dispatcher artifact), `checks: write` (to surface a "Fleet Review" check on the PR — `workflow_dispatch` runs aren't otherwise visible in the Checks tab).
- **Concurrency:** Keyed per PR; cancels in-progress runs.

### Jobs

1. **`setup`** — Resolves params (artifact for `workflow_run`, inputs for `workflow_dispatch`). The label path forces the default fleet size of 3 from the priority list `[correctness, security, api-compatibility, performance, testing]`. The confirm path passes an explicit reviewer JSON array. Creates a check run on the PR head and posts an "in progress" sticky comment.
2. **`review`** (matrix, `fail-fast: false`) — One job per reviewer. Checks out PR head with `persist-credentials: false`, pre-computes the diff / changed-files / api-report-files, then loads the prompt **from the base branch** (`git show origin/${BASE_REF}:.github/prompts/reviewers/${REVIEWER}.md`) to prevent prompt-injection via PR-authored prompt edits. Installs `@github/copilot` and runs with `COPILOT_GITHUB_TOKEN`, model `claude-sonnet-4-6`, and **only `--allow-tool=read --allow-tool=write`** — no shell or git tools, because the PR diff is attacker-controlled. The reviewer writes `review-${reviewer}.json`, uploaded as an artifact.
3. **`consolidate`** — Downloads all `review-*` artifacts, runs `.github/scripts/consolidate_reviews.py` (exit 0 = findings, 2 = clean), scrubs GitHub token patterns from the output as defense-in-depth, and posts the result via the same `pr-review-fleet` sticky header so it overwrites the in-progress comment.
4. **`teardown`** — Always runs to finalize the check run (success / neutral with findings / failure), so a failed `setup` doesn't leave the "Fleet Review" check stuck in `in_progress`.

## End-to-End Flows

### Recommended path (auto-route)

```
PR opened/sync ─▶ pr-review-auto-route (pull_request_target, base-branch trusted)
                    └─▶ posts proposal comment with checkboxes
User edits comment, ticks "Start review"
                ─▶ pr-review-confirm (issue_comment.edited, verifies write access)
                    └─▶ gh workflow run pr-review-fleet.yml (workflow_dispatch)
                          └─▶ setup → matrix review → consolidate → teardown
```

### Label path

```
Label "fleet-review" applied
  ─▶ pr-review-dispatch (uploads params artifact, contents:read only)
       └─▶ pr-review-fleet via workflow_run (downloads artifact, default 3 reviewers)
```

## Security Notes

- `auto-route` uses `pull_request_target` (gets secrets on fork PRs) but **never executes PR code** — it only reads numstat data. Scripts must live on the base branch.
- `fleet` reads reviewer prompts from `origin/${BASE_REF}`, not the PR checkout — prevents PR authors from rewriting the reviewer instructions that an authenticated agent will execute.
- Reviewer agents are credentialed with `COPILOT_GITHUB_TOKEN` but denied shell tools; git context is pre-materialized before the token is in scope (git aliases can shell out).
- The consolidated report is regex-scrubbed for `gh[pousr]_…` and `github_pat_…` token patterns before posting, since the model output itself is untrusted.
- The confirm workflow needs `actions: write` because `GITHUB_TOKEN` can only dispatch workflows in its own repo when that permission is explicitly granted.
