---
"@fluidframework/core-interfaces": minor
"@fluidframework/telemetry-utils": minor
"@fluidframework/azure-client": minor
"@fluidframework/devtools-view": minor
"fluid-framework": minor
"__section": breaking
"__highlight": true
---
Require a log level for every telemetry event

The `logLevel` parameter of `ITelemetryBaseLogger.send` and the inherited `ITelemetryLoggerExt.send` is now required.
Callers must select a `LogLevel` for every event they log.

Explicitly specifying a level makes logging intent part of every call site, which enables consistent filtering and sampling of telemetry.

#### Migration for callers

Pass a `LogLevel` for every event.
To preserve the behavior of a call that previously omitted the level, use `LogLevel.essential`:

```typescript
import { LogLevel } from "@fluidframework/core-interfaces";

// Before
logger.send({ category: "generic", eventName: "ExampleEvent" });

// After
logger.send({ category: "generic", eventName: "ExampleEvent" }, LogLevel.essential);
```

#### Migration for logger implementations

This is a compile-time requirement on callers only; nothing about how events are dispatched at runtime has changed.

Logger implementations should keep declaring `logLevel` as optional and treat an omitted level as `LogLevel.essential`:

```typescript
import {
	LogLevel,
	type ITelemetryBaseEvent,
	type ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";

class MyLogger implements ITelemetryBaseLogger {
	public send(event: ITelemetryBaseEvent, logLevel?: LogLevel): void {
		const level = logLevel ?? LogLevel.essential;
		// ...
	}
}
```

Fluid supports running with a mix of package versions, so code compiled before `logLevel` became required still calls `send(event)` with a single argument, and will for as long as those versions are supported.
An implementation that assumes `logLevel` is always defined can therefore silently drop those events or handle them at the wrong level.

This layer-compatibility guidance can be retired only after the compatibility window for callers that may omit `logLevel` has closed in a future coordinated breaking change.
See the `ITelemetryBaseLogger` API documentation and [microsoft/FluidFramework#27595](https://github.com/microsoft/FluidFramework/issues/27595) for more information.
