---
"@fluidframework/driver-definitions": minor
"@fluidframework/local-driver": minor
"@fluidframework/tinylicious-driver": minor
"fluid-framework": minor
"__section": feature
---
Collect container telemetry through ServiceClient

The alpha [ServiceOptions](https://fluidframework.com/docs/api/driver-definitions/serviceoptions-interface) interface now accepts an optional `logger`.
Session, ephemeral, and Tinylicious clients forward telemetry from containers they create or load to this logger.
Existing callers can omit the option without changing their behavior.

```typescript
import { startEphemeralService } from "@fluidframework/local-driver/alpha";

const service = startEphemeralService();
const client = service.newClient({
	oldestSupportedClient: "2.100.0",
	logger: {
		send(event) {
			console.log(event);
		},
	},
});
```

The same `logger` option is supported by `getSessionService().newClient(...)` and `createTinyliciousServiceClient(...)`.
