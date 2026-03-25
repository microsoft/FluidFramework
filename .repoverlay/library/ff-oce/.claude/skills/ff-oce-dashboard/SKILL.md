---
name: ff-oce-dashboard
description: "Generate the OCE shift status dashboard. Triggers on: 'generate shift dashboard', 'show dashboard', 'shift status', 'status dashboard', 'what's going on', or any request for a NON-SPECIFIC overview of current OCE status (incidents, pipelines, errors)."
version: 1.0.0
---

# OCE Shift Status Dashboard

Gathers data from multiple MCP servers in parallel and presents a consolidated shift status dashboard. Best-effort — partial results are always shown.

## Procedure

### Step 0: Confirm with the user

Before gathering any data, use the `ask_user` tool:

**Question:** "Would you like me to generate a shift status dashboard? This will query IcM, ADO, Kusto, Teams, and WorkIQ and may trigger auth prompts. Make sure you're connected to **VPN** first — it's required for Kusto and other internal services."

**Choices:** "Yes", "Yes, and write it to a file", "No"

- If **No**: respond "No problem — what can I help you with?" and stop.
- If **Yes**: proceed to Step 1. Present the dashboard in the console.
- If **Yes, and write it to a file**: proceed to Step 1. Write the dashboard to `oce-dashboard-<YYYYMMDD-HHmmss>.md` in the current working directory instead of printing it to the console. Just confirm the filename when done.

### Step 1: Launch 6 background agents in parallel

Use the `task` tool with `mode: "background"` for each. Instruct each agent to **always terminate** — either return its results or respond with "FAILED: \<reason\>" if the tool call errors or auth fails. Agents must never hang or retry indefinitely.

> **CRITICAL:** Background agents do **not** inherit the agent prompt context. Each sub-agent prompt must be **self-contained** with all IDs, parameters, and tool-call details it needs. Use the templates below — do not construct prompts from memory.

#### Agent 1 — IcM Incidents

Call `icm-search_incidents_by_owning_team_id` for each team: **98481** (FF Hot), **149377** (Fluid Framework Client), **98313** (Azure Fluid Relay Client). Only include **Active** and **Mitigated** incidents — exclude Resolved. Report ID, Sev, Title, Status, Team, Created date.

#### Agent 2 — ADO Pipeline Health

Call `ado-pipelines_get_builds` for each pipeline definition (**12** = Build, **56** = E2E, **63** = Stress) with `project: "internal"`, `branchName: "refs/heads/main"`, `statusFilter: "Completed"`, `top: 3`, `queryOrder: "FinishTimeDescending"`. Result codes: **2** = ✅, **4** = ⚠️, **8** = ❌. Report build ID, result, finish time, and overall trend.

#### Agent 3 — Loop-FF Integration Pipeline

Call `ado-office-pipelines_get_builds` with `project: "OC"`, `definitions: [29163]`, `top: 5`, `queryOrder: "FinishTimeDescending"`. **Important:** Use the `ado-office` MCP server tools (NOT the default `ado` tools) — this pipeline is in the `office` ADO org, not `fluidframework`. Result codes: **2** = ✅, **4** = ⚠️, **8** = ❌. Report build ID, result, finish time, branch, and build number. Flag any failures — a failing integration pipeline means the next FF bump to Loop will break.

#### Agent 4 — Kusto Error Rates

Do **not** load the ff-oce-kusto skill. Call `kusto-kusto_query` with `cluster_uri: "https://kusto.aria.microsoft.com"`, `database: "6a8929bcfc6d44e9b13fee392ada9cf0"`, and this query:

```kql
Office_Fluid_FluidRuntime_Error
| where Event_Time > ago(1h)
| summarize ErrorCount = count() by AppName = tostring(App_Name)
| order by ErrorCount desc
| take 15
```

If it fails, retry with a simple `summarize ErrorCount = count()` fallback (no `by` clause). Report as a table: Partner, Error Count.

#### Agent 5 — Teams Pipeline Alerts

Call `teams-ListChannelMessages` with teamId `9ce27575-2f82-4689-abdb-bcff07e8063b`, channelId `19:25dabf309c5c42a7abe4647c7c1b7990@thread.skype`, top 50. Filter for messages from Azure DevOps in the last 2 weeks. Classify each as **Acknowledged** (has a text reply or ✅/☑️/👍/👀 reaction), **Resolved** (reply confirming fix), or **Unacknowledged** (no replies, no meaningful reactions). Report: Date, Description, Status, Action Needed.

#### Agent 6 — WorkIQ

Call `workiq-ask_work_iq`: "Do I have any pending emails, action items, or meeting follow-ups related to Fluid Framework, FF Client, FF Hot, or Fluid Relay from the last week?" Summarize any actionable items.

### Step 2: Collect results with a 90-second timeout

Use `read_agent` with `wait: true, timeout: 90` for each agent, all in parallel.

**Hard cutoff:** After this single round of `read_agent` calls, you are **done collecting data**. Do not call `read_agent` again. Do not wait for agents that are still running. If an agent's status is anything other than "completed" with results, mark that section `⚠️ unavailable — timed out` and move on to Step 3 immediately. Agents left running can be ignored — they will clean up on their own.

### Step 3: Present the dashboard

```
## 🖥️ Shift Status Dashboard
Generated: <timestamp>

### 🚨 Active IcM Incidents
| ID | Sev | Title | Status | Team | Age |
| --- | --- | --- | --- | --- | --- |

### 🔧 Pipeline Health (main, last 3 runs)
| Pipeline | Run 1 | Run 2 | Run 3 | Trend |
| --- | --- | --- | --- | --- |

### 🔗 Loop-FF Integration Pipeline (last 5 runs)
| Build ID | Result | Finished | Build Number | Notes |
| --- | --- | --- | --- | --- |

### 📊 Error Rates (last 1h)
| Partner | Error Count | Notes |
| --- | --- | --- |

### 🔔 Integration Pipeline Alerts (FF Client OCE channel, last 2 weeks)
| Date | Description | Status | Action Needed |
| --- | --- | --- | --- |

### 📋 WorkIQ
(summary)
```

For any section with no data, show "✅ None". For failed services, show "⚠️ [Service] unavailable — reason".
