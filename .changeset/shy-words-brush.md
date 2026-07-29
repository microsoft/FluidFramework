---
"@fluidframework/core-interfaces": minor
"@fluidframework/telemetry-utils": minor
"@fluidframework/azure-client": minor
"fluid-framework": minor
"__section": breaking
---
Require a log level for every telemetry send

The `logLevel` parameter of `ITelemetryBaseLogger.send` and `ITelemetryLoggerExt.send` is now required.
Logger implementations must accept the level, and callers must select one for every event.

To preserve the previous behavior of a call that omitted the level, pass `LogLevel.essential`.

```typescript
import { LogLevel } from "@fluidframework/core-interfaces";

logger.send(
	{
		category: "generic",
		eventName: "ExampleEvent",
	},
	LogLevel.essential,
);
```
