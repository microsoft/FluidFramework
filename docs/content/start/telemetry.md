---
title: Quick Start
menuPosition: 4
codeCopyButton: true
aliases:
  - "/docs/get-started/telemetry/"
---


With thousands of developers using our framework to build their services and applications, telemetry is an essential part of maintaining and troubleshooting the health of the applications, so we are offering just that! We have integrated a way for the developers to set up a telemetry system by allowing them to create custom logging and handling logics to be passed in and called by our Fluid Framework telemetry pipeline.

## ITelemetryBaseLogger interface

The `ITelemetryBaseLogger` is an interface within the `@fluidframework/common-definitions` package. This interface can be implemented and passed into the `createContainer()` and `getContainer()` methods in `TinyliciousClient` as part of the `TinyliciousContainerConfig` type parameter.

```ts
export interface TinyliciousContainerConfig {
  id: string;
  logger?: ITelemetryBaseLogger;
}
```

```ts
public async createContainer(
  serviceContainerConfig: TinyliciousContainerConfig,
  containerSchema: ContainerSchema,
): Promise<[container: FluidContainer, containerServices: TinyliciousContainerServices]>
```


### Properties and methods

The interface contains a `supportTags` property and a `send()` method as shown:

```ts
export interface ITelemetryBaseLogger {
  /**
   * An optional boolean which indicates to the user of this interface that tags (i.e. `ITaggedTelemetryPropertyType`
   * objects) are in use. Eventually this will be a required property, but this is a stopgap that allows older hosts
   * to continue to pass through telemetry without trouble (this property will simply show up undefined), while our
   * current logger implementation in `telmetry-utils` handles tags in a separate manner.
   */
  supportsTags?: true;
  send(event: ITelemetryBaseEvent): void;
}
```

- Supports Tags
  - These tags are generic strings used to classify different events. In a simple logger, all events are untagged and handled the same by your logger's implementation. However, in some scenarios, where some data should be handled separately (e.g. private customer data), then it would be worthwhile to "tag" the event with some identifier.
- `send()`
  - The `send()` method is called by the container's telemetry system whenever a telemetry event occurs. This method takes in an ITelemetryBaseEvent type parameter, which is also within the `@fluidframework/common-definitions` package. Given this method is part of an interface, users can implement a custom telemetry logic for the container's telemetry system to execute.

### Adding complexity

Different levels of logging complexity can be achieved by adding other attributes to the object implementing the `ITelemetryBaseLogger` interface. For example, the `ITelemetryLogger` interface, also within the `@fluidframework/common-definitions` package, broke down telemetry events into different categories, allowing different logging logics for each category. However, it is imperative to ensure that the `send()` method is ultimately called since it is the actual method that is piped to the container's telemetry system and sends the telemetry event.

### ITelemetryBaseEvent interface

A telemetry event is any errors, performance, and informational (non-error) related events. An event is captured and labeled within the `ITelemetryBaseEvent` parameter mentioned previously. The `ITelemetryBaseEvent` is also an interface and implements the `ITelemetryProperties` type. This interface is the base interface for logging telemetry statements, allowing the user to have any number of properties and will serialize it as a JSON payload. With that said, the interface has 2 properties defined already, `eventName` and `category`. These 2 properties are used by the telemetry system to label and define the telemetry event that has occurred.

```ts
/**
 * Base interface for logging telemetry statements.
 * Can contain any number of properties that get serialized as json payload.
 * @param category - category of the event, like "error", "performance", "generic", etc.
 * @param eventName - name of the event.
 */
export interface ITelemetryBaseEvent extends ITelemetryProperties {
  category: string;
  eventName: string;
}
```

### Category

Currently, there are 3 categories used by the telemetry system:

- errors - used to classify known errors, e.g. duplicate data store IDs.
- performance - used to track metrics, e.g. used by the summarizer to track how long it takes to do or load a summary (if it's takes too long then even though its a performance event it'll be considered an error).
- generic - used as a catchall for events that are mostly harmless.

### Event name

This property is currently used by the telemetry system to indicate the event in a more descriptive manner.

### Adding complexity

Similar to the `ITelemetryBaseLogger` interface mentioned above, different levels of event complexity can also be achieved by adding other attributes to the object implementing the `ITelemetryBaseEvent` interface. Below are some examples:

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

The code snippet here implements a telemetry event without adding much complexity. The telemetry event object here adds only a few other attributes to the `ITelemetryBaseEvent`.

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

However, the code snippet here shows a telemetry event object that adds much more complex logics to determine the event that has occurred, then passed the resulting event to the `send()` method for the container's telemetry system to output.

Here is the above telemetry event object in action:

```ts
// Adding this event temporarily so that we can get help debugging if something goes wrong.
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

## Code example

With the interface already hooked up to the container's telemetry system, it is easy for users to write a custom telemetry object by implementing the `ITelemetryBaseLogger` interface and defining the `send()` method. Below is an example custom telemetry logger, `ConsoleLogger`, that implements the `ITelemetryBaseLogger` interface. As the name suggest, the `ConsoleLogger` defined the `send()` method to stringify the entire event object and print it out.

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

This custom logger is then created and passed into the `getContainer()` and `createContainer()` in a `TinyliciousClient` object. The custom logger is now hooked up to the container's telemetry system.

```ts
async function start(): Promise<void> {
    // Create a custom ITelemetryBaseLogger object to pass into the Tinylicious container
    // and hook to the Telemetry system
    const consoleLogger: ConsoleLogger = new ConsoleLogger();

    // Get or create the document depending if we are running through the create new flow
    const client = useFrs ? FrsClient :  new TinyliciousClient();
    const [fluidContainer, containerServices] = createNew
        ? await client.createContainer({ id: containerId, logger: consoleLogger }, containerSchema)
        : await client.getContainer({ id: containerId, logger: consoleLogger }, containerSchema);
```

Now, whenever a telemetry event is encountered, the custom `send()` method gets called and will print out the entire event object.

![ConsoleLogger_telemetry_in_action](/images/ConsoleLogger_telemetry_in_action.png "ConsoleLogger_telemetry_in_action")


