# Fluid Framework On-Call Kusto Query Reference

This document is a comprehensive reference for Fluid Framework telemetry investigation. It is organized into two parts:
1. **Column & Table Reference** — what every significant field means and how to use it
2. **Query Cookbook** — real queries used in investigations, with context explaining what problem they solved

**Cluster:** `https://kusto.aria.microsoft.com`
**Primary database:** `Office Fluid`
**Data retention:** ~28 days
**VPN requirement:** Required since June 2024 (Microsoft IP)

---

## Part 1: Tables & Column Reference

### 1.1 Table Overview

| Table | Purpose |
|---|---|
| `Office_Fluid_FluidRuntime_Error` | All errors emitted by the Fluid runtime. Should be empty for a healthy session. First stop in any investigation. |
| `Office_Fluid_FluidRuntime_Performance` | Performance (timing) events. Emitted in `_start` / `_end` / `_cancel` pairs for every measured operation. `_cancel` events often appear in the Error table instead. |
| `Office_Fluid_FluidRuntime_Generic` | Everything else — informational events, state change notifications, container load stats, etc. |
| `Office_Fluid_OfficeWebHost_Activity_LoadComponentInIframe` | OWH (OfficeWebHost) activity events for the LoadComponentInIframe scenario. Used as a denominator for ICE/ACE error-rate queries. |
| `Office_Fluid_OfficeWebHost_Activity_LoadComponentInDiv` | Same as above, for the LoadComponentInDiv scenario. |
| `Office_Fluid_QoS_Error` | Quality-of-Service error events from the OWH layer — coarser than the FluidRuntime tables, but important for monitoring. Used with `CubeFilter_OwhQoSContainerPostBootError()` and `OWHIsICE()`. |
| `database("OneNote Fluid").reportdata` | OneNote's Fluid telemetry. Different schema — uses `EventInfo_Time`, `Message` (JSON blob), `Namespace`, `SessionId`, `CorrelationId`. |
| `database("Outlook Web").client_event` | OWA's telemetry. Uses `EventName`, `EventInfo_Time`, `MiscData` (JSON blob). **WARNING: Uses sampling.** Requires `olkwebar` security group membership. |
| `cluster('fcmdata.kusto.windows.net').database('FCMKustoStore').ChangeEvent` | FCM flight/killswitch change log. Used to correlate error spikes with deployment events on ODSP. |
| `Office_Fluid_HostTracker_Activity_RenderComponentByHost` | Host-level render reliability events from the HostTracker telemetry pipeline (Loop FFX). `Activity_Result_Type == "Failure"` = failed renders. See section 2.21. |
| `Office_Fluid_Scriptor_Error` | Errors from Scriptor — the FFX subcomponent host. Filtered by `Data_scriptorLogArea` (e.g. `'FluidComponentHost'`, `'GuestComponents'`, `'FluidBasedLoopComponent'`). |
| `Office_Fluid_Scriptor_Activity_DelegatedRender` | Subcomponent render activity events. Used for render reliability of individual delegated components. `Data_delegatedComponentIdentityName` identifies the component. |
| `Office_Fluid_Video_Error` | Video component errors. Key fields: `Data_loopRegistrationId` (e.g. `@fluidx/video`), `Data_errorCode`, `Data_errorMessage`. |
| `Office_Fluid_Video_Activity_VideoRecorderLoad` | Video recorder load events. `Activity_Duration` (in µs — multiply by 0.001 for ms). `Activity_Success` for success/failure. |
| `Office_Fluid_Video_Activity_VideoUpload` | Video upload events. Keyed by `Data_webRecorderCorrelationId`. |
| `Office_Fluid_Video_Activity_VideoLoadFromUnfurl` | Video load from stream unfurling. Keyed by `Data_unfurlCorrelationId`. |
| `Office_Fluid_Video_Activity_GetPersonalOdbUrl` | ODB URL fetch events. `Activity_Success == false` signals failures. `Data_isExpected` marks expected failures (e.g. 404 for users without ODB). |
| `Office_Fluid_Video_Activity_CreateRedeemableSharingLink` | Sharing link creation events for video. `Activity_Success == 'false'` for failures. |
| `Office_Fluid_Video_Generic_Request` | Raw HTTP request events from the video component. Fields: `Data_status` (HTTP status code), `Data_clientRequestId`, `Data_requestId`, `Data_spRequestGuid`. |
| `office_fluid_ffautomation_error` | **Database: "Office Fluid Test" (ID `742fa5a288b045e5beab1a2b8e445a71`)** — NOT in the primary "Office Fluid" database. Errors from stress test / automation runs. Key columns: `Data_buildId`, `Data_driverType`, `Data_driverEndpointName` (values: `frs`, `frsCanary`, `odsp`, `odsp-df`, `local`), `Data_profile`, `Data_branch`, `Data_docId`, `Data_containerId`, `Data_eventName`, `Data_error`, `Data_errorType`, `Data_message`, `Data_stack`. Filter: `Data_hostName == "@fluid-internal/test-service-load"`. Note: tenant ID and service endpoint URLs are NOT logged in telemetry. |
| `office_fluid_ffautomation_performance` | Same database as above. Performance/timing events from automation runs. Same key columns as `_error`. |
| `office_fluid_ffautomation_generic` | Same database as above. Informational events from automation runs. Same key columns as `_error`. |
| `union office_fluid_ffautomation_error, office_fluid_ffautomation_performance, office_fluid_ffautomation_generic` | All automation tables. **Do NOT use wildcard `office_fluid_ffautomation*`** — the wildcard syntax does not resolve in this database. Always enumerate the three tables explicitly. |
| `cluster('https://stream.eastus2.kusto.windows.net').database("OnePlayer").*` | OnePlayer (Stream video player) telemetry. Key fields: `playbackSessionId`, `userId`, `odspItemId`, `hostComponent`, `hostApp`, `result` (`"Fatal"` = error), `name`, `message`. EU cluster: `cluster('https://streameu.northeurope.kusto.windows.net')`. |

**Shorthand for all FluidRuntime tables:**
```kusto
union Office_Fluid_FluidRuntime_*
```

**Shorthand for all Error tables across Fluid + partners:**
```kusto
union kind=outer database("Office Fluid").*Runtime*_Error
```

---

### 1.2 Core Timestamp & Ordering Fields

These fields are present on every event in every FluidRuntime table.

| Field | Type | Description |
|---|---|---|
| `Event_Time` | datetime | Client-side timestamp (UTC). Use this for most time-range filters and timecharts. |
| `Event_ReceivedTime` | datetime | Ingestion-service timestamp (UTC). Lags `Event_Time` slightly. Use for recency checks like `> ago(3d)` when you want events that arrived recently, even if the client clock was off. |
| `Event_Sequence` | long | Monotonically increasing sequence number per `Session_Id`. When multiple events share the same `Event_Time`, sort by `Event_Time, Event_Sequence` to reconstruct correct order. |
| `Event_Name` | string | Namespace/table identifier — e.g. `fluid:telemetry:Container:Load_end`. Also called "event namespace." Useful for filtering when you know the exact namespace of an event. |

**Typical time filter patterns:**
```kusto
| where Event_Time > ago(3d)
| where Event_Time > ago(5h)
| where Event_Time between (datetime(2025-11-01) .. datetime(2025-11-15))
```

---

### 1.3 Correlation ID Fields

Understanding these IDs is the foundation of every investigation. They form a hierarchy from broad to narrow.

| Field | Scope | Description |
|---|---|---|
| `Session_Id` | App session | Unique per tab/window lifetime. Maps to a single user opening a browser tab. May contain multiple documents and multiple Fluid sessions. This is what Loop shows in the **About** dialog (ellipsis → About). Also logged when a user submits feedback. |
| `Data_hostCorrelationId` | Same as `Session_Id` | The host app's term for the same session ID. In the FluidRuntime tables this field is `Data_hostCorrelationId`; the corresponding column across all Office events is `Session_Id`. They are the same value. |
| `Data_pageCorrelationId` | Document session | A single document open within a session. One `Session_Id` may have multiple `pageCorrelationId`s if the user navigates between documents without reloading. Maps 1:1 to a `docId`. |
| `Data_docId` | Document identity | Stable, unique document ID. Does not change between sessions. Use to find all sessions (across time) that ever opened a particular document. |
| `Data_loaderId` | Fluid loader instance | One loader is created per app session by the host. The summarizer agent shares the same `loaderId` as the interactive client, which is why it's useful for correlating the two. |
| `Data_containerId` | Fluid container instance | One container per document per loader. Use to isolate all events for a specific document within a session. |
| `Data_clientId` | PUSH session | Unique ID for a PUSH (ordering service) connection. A given document session will have multiple `clientId`s since PUSH sessions expire every ~15 minutes. Stored in the file — usable to identify a user if you have access to the document. |
| `Data_pendingClientId` | Pending PUSH connection | The "future" clientId issued during the `Connecting` state, before the client reaches `Connected`. |
| `Data_socketDocumentId` | PUSH session document | Unique identifier of the PUSH server session. Stays stable as long as at least one client is connected to the document. |
| `Data_sprequestguid` | SPO HTTP request | SharePoint/ODSP correlation ID for HTTP fetch requests (snapshot, ops, versions). Appears on connectivity events (`TreesLatest_end`, `TreesLatest_cancel`). Use to correlate with ODSP/Jarvis logs. |

**Correlation ID hierarchy:**
```
Session_Id (1 browser tab)
  └─ Data_pageCorrelationId (1 doc session within tab)
       └─ Data_docId (stable doc identity)
            └─ Data_loaderId (Fluid loader, shared with summarizer)
                 └─ Data_containerId (per-document Fluid container)
                      └─ Data_clientId (per-PUSH-session)
```

---

### 1.4 Version & Build Fields

