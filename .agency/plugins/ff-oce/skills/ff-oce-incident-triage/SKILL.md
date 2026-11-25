---
name: ff-oce-incident-triage
description: >
  Triage IcM pipeline-failure incidents. Use when asked to investigate pipeline
  incidents, assess commit relevance to failures, distinguish regressions from
  transient or flaky failures, or verify recovery before closing an incident.
version: 1.0.0
---

# IcM Pipeline Incident Triage

Investigate the incident IDs or URLs supplied by the user.
This skill is for pipeline-failure incidents, not general customer-impacting incidents.

## Inputs

- Incidents: `<IcM incident IDs or URLs>`
- Permissions: read-only investigation and draft recommendations by default.
  Any incident updates, pipeline reruns, bug creation, or external messages require explicit approval.

## Task

Investigate the supplied IcM incidents end to end.
If multiple incidents are supplied, they may be related or independent.
Check for shared failing runs, error signatures, tested changes, or overlapping service disruptions.
Reuse evidence where a connection is supported, but keep a separate verdict and recovery assessment for each incident.
Do not assume that one incident's cause or recovery applies to the others.

Prioritize whether the changes tested by the failing runs plausibly explain the failures.
If you can inspect the relevant changes and find no plausible connection, treat the failures as suspected flakes rather than assuming a product regression.
Common causes include OneDrive and SharePoint (ODSP) network issues, tinylicious flakiness, and Azure Fluid Relay (AFR) reliability.
These are hypotheses, not established root causes.

Distinguish classification from recovery: a suspected flake is not automatically a recovered incident.
Use subsequent executions to determine whether the failure has cleared.
Do not dismiss persistent failures just because no relevant commit is apparent.

Complete the read-only investigation without pausing for routine decisions.
If access or evidence is missing, report the specific gap rather than guessing.
Then present the summary and wait for the user to continue before reviewing incident-handling decisions together.

### Link every referenced ID

Whenever you display an artifact ID, hyperlink it to the corresponding record.
This applies to IcM incidents, ADO work items, builds and pipeline runs, test results, logs, GitHub issues and pull requests, and commit SHAs.
Apply this rule in summary tables, investigation notes, drafted messages, and decision prompts, including references to earlier evidence.
Use the ID as the link label and a verified destination URL.
If a prompt field cannot render hyperlinks, include the full verified URL alongside the ID.
If no direct link is available, link to the containing evidence page; if neither destination is available, describe the artifact without a bare ID and disclose the missing link.
Do not invent URLs.

## 1. Establish the incident and failure context

Read each incident's details, description, discussion, and linked troubleshooting guide.
Identify the affected pipeline runs, branch, failure times, and any investigation already completed.
Respect incident-specific instructions and do not overwrite another engineer's conclusions without evidence.

Use the configured IcM and Azure DevOps (ADO) tools.
Discover available tools and their schemas before invoking them; do not assume tool names or parameters.
For Fluid Framework pipelines, the ADO project is `internal`.
Derive the organization, project, and pipeline from the actual run URL for other pipelines.
Use the `pipeline-test-triage` skill if available.

For each linked failing run, capture:

- Pipeline definition, run URL, branch, source commit, and execution time in UTC.
- Actual tested package or artifact version and source commit, if these differ from the pipeline checkout.
- Failed stage, job, task, and attempt.
- Full failing test name, driver, compatibility configuration, and error signature.

Use structured test results and the build timeline when available, then fetch only the relevant logs.
An error line alone does not establish that its task failed.
Check failed attempts hidden by automatic retries, even when the final build is green.
Separate distinct failure signatures; one run or incident can contain both a flake and a regression.

If this is not a pipeline-failure incident, or the incident reports customer impact, stop this shortcut for that incident.
Summarize the evidence and recommend the appropriate incident-specific investigation instead.

## 2. Check commit relevance before deciding it is flaky

