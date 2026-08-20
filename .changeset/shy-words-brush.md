---
"@fluidframework/core-interfaces": minor
"@fluidframework/telemetry-utils": minor
"@fluidframework/azure-client": minor
"fluid-framework": minor
"__section": breaking
"__highlight": true
---
Require a log level for every telemetry event

The `logLevel` parameter of [`ITelemetryBaseLogger.send`](https://fluidframework.com/docs/api/core-interfaces/itelemetrybaselogger-interface#send-methodsignature) and [`ITelemetryLoggerExt.send`](https://fluidframework.com/docs/api/telemetry-utils/itelemetryloggerext-interface) is now required.
Callers must select a [`LogLevel`](https://fluidframework.com/docs/api/core-interfaces/loglevel-typealias) for every event they log.
Custom logger implementations should declare the parameter so they match the updated interface, and they must forward it to any logger they wrap.

Explicitly specifying a level makes logging intent part of every call site, which enables consistent filtering and sampling of telemetry.

#### Migration

Pass a `LogLevel` for every event.
To preserve the behavior of a call that previously omitted the level, use [`LogLevel.essential`](https://fluidframework.com/docs/api/core-interfaces/loglevelconst-interface#essential-propertysignature):

```typescript
import { LogLevel } from "@fluidframework/core-interfaces";

// Before
logger.send({ category: "generic", eventName: "ExampleEvent" });

// After
logger.send({ category: "generic", eventName: "ExampleEvent" }, LogLevel.essential);
```

Loggers that wrap another logger should accept the level and pass it through:

```typescript
class ForwardingLogger implements ITelemetryBaseLogger {
	// ...
	public send(event: ITelemetryBaseEvent, logLevel: LogLevel): void {
		this.baseLogger.send(event, logLevel);
	}
}
```

See [microsoft/FluidFramework#27595](https://github.com/microsoft/FluidFramework/issues/27595) for more information.