| Field | Source | Description |
|---|---|---|
| `Data_loaderVersion` | Loader | Version of the Fluid Loader package. **Tied to the host app build** — e.g. if Loop deploys a new host build, `loaderVersion` changes. Every event from the loader has this field. |
| `Data_runtimeVersion` | Runtime | Version of the Fluid ContainerRuntime. **Tied to the container deployment** (the `Data_containerCodeDetailsName`). Different from `loaderVersion` because the runtime is delivered per-container, not per-host. |
| `Data_driverVersion` | Driver | Version of the Fluid driver (typically the ODSP driver for first-party partners). In many partners this is service-delivered and independent from loader and runtime. |
| `App_Version` | Host | Host application version. In the Fluid Preview app, this maps directly to the Fluid package version used. |
| `Data_containerCodeDetailsName` | Container | Identifies the deployed container package, e.g. `@fluidx/loop-page-container`, `@ms/office-fluid-container`, `@ms/onenote-meetings`. `runtimeVersion` is tied to this. |

**Key insight:** When diagnosing regressions:
- If errors correlate with a `loaderVersion` change → the host (Loop, Teams, etc.) deployed a new build
- If errors correlate with a `runtimeVersion` change → the container (Loop page, OneNote, etc.) deployed a new schema/runtime
- If errors correlate with a `driverVersion` change → a driver-side change is implicated

---

### 1.5 Error & Event Name Fields

| Field | Description |
|---|---|
| `Data_eventName` | Full telemetry event name as emitted in code, e.g. `fluid:telemetry:Container:Load_end`. Note: code uses `Load`, telemetry shows `Load_end` / `Load_start` / `Load_cancel`. Search with `contains` when you don't know the exact suffix. |
| `Data_error` | Error message string. Usually enough to identify the problem. Present on all Error table events and on some non-error events. |
| `Data_errorType` | Categorization of the error. Key values: `dataCorruptionError`, `dataProcessingError`, `authorizationError`. Determines which TSG to follow. |
| `Data_reason` | Additional context, especially on connectivity events. Often contains structured detail like disconnect reason codes. |
| `Data_stack` | Stack trace. Used primarily in `dataCorruptionError` investigations. Also used to filter out known reverse proxies (`.goskope.com`, `.myshn.net`). |

**Performance event naming pattern:**
- `fluid:telemetry:Container:Load_start` — operation began
- `fluid:telemetry:Container:Load_end` — operation succeeded
- `fluid:telemetry:Container:Load_cancel` — operation failed (often also in the Error table)

---

### 1.6 Connectivity-Specific Fields

These fields appear on connectivity and performance events.

| Field | Description |
|---|---|
| `Data_online` | Whether the client was online when this event was emitted. |
| `Data_duration` | Duration of the operation in milliseconds (on `_end` and `_cancel` events). |
| `Data_attempts` | Number of retry attempts for the operation. |
| `Data_dmLastMsqSeqNumber` | Sequence number of the last op observed by the container. On close/disconnect events. |
| `Data_dmLastMsqSeqTimestamp` | Timestamp of the last op observed by the container. |

---

### 1.7 App Identification Fields

These fields identify which partner app or host generated the telemetry. **Use `App_Name` (not `AppName`) for partner-level breakdowns.**

| Field | Type | Description |
|---|---|---|
| `App_Name` | string | Clean partner app name. Common values: `"Loop App"`, `"Teams"`, `"Outlook"`, `"Office.com"`, `"OneNote"`, `"Whiteboard"`, `"AIHub"`, `"Excel"`, `"Word"`, `"PowerPoint"`, `"Edge"`, `"Outlook_iOS"`, `"Outlook_Android"`, `"OfficeMobile"`, `"TeamSpace_Android"`, `"Loop"` (mobile), `"Microsoft Planner"`, `"Unknown"`. Use this field for baseline health checks and partner-level error breakdowns. |
| `App_Platform` | string | Platform of the host app. Common values: `"Web"`, `"Win32"`, `"iOS"`, `"Android"`. |
| `App_Version` | string | Host application build version. In the Fluid Preview app, maps directly to the Fluid package version. |
| `Data_hostName` | string | Host app identifier from the Fluid loader perspective. More granular than `App_Name` — e.g. `"Loop"`, `"LoopEmbed"`, `"Teams"`, `"Whiteboard"`. |

> **`App_Name` vs `Data_hostName`:** `App_Name` gives clean, user-friendly partner names (good for dashboards and high-level health checks). `Data_hostName` is more granular and distinguishes sub-hosts (e.g. `"Loop"` vs `"LoopEmbed"`). Use `App_Name` for shift baseline queries and `Data_hostName` for detailed investigations.

---

### 1.8 Client Type & Agent Fields

| Field | Values | Description |
|---|---|---|
| `Data_clientType` | `"interactive"`, `"summarizer"`, others | Distinguishes human users from agent processes. `"interactive"` = a human user's client. Any other value (including empty) in driver events = unknown. The summarizer agent is the oldest read-write client in the session and is spawned to maintain summaries. It boots faster than interactive clients (due to caching) and produces duplicate events (e.g. multiple Load events per session). Always filter by `Data_clientType == "interactive"` when you want user-facing impact only. |

---

### 1.9 Deployment Ring / Audience Fields

| Field | Table origin | Description |
|---|---|---|
| `Loop_Audience` | FluidRuntime tables | Deployment ring from the Loop perspective. Common values: `"Dogfood"`, `"MSIT"`, `"Production"`, `"Preview"`. |
| `Release_AudienceGroup` | OWH/QoS tables | Same concept as `Loop_Audience` but for SPO ring. Values: `"SPDF"`, `"MSIT"`, `"Production"`. |

Both fields effectively represent which deployment ring the data is from. Use `Loop_Audience` in the FluidRuntime tables and `Release_AudienceGroup` in the OWH tables.

---

### 1.10 OWH-Specific Fields

These fields appear in the `Office_Fluid_OfficeWebHost_*` and `Office_Fluid_QoS_*` tables.

| Field | Description |
|---|---|
| `Activity_Success` | Boolean flag on activity events. `0` = failure. Used in `dcountif` to compute failure rates. |
| `Data_message` | Error message on QoS/activity events. Often contains the HTTP status code, e.g. `"Error 404"`, `"Error 403"`. |
| `Data_isAce` | Whether the error is classified as an ACE (Actionable Client Error — unexpected, investigate) vs. ICE (Informational/Expected Client Error — expected, monitor rate). |
| `Data_hostCorrelationId` | Present on OWH events as well; same session-level correlation ID. Used to join OWH tables with FluidRuntime tables. |

---

### 1.11 Data Corruption Investigation Fields

These fields appear in `Office_Fluid_FluidRuntime_Error` for `dataCorruptionError` events.

| Field | Description |
|---|---|
| `Data_channelFactoryType` | For `channelFactoryNotRegisteredForGivenType` errors: the channel factory type that was not found, e.g. a Graph URL like `https://graph.microsoft.com/types/counter`. Also used to filter reverse proxy traffic (`.myshn.net`). |
| `Data_dataStorePackagePath` | Package path of the datastore that caused the error. Useful for finding the owning team. |
| `Data_packageName` | Package name missing from registry (for `dataProcessingError` "Registry does not contain entry" errors). |
| `Data_fullPackageName` | Full package name, alternative to `Data_packageName` if the latter is empty. |
| `Data_createContainerRuntimeVersion` | The runtime version that was used when the container (document) was originally created. Found via `ContainerLoadStats` events in the Generic table. Used to determine if a `channelTypeNotAvailable` document predates a known fix. |

---

### 1.12 Kusto Functions (Office Fluid database)

These are stored functions in the `Office Fluid` Kusto database that simplify common patterns.

| Function | Description |
|---|---|
| `OwhLoads` | Returns all OWH load events (`Office_Fluid_OfficeWebHost_Activity_LoadComponentInIframe` UNION `Office_Fluid_OfficeWebHost_Activity_LoadComponentInDiv`). Used as the standard denominator for computing ICE/ACE error rates. Filter by `Release_AudienceGroup` on the result. |
| `CubeFilter_OwhQoSContainerPostBootError()` | Invoked on `Office_Fluid_QoS_Error` to filter to post-boot container errors only. Standard filter in ICE rate queries. |
| `getDataCorruptionErrors(startDt, endDt, containerCodeDetailsName)` | Returns data corruption errors for a given container and time range. Used from the Geneva "Diagnose trend" button in IcM. |
| `getDataProcessingErrors(startDt, endDt, containerCodeDetailsName)` | Same as above but for `dataProcessingError` type. |
| `DataCorruptionKnownDocIds` | Table of previously-seen corrupted document IDs with a `firstSeen` timestamp. Join with error results to determine if a document is newly corrupted or a known case. |
| `OWHIsICE()` | Invoke on OWH error events to classify as ICE (expected). Used in LiveSite ICE investigations. |
| `WhyIsTheContainerStuck(containerId)` | Returns a JSON object explaining why a container is stuck/disconnected — includes `eventName`, `message`, `error`, `reason` fields. Call with the `Data_containerId` from any session event. |

---

### 1.13 Loop FFX / Render / Video Fields

These fields appear in the Loop FFX telemetry tables (`HostTracker`, `Scriptor`, `Video`).

| Field | Table(s) | Description |
|---|---|---|
| `Activity_Result_Type` | `HostTracker`, `Scriptor` | Result of an activity: `"Success"` or `"Failure"`. Use `Activity_Result_Type == "Failure"` to filter failed renders. Different from `Activity_Success` (bool) used in OWH tables. |
| `Activity_Duration` | `Video_Activity_*` | Duration of the activity in **microseconds**. Multiply by `0.001` to get milliseconds. |
| `Data_delegatedComponentIdentityName` | `Scriptor_Activity_DelegatedRender` | The name of the subcomponent being rendered, e.g. a specific Loop component type. Use to filter render reliability for a particular component. |
| `Data_scriptorLogArea` | `Scriptor_Error` | Categorizes the Scriptor log area. Common values: `'FluidComponentHost'`, `'GuestComponents'`, `'FluidBasedLoopComponent'`, `'URLUnfurling'`, `'NonFluidLoopComponent'`. |
| `Data_loopRegistrationId` | `Video_*` | Loop component registration ID, e.g. `'@fluidx/video'`. Identifies the Loop component type responsible for the telemetry. |
| `Data_unfurlCorrelationId` | `Video_Activity_VideoLoadFromUnfurl` | Correlation ID for a stream unfurling operation. Use to trace all events for a single unfurl attempt. |
| `Data_webRecorderCorrelationId` | `Video_Activity_VideoUpload`, `Video_Error` | Correlation ID for a video recording session. Use to trace recording and upload events. |
| `Data_isExpected` | `Video_Activity_GetPersonalOdbUrl` | Boolean: `true` if the error is expected (e.g. 404 for users without ODB). If this column doesn't exist in a query result, the error was unexpected. |
| `Data_loopAudience` | Some FluidRuntime / automation tables | Deployment ring, similar to `Loop_Audience`. May appear as `Data_loopAudience` (lowercase `loop`) in some tables/contexts. |