For each failure signature, find the nearest preceding comparable run where the affected test or task actually passed.
Match pipeline, branch, driver, compatibility configuration, and relevant inputs.
A skipped test or an unrelated green stage is not a passing baseline.

Compare the failing run against that baseline:

1. Establish the full change range between the baseline's tested revision and the failing run's tested revision.
   Do not inspect only the failing run's final commit.
   If the tested artifact comes from another build or repository, follow its provenance.
2. Read commit descriptions and relevant diffs.
   Consider product code, shared dependencies, lockfiles, test code, pipeline configuration, harness changes, and service setup.
   Do not infer relevance from filenames or commit titles alone.
3. Map plausible changes to the failing operation, assertion, or stack.
   Follow shared helpers or configuration when needed to explain the connection.
4. Record the relevance verdict, supporting commit links, and a short explanation for each failure signature.
   A plausible relationship is a regression lead, not proof of causation.

Use these verdicts:

| Commit relevance | Meaning | Initial handling |
| --- | --- | --- |
| Plausibly relevant | A tested change could explain this failure. | Investigate as a potential regression. |
| No apparent relevance | You inspected the available change range and found no plausible connection. | Treat as a suspected flake and check recovery. |
| Unknown | Baseline, provenance, diffs, or other required evidence are unavailable. | Report uncertainty; do not claim changes are unrelated. |

Identical tested revisions across a passing and failing execution support intermittent behavior.
They do not prove the product is bug-free: code bugs can also be intermittent.
If a relevant change exists but retries pass, retain both observations rather than forcing a single explanation.

## 3. Check subsequent runs and recovery

Start with up to three comparable executions before and three after the failure, within the last seven days.
Always inspect the incident-linked failing runs even when they are older.
For older incidents, use the same seven-day window around the failure and check the latest comparable execution.
Expand the search only when necessary to find a valid baseline or resolve conflicting evidence.
State the window and coverage gaps in the result.
Prefer existing retries and scheduled runs over queuing new work.

Compare the same test or failed operation, driver, compatibility configuration, and relevant artifact inputs.
For each comparison, record the run, attempt, tested revision, result, and whether the failing operation actually executed.
If later commits or configuration changes could have fixed the failure, do not call the recovery spontaneous.

Use the following handling:

| Evidence | Classification and recommendation |
| --- | --- |
| No apparent commit relevance; affected operation passes on a comparable retry or later run without an apparent relevant fix | Likely transient/flaky; recommend mitigation or resolution only if the troubleshooting guide's recovery conditions are met. |
| No apparent commit relevance; failures vary across runs and previously failing operations pass later | Likely flaky behavior, potentially service-related; do not open a new FF investigation for each isolated failure or compatibility variant. Assess failure rate and incident noise before recommending escalation. |
| No apparent commit relevance; no comparable subsequent execution | Suspected flake, recovery unverified; keep open and recommend checking the next run or an approved rerun. |
| Same signature continues in comparable executions | Persistent failure; assess impact and likely ownership regardless of commit relevance. Use existing tracking and route service issues to the service owner rather than assuming an FF product investigation is required. |
| Same issue is already covered by an active incident, including on another branch | Recommend making the supplied incident a child of the existing incident, using the evidence checks below. Do not start a parallel investigation or treat a cross-reference note as the complete recommendation. |
| Plausibly relevant change and matching failure | Potential regression; identify the suspect change and recommend focused investigation, even if later retries pass. |
| Missing or conflicting evidence | Inconclusive; state exactly what is needed next. |

Timeouts, connection errors, throttling, and service errors support a transient hypothesis but are not enough on their own.
Persistent authentication failures or broken test infrastructure need action, not repeated dismissal as flakes.
Do not claim ODSP, tinylicious, or AFR caused a failure unless the evidence supports that attribution.

### Service ownership and investigation scope

