---
name: pipeline-test-triage
description: >
  Triage test failures in an Azure DevOps pipeline run for Fluid Framework. Use when the
  user shares an ADO build/pipeline URL or build ID and wants failures analyzed, when they
  ask "why did this pipeline fail", "summarize the test failures", "is this test flaky or a
  real bug", "compare these runs", or wants bugs filed for genuine failures. Covers the Real
  Service End to End Tests pipeline as the worked example but applies to any FF test pipeline.
---

# Pipeline Test Triage

Analyze test failures for a given ADO pipeline run, classify them (service flakiness vs.
infra/harness vs. deterministic product/test bug), compare against adjacent runs to tell
**flaky from deterministic**, and optionally file well-formed ADO bugs for the real ones.

Org: `fluidframework` · Project: **`internal`** (work items *and* pipelines) · Repo on GitHub: `microsoft/FluidFramework`.

---

## Prefer the cheapest source that answers the question

Reach for the smallest, most-structured source first, and escalate only when it can't answer the
question. A single Real Service E2E run has ~660 logs and tens of MB, almost all of which are
*passing* "Container" logs — so **bulk-downloading logs works but is the slow, expensive option;
treat it as a last resort, not a first move.**

| Tier | Source | Gets you | Auth | Use when |
|------|--------|----------|------|----------|
| **1 (primary)** | **Playwright on the Tests tab** | Grouped failures + error/stack + per-test run **history** | Signed-in browser (one-time) | Almost always — start here |
| **2 (fallback)** | **ADO MCP** (`ado-pipelines_*`) | Failing leg names + targeted report-log parsing | Pre-authed MCP (zero setup) | No browser session, or need raw log context (npm exit codes, infra) |
| **3 (optional)** | **Test Results / Timeline REST** | Failed-tests-only + per-test history + exact failing `log.id` + **retried-attempt failures** | MCP tool if exposed; else `az` token (**verified working**) | Bulk multi-run history, pinpoint the failing log, or surface failures hidden in retried attempts |
| **4 (last resort)** | **Bulk log download** (MCP `build_log get_content`) | Everything, unstructured | Pre-authed MCP | Nothing above resolved it — targeted fetches missed, or you need to search across many logs |

Descend a tier only when the one above can't answer the question. Tier 2 already lets you fetch just
the *relevant* report log(s); Tier 4 (grab many/all logs and grep) is fine when targeting fails —
just know it's the costly path, so exhaust cheaper options first.

---

## Mental model: the failure taxonomy

Every failure sorts into one of three buckets. Classification *is* the deliverable.

1. **Service flakiness** — real backing service was unhappy. Ignore / no bug (or a service bug, not a code bug).
   Signatures (FF Real Service E2E): FRS `Document not found` / service degradation; `[r11s-frs]` `stashed ops` blob-upload **timeouts**; `[t9s]` (tinylicious) `Timeout of 5000ms exceeded`; undici `Cannot destructure property 'socket' of 'parser.deref(...)'`; sporadic connect/socket errors. These usually differ run-to-run and often pass on auto-rerun.
2. **Infra / harness** — the run's plumbing broke: `Npm failed with return code: N`, container/docker setup, artifact/publish steps. The npm rc on a leg is a *symptom* — find the actual failing test inside that leg.
3. **Deterministic product / test bug** — the **same test** fails with the **same assertion/stack** across adjacent runs. This is the high-value find. File a bug.

> **Green builds hide failures too.** A test can fail on Attempt 1 and pass on the auto-retry, leaving the build
> **green** and `resultsbybuild` reporting **0 failures** — yet the Tests tab still shows the Attempt-1 failure.
> Never conclude "no failures" from a green status alone; check for retried attempts (Tier 3 recipe).

**Driver awareness (critical for FF):** the same spec runs per driver and is prefixed in the report:
`[odsp]`, `[r11s-frs]`, `[r11s-docker]`, `[t9s]`, `[local]`. A test may be `pending` (skipped, shown as `-`)
on some drivers and only actually execute on one. When comparing runs you must match the **same task**
(e.g. `test:realsvc:odsp:report --compatVersion=0 --tenantIndex=0`), not just the test name.

