# ODSP operation telemetry

Use operation events to separate retries from independent calls to the OneDrive/SharePoint (ODSP) driver.
Do not count storage, connection, container, and application error events as separate HTTP failures.
They can report the same error.

## Correlation fields

| Field | Meaning |
| --- | --- |
| `odspOperationId` | One top-level call, including its internal token, coherency, and service retries. Independent calls have different IDs. |
| `odspOperationKind` | The initiating driver operation. |
| `odspServiceId` | The operation owner's lifetime. Disposal does not transfer an operation to a replacement service. |
| `odspTargetId` | A randomly salted target discriminator. Compare it only within the same request scope; it is not a URL, blob ID, or cross-client identifier. |
| `odspRequestScopeId` | The scope in which target IDs and `inFlightRequests` are comparable. |
| `odspAttemptId`, `odspAttemptNumber` | One actual HTTP attempt and its increasing number within the operation. |
| `odspRequestId` | The request's existing `X-RequestStats` value when using the epoch tracker, or a local UUID for a raw request. Existing server correlation fields remain on request-end events and errors. |
| `joinSessionCaller` | Initial connect, reconnect, periodic refresh, or another initiating join-session caller. |
| `joinSessionAttemptCaller` | The caller category for this attempt, including socket-token or storage-token refresh within an existing operation. |
| `throttleGateId`, `throttleScope` | The consulted shared client/document gate, or the operation-local retry gate. |
| `serverRetryAfterMs` | Retry-After exposed by the HTTP error. It is absent when the delay is synthesized by the driver. |
| `retryDelayMs` | Delay exposed by the retryable error, including synthesized coherency delays. |
| `scheduledDelayMs`, `observedDelayMs` | Selected delay and elapsed client time before the next request or the end of a shared-gate wait. |

`OdspOperationStart` and `OdspOperationEnd` delimit a caller.
The terminal `outcome` is `succeeded`, `failed`, `exhausted`, or `abandoned` on owner disposal.
`httpAttempts` counts actual request starts, not token fetches, cache hits, or coalesced callers.
Disposal records abandonment immediately.
An HTTP request already in flight can finish afterward, but cannot turn abandonment into success.

`OdspRequestStart` is emitted after concurrency queuing and shared-gate checks.
It records client wall-clock `requestStartTime`, `waitQueueLength`, and `inFlightRequests`, including the starting request.
`OdspRequestEnd` reports the HTTP helper's result; successful HTTP can still be followed by a logical failure such as epoch validation or snapshot parsing.
Originating errors retain their operation and attempt IDs through wrapper telemetry.
A coalesced caller's terminal event uses its own operation ID, not the originating error's ID.

`OdspOperationCoalesced.sharedOperationId` links a caller to a cached or in-flight result without inventing an HTTP attempt.
Concurrent background snapshot refreshes have separate operations and an `odspParentOperationId`.
A caller that succeeds from cache does not report recovery of a background request.

Join-session 429 responses end the current operation.
A subsequent reconnect is a new operation that consults the retained shared gate.
The generic file-link retry loop can instead retry a 429 inside one operation.
Telemetry records the existing retry policy, including any selected delay that differs from Retry-After; it does not change that policy.

## Kusto queries

Adapt this input to your telemetry schema, then prefix each query below with this definition.
The examples use Kusto Query Language (KQL), assume complete unsampled events, and limit the time range.
If your logger stores fields as columns rather than `customDimensions`, change only this input projection.

```kusto
let E = YourTelemetryTable
    | where timestamp > ago(1d)
    | extend p = todynamic(customDimensions)
    | project timestamp, p, eventName = tostring(p.eventName),
        operationId = tostring(p.odspOperationId),
        attemptId = tostring(p.odspAttemptId);
```

### Reconstruct one retry chain and deduplicate failure reporting

```kusto
let operation = "<odspOperationId>";
E
| where operationId == operation
| project timestamp, eventName, attemptId,
    attempt = toint(p.odspAttemptNumber),
    requestId = tostring(p.odspRequestId),
    target = tostring(p.odspTargetId),
    caller = tostring(p.joinSessionCaller),
    attemptCaller = tostring(p.joinSessionAttemptCaller),
    serverRetryAfterMs = tolong(p.serverRetryAfterMs),
    scheduledDelayMs = tolong(p.scheduledDelayMs),
    observedDelayMs = tolong(p.observedDelayMs),
    outcome = tostring(p.outcome)
| order by timestamp asc
```

For exact HTTP failure counts, select only `OdspRequestEnd` with `requestSucceeded == false`, then deduplicate by `attemptId`.
For coalesced operations, follow `sharedOperationId` to inspect the originating requests.
Do not merge the callers' terminal outcomes.

### Detect requests inside an active join-session throttle window

Use client timestamps rather than ingestion order.
The shared gate ID spans independent operations and services that share the same client/document cache.

```kusto
let windows = E
    | where eventName endswith ":JoinSessionThrottle" or eventName == "JoinSessionThrottle"
    | where tostring(p.throttleScope) == "clientDocument"
    | project gate = tostring(p.throttleGateId),
        deadlineMs = tolong(p.throttleDeadline),
        windowStartMs = tolong(p.throttleDeadline) - tolong(p.serverRetryAfterMs),
        throttledAttempt = attemptId;
E
| where eventName endswith "OdspRequestStart"
| where tostring(p.throttleScope) == "clientDocument"
| project operationId, attemptId, gate = tostring(p.throttleGateId),
    startMs = tolong(p.requestStartTime), caller = tostring(p.joinSessionCaller)
| join kind=inner windows on gate
| where startMs >= windowStartMs and startMs < deadlineMs
| where attemptId != throttledAttempt
| summarize activeDeadlineMs = max(deadlineMs) by operationId, attemptId, caller, startMs
```

The attempt that established a window is excluded.
A request at the deadline is allowed.
Use `JoinSessionThrottleWait`, `JoinSessionThrottleWait_end`, and `JoinSessionThrottleWait_cancel` to explain waits, extensions, and disposal.

### Measure same-operation recovery and reconcile counts

Success means recovery only when it belongs to the same operation as a failed HTTP attempt.
Success by a replacement service or an independent caller is not recovery.

```kusto
let attempts = E
    | where eventName endswith "OdspRequestEnd"
    | summarize arg_max(timestamp, *) by operationId, attemptId
    | summarize completedRequests = count(),
        failedRequests = countif(tobool(p.requestSucceeded) == false) by operationId;
let starts = E
    | where eventName endswith "OdspRequestStart"
    | summarize by operationId, attemptId
    | summarize startedRequests = count() by operationId;
E
| where eventName endswith "OdspOperationEnd"
| summarize arg_max(timestamp, *) by operationId
| project operationId, outcome = tostring(p.outcome), reportedRequests = tolong(p.httpAttempts)
| join kind=leftouter starts on operationId
| join kind=leftouter attempts on operationId
| extend startedRequests = coalesce(startedRequests, 0),
    completedRequests = coalesce(completedRequests, 0),
    failedRequests = coalesce(failedRequests, 0)
| extend sameOperationRecovery = outcome == "succeeded" and failedRequests > 0,
    countsReconcile = reportedRequests == startedRequests and startedRequests == completedRequests
| summarize operations = count(),
    recovered = countif(sameOperationRecovery),
    incompleteCounts = countif(not(countsReconcile)) by outcome
```

Allow enough time for in-flight requests to finish after abandonment and for telemetry delivery before interpreting incomplete counts.
Zero-request cache hits and coalesced callers reconcile as zero.
Missing or sampled events cannot prove recovery or a throttle violation.