Service-related failures are not automatically the responsibility of the Fluid Framework on-call engineer (FF OCE) to debug.
When failures are unrelated or inconsistent across runs, affected operations pass later, and no plausible FF change explains them, treat the pattern as likely flaky behavior.
FF OCE does not need to investigate flaky ODSP service behavior further unless it produces a significant failure rate or incident noise.
An isolated timeout in a different test or compatibility configuration, or the absence of an exact tracking record for it, is not by itself a reason to keep the original incident open or create a new bug.
Recommend resolution when the troubleshooting guide's recovery conditions are met, while retaining useful existing tracking.

Assess significance using the affected runs and operations, the number of comparable executions, and repeated incident alerts in the checked window.
Distinguish isolated test failures from widespread or sustained pipeline failures, even when individual signatures vary.
Use thresholds from the troubleshooting guide when available; do not invent a numeric cutoff.
For significant service failures or alert noise, recommend coordination through existing service-owner tracking or escalation.
Reserve deeper FF product or harness investigation for evidence pointing to those components.

Complete the read-only follow-up needed for an incident-handling recommendation before presenting the summary:

- Classify recurring failures and failures in the latest comparable runs, including new signatures found while checking recovery.
  Determine whether they match the original failure, represent separate intermittent failures, or suggest a persistent problem.
  Inspect their errors, stacks, and relevant changes rather than relying on the overall run result.
  Stop at the evidence needed for classification and ownership; do not turn routine service flakes into open-ended root-cause investigations.
- Search existing ADO work items, GitHub issues, and related IcM incidents for matching tracking.
  Search across branches, not only the branch of the supplied incident.
  Use the failing test or operation, driver, compatibility configuration, and error signature to assess matches.
  Inspect candidate records before claiming they cover the failure.
  Record matching links and status, or state that no matching tracking was found and identify the search scope.
- Decide whether further investigation is warranted and explain why.
  If a deeper investigation remains necessary, identify the specific unresolved question and concrete next checks.
  Do not defer routine signature comparison or tracking searches to the user decision walkthrough.

If access or evidence prevents these checks, report the specific blocker and its effect on the recommendation.
Do not treat an unperformed or blocked search as evidence that no tracking exists.

### Consolidate incidents for the same issue

Inspect matching active incidents, their discussions, existing parent/child relationships, and linked Teams threads or service-owner escalations.
A different branch does not make an otherwise matching issue independent.
Compare the failing operation, signature or stack, driver endpoint, profile, and investigation context before concluding that incidents cover the same issue.
Do not infer a shared issue from a generic timeout or shared service name alone.

When an existing active incident already tracks the same issue and its ongoing investigation, recommend making the supplied incident a child of that incident.
Prefer the incident already coordinating the shared investigation or service-owner escalation as the parent.
State the proposed child and parent explicitly, hyperlink both, and explain the evidence for the relationship.
Keep each branch's recovery assessment separate; creating a parent/child relationship does not establish recovery or authorize resolution.
Include this recommendation in the initial summary table, then present the supporting notes and request approval during the walkthrough.
Do not substitute a new bug, duplicate escalation, or cross-reference-only note for the parent/child recommendation.
If the relationship cannot be read or changed with available tools, disclose the limitation and provide the proposed relationship without claiming it was applied.

## 4. Recommend incident handling

For each incident, prepare a concise investigation note suitable for its discussion.
Keep these notes for the decision walkthrough; do not include them in the initial summary.
Include:

- **Verdict:** classification, confidence, and whether recovery is verified.
- **Failure:** affected runs, tests or tasks, driver, and error signature.
- **Commit relevance:** compared revisions, suspect changes or why none appear relevant, and any coverage gaps.
- **Recovery:** comparable attempts or later runs, UTC times, and direct evidence links.
- **Tracking:** matching bugs or incidents and their status, linked Teams discussions or escalations, any proposed parent/child relationship, or the search scope and any gaps when no match was found.
- **Action:** proposed next step and any condition that prevents mitigation or resolution.
  Base the recommendation on the completed recurrence and tracking checks, not on a proposal to perform those checks later.