---

## Tier 1 — Playwright on the Tests tab (primary)

Prereq: a browser signed into `dev.azure.com/fluidframework` (same one the `loop`/`expense-report`
skills use). If auth is missing you'll land on a login page — pause and let the user sign in, then continue.

### Single-run triage
1. `playwright-browser_navigate` →
   `https://dev.azure.com/fluidframework/internal/_build/results?buildId={ID}&view=ms.vss-test-web.build-test-results-tab`
2. `playwright-browser_snapshot` to read the summary. Filter/click **Outcome = Failed**. The tab groups
   failures and flags each **New / Existing / Fixed** vs. prior runs — that flag alone hints flaky vs. regression.
3. For each failed test, click it to expand the **error message + stack**. Capture: full test name (with `[driver]`
   prefix), the assertion/error, top 2–3 stack frames, and the owning file. `playwright-browser_take_screenshot`
   for the record if filing a bug.
4. Note the **leg/stage** (e.g. "Run Non-compat") and the driver — the tab shows these per result.

### Flaky vs. deterministic (the key question)
- Open the failed test's **history** (the per-test view has a pass/fail sparkline across recent runs), or use
  the pipeline's **Analytics → Test results trend** / the "failing since" column. Read whether this exact test
  has been failing on **consecutive** runs (deterministic) or intermittently (flaky).
- If the history view is awkward to read, drop to Tier 2/3 to compare the specific runs directly.

### Notes
- ADO tabs render lazily and paginate — always `snapshot` before clicking; don't assume off-screen rows exist.
- Prefer reading grouped/expanded panels over scraping; screenshot anything you'll cite in a bug.

---

## Tier 2 — ADO MCP fallback (zero setup, always works)

Use when there's no browser session, or you need raw log context the Tests tab doesn't show. This is the
approach used in the reference triage; it works but is heavier, so stay surgical.

### Step 1 — find the failing legs (cheap)
`ado-pipelines_build action=get_status buildId={ID} project=internal` → the **Issues** section lists failing
task names + error summaries, e.g. `Run Non-compat … Npm failed with return code: 2`. This tells you *which
legs* failed without reading a single big log.

### Step 2 — locate the right report log (don't guess by size)
`ado-pipelines_build_log action=list buildId={ID} project=internal`. Report-step logs are separate from the
job "Container" aggregate and start with `##[section]Starting: [test] test:realsvc:<driver>:report …`.
For each failing leg, the driver-specific report log is a **medium** log (~2.5–4k lines), *not* the biggest
(the biggest are usually passing job aggregates). Fetch a few medium candidates and match on the first line /
the `test:realsvc:<driver>:report` command rather than trusting size.

> Gotcha proven in practice: the odsp Non-compat failure lived in a ~3.4k-line report log, while the 15–19k-line
> logs were all *passing* legs. Biggest ≠ failing.

### Step 3 — parse the failing report log
Fetch the matched log's content and run the helper (handles the get_content temp-file JSON, ANSI/timestamp
stripping, and pulls the mocha summary + numbered failure block):

```
scripts/Parse-AdoTestLog.ps1 -Path <temp-file-from-get_content> [-Context 30]
```

Or inline: `Get-Content <file> -Raw | ConvertFrom-Json` → strip `\u001b\[[0-9;]*m` and leading `^.*?Z ` →
grep `^\s*\d+ (passing|failing|pending)` and the `N)` numbered failure entries. The 1-based array index is the
log line number (use it to build a direct link).

### Step 4 — compare across adjacent runs (flaky vs. deterministic)
1. `ado-pipelines_build action=list definitionId={DEF} project=internal top=100` → **filter client-side by
   `definitionId`** (the MCP param does *not* reliably filter) and by branch. For Real Service E2E: `definitionId = 56`.
2. Take the previous few runs (include `PartiallySucceeded`, not just `Failed` — a real failure can still leave a
   run "partially succeeded"). For each, find the **same** report task (Step 2) and re-parse (Step 3).
