---
name: ff-oce-kusto
description: "Use this skill for any Kusto query or telemetry investigation specifically related to Fluid Framework or its partners. Triggers include: writing or running a Kusto query against the Office Fluid database, investigating Fluid Framework telemetry or error rates, querying Office_Fluid_FluidRuntime_* tables, looking up a Fluid session by Session_Id or docId, investigating a Fluid-related error in Loop or Whiteboard telemetry, monitoring an FF bump or partner ring deployment, checking Fluid render reliability or Scriptor errors, or when the user mentions Fluid-specific tables (Office_Fluid_FluidRuntime_*, OwhLoads, HostTracker, Scriptor) or Fluid-specific error types (dataCorruptionError, dataProcessingError, DeltaConnectionFailureToConnect, ICE, ACE). Do NOT trigger for general Kusto questions that are not related to Fluid Framework."
version: 1.0.0
---

# Fluid Framework Kusto Reference

This skill provides a comprehensive reference for Fluid Framework telemetry investigation in Kusto. Load it whenever a Kusto query needs to be written, interpreted, or run against the Office Fluid database.

> **VPN required.** The Office Fluid Kusto cluster (`https://kusto.aria.microsoft.com`) is only reachable on the Microsoft internal network. If a query fails to connect or returns no results unexpectedly, remind the user to check that their VPN is on before troubleshooting further.

## Cluster & Access

- **Cluster:** `https://kusto.aria.microsoft.com`
- **Primary database:** `Office Fluid`
- **Retention:** ~28 days
- **VPN:** Required (Microsoft internal network)
- **Access requirement:** M365HeartbeatTenantUsers group membership

## Quick Orientation

The primary tables are:
- `Office_Fluid_FluidRuntime_Error` — all errors (first stop)
- `Office_Fluid_FluidRuntime_Performance` — timing events
- `Office_Fluid_FluidRuntime_Generic` — everything else
- `union Office_Fluid_FluidRuntime_*` — all three at once
- `OwhLoads` (stored function) — denominator for ICE/ACE error rate queries

Key correlation ID hierarchy: `Session_Id`/`Data_hostCorrelationId` → `Data_docId` → `Data_containerId`

Key deployment ring field: `Loop_Audience` (FluidRuntime tables), `Release_AudienceGroup` (OWH/QoS tables)

## Using the Full Reference

Before writing any non-trivial Kusto query, read the full reference file:

**`references/kusto-query-reference.md`**

This 1,400-line reference contains:
- **Part 1** — All tables, fields, correlation IDs, version fields, stored functions, partner database schemas (OneNote, OWA, Loop FFX, Video, Scriptor, HostTracker, automation)
- **Part 2** — Query Cookbook with ~20 sections of ready-to-use queries (session lookup, error timecharts, breadth assessment, version correlation, ICE rate calculations, EU global queries, ODSP flight changes, etc.)
- **Part 3** — Investigation playbook patterns (incoming partner incident, dataCorruptionError triage, ICE error rate, important notes)
- **Part 4** — Additional query sections: FF bump tracking (5 queries), render reliability, Scriptor errors, Video telemetry (10+ queries), container reconnects / `WhyIsTheContainerStuck()`, stress test automation (`FindBuildErrors`, `DidSummarizerRecover`, `SummarizerView`)

## Key Reminders

- Always use **absolute timestamps** in IcM notes (not `ago()`) so queries remain reproducible
- Always filter `Data_stack !has '.goskope.com'` and `Data_channelFactoryType !has '.myshn.net'` in corruption queries to exclude known reverse proxies
- The `hll()` / `dcount_hll(hll_merge(...))` pattern is required for EU-compliant distinct user counts across clusters
- For EU data, use `macro-expand force_remote = true officefluid_global as X (...) | summarize ...`
- `Loop_Audience` (FluidRuntime) and `Release_AudienceGroup` (OWH/QoS) are the same concept; filter `== "Production"` to exclude dogfood noise