---

### 1.14 Partner / External Database Fields

#### OneNote Fluid (`database("OneNote Fluid").reportdata`)

| Field | Description |
|---|---|
| `EventInfo_Time` | Timestamp (equivalent to `Event_Time` in FluidRuntime tables) |
| `Namespace` | Identifies source, e.g. `'OneNotePreviewCanvas'` for OneNote Fluid events |
| `Message` | JSON blob containing all event data — parse with `parse_json(Message)`. Access fields as `d.category`, `d.eventName`, `d.error`, `d.docId`. |
| `SessionId`, `CorrelationId`, `d.hostId`, `DeviceInfo_Id` | Various correlation IDs — semantics not fully documented |
| `AppInfo_version` | Application version |

#### Outlook Web (`database("Outlook Web").client_event`)

| Field | Description |
|---|---|
| `EventName` | Event type. Key values: `"FluidComponentLoaded"`, `"FluidComponentError"`, `"BohemiaLogger_Error"`, `"BohemiaLogger_Event"`, `"BohemiaLogger_Perf"` |
| `EventInfo_Time` | Timestamp |
| `MiscData` | JSON blob containing all data — parse with `parse_json(MiscData)`. Access as `s.docId`, `s.OwaScenario_1`, etc. |
| `s.OwaScenario_1` | `1` = Compose, anything else = Reading |

---

## Part 2: Query Cookbook

### 2.1 Connection Setup & Access

**Cluster and database:**
- Cluster: `https://kusto.aria.microsoft.com`
- Database: `Office Fluid`
- Requires: M365HeartbeatTenantUsers group membership, VPN (since June 2024)

**Switch databases in the same cluster:**
```kusto
database("Office Fluid").Office_Fluid_FluidRuntime_Error
database("OneNote Fluid").reportdata
database("Outlook Web").client_event
```

**Cross-cluster (FCM flight data):**
```kusto
cluster('fcmdata.kusto.windows.net').database('FCMKustoStore').ChangeEvent
```

---

### 2.2 Starting Point: All Events for a Session or Document

**The most common first step in any investigation — get everything for a session and look at the flow:**

```kusto
// All events for a known Session_Id
let SessionId = "db9d4fe5-f9cc-480c-a15c-52e269278a44";
union Office_Fluid_FluidRuntime_*
| where Session_Id == SessionId
| project-reorder Event_Time, Data_docId, Event_Name, Data_eventName,
                  Data_error, Data_reason, Data_duration, Data_attempts,
                  Data_online, Data_sprequestguid
```
*Source: partner-incidents OCE playbook. The `project-reorder` puts the most useful columns first while keeping all others. Swap `Session_Id` for `Data_docId`, `Data_containerId`, or `Data_hostCorrelationId` depending on what ID you have.*

```kusto
// All events for a known docId
let DocId = "abc123";
union Office_Fluid_FluidRuntime_*
| where Data_docId == DocId
| sort by Event_Time asc, Event_Sequence asc
```

---

### 2.3 Finding Fluid Versions and IDs from a HostCorrelationId

