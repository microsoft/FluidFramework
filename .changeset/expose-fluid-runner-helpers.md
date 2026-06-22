---
"@fluidframework/fluid-runner": minor
"__section": other
---
New public APIs for loading containers from ODSP snapshots and collecting telemetry

Two new functions and their supporting types are now available in `@fluidframework/fluid-runner`:

**`createFluidRunnerLogger(filePath, options?)`** — Creates a file-backed telemetry logger that writes events to disk in JSON (default) or CSV format. Returns a `logger` (an `ITelemetryBaseLogger` to send events through) and a `fileLogger` (an `IFileLogger` whose `close()` method must be called when done to flush buffered events).

**`createFluidRunnerContainerAndExecute(snapshot, converter, logger, ...)`** — Loads a Fluid container from an ODSP snapshot (JSON string or binary `Uint8Array`), waits for it to catch up, then runs caller-provided code via an `IFluidFileConverter`. The container is automatically disposed after execution. Supports an optional timeout and the ability to disable network fetch to ensure fully offline operation.

**Typical usage:**

```ts
const { logger, fileLogger } = createFluidRunnerLogger("./telemetry.json");
const result = await createFluidRunnerContainerAndExecute(
  snapshotContent, myConverter, logger, options, timeout,
);
await fileLogger.close();
```

**Supporting types:**

- `IFileLogger` — A telemetry logger that writes to a file and exposes a `close()` method to flush buffered events.
- `IFileLoggerTelemetryOptions` — Configuration for the logger: output format (`JSON` or `CSV`), default properties added to every event, and flush batch size.

