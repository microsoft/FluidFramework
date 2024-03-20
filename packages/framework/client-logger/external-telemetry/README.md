# Description

The telemetry-manager package contains code for managing production and consumption of typed telemetry intended for customers building Fluid Framework applications. The typed telemetry from this package is used as the backbone for different Fluid Framework cloud offerings such as dashboards and alarms for Fluid applications.

The telemetry is produced from internal system events, such as [`IContainerEvents`](../../../common/container-definitions/src/loader.ts).

# High level design overview

At a high level, this package accomplishes producing and consuming telemetry with a few simple concepts

1. **Telemetry Producers** - Producers are responsible for taking in raw Fluid system events and producing the typed telemetry provided within this package.
2. **Telemetry Consumers** - Consumers are responsible for recieving typed telemetry events [`IExternalTelemetry`](./telemetry-manager/common/telemetry/index.ts) and doing something with is. Consumers extend the base interface[`ITelemetryConsumer`](./telemetry-manager/common/consumers/index.ts).
    - One concrete implementation of this is emitting the telemetry to an external logging service, for example to Azure App insights [`AppInsightsTelemetryConsumer`](./telemetry-manager/common/consumers/appInsightsTelemetryConsumer.ts)
3. **Telemetry Managers** - Managers handle taking **Producers** and **Consumers** and linking them together create a pipeline for producing [`IExternalTelemetry`](./telemetry-manager/common/telemetry/index.ts), ideally with a focus on a specific set of events.
    - The [`ContainerTelemetryManager`](./telemetry-manager/container/telemetryManager.ts) is one such example focused on producing [`IContainerTelemetry`](./telemetry-manager/container/containerTelemetry.ts).

# Package Structure

`/common/` : Shared/common files such as interfaces used within the telemetry-manager pacakge

-   `/consumers/` : Shared/common files for **telemetry consumers** such as base interfaces and implementations
    that are not specific to specific domain of Fluid events

-   `/telemetry/` : Shared/common files for typed telemetry such as base interface `IExternalTelemetry`

`/container/` : Code files for specifically managing Fluid container events

-   `/containerSystemEvents.ts` : This file contains an enum [`ContainerSystemEventName`](./telemetry-manager/container/containerSystemEvents.ts) with a non-exhaustive set of the unique event names of raw system events from [`IContainerEvents`](../../../common/container-definitions/src/loader.ts) produced by Fluid containers.
    It's important to note that the type for each system events is a actually function signature such as

    ```
    (event: "readonly", listener: (readonly: boolean) => void): void;
    ```

    but that the [`ContainerSystemEventName`](./telemetry-manager/container/containerSystemEvents.ts) enum only captures the event name in each function.

-   `/containerTelemetry.ts` : This file contains the types for container telemetry that can be produced.

-   `/telemetryManager.ts` : This class manages container telemetry intended for customers to consume. It manages subcribing to the proper raw container system events, sending them to the [`ContainerEventTelemetryProducer`](./telemetry-manager/container/telemetryProducer.ts) to be transformed into [`IContainerTelemetry`](./telemetry-manager/container/containerTelemetry.ts) and finally sending them to the provided [`ITelemetryConsumer`](./telemetry-manager/common/consumers/index.ts)

-   `/telemetryProducer.ts` : This class produces [`IContainerTelemetry`](./telemetry-manager/container/containerTelemetry.ts) from raw container system events [`IContainerEvents`](../../../common/container-definitions/src/loader.ts) The class contains different helper methods for simplifying and standardizing logic for adding additional information necessary
    to produce different [`IContainerTelemetry`](./telemetry-manager/container/containerTelemetry.ts).

`/factory/` : Helps simplify the creation of one or more telemetry managers without having to worry too much about the underlying resources and components.

---
