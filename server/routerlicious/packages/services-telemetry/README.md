# @fluidframework/server-services-telemetry

Fluid server package containing telemetry utilities used across Fluid service code.

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on the Fluid Framework and packages within.

## Overview

The `services-telemetry` package is built around 3 main components:

1. A `Lumberjack` class: the main telemetry manager. `Lumberjack` is the telemetry interface to be used when instrumenting the code. It is a singleton responsible for managing a list of “engines” that implement the app-specific telemetry logic. It can be used to initialize a metric/data instance (which we call `Lumber`). It also supports the logging functionality.
2. An `ILumberjackEngine` interface: defining the requirements for an implementation of the engines employed by `Lumberjack`.
3. `Lumber`: the self-contained class representing a metric or event. `Lumber` should be created through `Lumberjack`, which will provide `Lumber` with the list of `LumberjackEngines` that define how to handle the data. After being created, `Lumber` can be used to add properties to a property bag and can be finally completed either as a successful or failed operation, while keeping track of duration of the event.

The idea behind `Lumberjack` is convenience, available through a globally accessible telemetry tool. It is customizable through the app-specific `ILumberjackEngine` implementations and is capable of handling 2 types of telemetry data. Metrics represent events or operations that can usually be associated with a result of success or failure, that can be measured in terms of duration and that can generally be used in the context of service monitoring/alerting. Logs, on the other hand, should be used in situations where there is no event being evaluated; in other words, where there is not an associated concept of success or failure, duration, etc.

At the start of each Node.js process, `Lumberjack` should be initialized so that it can be used in singleton style throughout the code. However, it is also possible to create individual instances of `Lumberjack` at any time. `Lumberjack` must be initialized with a mandatory `ILumberjackEngine[]` parameter (it uses each `ILumberjackEngine` in the list to emit the telemetry data according to the `ILumberjackEngine` logic). `Lumberjack` can also take an optional `ILumberjackSchemaValidator`, which defines the requirements for mandatory parameters and values associated with each `Lumber` instance.

## How to use

In these examples, we will be using [`WinstonLumberjackEngine`](https://github.com/microsoft/FluidFramework/blob/da99118135fc383fd69a401a48d6b99caaa18378/server/routerlicious/packages/services-utils/src/winstonLumberjackEngine.ts#L11) as our `ILumberjackEngine` sample implementation.

### Initializing Lumberjack

```typescript
// Singleton style, at the start of each process
const lumberjackEngine = new WinstonLumberjackEngine();
Lumberjack.setup([lumberjackEngine]);

// Instance style
const lumberjackEngine = new WinstonLumberjackEngine();
const customInstance = Lumberjack.createInstance([lumberjackEngine]);
```

In [FluidFramework Server code](https://github.com/microsoft/FluidFramework/tree/main/server), `Lumberjack` initialization is taken care of automatically thanks to [`configureLogging()`](https://github.com/microsoft/FluidFramework/blob/da99118135fc383fd69a401a48d6b99caaa18378/server/routerlicious/packages/services-utils/src/logger.ts#L24) in the `server-services-utils` package.

### Metrics

Metrics are associated with types of events, and each event type should have a unique name. The list of Events is kept in the [`LumberEventName` enum](https://github.com/microsoft/FluidFramework/blob/main/server/routerlicious/packages/services-telemetry/src/lumberEventNames.ts). `Lumberjack` also supports simple `string` event names. Example:

```typescript
const lumberJackMetric = Lumberjack.newLumberMetric(LumberEventName.DeliHandler);

lumberJackMetric.setProperties({
    [BaseTelemetryProperties.tenantId]: this.tenantId,
    [BaseTelemetryProperties.documentId]: this.documentId,
});

try {
    ... // Event being tracked
    lumberJackMetric.success("Success message!");
}
catch (error) {
    lumberJackMetric.error("Error message :(", error);
}
```

### Logs

`Lumberjack` provides a static method for logging. Example:

```typescript
const props = {
	property1: "prop1",
	property2: "prop2",
};

Lumberjack.log("Sample message", LogLevel.Info, properties);
```

### Global Telemetry Context

When using Lumberjack in Node.js, we can take advantage of [Node.js Asynchronous Context](https://nodejs.org/docs/latest-v18.x/api/async_context.html#class-asyncresource) to bind telemetry properties to the async context which ensures their availability in telemetry without manually adding them to a log's properties param.

```typescript
import {
	getGlobalTelemetryContext,
	bindTelemetryContext,
} from "@fluidframework/server-services-telemetry";
import { configureLogging } from "@fluidframework/server-services-utils";

// Do this once at server boot.
// By default, this will enable global context using Node.js AsyncLocalStorage.
configureLogging(configPath);

// Do this in codepath entrypoints when common telemetry properties become available.
getGlobalTelemetryContext().bindProperties({ documentId }, () => {
	// INSIDE OF documentId CONTEXT
	getGlobalTelemetryContext().bindProperties({ tenantId }, () => {
		// INSIDE OF tenantId, documentId CONTEXT
		getGlobalTelemetryContext().bindProperties({ sessionId, tenantId: "override" }, () => {
			// INSIDE OF tenantId: "override", documentId, sessionId CONTEXT
		});
		// INSIDE OF tenantId, documentId CONTEXT
	});
});

// You can also use async/await
const result = await getGlobalTelemetryContext().bindPropertiesAsync({ documentId }, async () => {
	// INSIDE OF documentId CONTEXT
	const apiResult = await callApi();
	return apiResult;
});

// Do this in your Express.js app
app.use(bindTelemetryContext());
```
