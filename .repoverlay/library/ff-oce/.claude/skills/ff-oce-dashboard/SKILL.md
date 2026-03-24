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

**Question:** "Would you like me to generate a shift status dashboard? This will query IcM, ADO, Kusto, Teams, and WorkIQ and may trigger auth prompts."

**Choices:** "Yes", "Yes, and write it to a file", "No"

- If **No**: respond "No problem — what can I help you with?" and stop.
- If **Yes** or **Yes, and write it to a file**: proceed to Step 1. Remember the choice for Step 3.

### Step 1: Launch 5 background agents in parallel

Use the `task` tool with `mode: "background"` for each. When writing each agent's prompt, **include the specific IDs, GUIDs, and constants it needs** from the Quick Reference — background agents do not inherit the agent prompt context.

- **IcM**: Report all active/mitigated incidents across the OCE teams. *(Include the three team IDs.)*
- **ADO**: Report recent pipeline health for Build, E2E, and Stress on `main`. *(Include the pipeline definition IDs, org, project, and result code meanings.)*
- **Kusto**: Run a lightweight error-rate snapshot (last 1 hour, by partner).
- **Teams**: Report unacknowledged integration pipeline alerts from the last 2 weeks. *(Include the FF Hot channel team/channel IDs, the sender to filter for, and the acknowledgment classification rules.)*
- **WorkIQ**: Report any pending items tagged FF Client, FF Hot, or Fluid Framework.

### Step 2: Collect results with a 60-second timeout

Use `read_agent` with `wait: true, timeout: 60` for each agent, all in parallel. Any agent that times out or errors → mark that section `⚠️ unavailable` and move on.

### Step 3: Present the dashboard

```
## 🖥️ Shift Status Dashboard
Generated: <timestamp>

### 🚨 Active IcM Incidents
| ID | Sev | Title | Status | Team | Age |

### 🔧 Pipeline Health (main, last 3 runs)
| Pipeline | Run 1 | Run 2 | Run 3 | Trend |

### 📊 Error Rates (last 1h)
| Partner | Error Count | Notes |

### 🔔 Integration Pipeline Alerts (FF Hot, last 2 weeks)
| Date | Description | Status | Action Needed |

### 📋 WorkIQ
(summary)

### ⚠️ Unavailable Services
(omit if all succeeded)
```

For any section with no data, show "✅ None". For failed services, show "⚠️ [Service] unavailable — reason".

If the user chose **"Yes, and write it to a file"**, also write the dashboard to `oce-dashboard-<YYYYMMDD-HHmmss>.md` in the current working directory.
