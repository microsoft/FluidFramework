---
"@fluidframework/core-interfaces": minor
"@fluidframework/telemetry-utils": minor
"@fluidframework/azure-client": minor
"fluid-framework": minor
"__section": breaking
"__highlight": true
---
Require a log level for every telemetry event

The `logLevel` parameter of `ITelemetryBaseLogger.send` and `ITelemetryLoggerExt.send` is now required.
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

#### Guidance for logger implementations

**Implementations should keep accepting a missing `logLevel` for now, and should not be updated to require it.**

This change is enforced only at compile time. Fluid supports running against a mix of package
versions, so code that was compiled before `logLevel` became required still calls `send(event)` with
a single argument and will keep doing so for as long as those versions are supported. An
implementation that assumes `logLevel` is defined would silently drop those events at runtime.

Declare the parameter as optional and default it to `LogLevel.essential`. TypeScript still accepts
such an implementation wherever an `ITelemetryBaseLogger` is required, so no cast is needed:

```typescript
class MyLogger implements ITelemetryBaseLogger {
	// Note: `logLevel` is intentionally optional; older callers may omit it.
	public send(event: ITelemetryBaseEvent, logLevel?: LogLevel): void {
		const level = logLevel ?? LogLevel.essential;
		// ...
	}
}
```

Loggers that wrap another logger should apply the same default when forwarding:

```typescript
class ForwardingLogger implements ITelemetryBaseLogger {
	// ...
	public send(event: ITelemetryBaseEvent, logLevel?: LogLevel): void {
		this.baseLogger.send(event, logLevel ?? LogLevel.essential);
	}
}
```

See [microsoft/FluidFramework#27595](https://github.com/microsoft/FluidFramework/issues/27595) for more information.