**Given a hostCorrelationId (from Loop's About dialog, feedback, or a partner report), find all Fluid versions and loader/container IDs in that session:**

```kusto
union Office_Fluid_FluidRuntime_*
| where Data_hostCorrelationId == "7bf699fc-eded-4080-8ae7-f3a5e8ff50c9"
| summarize make_set(Data_loaderVersion),
            make_set(Data_driverVersion),
            make_set(Data_runtimeVersion),
            make_set(Data_clientType)
  by Data_loaderId, Data_containerId
```
*Source: working-with-telemetry. The `by Data_loaderId, Data_containerId` groups results so you can see the summarizer (same `loaderId`, different `containerId`) vs. interactive clients side by side. `Data_clientType == "interactive"` is the human; the summarizer will show differently.*

---

### 2.4 Extracting Sample IDs from an Aggregation

**When you have a query summarizing counts across dimensions and want to drill into a specific session:**

```kusto
union Office_Fluid_FluidRuntime_*
| where Event_ReceivedTime > ago(3d)
| where Data_error has "429"
| summarize count(), dcount(Session_Id), dcount(Data_docId),
            take_any(Session_Id, Data_docId)  // <-- add this to get sample IDs
  by Data_containerCodeDetailsName
```
*Source: partner-incidents playbook. `take_any()` picks one representative record per group and returns those fields — gives you a concrete `Session_Id` or `Data_docId` you can paste into a deep-dive query.*

---

### 2.5 Error Timechart — Overall Volume Over Time

**Baseline health check: are Fluid errors trending up or down?**

```kusto
// All runtime errors, past 30 days
union kind=outer database("Office Fluid").*Runtime*_Error
| where Event_Time > ago(30d)
| summarize count() by bin(Event_Time, 1d)
| render timechart
```
*Source: working-with-telemetry. Good for a shift health check or for identifying when an error spike started.*

**Scoped to a specific error type:**
```kusto
Office_Fluid_FluidRuntime_Error
| where Data_errorType == "dataCorruptionError"
    and Data_error == "packages is undefined"
    and Data_stack !has '.goskope.com'
    and Data_stack !has '.myshn.net'
    and Data_channelFactoryType !has '.myshn.net'
| summarize count() by bin(Event_Time, 1h)
| render timechart
```
*Source: datacorruptionerror TSG. The `.goskope.com` / `.myshn.net` / `channelFactoryType` filters exclude known reverse proxies that generate noise.*

---

### 2.6 Impact Breadth Assessment

**When a partner reports an error, independently corroborate their impact numbers with raw Fluid telemetry:**

```kusto
// Example: 429 throttling errors — breadth by container type
union Office_Fluid_FluidRuntime_*
| where Event_ReceivedTime > ago(3d)
| where Data_error has "429"
| summarize count(),
            dcount(Session_Id),               // unique affected sessions
            dcount(Data_docId),               // unique affected documents
            make_set(Data_hostName),          // which host apps (Loop, Teams, etc.)
            make_set(Loop_Audience)           // which deployment rings
  by Data_containerCodeDetailsName           // which container type
```
*Source: partner-incidents playbook. Adjust the `Data_error has "429"` filter to match whatever the partner is reporting. The `dcount(Session_Id)` / `dcount(Data_docId)` split tells you breadth across sessions vs. documents (some documents are hit by many sessions).*

---

### 2.7 Version-to-Error Correlation (Time + Build)

**Determine when the symptom started and which Fluid package versions are implicated:**

```kusto
// 429 errors in Production Loop — which versions are affected?
union Office_Fluid_FluidRuntime_*
| where Event_ReceivedTime > ago(3d)
| where Data_error has "429"
| where Loop_Audience == "Production"
| where Data_hostName == "Loop App"
| summarize count(),
            dcount(Session_Id),
            dcount(Data_docId),
            min(Event_Time)                   // earliest occurrence per version combo
  by Data_loaderVersion, Data_runtimeVersion, Data_driverVersion
```
*Source: partner-incidents playbook. The `min(Event_Time)` shows when each version first saw the error. If the error only appears in versions deployed after a certain date, that pinpoints the regression. Use this to help partners choose a rollback target.*

**Layer attribution guide:**
- Errors that started at a particular `loaderVersion` → likely in the **host** (Loop, Teams) deployment
- Errors that started at a particular `runtimeVersion` → likely in the **container** (the app schema, `Data_containerCodeDetailsName`)
- Errors that started at a particular `driverVersion` → likely in the **ODSP driver**

---

### 2.8 Connectivity Investigation

**Investigate disconnect/reconnect patterns and NACKs:**

```kusto
// All connection state change events for a session
let SessionId = "db9d4fe5-f9cc-480c-a15c-52e269278a44";
union Office_Fluid_FluidRuntime_*
| where Session_Id == SessionId
| where Data_eventName contains "Connection"
| project Event_Time, Event_Sequence, Data_eventName, Data_reason, Data_online
| sort by Event_Time asc, Event_Sequence asc
```
*Source: working-with-telemetry. The `contains "Connection"` catches all `ConnectionStateChange_*` variants without needing the exact name. Normal sessions see a few connects/disconnects; a reconnect loop every second indicates a problem.*

---

### 2.9 DataCorruptionError Investigation

**Step 1: Find which documents reported corruption recently:**
```kusto
// Recent corrupted docIds (RoW only) — check against known list
Office_Fluid_FluidRuntime_Error
| where Data_errorType == 'dataCorruptionError'
    and Event_Time > ago(1d)
    and Data_stack !has '.goskope.com'
    and Data_stack !has '.myshn.net'
    and Data_channelFactoryType !has '.myshn.net'
| distinct Data_docId
| join kind=leftouter DataCorruptionKnownDocIds on Data_docId
| project Data_docId, firstSeen
```
*Source: datacorruptionerror TSG. If `firstSeen` is empty, this is a newly corrupted document. If `firstSeen` is recent and matches the incident window, it's a new regression. If `firstSeen` is old, it's likely a known flaky document.*

**Step 2: Identify which error types are spiking:**
```kusto
Office_Fluid_FluidRuntime_Error
| where Data_errorType == "dataCorruptionError"
    and Event_Time > ago(2d)
    and Data_stack !has '.goskope.com'
    and Data_stack !has '.myshn.net'
    and Data_channelFactoryType !has '.myshn.net'
| summarize dcount(Data_docId) by Data_error, Loop_Audience
| sort by dcount_Data_docId desc
```

**channelFactoryNotRegisteredForGivenType — identify owner:**
```kusto
Office_Fluid_FluidRuntime_Error
| where Event_Time > ago(2d)
    and Data_errorType == 'dataCorruptionError'
    and Data_error == 'channelFactoryNotRegisteredForGivenType'
    and Data_containerCodeDetailsName == '@ms/onenote-meetings'  // adjust as needed
    and Data_stack !has '.goskope.com'
    and Data_stack !has '.myshn.net'
    and Data_channelFactoryType !has '.myshn.net'
| summarize count() by Data_dataStorePackagePath, Data_channelFactoryType
```
*Source: datacorruptionerror TSG. The `Data_dataStorePackagePath` and `Data_channelFactoryType` identify the specific component and its owning team. The channel factory type is often a Graph URL like `https://graph.microsoft.com/types/counter`.*

**channelFactoryNotRegisteredForGivenType — verify if traffic is from reverse proxies:**
```kusto
Office_Fluid_FluidRuntime_Error
| where Data_errorType == "dataCorruptionError"
    and Data_error == "channelFactoryNotRegisteredForGivenType"
    and Data_stack !has '.goskope.com'
    and Data_stack !has '.myshn.net'
    and Data_channelFactoryType !has '.myshn.net'
| project Data_stack
```
*Source: datacorruptionerror TSG. Check `Data_stack` for unexpected CDN domains (`res.cdn.office.net.rproxy.goskope.com`) or `Data_channelFactoryType` for `.myshn.net` domains — these are known reverse proxies that generate garbage telemetry.*

**channelTypeNotAvailable — determine if documents are pre-fix:**
```kusto
let docs = Office_Fluid_FluidRuntime_Error
    | where Event_Time > ago(2d)
        and Data_errorType == 'dataCorruptionError'
        and Data_error == 'channelTypeNotAvailable'
    | distinct Data_docId;
Office_Fluid_FluidRuntime_Generic
    | lookup kind = inner docs on Data_docId
    | where Data_eventName has 'ContainerLoadStats'
    | summarize by Data_docId, Data_createContainerRuntimeVersion
```
*Source: datacorruptionerror TSG. If `Data_createContainerRuntimeVersion` is `2.0.0-internal.4.0.x` or earlier, the document was caught by a known bug already fixed. These cases are non-actionable — the document content must be copied to a new document.*

---

### 2.10 DataProcessingError Investigation

```kusto
// Timechart for a specific dataProcessingError
Office_Fluid_FluidRuntime_Error
| where Data_errorType == "dataProcessingError"
    and Data_error == "packages is undefined"
| summarize count() by bin(Event_Time, 1h)
| render timechart
```

**Registry does not contain entry — find affected package and versions:**
```kusto
union Office_Fluid_FluidRuntime_*
| where Event_Time between (datetime(2022-08-28) .. datetime(2022-08-29))
    and Data_error == 'Registry does not contain entry for the package'
| summarize dcount(Session_Id)
  by Data_packageName,
     Data_hostName,
     App_Version,
     Data_containerCodeDetailsName,
     bin(Event_Time, 5m)
| render timechart
```
*Source: dataprocessingerror TSG. `dcount(Session_Id)` shows user impact. Fine time bucketing (5m) helps see whether it's a spike (likely transient) or sustained. If `Data_packageName` is empty, try `Data_fullPackageName` instead.*

---

### 2.11 ICE (Expected) Error Rate Calculations

For ICE errors, the question is never "how many?" but "what rate?" You need a denominator.

**RoW-only: Error rate as % of OWH loads (standard denominator):**
```kusto
let resolution = 1d;
OwhLoads
| where Release_AudienceGroup == "Production"
| summarize loads = dcount(Data_hostCorrelationId) by bin(Event_ReceivedTime, resolution)
| join kind=leftouter (
    Office_Fluid_QoS_Error
    | where Data_isAce == false
    | invoke CubeFilter_OwhQoSContainerPostBootError()
    | where Data_message == "Error 404"
    | summarize 404ClosedErrorCount=dcount(Data_hostCorrelationId)
      by bin(Event_ReceivedTime, resolution)
  ) on Event_ReceivedTime
| extend 404ClosedErrorCount = iff(isempty(404ClosedErrorCount), 0, 404ClosedErrorCount)
| extend rateOf404Closed = todouble(404ClosedErrorCount) / todouble(loads) * 100
| project Event_ReceivedTime, rateOf404Closed
| render timechart
```
*Source: ICE TSG. The `leftouter` join is critical — without it, time buckets with zero errors are dropped and the chart looks wrong. Always `iff(isempty(...), 0, ...)` after the join.*

**Global (RoW + EU) version of the same query:**
```kusto
let resolution = 1d;
let audience = "Production";
macro-expand force_remote = true officefluid_global as X
    (
        X.Office_Fluid_OfficeWebHost_Activity_LoadComponentInIframe
        | union X.Office_Fluid_OfficeWebHost_Activity_LoadComponentInDiv
        | where Loop_Audience == audience
        | summarize loads = dcount(Data_hostCorrelationId) by bin(Event_ReceivedTime, resolution)
        | join kind=leftouter (
            X.Office_Fluid_QoS_Error
            | where Loop_Audience == audience
            | where Data_isAce == false
            | invoke CubeFilter_OwhQoSContainerPostBootError()
            | where Data_message == "Error 404"
            | summarize 404ClosedErrorCount=dcount(Data_hostCorrelationId)
              by bin(Event_ReceivedTime, resolution)
          ) on Event_ReceivedTime
    )
| summarize total_loads = sum(loads),
            total_404ClosedErrorCount = sum(404ClosedErrorCount)
  by bin(Event_ReceivedTime, resolution)
| extend rateOf404Closed = todouble(total_404ClosedErrorCount) / todouble(total_loads) * 100
| project Event_ReceivedTime, rateOf404Closed
| render timechart
```
*Source: ICE TSG. Only use EU data when you can't get the insight from RoW alone. Replace `"Error 404"` with the error message from your specific incident.*

**Self-denominating: LoadComponent failure rate (403 example):**
```kusto
// RoW only
OwhLoads
| where Release_AudienceGroup == "Production"
| summarize loads = dcount(Data_hostCorrelationId),
            403FailedLoads = dcountif(Data_hostCorrelationId,
                Activity_Success == 0 and Data_message has "403")
  by bin(Event_ReceivedTime, 1d)
| extend rateOf403Failure = todouble(403FailedLoads) / todouble(loads) * 100
| project Event_ReceivedTime, rateOf403Failure
| render timechart
```
*Source: ICE TSG. `LoadComponent*` activities are self-denominating because the activity event fires on both success and failure. Use this when the error you're investigating is visible on the OWH activity event itself (not just in QoS_Error).*

**Rate broken out by host and audience simultaneously:**
```kusto
// RoW only — adds Data_hostName and Release_AudienceGroup dimensions
let resolution = 1d;
OwhLoads
| summarize loads = dcount(Data_hostCorrelationId)
  by bin(Event_ReceivedTime, resolution), Data_hostName, Release_AudienceGroup
| join kind=leftouter (
    Office_Fluid_QoS_Error
    | where Data_isAce == false
    | invoke CubeFilter_OwhQoSContainerPostBootError()
    | where Data_message == "Error 404"
    | summarize 404ClosedErrorCount=dcount(Data_hostCorrelationId)
      by bin(Event_ReceivedTime, resolution), Data_hostName, Release_AudienceGroup
  ) on Event_ReceivedTime, Data_hostName, Release_AudienceGroup
| extend 404ClosedErrorCount = iff(isempty(404ClosedErrorCount), 0, 404ClosedErrorCount)
| extend rateOf404Closed = todouble(404ClosedErrorCount) / todouble(loads) * 100
| project Event_ReceivedTime, rateOf404Closed, Data_hostName, Release_AudienceGroup
| render timechart
```
*Source: ICE TSG. Use this when you suspect the error is concentrated in a specific host or ring. The chart will show separate series per host+ring combination.*

**Granular driver event failure rate (join driver error to OWH load):**
```kusto
// Rate of a specific ODSP driver operation failure — RoW only
let resolution = 1d;
OwhLoads
| join kind=leftouter (
    Office_Fluid_FluidRuntime_Error
    | where Data_eventName == "fluid:telemetry:OdspDriver:TreeLatest_SecondCall"
  ) on Data_hostCorrelationId
| summarize DriverOperationFailures = dcountif(Data_hostCorrelationId1, isnotempty(Data_hostCorrelationId1)),
            Loads = dcount(Data_hostCorrelationId)
  by bin(Event_ReceivedTime, resolution)
| extend rate = todouble(DriverOperationFailures) / todouble(Loads) * 100
| project Event_ReceivedTime, rate
| render timechart
```
*Source: ICE TSG. Use this when you've identified that a specific driver operation (e.g. `TreeLatest_SecondCall`) is the origin of the ICE error. This is more precise than using QoS_Error because it isolates the specific driver activity rather than mixing all operations that produce the same surface-level error code.*

---

### 2.12 EU / Global Data Queries

**Only query EU data when RoW-only data is insufficient. Always read the EU compliance doc first.**

**`macro-expand` pattern:**
```kusto
macro-expand force_remote = true officefluid_global as X (
  X.table("Office_Fluid_FluidRuntime_Error")
  | where Data_errorType == "dataCorruptionError"
      and Data_error == "packages is undefined"
  | summarize count = count() by bucket = bin(Event_Time, 1h)
)
| summarize count = sum(count) by bucket  // required: merge both cluster results
| render timechart
```
*Source: datacorruptionerror TSG. The inner query runs on both clusters (RoW and EU). The outer `summarize ... sum()` aggregates the results. Always include the outer aggregation or you'll get duplicate rows.*

**EU global data with `getDataCorruptionErrors` function:**
```kusto
let startDt = datetime(2025-11-01);
let endDt = datetime(2025-11-15);
let containerCodeDetailsName = '@fluidx/loop-page-container';
macro-expand force_remote = true officefluid_global as X (
  getDataCorruptionErrors(startDt, endDt, containerCodeDetailsName)
  | summarize docIdCount = dcount(Data_docId)
    by Data_error, Loop_Audience
)
| summarize docIdCount = sum(docIdCount) by Data_error, Loop_Audience
```
*Source: datacorruptionerror TSG. The `getDataCorruptionErrors` function applies the team's standard filtering (excluding reverse proxies, etc.). Use absolute datetimes when writing queries for IcM notes — not `ago()` — so they remain reproducible.*

---

### 2.13 Partner Database Queries

#### OneNote Fluid
```kusto
// All Fluid errors in OneNote
union kind=outer database("OneNote Fluid").reportdata
| where EventInfo_Time > ago(7d)
| where Namespace == 'OneNotePreviewCanvas'
| extend d = parse_json(Message)
| where d.category == "error"
| where d.eventName contains "fluid:"
| project d.eventName, d.error, d.docId
```
*Source: working-with-telemetry. Equivalent to querying `Office_Fluid_FluidRuntime_Error` but for OneNote's telemetry pipeline. Fields are in the `d` object after `parse_json(Message)`.*

#### Outlook Web (OWA)

> **Warning:** OWA uses sampling in the `client_event` table. Numbers are not raw counts. Requires `olkwebar` security group membership.

```kusto
// Fluid component loaded events in OWA — by scenario
database("Outlook Web").client_event
| where EventName in ("FluidComponentLoaded")
| extend s = parse_json(MiscData)
| extend owa = toint(s.OwaScenario_1)
| extend name = iff(owa == 1, "Compose", "Reading")
```

```kusto
// OWA Fluid success rate over time
database("Outlook Web").client_event
| where EventName in ("FluidComponentLoaded", "FluidComponentError")
| summarize TotalSuccess = countif(EventName == "FluidComponentLoaded"),
            TotalErrors  = countif(EventName == "FluidComponentError")
  by bin(EventInfo_Time, 1h)
| extend SuccessRate = todouble(TotalSuccess) / todouble(TotalErrors + TotalSuccess)
| project EventInfo_Time, SuccessRate
| render timechart
```

```kusto
// OWA BohemiaLogger errors (includes OWH and FluidRuntime logs via Bohemia)
database("Outlook Web").client_event
| where EventName == "BohemiaLogger_Error"
| extend data = parse_json(MiscData)
// Access: data.docId, data.eventName, data.error, etc.
```
*Source: working-with-telemetry. For OWA Fluid issues, use these rather than the FluidRuntime tables. `BohemiaLogger_Error` / `_Event` / `_Perf` events from OWA mirror the structure of FluidRuntime events but pass through the Bohemia logger pipeline.*

---

### 2.14 ODSP Flight & Killswitch Change Queries

**When a Fluid error spike coincides with a deployment, check whether a killswitch or ECS flight was activated:**

```kusto
// cluster('fcmdata.kusto.windows.net').database('FCMKustoStore')
let odspServiceTreeGuid = 'dca25814-84aa-4dd2-bc5b-01f9cfe88ec6';
let farmGeoSequencePrefix = "US_231";  // Replace with farm prefix from incident
let endTime = datetime(2025-10-16 23:59:59);  // Use absolute times
let startTime = endTime - 48h;
ChangeEvent
| where ServiceTreeGuid == odspServiceTreeGuid
    and (isempty(farmGeoSequencePrefix) or Locations has farmGeoSequencePrefix)
    and TIMESTAMP > startTime and TIMESTAMP < endTime
    and Status == 'Completed'
| extend ChangeVehicle = tostring(parse_json(Description).PayloadChangeType)
| project TIMESTAMP, ComponentName, ChangeVehicle, Title, Locations, Description
| where ChangeVehicle has_any ("KillSwitch")
| sort by TIMESTAMP desc
```
*Source: ODSP OCE playbook. Remove the `ChangeVehicle has_any ("KillSwitch")` filter and uncomment `has_any ("KillSwitch", "Flights")` to also see ECS flight changes. The `farmGeoSequencePrefix` (format `US_231`) narrows to a specific farm/geo — get it from the incident's affected region.*

---

### 2.15 Version Regression Analysis (Error by RuntimeVersion Over Time)

**When investigating a spike, split errors by runtime version to pinpoint which version introduced the regression:**

```kusto
// Errors per runtimeVersion per day — identifies which version introduced the regression
Office_Fluid_FluidRuntime_Error
| where Data_errorType == 'dataCorruptionError'
    and Event_Time > ago(30d)
    and Data_stack !has '.goskope.com'
    and Data_stack !has '.myshn.net'
    and Data_channelFactoryType !has '.myshn.net'
| summarize count() by bin(Event_Time, 1d), Data_runtimeVersion
| render timechart
```
*From Teams investigation threads (Oct–Nov 2025 IdCompressor regression investigation). Adding `Data_runtimeVersion` as a split dimension lets you see which version's line goes up — if only one version line spikes, the regression is isolated to that version. The end of October spooky spike was investigated this way.*

**Errors filtered by a specific error code (0x645 IdCompressor investigation example):**
```kusto
Office_Fluid_FluidRuntime_Error
| where Data_error contains "0x645"
    and Event_Time > ago(30d)
| summarize count() by bin(Event_Time, 1d), Data_runtimeVersion
| render timechart
```
*Source: Teams investigation threads (Nov 2025 IdCompressor corruption incidents). Error codes like `0x645` are hex-encoded error IDs from the Fluid Framework error catalog. When you see these, immediately engage FF Hot — they indicate errors that need expert attention.*

---

### 2.16 Filtering Interactive Users vs. Summarizer

**Summarizer agents produce duplicate events for Load, ContainerClose, etc. Filter them out when measuring user-facing impact:**

```kusto
// Only interactive (human) clients
union Office_Fluid_FluidRuntime_*
| where Data_clientType == "interactive"
| where Data_errorType == "dataCorruptionError"
| summarize dcount(Session_Id) by Data_error, bin(Event_Time, 1d)
| render timechart
```

**Compare interactive vs. summarizer error counts (identify if the issue is agent-specific):**
```kusto
Office_Fluid_FluidRuntime_Error
| where Event_Time > ago(7d)
    and isnotempty(Data_clientType)  // driver events have empty clientType
| summarize count() by Data_clientType, Data_error
| sort by count_ desc
```
*Source: working-with-telemetry. If most errors are from the summarizer, the issue may be in summarization logic. If errors are only from interactive clients, the issue is in user-facing code paths. If `Data_clientType` is empty, the event came from the ODSP driver (which doesn't set this field).*

---

### 2.17 ContainerClose Error Investigation (404 / 403 / ForceReadonlyPendingChanged)

**Investigating "Trying to reconnect" / `ForceReadonlyPendingChanged` errors:**

```kusto
// Find ContainerClose errors by type
union Office_Fluid_FluidRuntime_*
| where Event_Time > ago(7d)
| where Data_eventName contains "ContainerClose" or Data_error contains "ForceReadonly"
| summarize count(), dcount(Session_Id), dcount(Data_docId),
            make_set(Data_hostName), make_set(Loop_Audience)
  by Data_error, Data_errorType
| sort by count_ desc
```
*From Teams investigation threads (IcM 701041202 — Loop Workspaces stuck on "Trying to reconnect"). `ForceReadonlyPendingChanged` errors in the context of 404/403 ContainerClose often indicate ODSP permission or auth issues rather than Fluid-side bugs.*

**Trace a ForceReadonlyPendingChanged event in a session:**
```kusto
let DocId = "your-doc-id-here";
union Office_Fluid_FluidRuntime_*
| where Data_docId == DocId
| where Data_eventName contains "Connection" or Data_error contains "ForceReadonly"
    or Data_eventName contains "Close"
| project Event_Time, Event_Sequence, Data_eventName, Data_error, Data_reason,
          Data_clientType, Session_Id
| sort by Event_Time asc, Event_Sequence asc
```

---

### 2.18 Identifying When a Regression Started

**Binary search approach — find the first hour/day errors appeared:**

```kusto
// Hourly timechart with enough history to see the onset
Office_Fluid_FluidRuntime_Error
| where Data_error has "channelTypeNotAvailable"
    and Event_Time > ago(14d)
| summarize count(), dcount(Data_docId) by bin(Event_Time, 1h)
| render timechart
```

**Compare volume before and after a suspected deployment time:**
```kusto
let deployTime = datetime(2025-11-01 18:00:00);
Office_Fluid_FluidRuntime_Error
| where Data_errorType == "dataCorruptionError"
    and Event_Time between ((deployTime - 24h) .. (deployTime + 24h))
| summarize count(), dcount(Data_docId)
  by bin(Event_Time, 1h), Data_containerCodeDetailsName
| render timechart
```

---

### 2.19 Proactive Shift Health Check

**Run at the start of a shift to establish baselines. Flag any dimensions that look elevated.**

```kusto
// Overall error volume by errorType for last 7 days vs previous 7 days
let recent = Office_Fluid_FluidRuntime_Error
    | where Event_Time > ago(7d) and Event_Time <= ago(0d)
    | summarize recent_count = count() by Data_errorType;
let prior = Office_Fluid_FluidRuntime_Error
    | where Event_Time > ago(14d) and Event_Time <= ago(7d)
    | summarize prior_count = count() by Data_errorType;
recent
| join kind=fullouter prior on Data_errorType
| extend pct_change = todouble(recent_count - prior_count) / todouble(prior_count) * 100
| project Data_errorType, recent_count, prior_count, pct_change
| sort by pct_change desc
```

```kusto
// Error volume by hostName and Loop_Audience for last 3 days
Office_Fluid_FluidRuntime_Error
| where Event_Time > ago(3d)
| summarize count(), dcount(Data_docId)
  by Data_hostName, Loop_Audience, Data_errorType
| sort by count_ desc
```

```kusto
// Error volume by App_Name: compare last 4 hours vs same window yesterday and last week
// Good for quick "is anything elevated right now?" checks
let today = Office_Fluid_FluidRuntime_Error
| where Event_Time between (ago(4h) .. now())
| where Loop_Audience == "Production"
| summarize TodayErrors=count(), TodaySessions=dcount(Session_Id) by App_Name;
let yesterday = Office_Fluid_FluidRuntime_Error
| where Event_Time between (ago(28h) .. ago(24h))
| where Loop_Audience == "Production"
| summarize YesterdayErrors=count(), YesterdaySessions=dcount(Session_Id) by App_Name;
let lastweek = Office_Fluid_FluidRuntime_Error
| where Event_Time between (ago(172h) .. ago(168h))
| where Loop_Audience == "Production"
| summarize LastWeekErrors=count(), LastWeekSessions=dcount(Session_Id) by App_Name;
today
| join kind=leftouter yesterday on App_Name
| join kind=leftouter lastweek on App_Name
| project App_Name, TodayErrors, TodaySessions,
    YesterdayErrors=coalesce(YesterdayErrors,0), YesterdaySessions=coalesce(YesterdaySessions,0),
    LastWeekErrors=coalesce(LastWeekErrors,0), LastWeekSessions=coalesce(LastWeekSessions,0)
| order by TodayErrors desc
```

---

### 2.20 OWH Loads Function — Understanding the Denominator

`OwhLoads` is a stored Kusto function equivalent to:
```kusto
Office_Fluid_OfficeWebHost_Activity_LoadComponentInIframe
| union Office_Fluid_OfficeWebHost_Activity_LoadComponentInDiv
```

It represents the total number of Fluid component load attempts (each distinct `Data_hostCorrelationId` = one user session loading a Fluid component). This is the standard denominator for ICE error rate calculations.

**Inspect the OwhLoads function definition (in Kusto Explorer):**
- Database: `Office Fluid` on `https://kusto.aria.microsoft.com`
- Look under Functions → `OwhLoads`

**Common usage patterns:**

```kusto
// Volume of loads over time
OwhLoads
| where Release_AudienceGroup == "Production"
| summarize dcount(Data_hostCorrelationId) by bin(Event_ReceivedTime, 1d), Data_hostName
| render timechart
```

---

## Part 3: Investigation Playbook Patterns

### 3.1 Incoming Partner Incident — Quick Start

1. **Acknowledge** the IcM incident (move from Active → Acknowledged)
2. **Corroborate impact** with section 2.6 (breadth query), adjusting the error filter
3. **Check when it started** with section 2.5 or 2.18 (timechart)
4. **Correlate with versions** using section 2.7 to identify loader/runtime/driver
5. **Dig into sample sessions** using section 2.2 + section 2.4
6. **Check for ODSP deployments** if 4xx errors using section 2.14

### 3.2 DataCorruptionError Triage

1. Run section 2.9 Step 1 to check if documents are in `DataCorruptionKnownDocIds`
2. Run section 2.5 scoped to `dataCorruptionError` to see if there's a spike
3. Identify the specific `Data_error` value (e.g. `channelFactoryNotRegisteredForGivenType`, `channelTypeNotAvailable`, `packages is undefined`)
4. Use the appropriate query from section 2.9 for that specific error
5. Consult the FF error catalog in ADO for the error description and owner

### 3.3 ICE Error Rate Investigation

1. Use section 2.11 to compute the rate (not raw count)
2. Start with RoW-only; only include EU if needed
3. Break down by `Data_hostName` and `Release_AudienceGroup` to isolate the scope
4. If rate is elevated vs. baseline, check if it's an ACE (actionable) or ICE (expected fluctuation)
5. Compare rate against historical baseline — 28 days of data is available

### 3.4 Important Notes

- **Always use absolute timestamps in IcM notes** (e.g. `datetime(2025-11-01 12:00:00)`) — not `ago()` — so queries remain reproducible
- **Data retention is ~28 days** — for older incidents, you must have saved query results at the time
- **Driver events have empty `Data_clientType`** — don't assume empty = interactive; it means driver-layer
- **Reverse proxies**: always filter `Data_stack !has '.goskope.com'` and `Data_channelFactoryType !has '.myshn.net'` for corruption queries, as these proxies generate false positives
- **OWA uses sampling**: error counts from `database("Outlook Web").client_event` are not raw event counts
- **`Loop_Audience`** in FluidRuntime tables and **`Release_AudienceGroup`** in OWH tables serve the same purpose — filter Production to avoid noise from Dogfood/MSIT testing

---

## Part 4: Additional Query Sections

### 4.1 FF Bump Tracking — Monitoring a New Version Rollout

**Source:** `tracking-an-ff-bump` on EngineeringHub (updated 2/28/2026)

Use these queries after a new Fluid Framework version ships to monitor its rollout across hosts and rings and detect regressions introduced by the bump.

**Step 1: Check how far the new version has rolled out across hosts and rings:**
```kusto
let newVersion="2.0.0-internal.5";
union Office_Fluid_FluidRuntime_*
| where Event_ReceivedTime > ago(1d)
| extend hasNewVersion =
    Data_driverVersion startswith newVersion
    or Data_loaderVersion startswith newVersion
    or Data_runtimeVersion startswith newVersion
| summarize
    containers=dcount(Data_containerId),
    newVersionContainers=dcountif(Data_containerId, hasNewVersion),
    newVersionRings=make_set_if(Data_loopAudience, hasNewVersion)
  by Data_hostName
| sort by newVersionContainers desc nulls last, containers desc nulls last
```
*Adjust the version prefix. `Data_loopAudience` (lowercase) is the ring field in this table. The result shows which hosts have received the new version and which rings it has reached.*

**Step 2: Find total errors occurring with the new version:**
```kusto
let newVersion="2.0.0-internal.5";
Office_Fluid_FluidRuntime_Error
| extend driverIsNew = Data_driverVersion startswith newVersion
| extend loaderIsNew = Data_loaderVersion startswith newVersion
| extend runtimeIsNew = Data_runtimeVersion startswith newVersion
| where driverIsNew or loaderIsNew or runtimeIsNew
| extend Data_error = iff(isnotempty(Data_error), Data_error,
    iff(isnotempty(Data_message), Data_message, Data_eventName))
| summarize count(), make_set(Data_hostName),
    countif(driverIsNew), countif(loaderIsNew), countif(runtimeIsNew)
  by Data_error
```
*The `countif` columns show which layer (driver/loader/runtime) each error comes from.*

**Step 3: Compare new version error rates against previous version (the key regression-detection query):**
```kusto
let newVersion="2.0.0-internal.5";
let versionError =
    Office_Fluid_FluidRuntime_Error
    | where Data_driverVersion startswith newVersion
        or Data_loaderVersion startswith newVersion
        or Data_runtimeVersion startswith newVersion
    | project Data_error = iff(isnotempty(Data_error), Data_error,
        iff(isnotempty(Data_message), Data_message, Data_eventName));
Office_Fluid_FluidRuntime_Error
| extend Data_error = iff(isnotempty(Data_error), Data_error,
    iff(isnotempty(Data_message), Data_message, Data_eventName))
| where Data_error in(versionError)
| extend hasNewVersion =
    Data_driverVersion startswith newVersion
    or Data_loaderVersion startswith newVersion
    or Data_runtimeVersion startswith newVersion
| summarize
    newVersionCount=countif(hasNewVersion),
    newVersionContainers=dcountif(Data_containerId, hasNewVersion),
    oldVersionsCount=countif(hasNewVersion == false),
    oldVersionsContainers=dcountif(Data_containerId, hasNewVersion == false)
  by Data_error, Data_loopAudience, bin(Event_ReceivedTime, 1d)
| summarize
    newVersionAvgCount = ceiling(avg(newVersionCount)),
    oldVersionsAvgCount = ceiling(avg(oldVersionsCount)),
    newVersionAvgContainers = ceiling(avg(newVersionContainers)),
    oldVersionsAvgContainers = ceiling(avg(oldVersionsContainers))
  by Data_error, Data_loopAudience
```
*Compares daily average error counts for the new version vs all older versions. If `newVersionAvgCount` >> `oldVersionsAvgCount` for a given error, that error is a regression introduced by the bump.*

**Step 4: Trend each error over time to see if things are improving or worsening:**
```kusto
let newVersionExact="2.0.0-internal.4.3.0";
let errorsWithNewVersion =
    Office_Fluid_FluidRuntime_Error
    | where Data_driverVersion == newVersionExact
        or Data_loaderVersion == newVersionExact
        or Data_runtimeVersion == newVersionExact
    | summarize by Data_error = substring(Data_error, 0, 65); // Truncate for chart grouping
Office_Fluid_FluidRuntime_Error
| where Data_error in (errorsWithNewVersion)
| summarize count() by Data_error, bin(Event_ReceivedTime, 1h)
| render timechart with (legend=hidden)
```

**Step 5: Compare error trends side-by-side for new vs other versions (top 5 errors):**
```kusto
let newVersionExact="2.0.0-internal.4.3.0";
let startDate = ago(21d);
let topErrors = (
    Office_Fluid_FluidRuntime_Error
    | where Event_ReceivedTime between (startDate..now())
    | summarize count(), dcount(Data_hostCorrelationId), dcount(Data_docId) by Data_error
    | sort by dcount_Data_docId desc
    | take 5
    | project Data_error
);
Office_Fluid_FluidRuntime_Error
| where Event_ReceivedTime between (startDate..now())
| extend isNewVersion =
    Data_driverVersion == newVersionExact
    or Data_loaderVersion == newVersionExact
    or Data_runtimeVersion == newVersionExact
| where Data_loopAudience in ("Dogfood")
| where Data_error in (topErrors)
| summarize count(), dcount(Data_hostCorrelationId), dcount(Data_docId)
  by bin(Event_ReceivedTime, 1h), Data_error, isNewVersion
| render timechart with (ycolumns=dcount_Data_docId, series=Data_error, isNewVersion)
```

---

### 4.2 Host Render Reliability (HostTracker)

**Source:** Host Render Reliability TSG, Loop FFX OCE playbook

```kusto
// Failed render rate over time — by host
Office_Fluid_HostTracker_Activity_RenderComponentByHost
| where Activity_Result_Type == "Failure"
| where Data_hostName == "Loop App" // adjust as needed
| summarize dcount(Data_hostCorrelationId) by Time = bin(todatetime(Event_Time), 1d)
| render timechart
```

```kusto
// Most recent 10 failed renders — for drill-down
Office_Fluid_HostTracker_Activity_RenderComponentByHost
| where Activity_Result_Type == "Failure"
    and Data_hostName == "Loop App" // adjust as needed
| order by Event_Time desc
| top 10 by Event_Time
```

```kusto
// Full session investigation — all tables across a correlated session
// Use when you have Session_Id and Data_hostCorrelationId from a failed render
union Office_Fluid_Scriptor*, Office_Fluid_LoopPageContainer*,
      Office_Fluid_HostTracker*, Office_Fluid_Tablero*,
      Office_Fluid_UserAction*, Office_Fluid_OfficeWebHost*,
      Office_Fluid_GenericLinkUnfurl*, Office_Fluid_Error
| where Session_Id == "<SessionId>"
    and Data_hostCorrelationId == "<CorrelationId>"
| project-reorder Event_Name, Data_eventName, Event_Time,
    Activity_Result_Type, Data_hostName
```
*The `union` across all Loop FFX tables gives you the complete picture of a session across every component. `Activity_Result_Type` and `Data_hostName` are the key render-reliability dimensions.*

---

### 4.3 Scriptor / FFX Subcomponent Errors

**Source:** Scriptor (Loop components) TSG, Loop FFX OCE playbook

```kusto
// RoW: Scriptor error rate by event name (last 24h)
let gap = 1h;
let startDt = ago(1d);
let endDt = now();
Office_Fluid_Scriptor_Error
| where Event_ReceivedTime between (startDt .. endDt)
    and Data_scriptorLogArea in (
        'FluidComponentHost', 'GuestComponents', 'FluidBasedLoopComponent',
        'URLUnfurling', 'NonFluidLoopComponent'
    )
| summarize dcount(Data_hostCorrelationId) by Data_eventName, bin(Event_ReceivedTime, gap)
| render timechart
```

```kusto
// EU-compliant version (absolute time range, use for IcM notes)
let startDt = datetime(2025-11-01);
let endDt = datetime(2025-11-08);
let gap = 1h;
macro-expand force_remote = true officefluid_global as X (
    X.table("Office_Fluid_Scriptor_Error")
    | where Event_ReceivedTime between (startDt .. endDt)
        and Data_scriptorLogArea in (
            'FluidComponentHost', 'GuestComponents', 'FluidBasedLoopComponent',
            'URLUnfurling', 'NonFluidLoopComponent'
        )
    | summarize count = dcount(Data_hostCorrelationId)
        by Data_eventName, bucket = bin(Event_ReceivedTime, gap)
)
| summarize count = sum(count) by Data_eventName, bucket
| render timechart
```

```kusto
// Delegated subcomponent render failures — rate over time
Office_Fluid_Scriptor_Activity_DelegatedRender
| where Data_eventName == "DelegatedRender"
    and Activity_Result_Type == "Failure"
| where Data_delegatedComponentIdentityName == "<subComponentName>"
| summarize dcount(Data_hostCorrelationId) by Time = bin(todatetime(Event_Time), 1d)
| render timechart
```

```kusto
// Most recent 10 failed delegated renders for a specific subcomponent
Office_Fluid_Scriptor_Activity_DelegatedRender
| where Activity_Result_Type == "Failure"
    and Data_delegatedComponentIdentityName == "<subComponentName>"
| order by Event_Time desc
| top 10 by Event_Time
```

---

### 4.4 Video Telemetry Investigation

**Source:** Video Recording and Video Stream Unfurling TSG pages, Loop FFX OCE playbook

**Tables used:** `Office_Fluid_Video_Error`, `Office_Fluid_Video_Activity_VideoRecorderLoad`, `Office_Fluid_Video_Activity_VideoUpload`, `Office_Fluid_Video_Activity_VideoLoadFromUnfurl`, `Office_Fluid_Video_Activity_GetPersonalOdbUrl`, `Office_Fluid_Video_Activity_CreateRedeemableSharingLink`, `Office_Fluid_Video_Generic_Request`

```kusto
// Video recorder load P95 duration — by ring and host
let _endTime = now();
let _startTime = _endTime - 24h;
let _audience = 'Production';
let _host = 'Loop App';
macro-expand force_remote=true officefluid_global as X (
    X.Office_Fluid_Video_Activity_VideoRecorderLoad
    | where Event_ReceivedTime between (_startTime .. _endTime)
        and Activity_Success == true
        and Loop_Audience == _audience
        and Data_hostName == _host
    | summarize
        m_P95DurationMs = toint(round(percentile(Activity_Duration, 95) * 0.001, 0)),
        m_RecorderLoadCount = dcount(Data_hostCorrelationId),
        m_P95Over5000ms = dcountif(Data_hostCorrelationId, (Activity_Duration * 0.001) > 5000)
      by d_Loop_Audience = Loop_Audience, d_Data_Host_Name = Data_hostName
)
| summarize
    m_P95DurationMs = max(m_P95DurationMs),
    m_RecorderLoadCount = sum(m_RecorderLoadCount),
    m_P95Over5000ms = max(m_P95Over5000ms)
  by d_Loop_Audience, d_Data_Host_Name
```
*`Activity_Duration` is in microseconds; multiply by 0.001 for milliseconds. The `macro-expand` is needed because video telemetry exists in both RoW and EU clusters.*

```kusto
// Video upload investigation — trace events for a specific recording session
// Get the webRecorderCorrelationId from user feedback or from Video_Error
Office_Fluid_Video_Activity_VideoUpload
| where Data_webRecorderCorrelationId == "<CorrelationId>"
| project Data_eventName, Activity_Result_Type, Event_ReceivedTime,
    Data_errorMessage, Data_videoDriveItemId, Data_webRecorderCorrelationId
```

```kusto
// Video errors for a specific recording session
Office_Fluid_Video_Error
| where Data_webRecorderCorrelationId == "<CorrelationId>"
| project Data_eventName, Event_ReceivedTime, Data_errorMessage, Data_errorCode,
    Loop_Audience, App_Platform, App_Name, Data_webRecorderCorrelationId
```

```kusto
// Impacted user count for video activity failures (RoW)
let _startTime = datetime(2025-11-01 00:00:00Z);
let _endTime = datetime(2025-11-01 01:00:00Z);
Office_Fluid_Video_Activity_VideoUpload
| where Activity_Result_Type != "Success"
    and Event_ReceivedTime between (_startTime .. _endTime)
    and App_Name == 'Loop App'
    and App_Platform == "Web"
    and Release_AudienceGroup == "Production"
| summarize totalCount = dcount(User_PrimaryIdentityHash) by Data_errorMessage
```

```kusto
// Impacted user count for video activity failures (EU-compliant, hll pattern)
let _startTime = datetime(2025-11-01 00:00:00Z);
let _endTime = datetime(2025-11-01 01:00:00Z);
macro-expand force_remote=true officefluid_global as X (
    X.Office_Fluid_Video_Activity_VideoUpload
    | where Activity_Result_Type != "Success"
        and Event_ReceivedTime between (_startTime .. _endTime)
        and Release_AudienceGroup == 'Production'
    | summarize hll(User_PrimaryIdentityHash) by Data_errorMessage
)
| summarize totalCount = dcount_hll(hll_merge(hll_User_PrimaryIdentityHash)) by Data_errorMessage
```
*The `hll` / `dcount_hll` pattern is the EU-compliant way to count distinct users across clusters without exposing individual user identities across boundaries.*

```kusto
// Stream unfurling: check for HTTP 4xx/5xx errors
let _startTime = datetime(2025-11-01 00:00:00Z);
let _endTime = datetime(2025-11-01 01:00:00Z);
let _audience = "Production";
Office_Fluid_Video_Generic_Request
| join kind=innerunique Office_Fluid_Video_Activity_VideoLoadFromUnfurl
    on Data_hostCorrelationId
| where Event_ReceivedTime between (_startTime .. _endTime)
    and Data_status >= 400 and Data_status <= 599
    and Release_AudienceGroup == _audience
| summarize dcount(Session_Id), dcount(User_PrimaryIdentityHash)
    by Data_eventName, Data_status, Data_hostName
| order by dcount_Session_Id desc
```

```kusto
// Get HTTP request/correlation IDs for a specific unfurl session
// Use Data_spRequestGuid to correlate with ODSP/backend logs
Office_Fluid_Video_Generic_Request
| join kind=innerunique Office_Fluid_Video_Activity_VideoLoadFromUnfurl
    on Data_hostCorrelationId
| where Data_unfurlCorrelationId == "<CorrelationId>"
| project Event_ReceivedTime, Data_hostName, Data_loopAudience,
    Data_eventName, Data_errorName, Data_errorCode, Data_errorMessage,
    Data_stack, Data_spRequestGuid, Data_hostCorrelationId,
    Data_unfurlCorrelationId, Data_hostScenarioName, App_Platform
```

```kusto
// ODB URL errors — distinguish expected (404 = no ODB) from unexpected
macro-expand force_remote=true officefluid_global as X (
    X.Office_Fluid_Video_Activity_GetPersonalOdbUrl
    | where Activity_Success == false
    // | where Data_isExpected == true  // Uncomment only if Data_isExpected column exists
    | summarize count() by Data_errorMessage, Date=bin(Event_ReceivedTime, 1d)
)
| summarize Sum=sum(count_) by Data_errorMessage, Date
| render timechart
```
*`Data_isExpected == true` marks 404s for users without personal ODB — these are noise, not incidents. Only uncomment that filter if the column exists; its absence means all errors are unexpected.*

#### OnePlayer (Stream Video Playback) Queries

```kusto
// Top playback errors for Loop video components (RoW)
let _startTime = datetime(2025-11-01 00:00:00Z);
let _endTime = datetime(2025-11-01 01:00:00Z);
union database("OnePlayer").*
| where hostComponent == "VideoPlaybackLoopComponent"
    and EventInfo_Time between (_startTime .. _endTime)
    and result == "Fatal"
| summarize SessionCount = dcount(playbackSessionId),
    UserCount = dcount(userId)
  by name, result, message
| order by SessionCount desc
```

```kusto
// Top playback errors (EU-compliant, two-cluster pattern)
let _startTime = datetime(2025-11-01 00:00:00Z);
let _endTime = datetime(2025-11-01 01:00:00Z);
let WW_Clusters = entity_group [
    cluster('https://stream.eastus2.kusto.windows.net'),
    cluster('https://streameu.northeurope.kusto.windows.net')
];
macro-expand force_remote = true WW_Clusters as X (
    union X.database("OnePlayer").*
    | where hostComponent == "VideoPlaybackLoopComponent"
        and EventInfo_Time between (_startTime .. _endTime)
        and result == "Fatal"
    | summarize hll_session_count = hll(playbackSessionId),
        hll_user_count = hll(userId)
        by name, result, message
)
| summarize hll_merge_session_count=hll_merge(hll_session_count),
    hll_merge_user_count=hll_merge(hll_user_count)
    by name, result, message
| project name, result, message,
    session_count = dcount_hll(hll_merge_session_count),
    user_count = dcount_hll(hll_merge_user_count)
| order by session_count desc
```

---

### 4.5 Container Reconnects / Stuck Container Investigation

**Source:** `runtime-detected-too-many-reconnects` error catalog, EngineeringHub

```kusto
// Count of "too many reconnects" errors over time
union Office_Fluid_FluidRuntime_*
| where Data_eventName == "fluid:telemetry:ContainerRuntime:ReconnectsWithNoProgress"
    or Data_error == "Runtime detected too many reconnects with no progress syncing local ops"
| summarize count(), dcount(Data_docId) by bin(Event_Time, 1d)
| render timechart
```

```kusto
// Why is a specific container stuck? Use WhyIsTheContainerStuck() function
// Returns JSON with: eventName, message, error, reason
WhyIsTheContainerStuck("<Data_containerId>")
```
*`WhyIsTheContainerStuck` is a stored Kusto function. Pass the `Data_containerId` value from any event in the container's session. The output JSON explains the last known state change and why the container entered a stuck/disconnected state.*

```kusto
// DeltaConnectionFailureToConnect — top error types causing connection failure
union Office_Fluid_FluidRuntime_*
| where Data_eventName == "fluid:telemetry:ConnectionManager:DeltaConnectionFailureToConnect"
| summarize count() by Data_message, Data_error, Data_errorType
| order by count_ desc
| take 5
| project Data_message, Data_error, Data_errorType
```
*`DeltaConnectionFailureToConnect` fires when the client fails to establish a delta connection (PUSH/ordering service). Common causes include expired auth tokens (401), throttling (429), and network issues. Check `Data_errorType` for `authorizationError` vs. other types.*

---

### 4.6 Stress Test Automation Queries

**Database:** `Office Fluid Test` (ID `742fa5a288b045e5beab1a2b8e445a71`). These tables are **NOT** in the primary "Office Fluid" database.

**Tables:** `office_fluid_ffautomation_error`, `office_fluid_ffautomation_performance`, `office_fluid_ffautomation_generic`. The wildcard `office_fluid_ffautomation*` does **NOT** resolve — always enumerate tables explicitly.

**Key columns** (shared across all three tables): `Data_buildId`, `Data_driverType` (`odsp`, `routerlicious`, `tinylicious`), `Data_driverEndpointName` (`odsp`, `odsp-df`, `frs`, `frsCanary`, `local`), `Data_profile`, `Data_branch`, `Data_hostName`, `Data_docId`, `Data_containerId`, `Data_eventName`. Error table additionally has: `Data_error`, `Data_errorType`, `Data_message`, `Data_stack`.

**Note:** Tenant IDs and service endpoint URLs are **not** logged in automation telemetry. To find the FRS Canary tenant ID, you must read the Key Vault secret `automation-fluid-driver-frs-canary-stress-test` from `prague-key-vault` (see OCE agent prompt for details).

```kusto
// FindBuildErrors: All errors for a specific stress test run
// RunId format: "<buildId>-<driverType>-<endpointName>-<profile>"
office_fluid_ffautomation_error
| extend RunId = strcat_delim("-", Data_buildId, Data_driverType,
    Data_driverEndpointName, Data_profile)
| where Event_Time > ago(30d)
    and Data_hostName == "@fluid-internal/test-service-load"
| where RunId == "126847-routerlicious-frs-" // replace with your run ID
| summarize count(), min(Event_Time), max(Event_Time)
    by Data_eventName, Data_error, Data_errorType,
       Data_message, RunId, Data_branch, Data_docId
| project Data_eventName, Data_error, TotalHits=count_, Data_errorType,
    min_Event_Time, max_Event_Time, Data_docId
| sort by min_Event_Time asc
```
*Get the RunId from the failing ADO pipeline run. The pipeline logs show the buildId, driverType, and profile used.*

```kusto
// CompareBuildHealth: Compare event volume, duration, and errors across builds per stage
// Use to diagnose "pipeline suddenly started failing" — shows which stage regressed
union withsource=TableName office_fluid_ffautomation_error, office_fluid_ffautomation_performance, office_fluid_ffautomation_generic
| where Event_Time between(datetime(2026-04-10) .. datetime(2026-04-17)) // adjust range
    and Data_hostName == "@fluid-internal/test-service-load"
    and Data_buildId in ("392069", "392243") // passing vs failing build IDs
| summarize
    TotalEvents=count(),
    MinTime=min(Event_Time),
    MaxTime=max(Event_Time),
    Duration_minutes=datetime_diff('minute', max(Event_Time), min(Event_Time)),
    DistinctDocs=dcount(Data_docId),
    ErrorCount=countif(TableName == "office_fluid_ffautomation_error")
    by Data_buildId, Data_driverType, Data_driverEndpointName
| order by Data_buildId asc, Data_driverType asc
```
*Healthy stages typically show 100K–800K events in 20–45 min. A degraded stage shows dramatically fewer events (e.g. 6K) over a much longer duration (60+ min) with many errors.*

```kusto
// CompareBuildErrors: Side-by-side error breakdown for passing vs failing builds
office_fluid_ffautomation_error
| where Event_Time between(datetime(2026-04-10) .. datetime(2026-04-17)) // adjust range
    and Data_hostName == "@fluid-internal/test-service-load"
    and Data_buildId in ("392069", "392243") // passing vs failing build IDs
| summarize ErrorCount=count(), DistinctDocs=dcount(Data_docId)
    by Data_buildId, Data_eventName, Data_error, Data_errorType
| order by Data_buildId asc, ErrorCount desc
```

```kusto
// StageHealthTrend: Track a specific stage's health across all recent builds
union withsource=TableName office_fluid_ffautomation_error, office_fluid_ffautomation_performance, office_fluid_ffautomation_generic
| where Event_Time > ago(7d)
    and Data_hostName == "@fluid-internal/test-service-load"
    and Data_driverEndpointName == "frsCanary" // change to stage of interest
| summarize
    TotalEvents=count(),
    Duration_minutes=datetime_diff('minute', max(Event_Time), min(Event_Time)),
    ErrorCount=countif(TableName == "office_fluid_ffautomation_error"),
    DistinctDocs=dcount(Data_docId)
    by Data_buildId
| order by TotalEvents asc
```
*Sort by TotalEvents ascending to quickly spot degraded builds (low event count = test couldn't make progress).*

```kusto
// DidSummarizerRecover: Determine if the summarizer recovered after errors
// Returns "true" if a successful summarize_end happened after the last error
union office_fluid_ffautomation_error, office_fluid_ffautomation_performance, office_fluid_ffautomation_generic
| where Data_docId == "<docId>"
| where Data_eventName in (
    "fluid:telemetry:Summarizer:Running:Summarize_end",
    "fluid:telemetry:Summarizer:summarizingError",
    "fluid:telemetry:Summarizer:Running:Summarize_cancel"
  )
| summarize
    sumend=maxif(Event_Time, Data_eventName == "fluid:telemetry:Summarizer:Running:Summarize_end"),
    ackerror=maxif(Event_Time,
        Data_eventName == "fluid:telemetry:Summarizer:summarizingError"
        or Data_eventName == "fluid:telemetry:Summarizer:Running:Summarize_cancel")
  by Data_docId
| extend
    DocumentRecovered=iif(sumend > ackerror, "true", "false"),
    neversummarized=iif(isnull(sumend), "never summarized", "summarized")
```

```kusto
// SummarizerView: Full timeline of summarizer events for a document
union office_fluid_ffautomation_error, office_fluid_ffautomation_performance, office_fluid_ffautomation_generic
| where Event_Time > ago(30d)
    and Data_clientType == 'noninteractive/summarizer'
    and Data_eventName contains "Summarizer:Running:"
    and Data_docId == "<docId>"
| project Event_Time, Data_eventName, Data_containerId,
    Data_opsSinceLastSummary, Data_referenceSequenceNumber,
    Data_reason, Data_summaryAttempts, Data_error
| order by Event_Time asc
```

```kusto
// SummarizerLaunchRunView: Full summarizer manager + runner timeline
union office_fluid_ffautomation_error, office_fluid_ffautomation_performance, office_fluid_ffautomation_generic
| where Event_Time > ago(30d)
    and (Data_eventName contains "fluid:telemetry:SummaryManager:"
        or Data_eventName contains "fluid:telemetry:Summarizer:Running")
    and Data_docId == "<docId>"
| project-reorder Event_Time, Data_eventName, Data_containerId,
    Data_clientType, Data_opsSinceLastSummary,
    Data_referenceSequenceNumber, Data_reason,
    Data_summaryAttempts, Data_error
| order by Event_Time asc
```

---

### 4.7 Playbook Updates

**Additional patterns discovered:**

- **`Data_loopAudience` vs `Loop_Audience`**: In `Office_Fluid_FluidRuntime_*` and some bump-tracking contexts the field name is `Data_loopAudience` (lowercase). In OWH tables it's `Loop_Audience`. They carry the same ring values (`Dogfood`, `MSIT`, `Production`). When a query against FluidRuntime tables returns no results with `Loop_Audience`, try `Data_loopAudience`.

- **`hll` / `dcount_hll` pattern for EU-compliant distinct counts**: When using `macro-expand` across RoW + EU clusters, you cannot use `dcount()` directly across cluster boundaries. Instead, use `hll(field)` in the inner query and `dcount_hll(hll_merge(hll_field))` in the outer query. This is the EU privacy-safe way to count distinct users.

- **Activity tables vs Error tables**: Loop FFX uses both `_Error` tables (for explicit errors) and `_Activity_*` tables (for success/failure of operations). Check `Activity_Result_Type == "Failure"` on activity tables and `Data_errorCode`/`Data_errorMessage` on error tables for the same operation.

- **`Data_hostScenarioName`**: Present in Video tables; identifies the specific scenario/feature (e.g., `"VideoRecording"`, `"VideoUnfurling"`). Useful for scoping video investigations.