3. Verdict:
   - **Deterministic** if the same test + same assertion/stack fails in **every** run where that task actually executed.
   - **Flaky** if it appears in some runs and not others, or the errors are timeouts/service errors that vary.

---

## Tier 3 — Test Results / Timeline (the high-payoff endpoints)

These endpoints return *exactly* the relevant rows (a few KB, no MB log downloads) and are the right
path when they're reachable. **All are verified working** (see the auth block for the exact token recipe):
- **Failed tests only (fast, modern host):** use the **`vstmr.dev.azure.com`** Test Results Management host, not
  the legacy `dev.azure.com/.../test/runs` path (that one hangs):
  - `GET https://vstmr.dev.azure.com/fluidframework/internal/_apis/testresults/resultsbybuild?buildId={ID}&outcomes=Failed&api-version=7.1-preview.1`
  - Summary/counts: `…/testresults/resultsummarybybuild?buildId={ID}&api-version=7.1-preview.1`
  - **Gotcha:** these require **`-preview.1`** in the api-version — plain `7.1` returns HTTP 400 `VssInvalidPreviewVersionException`.
- **Per-test history across builds** (direct flaky-vs-deterministic answer, avoids re-parsing N runs):
  `POST https://vstmr.dev.azure.com/fluidframework/internal/_apis/testresults/results/testhistory?api-version=7.1-preview.1`
  with a body carrying the test's `automatedTestName` (`{ "automatedTestName": "…", "groupBy": "branch", … }`).
- **Timeline** — maps each failing task to its **exact `log.id`** *and* yields the job/task GUIDs for deep links:
  `GET https://dev.azure.com/fluidframework/internal/_apis/build/builds/{ID}/timeline?api-version=7.1` — filter
  `records[]` to `result == 'failed'`. This removes the Tier-2 "which of ~660 logs is the failing report?" guessing.

> **⚠️ Green builds can still hide failures (retried attempts).** `resultsbybuild` and the **default** timeline only
> report the **latest attempt**. A test that failed on Attempt 1 and passed on the auto-retry (Attempt 2) shows
> **0 failures** in both — the build is green, yet the Tests tab still surfaces the Attempt-1 failure. To find these,
> see **"Finding failures hidden in retried attempts"** below. Always check for retries before declaring a build clean.

**Preferred access — via the ADO MCP, if it exposes these.** The MCP is already authenticated (zero setup), but
today its surface only covers build/log listing + raw log content, *not* test-results or timeline. If/when the
MCP gains timeline or test-results reader tools, **use those** — no token needed. Re-check the available
`ado-*` tools before assuming you must go direct.

**Fallback access — direct REST with your own token.** Needed only because calling these URLs yourself (outside
the MCP) has no credential attached — the MCP's credential can't be borrowed for endpoints it doesn't implement.
Probe for a token; if none exists, stay on Tier 1/2 rather than prompting for setup mid-task:

```powershell
# AAD token via Azure CLI (preferred: no stored secret, short-lived, auto-refreshed).
# NOTE the ADO resource ID below — this exact GUID works against the fluidframework org.
$tok = az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv
$headers = @{ Authorization = "Bearer $tok" }
# — or — least-privilege PAT (Build:Read + Test:Read) from an env var:
$pat = $env:AZURE_DEVOPS_EXT_PAT
$headers = @{ Authorization = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(":$pat")) }

Invoke-RestMethod "https://dev.azure.com/fluidframework/internal/_apis/build/builds/$ID/Timeline?api-version=7.1" -Headers $headers
```

Never print the token/PAT; read it only from `az`/env. See **"Enabling REST auth"** below for one-time setup.