For an incident with multiple failure signatures, account for all of them before recommending closure.
Do not describe a transient recovery as a code fix.
Do not invent a root cause or claim that a rerun proves a permanent fix.
Use full GitHub URLs in ADO work-item text rather than bare issue or pull request numbers.
Keep secrets, credentials, and unnecessary customer data out of notes and local files.

Do not acknowledge, mitigate, resolve, transfer, change severity, change parent/child relationships, post notes, file bugs, or queue reruns without explicit approval.
When an action is approved, re-read the incident and latest relevant run first.
Apply only the approved action, follow the incident's troubleshooting guide, and verify the resulting state.
During the decision walkthrough, if approval is absent, show the proposed note and action without performing writes.

## 5. Present the summary and pause

Return only a summary table followed by the continuation invitation below.
Use one row per incident with its linked ID, classification, commit-relevance verdict, recovery evidence, and recommended action.
Keep cells concise and identify material blockers, unresolved signatures, and proposed related groups within the table.
Recommendations are not completed actions; any external writes still require explicit approval.
Format every recommended-action cell as `**<Action label>.** <Incident-specific details>`.
Always bold the recommendation's action label; keep the supporting details in regular text.
For the same recommended action, reuse exactly the same short action label, capitalization, and punctuation across rows.
For example, recommendations to mark an incident as transient should all start with `**Mark as transient.**`, followed by their relevant details.
Preserve the substance of each recommendation, including its scope, conditions, uncertainty, and links.
This is a presentation rule only: do not change the recommended action or merge distinct actions merely to make labels match.
Do not include investigation notes, supporting-evidence sections, or other prose outside the table and invitation.
Complete the investigation and tracking checks before this pause; defer only presentation of the details, not the work.
End the response with a friendly invitation: "Please let me know when you're ready to walk through the incident decisions one by one."
Stop here until the user responds; do not begin the decision walkthrough, perform writes, or start a monitoring loop.

## 6. Walk through decisions after the user continues

Treat a request to continue as permission to start the discussion, not as approval to change incidents or perform other external writes.
Review one incident at a time, or one related group at a time when the evidence supports grouping.
Identify all incident IDs in a group and retain a separate recovery assessment for each.
Follow the summary order unless the user chooses another order.

For the current incident or group:

1. Show the prepared **Investigation notes** for the current incident or group only, including the verdict, failure details, commit relevance, recovery evidence, tracking findings, remaining uncertainty, and recommended action.
   Include direct evidence links and explain any grouping.
   Do not show notes for later incidents before their turn.
2. Use `ask_user` when available to let the user choose the next step.
   Offer only relevant choices, such as resolving a recovered transient incident, making it a child of an existing incident for the same issue, keeping it open with recommended checks, investigating a specific unresolved question, drafting a note, or deferring it.
   Do not offer routine investigation that should already be complete as a next step.
   Distinguish deeper follow-up or newly available evidence from missing initial triage work, and disclose any blocked checks.
   State the exact incident IDs and proposed action when requesting approval for a write.
   For a parent/child change, identify and link both incidents and explicitly request approval to make the specified child a child of the specified parent.
   Group approval applies only to the listed incidents and actions, not to the rest of the batch.
3. Carry out only the selected step.
   Before any approved write, re-read the incident and latest relevant run as described above.
   If new evidence changes the recommendation or invalidates recovery, explain the change and request a new decision instead of applying the stale approval.
   Recommend resolution only when the recovery conditions are met, not merely because the failure is likely transient.
4. Report the result and verify any changed state.
   If the user requested recommendations only, give concrete checks and explain what evidence would change the verdict without performing writes.
   Finish or defer this decision before presenting the next incident or group.

Continue the walkthrough only while the user wants to proceed.
If the user pauses or stops, return the completed decisions and remaining incidents without taking further action.
When all decisions are complete, summarize actions taken, incidents left open, and unresolved checks.
