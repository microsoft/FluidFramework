---
title: Logging and telemetry
menuPosition: 2
aliases:
  - "/docs/start/telemetry"
---


Telemetry is an essential part of maintaining the health of modern applications. Fluid Framework provides a way to plug
in your own logic to handle telemetry events sent by Fluid. This enables you to integrate the Fluid telemetry along with
your other telemetry, and route the event data in whatever way you need.

## Collect Fluid Framework logs with a custom `ITelemetryBaseLogger`

The `ITelemetryBaseLogger` is an interface within the `@fluidframework/common-definitions` package. This interface can
be implemented and passed into the client's constructor via the props parameter.

All Fluid service clients (for example, `AzureClient` and `TinyliciousClient`) allow passing a `logger?: ITelemetryBaseLogger`
into the service client props. Both `createContainer()` and `getContainer()` methods will
create an instance of a `Loader` class object, where the logger defined in the service client props is passed in
as an optional parameter, `ILoaderProps.logger`, to the `Loader` constructor.

[TinyliciousClientProps](https://github.com/microsoft/FluidFramework/blob/main/packages/framework/tinylicious-client/src/interfaces.ts#L17)
interface definition takes an optional parameter `logger`. (The definition is similar to
[AzureClientProps](https://github.com/microsoft/FluidFramework/blob/main/packages/framework/azure-client/src/interfaces.ts#L22) interface)

```ts
const loader = new Loader({
  urlResolver: this.urlResolver,
  documentServiceFactory: this.documentServiceFactory,
  codeLoader,
  logger: tinyliciousContainerConfig.logger,
});
```

The `Loader` constructor is called by both `createContainer()` and `getContainer()`, and requires a `ILoaderProps`
interface as its constructor argument. `ILoaderProps` interface has an optional logger parameter that will take the
`ITelemetryBaseLogger` defined by the user.

[ILoaderProps.logger](https://github.com/microsoft/FluidFramework/blob/main/packages/loader/container-loader/src/loader.ts#L313)
is used by `Loader` to pipe to container's telemetry system.

### Properties and methods

The interface contains a `send()` method as shown:

```ts
export interface ITelemetryBaseLogger {
  send(event: ITelemetryBaseEvent): void;
}
```

- `send()`
  - The `send()` method is called by the container's telemetry system whenever a telemetry event occurs. This method
    takes in an ITelemetryBaseEvent type parameter, which is also within the `@fluidframework/common-definitions`
    package. Given this method is part of an interface, users can implement a custom telemetry logic for the container's
    telemetry system to execute.

### Customizing the logger object

In some cases you may wish to add custom attributes to the object implementing the `ITelemetryBaseLogger` interface. For
example, you may wish to handle some categories differently than others, or you may want to label categories based on
the input.

Regardless of your logic, `ITelemetryBaseLogger` must be implemented, and you must call the `send()` method ultimately
since it is the actual method that is piped to the container's telemetry system and sends the telemetry event.

To see an example of building custom logic into the telemetry implementation, see the `ITelemetryLogger` interface
snippets below, or in the `@fluidframework/common-definitions` package for full details.

```ts
// @public
export interface ITelemetryLogger extends ITelemetryBaseLogger {
    send(event: ITelemetryBaseEvent): void;
    sendErrorEvent(event: ITelemetryErrorEvent, error?: any): void;
    sendPerformanceEvent(event: ITelemetryPerformanceEvent, error?: any): void;
    sendTelemetryEvent(event: ITelemetryGenericEvent, error?: any): void;
}
```

`ITelemetryLogger` interface breaks down telemetry events into different categories, and will contains different logic
for different events.

```ts
/**
 * Send a telemetry event with the logger
 *
 * @param event - the event to send
 * @param error - optional error object to log
 */
public sendTelemetryEvent(event: ITelemetryGenericEvent, error?: any) {
  const newEvent: ITelemetryBaseEvent = {
    ...event,
    category: event.category ?? (error === undefined ?  "generic" : "error"),
  };
  if (error !== undefined) {
    TelemetryLogger.prepareErrorObject(newEvent, error, false);
  }
  this.send(newEvent);
}
```

Like demonstrated here, it is imperative to ensure `send()` is ultimately called at the end of custom properties for the
information to be piped to the container's telemetry system and sends the telemetry event.

## ITelemetryBaseEvent interface

All Fluid telemetry events are sent as `ITelemetryBaseEvent`s via the `send()` method in `ITelemetryBaseLogger`. This
interface can be augmented, allowing you to add additional properties that will be serialized as JSON. The default
required properties, `eventName` and `category`, are set by the telemetry system.

```ts
export interface ITelemetryBaseEvent extends ITelemetryProperties {
  category: string;
  eventName: string;
}

export interface ITelemetryProperties {
    [index: string]: TelemetryEventPropertyType | ITaggedTelemetryPropertyType;
}

export interface ITaggedTelemetryPropertyType {
  value: TelemetryEventPropertyType,
  tag: string,
}

export type TelemetryEventPropertyType = string | number | boolean | undefined;
```

The `ITelemetryBaseEvent` interface contains `category` and `eventName` properties for labeling and defining a telemetry event,
and extends `ITelemetryProperties` which has a string index signature. The values of the index signature are
either tagged (`ITaggedTelemetryPropertyType`) or untagged (`TelemetryEventPropertyType`) primitives (`string`,
`boolean`, `number`, `undefined`).

### Understanding Tags

Tags are strings used to classify the properties on telemetry events. In the course of operation,
the Fluid Framework may emit events with tagged properties, so implementations of `ITelemetryBaseLogger` must be
prepared to check for and interpret any tags.  Generally speaking, when logging to the user's console, tags can
be ignored and tagged values logged plainly, but when transmitting tagged properties to a telemetry service,
care should be taken to only log tagged properties where the tag is explicitly understood to indicate the value
is safe to log from a data privacy standpoint.

### Category

The Fluid Framework sends events in the following categories:

- error -- used to identify and report error conditions, e.g. duplicate data store IDs.
- performance -- used to track performance-critical code paths within the framework. For example, the summarizer tracks
  how long it takes to create or load a summary and reports this information in an event.
- generic -- used as a catchall for events that are informational and don't represent an activity with a duration like a
  performance event.

### EventName

This property contains a unique name for the event.

### Customizing logged events

Similar to the `ITelemetryBaseLogger` interface mentioned above, different levels of event complexity can also be
achieved by adding other attributes to the object implementing the `ITelemetryBaseEvent` interface. Below are some
examples:

```ts
if (chunk.version !== undefined) {
  logger.send({
      eventName: "MergeTreeChunk:serializeAsMinSupportedVersion",
      category: "generic",
      fromChunkVersion: chunk.version,
      toChunkVersion: undefined,
  });
}
```

The code snippet here implements a telemetry event without adding much complexity. The telemetry event object here adds
only a few other attributes to the `ITelemetryBaseEvent`.

```ts
/**
 * Send a telemetry event with the logger
 *
 * @param event - the event to send
 * @param error - optional error object to log
 */
public sendTelemetryEvent(event: ITelemetryGenericEvent, error?: any) {
  const newEvent: ITelemetryBaseEvent = {
    ...event,
    category: event.category ?? (error === undefined ?  "generic" : "error"),
  };
  if (error !== undefined) {
    TelemetryLogger.prepareErrorObject(newEvent, error, false);
  }
  this.send(newEvent);
}
```

However, the code snippet here shows a telemetry event object that adds much more complex logic to determine the event
that has occurred, then passes the resulting event to the `send()` method for the container's telemetry system to
output.

Here is the above telemetry event object in action:

```ts
this.logger.sendTelemetryEvent({
  eventName: "connectedStateRejected",
  source,
  pendingClientId: this.pendingClientId,
  clientId: this.clientId,
  hasTimer: this.prevClientLeftTimer.hasTimer,
  inQuorum: protocolHandler !== undefined && this.pendingClientId !== undefined
      && protocolHandler.quorum.getMember(this.pendingClientId) !== undefined,
});
```

Another point worth noting is that with the customized logics, it is a great place where you can send these events to
your external telemetry system to have them logged.

## Code example

With the interface already hooked up to the container's telemetry system, it is easy for users to write a custom
telemetry object by implementing the `ITelemetryBaseLogger` interface and defining the `send()` method. Below is an
example custom telemetry logger, `ConsoleLogger`, that implements the `ITelemetryBaseLogger` interface. As the name
suggests, the `ConsoleLogger` defined the `send()` method to stringify the entire event object and print it to the
browser console.

```ts
import { ITelemetryBaseLogger, ITelemetryBaseEvent } from "@fluidframework/common-definitions";

// Define a custom ITelemetry Logger. This logger will be passed into TinyliciousClient
// and gets hooked up to the Tinylicious container telemetry system.
export class ConsoleLogger implements ITelemetryBaseLogger {
    constructor() {}
    send(event: ITelemetryBaseEvent) {
        console.log("Custom telemetry object array: ".concat(JSON.stringify(event)));
    }
}
```

This custom logger should be provided in the service client constructor and will be created when creating or getting
the container. Once the container is returned, the custom logger is now hooked up to the container's telemetry system.

```ts
async function start(): Promise<void> {
  // Create a custom ITelemetryBaseLogger object to pass into the Tinylicious container
  // and hook to the Telemetry system
  const azureConfig = {
      connection: connectionProps,
      logger: new ConsoleLogger(),
  };
  const client = new AzureClient(azureConfig);
  let container: FluidContainer;
  let services: AzureContainerServices;

  // Get or create the document depending if we are running through the create new flow
  const createNew = !location.hash;
  if (createNew) {
      // The client will create a new detached container using the schema
      // A detached container will enable the app to modify the container before attaching it to the client
      {container, services} = await client.createContainer(containerSchema);
  }
```

Now, whenever a telemetry event is encountered, the custom `send()` method gets called and will print out the entire
event object.

<img src="https://fluidframework.blob.core.windows.net/static/images/consoleLogger_telemetry_in_action.png" alt="The
  ConsoleLogger sends telemetry events to the browser console for display.">

{{% callout warning %}}

The purpose of `ConsoleLogger` is purely to demonstrate how the `ITelemetryBaseLogger` interface should be implemented. The
Fluid Framework provides `DebugLogger` by default if a custom logger is not provided. For more information, please refer to
[Using DebugLogger](#using-debuglogger) below instead of implementing something similar to `ConsoleLogger`.

{{% /callout %}}

### Using `DebugLogger`

The `DebugLogger` offers a convenient way to output all telemetry events to the console. Like mentioned previously, creating
or getting a container creates a `Loader` object, which then also provides a `DebugLogger` as a mixin in its constructor. Hence,
`DebugLogger` is already present by default when creating/getting a container, and no extra steps are required to use it.

Under the hood, `DebugLogger` uses the [debug](https://github.com/visionmedia/debug) library. `Debug` allows a library to log
messages to a namespace. By default these messages aren't displayed but can be enabled by the app that is using the library. For
our node apps enabling library logging can be done by setting the DEBUG environment variable - i.e.

In the browser you can enable them by setting `localStorage.debug` variable, after which you will need to reload the page.

`localStorage.debug = 'fluid:*'`