> **Auth gotchas (both verified in practice):**
> - **Resource ID must be `499b84ac-1321-427f-aa17-267ca6975798`.** The commonly-cited well-known ADO GUID
>   (`499b84ac-1332-4a5e-9d67-b18d6c8a1c66`) returns `AADSTS500011: resource principal … not found in tenant` here.
> - If the token call errors or returns an HTML sign-in page, the shell is on the wrong tenant — run
>   `az login --tenant 72f988bf-86f1-41af-91ab-2d7cd011db47 --allow-no-subscriptions` first
>   (the `fluidframework` org is backed by the corp tenant `72f988bf…`, confirmed via the `X-VSS-ResourceTenant` header).
> - The Azure CLI may not be on `PATH`; call it by full path if needed
>   (`"$env:ProgramFiles\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"`). Each PowerShell call is a fresh process.

### Timeline → deep link recipe
1. `GET …/builds/{ID}/timeline?api-version=7.1` → `records[]`, each with `id` (GUID), `parentId`, `type`
   (`Stage`/`Phase`/`Job`/`Task`), `name`, `result`, and (Task records) `log: { id }`.
2. Failing **Task** record (`result=='failed'`, `name` matches the report step): its `id` = **`t`**, its `log.id`
   = the exact log to read.
3. Walk `parentId` up to the enclosing **Job** record: its `id` = **`j`**.
4. `l` = failing line number (from parsing that log — grep the log for the mocha `● …` / `N failing` /
   `FAIL <spec>` marker; the 1-based line index is `l`).
5. Assemble: `…/_build/results?buildId={ID}&view=logs&j={j}&t={t}&l={l}`.
   Param names drift across ADO versions (older builds used `lineStart`/`lineEnd`), so keep the raw-log-range URL
   as the always-safe fallback.

### Finding failures hidden in retried attempts (green build, but Tests tab shows a failure)
When the build is green and `resultsbybuild?outcomes=Failed` returns **0**, but a failure is still visible, an
earlier **attempt** failed and the auto-retry passed. The failing job/task GUIDs live in a **separate sub-timeline**,
not the main one. Recipe (verified on build 409208 — a JestTest failure hidden in Attempt 1 of a green build):
1. `GET …/builds/{ID}/timeline?api-version=7.1` (main timeline).
2. Find records with a non-empty **`previousAttempts`** array (these were retried); each entry has a
   **`timelineId`** pointing at the earlier attempt's sub-timeline. Collect the distinct `timelineId`s.
3. For each: `GET …/builds/{ID}/timeline/{timelineId}?api-version=7.1` → filter `records[]` to `result == 'failed'`.
   *That* sub-timeline holds the real failing `Task` (→ `t`, `log.id`) and its parent `Job` (→ `j`).
4. Fetch that `log.id`, grep for the failure marker to get `l`, and build the deep link as above.

```powershell
$base = "https://dev.azure.com/fluidframework/internal/_apis/build/builds/$ID"
$main = Invoke-RestMethod -Headers $headers "$base/timeline?api-version=7.1"
$retryTimelines = $main.records | ForEach-Object { $_.previousAttempts.timelineId } | Sort-Object -Unique
foreach ($tid in $retryTimelines) {
  $sub = Invoke-RestMethod -Headers $headers "$base/timeline/$tid`?api-version=7.1"
  $sub.records | Where-Object result -eq 'failed' |
    Select-Object type,name,@{n='logId';e={$_.log.id}},id,parentId
}
```

### Enabling REST auth (one-time; optional but high payoff)
The gain is large exactly where this task is slowest: a full triage (~dozens of log fetches, tens of MB) collapses
to ~3 REST calls, and cross-run flakiness becomes **one** Test History call instead of re-parsing N runs. To enable:
- **Preferred — `az login`:** install Azure CLI, run `az login` once. No stored secret; tokens are short-lived and
  the CLI refreshes them silently for weeks. The skill mints a fresh token per call.
- **Fallback — PAT:** create a **least-privilege** PAT (Build **Read** + Test Management **Read** only), short
  expiry, scoped to the `fluidframework` org; store it in the `AZURE_DEVOPS_EXT_PAT` user env var (not the repo,
  not shell history). Rotate on expiry.
- Prefer `az` (AAD) over PAT: short-lived and no secret at rest. Either way, the skill must read the credential
  only from `az`/env and must never echo it.

---

## Building direct links (put these in the summary / bug)

- **Tests tab:** `…/_build/results?buildId={ID}&view=ms.vss-test-web.build-test-results-tab`
- **Raw log line range** (constructible without auth; opening it needs a signed-in session):
  `https://dev.azure.com/fluidframework/internal/_apis/build/builds/{ID}/logs/{LOG}?startLine={A}&endLine={B}`
