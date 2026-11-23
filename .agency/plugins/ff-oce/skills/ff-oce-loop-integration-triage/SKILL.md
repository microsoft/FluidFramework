---
name: ff-oce-loop-integration-triage
description: >
  Investigate Loop-FF integration pipeline failures in Office Azure DevOps.
  Use when asked to examine an office-bohemia External Partner to Loop Integration
  run, find known issues or fix PRs and Teams discussions, or retry failing parts.
version: 1.0.0
---

# Loop-FF Integration Failure Triage

Investigate the supplied Loop-Fluid Framework (FF) integration build URL or ID.
First look for existing knowledge and fixes.
If a matching fix has landed, prompt the user to trigger a fresh pipeline run.
If the issue is unknown, try a targeted retry after explicit approval.
Do not queue a run or retry merely because this skill was invoked.

## Context and permissions

- Azure DevOps (ADO) organization: `office`; project: `OC`.
- Pipeline: `office-bohemia External Partner to Loop Integration`, definition `29163`.
- Repository: `office-bohemia`; normal integration branch: `master`.
- Use the configured `ado-office` tools, not the `ado` server scoped to `fluidframework`.
- Discover available tools and read their schemas before use.
  Do not assume a tool supports timeline access, job retries, or arbitrary request fields.
- Follow the ff-oce agent's confirmation requirement for every external write.
  Use `ask_user` for decisions and approval; do not post Teams messages or create tracking without approval.
- Link referenced builds, logs, commits, issues, and pull requests (PRs).
  Never expose tokens or credentials.

Use the `pipeline-test-triage` skill if available for log and test-result investigation.
Its `fluidframework/internal` defaults do not apply to this Office pipeline.
Do not delegate to another agent unless requested.

## 1. Identify the actual failure

Read the build status, source revision, branch, parameters, and tested FF artifact provenance.
Record the failing stage, job, task, attempt, and exact test or operation with its error and relevant stack.
Keep separate failure signatures separate, including non-test failures.

Focus the investigation on stages whose actual result is **Failed**.
A stage marked as a warning or **Succeeded with issues** is not a blocker.
Do not treat error log lines, a nonzero script exit code, or a size threshold breach as a stage failure without checking the resulting status and any `continueOnError` configuration.
For example, the Office-baseline bundle comparison can report regressions but remain non-blocking because it uses `continueOnError: true`; check the separate FF-to-FF comparison independently.
Briefly review and call out relevant warnings, but keep failed stages as the investigation priority.
Investigate warning-only stages in depth only when they help explain a failed stage or the user explicitly asks about them.

Use the build timeline and structured test results when accessible.
The Issues panel aggregates error log lines; it does not prove a task failed.
If timeline access is unavailable, inspect task completion and exit status in the relevant logs and state any remaining uncertainty.
Fetch log metadata first, identify candidate tasks from their opening `Starting:` lines, then read the relevant failure ranges.
Do not bulk-download all logs or assume that the largest log contains the failure.

This pipeline's `Bump FF Versions` task can emit lint errors and then auto-suppress them successfully.
Do not report those lines as failed lint stages unless the actual task result supports that conclusion.
The later `Lint and Type Check with read-write cache` task is distinct.
Likewise, an end-to-end test storm warning alone is not evidence that the stage failed.

## 2. Search existing knowledge before retrying

For each signature, search existing work items or issues, open PRs, recently completed PRs, and human Teams discussions.
Start with the exact test name, distinctive error text, package, and shared helper.
Then try shorter terms and relevant PR IDs if exact searches find nothing.
Search `office-bohemia` first; follow evidence into `microsoft/FluidFramework` for FF changes.
Use available internal documentation and prior investigation context when relevant.
Start with the preceding seven days and widen only when needed.
Search failures and candidate fixes in parallel when independent.

Inspect candidate descriptions and relevant changes, not just titles.
Check PR status explicitly: an active PR with a successful merge preview or a `lastMergeCommit` is not a completed PR.
For a completed fix, verify whether its commit is included in the run's actual tested revision or artifact.
Queue time, finish time, and commit timestamps alone do not prove inclusion.
If provenance or ancestry cannot be verified, say that inclusion is unverified.

### Teams filtering

