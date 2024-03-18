# Description

The telemetry-manager package contains code for managing production and consumption of typed telemetry intended for customers building Fluid Framework applications. The typed telemetry from this package is used as the backbone for different Fluid Framework cloud offerings such as dashboards and alarms for Fluid applications.

The telemetry is produced from internal system events, such as `IContainerEvent` (`@fluidframework/container-definitions`).

# High level design overview

At a high level, this package accomplishes producing and consuming telemetry with a few simple concepts

1. **Telemetry Producers** - Producers are responsible for taking in raw Fluid system events and producing the typed telemetry provided within this package.
2. **Telemetry Consumers** - Consumers are responsible for recieving typed telemetry events [`IExternalTelemetry`](./telemetry-manager/common/telemetry/index.ts).
    - One concrete implementation of this is emitting the telemetry to an external logging service, for example to Azure App insights [`AppInsightsTelemetryConsumer`](./telemetry-manager/common/consumers/appInsightsTelemetryConsumer.ts)
3. **Telemetry Managers** - Managers handle taking **Producers** and **Consumers** and linking them together create a pipeline for producing [`IExternalTelemetry`](./telemetry-manager/common/telemetry/index.ts), ideally with a focus on a specific set of events.
    - The [`ContainerTelemetryManager`](./telemetry-manager/container/telemetryManager.ts) is one such example focused on producing [`IContainerTelemetry`](./telemetry-manager/container/containerTelemetry.ts).

# Package Structure

`/common/` : Shared/common files such as interfaces used within the telemetry-manager pacakge

-   `/consumers/` : Shared/common files for **telemetry consumers** such as base interfaces and implementations
    that are not specific to specific domain of Fluid events

-   `/system-events/` : Shared/common files for Fluid system events such as the aggregate type for all Fluid system events [`ExternalTelemetryEventName`](./telemetry-manager/common/events/index.ts)

-   `/telemetry/` : Shared/common files for

`/container/` : Code files for specifically managing Fluid container events
