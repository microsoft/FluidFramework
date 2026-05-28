# `pull_request` vs `pull_request_target` — Design Notes

> Adapted from a transcript discussion, corrected against the actual Fleet Review workflows in this directory. See [`pr-review-fleet.README.md`](./pr-review-fleet.README.md) for the workflow reference.

Understanding the difference between the GitHub Actions `pull_request` and `pull_request_target` trigger events is important for designing secure workflows.

At a high level, GitHub's documentation says that `pull_request` runs in the context of the PR's merge commit, while `pull_request_target` runs in the context of the base branch (and, since December 2025, the default branch is the workflow source for `pull_request_target`). Put more simply: when you use `pull_request`, the workflow is evaluating the proposed PR changes; when you use `pull_request_target`, the workflow definition comes from the trusted repository side instead.

The security concern arises because pull requests, especially from forks, must be treated as untrusted input. Build scripts, tests, package install hooks, and other automation paths can all become code-execution points. If a workflow running on PR content also has access to sensitive capabilities, a malicious contributor can shape the PR so that their code runs in that environment and abuses those capabilities.

This is where `pull_request_target` comes in. The documented difference is that it runs using the trusted repository context rather than the PR's merge context, which is why it's commonly used for things like labeling, commenting, or other repo-side automation that needs elevated permissions. But GitHub also warns that this event has a larger attack surface precisely because it runs with repository privileges while still being triggered by user-supplied PR activity. So the safe summary is: `pull_request_target` helps prevent untrusted workflow definitions from being used as the workflow source, but it does not make PR-derived input safe by itself.

This tradeoff is central to using `pull_request_target` safely. Because it executes in a more privileged environment, it requires much more discipline around untrusted input. The primary rule is that PR-derived data is data only: do not check it out as the working tree, execute it, source it, or let it define the workflow/prompt being run.

The secondary rule is to constrain what leaves a privileged job. Instead of passing raw PR-derived data downstream, convert it into well-defined, controlled outputs — typically small blobs of JSON or comments that trusted workflow code constructs. The idea is that no matter what the PR contains, the next workflow step receives something bounded and intentionally shaped.

A concrete example is the review routing logic in `pr-review-auto-route.yml`. The workflow runs on `pull_request_target` from the base branch and **never checks out the PR head** — it only `git fetch`es the head commit and reads `--numstat` from it. From those numbers it derives `lines` / `files` / `packages` counts and picks a tier. That base-branch-only checkout is the foundational input boundary that makes `pull_request_target` safe here. The sticky proposal comment that the bot constructs itself is the separate output boundary.

## How the Fleet Review pipeline composes this

It's worth being precise about the architecture, because it's not a single workflow with privileged and unprivileged jobs — it's **separate workflows on different trigger surfaces**:

- `pr-review-auto-route.yml` runs on `pull_request_target`. Its job is sizing and UI only. It posts a proposal comment with checkboxes; it does not run the reviewer.
- `pr-review-fleet.yml` runs on `workflow_dispatch` (triggered by the confirm workflow when the author ticks "Start review") or on `workflow_run` (triggered by the label-driven dispatcher). It checks out the PR head itself with `persist-credentials: false`, generates `pr-diff.patch` and `changed-files.txt` inline, and then runs the Copilot CLI in that same job.

So the isolation isn't "diff is passed across job boundaries from a privileged job to a less-privileged one." It's:

1. The reviewer agent has **no shell or exec tools** — only `--allow-tool=read --allow-tool=write`. Even though `.git` is on disk, the agent can't invoke `git`.
2. Checkout uses `persist-credentials: false`, so the auth token isn't stashed in the local Git config for later steps to reuse.
3. All git-derived context (the diff, the changed-files list, the reviewer prompt) is materialized **before** `COPILOT_GITHUB_TOKEN` enters the step's environment. Once that token is present, the model-influenced part of the job consumes fixed files instead of invoking git, resolving refs, or loading prompts through a path that attacker-controlled instructions could try to steer.

This was the shape of a previous MSRC issue: earlier versions allowed arbitrary Git operations with persisted credentials, which could have been abused for exfiltration. Removing Git capabilities from the credentialed step closed that hole. The mitigation is "the agent can't reach git," not "git isn't used at all."

## Prompt-injection: a second untrusted input

The diff isn't the only untrusted input the reviewer agent sees — the reviewer prompt itself is too, if you load it from the PR checkout. `pr-review-fleet.yml` loads the prompt from the **base branch** instead:

```bash
git show "origin/${BASE_REF}:.github/prompts/reviewers/${REVIEWER}.md" > "$PROMPT_FILE"
```

That way a malicious PR can't rewrite the instructions an authenticated agent is about to execute.

## Output is untrusted too

Model output is also untrusted. The consolidator regex-scrubs GitHub token patterns (`gh[pousr]_…`, `github_pat_…`) from the report before it's posted as a PR comment. It's defense-in-depth, but worth doing — the agent is denied shell tools, but its prose output still flows to a public-facing comment.

## Credential handling

Setting `persist-credentials: false` on `actions/checkout` prevents the checkout action from storing the auth token in the local Git config for later Git operations. It does not remove every possible credential from the job, but it closes a common path for accidental or malicious reuse in later steps.

Note also that the confirm workflow (`pr-review-confirm.yml`) declares `actions: write`. That permission is what lets `gh workflow run pr-review-fleet.yml` dispatch the fleet — `GITHUB_TOKEN` can dispatch workflows in its own repo only when this permission is explicitly granted; otherwise the call 403s. It's a small but easy-to-miss requirement when wiring up a confirm-then-dispatch flow.

## Who is allowed to trigger?

There are guardrails on who can trigger the fleet:

- **Confirm path:** `pr-review-confirm.yml` calls `actions-cool/check-user-permission` with `require: write` against `github.event.sender.login` before dispatching. The bot authored the comment, so `author_association` on the event isn't meaningful — we have to check the acting user directly.
- **Label path:** `pr-review-dispatch.yml` trusts whoever can apply the `fleet-review` label, which is gated by GitHub's own repo permissions on labeling.
- **Manual `workflow_dispatch`:** gated by GitHub on `actions: write` to the repo.

## Summary

Conceptually, the goal is to split responsibilities:

- `pull_request_target` handles classification / analysis using untrusted input, **without checking out PR head**.
- Downstream workflows (triggered via `workflow_dispatch` / `workflow_run`) do the heavier work, but with PR code denied any path to credentials — via `persist-credentials: false`, no shell tools for the agent, prompts loaded from the base branch, and output scrubbed before posting.
- Nothing ever blindly executes code from the PR itself.

In practice, `pull_request` is the appropriate event for running untrusted PR code with limited privileges, while `pull_request_target` is appropriate for trusted repository-side automation that must not execute PR-controlled code. The key is to be precise about what is trusted, what is untrusted, and where credentials or elevated permissions are available — and to remember that "untrusted" includes the diff, any prompt loaded from the PR, **and** the model's own output.