Look for human discussion, diagnosis, ownership, and fix links.
Exclude automated build notifications from the **FF Client OCE** channel from the reported Teams findings.
That channel has team ID `9ce27575-2f82-4689-abdb-bcff07e8063b` and channel ID `19:25dabf309c5c42a7abe4647c7c1b7990@thread.skype`.
Notifications commonly have sender `Azure DevOps` or `azuredevops@microsoft.com`.
Filter returned results by channel and sender; do not assume the search API supports exclusion filters.
Do not list or link these automated notification threads as relevant discussions, even as a fallback when no human discussion is found.
You may use substantive human replies as evidence, but link the specific human reply rather than the automated parent.
Read relevant thread context when available before summarizing a search snippet.

If no matching human discussion is found, say so and state the search window.
A blocked or incomplete search is a coverage gap, not evidence that the issue is unknown.
Do not invent a root cause or classify a timeout as a service failure without supporting evidence.

## 3. Choose the next action

Apply this decision separately to each failure signature.
Do not let one known issue hide an unrelated failure.

| Evidence | Action |
| --- | --- |
| Matching fix completed and absent from the tested revision | Explain the match and prompt the user to trigger a **fresh pipeline run** that includes the fix. |
| Matching fix completed, but inclusion unverified | Explain the uncertainty; verify provenance if possible before recommending a fresh run as fix validation. |
| Matching fix already included, but failure persists | Do not call it fixed. Check whether the fix covers this signature and report the remaining issue. |
| Matching active PR or known unresolved issue | Link the existing work and current status. Do not retry merely because the fix is still open. |
| No matching knowledge after the searches complete | Propose one targeted retry of the failing jobs or stages, and request approval. |
| Required searches or failure attribution blocked | Report the blocker. Do not label the issue unknown or queue an automatic retry. |

A fresh run and a retry have different purposes.
Retrying failed stages of the old run normally retains its old checkout and inputs; it does not validate a newly merged fix.
For a fresh run, identify the intended branch/revision and FF build selection.
Preserve the intended FF artifact unless the user approves changing it.
If the pipeline chooses artifacts dynamically, disclose that a new run may select different inputs.
Prompt the user to trigger the new run, or ask whether they want you to queue it.
Do not silently replace the request with a retry of the old build.

## 4. Retry unknown failures, with approval

Before requesting approval, check existing retries and later comparable runs.
If the affected operation has already passed with the same relevant inputs, report that evidence rather than queueing redundant work.
A skipped operation or an unrelated green stage is not recovery.

Identify the smallest supported retry scope from the timeline.
Prefer failed jobs only; use a stage retry if that is the supported granularity.
Discover the current write-tool schema and confirm that it supports the target build state.
The `pipelines_write` tool may expose `update_build_stage` with `status: Retry` and `forceRetryAllJobs: false`.
Use an exact stage identifier obtained from the timeline, not its guessed display name.
Do not assume that a completed build is eligible because the tool accepts a build ID.

Show the linked build, exact jobs or stages, and retained inputs in the approval prompt.
Explain if the smallest supported retry also reruns successful work or downstream stages.
If the API or permissions do not support the targeted retry, give the user the build link and the manual retry scope.
Do not silently queue a full build, force all jobs to retry, or use an unapproved REST workaround.

After approval, re-read the build state to avoid duplicate retries or stale decisions.
Submit only the approved retry scope once.
Verify that ADO accepted it and that a new attempt is queued or running.
If it is rejected, report the error rather than repeatedly submitting it.
Check the result when feasible; otherwise report that verification is pending and link the attempt.
Do not claim success merely because the retry request returned successfully.
If the same signature fails again, report the persistent failure and recommend focused investigation.
Do not loop retries or file a new issue without approval.

## 5. Report concisely

Lead with the actual failure and whether a matching fix exists.
Keep non-blocking warnings separate from failures, and do not describe them as the reason the build failed.
Include a brief secondary note about relevant warnings; do not omit them just because they are non-blocking or let them dominate the report.
Include the matching PRs and their current status, relevant human Teams discussions, and the next action.
State missing access or uncertain fix inclusion explicitly.
For multiple signatures, use a small table with failure, known work, and recommended action.
Distinguish verified recovery from a proposed fix or a queued retry.
Never include automated FF Client OCE notification threads in this report.