- **Nice UI log deep link** (needs Timeline job/task GUIDs — Tier 3):
  `…/_build/results?buildId={ID}&view=logs&j={jobGuid}&t={taskGuid}&l={line}`

---

## Filing bugs (when a failure is a real, deterministic bug)

Confirm scope with the user first (project, tag, assignee). Defaults that have been used: project **`internal`**,
tag **`Flaky Test`** *(reconsider this tag if the failure is deterministic — say so)*, unassigned.

- Create: `ado-wit_work_item_write action=create` with a `fields` array. **Bugs in `internal` REQUIRE
  `System.Description`.** This ADO instance does **not** display the Repro Steps field — put everything in
  **Description** (Markdown), not `Microsoft.VSTS.TCM.ReproSteps`.
- Update: `ado-wit_work_item_write action=update` with an **`updates`** array of JSON-Patch ops
  (`{op:"Replace", path:"/fields/System.Description", value:…}`, `format:"Markdown"`). Do **not** use `fields` for update.
- **GitHub link gotcha:** in ADO text a bare `#12345` (and `AB#12345`) auto-links to a *work item*, not a GitHub
  PR/issue. Always use a full URL, e.g. `[PR #27637](https://github.com/microsoft/FluidFramework/pull/27637)`.
- **Angle-bracket gotcha:** ADO strips `<...>` tokens as HTML even inside Markdown code fences — a stack frame like
  `at Object.<anonymous> (…)` loses the `<anonymous>`. HTML-escape them in the source: write `&lt;anonymous&gt;`
  (renders as `<anonymous>`). Same for any `<T>` / html-ish text in error output.

### Description template
```markdown
## Summary
<one line: which leg/driver, what consistently fails, deterministic vs. flaky>

## Failing test
`<full test name including [driver] prefix>`
- Task: `test:realsvc:<driver>:report --compatVersion=<n> --tenantIndex=<n>`
- Driver: <driver> only (pending/skipped elsewhere, if applicable)

## Error
```
<trimmed error + top stack frames>
```

## Reproducibility
<table of the runs checked, each row linking to the error line>
| Build | Date | Result | Error line |
|-------|------|--------|-----------|
| 409255 | … | Failed | [log 400](…/logs/400?startLine=…&endLine=…) |

## Suspected root cause
<1–2 concrete hypotheses; link suspect PRs with full GitHub URLs>

## Links
- [Build … – test results](…&view=ms.vss-test-web.build-test-results-tab)
```

---

## Output contract (what to hand back)

1. **Failure-mode summary** — grouped and classified (service-flakiness / infra / deterministic), with counts and
   which legs/drivers, not a raw dump.
2. **Flaky-vs-deterministic verdict** for anything ambiguous, backed by the specific runs compared.
3. **Recommended actions** — ignore (flaky/service), retry, or file a bug; and for bugs, a ready-to-paste
   Description with direct error-line links.

Keep the narrative tight; lean on links for depth.

---

## Reference specifics — Real Service End to End Tests
- Pipeline **definitionId 56** ("Real Service End to End Tests"), runs on `main` (and release branches) on a schedule.
- Legs (matrix, one job per driver): **Run** (default), **Oldest-Compatible-Version**, **N-2ToLTS+1-back-compat**,
  **Non-compat**, **N-1**, **Cross-Client**. Each leg fans out across drivers via `test:realsvc:<driver>:report`.
- Known flaky signatures to discount: FRS `Document not found`; `[r11s-frs]` stashed-ops blob-upload timeouts;
  `[t9s]` 5000ms timeouts; undici `parser.deref(...)` socket destructure.
- The mocha report per driver ends with `N passing / N pending / N failing` followed by a numbered failure list —
  that block is the payload; everything above it is noise.
