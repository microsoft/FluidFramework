---
title: Available Fluid services
menuPosition: 1
---

The Fluid Framework can be used with any compatible service implementation. Some services, like Tinylicious, are
intended only for testing and development, while other hosted options provide the high scalability needed for
production-quality applications.

## Tinylicious

[Tinylicious]({{< relref "tinylicious.md" >}}) is a minimal, self-contained implementation of the Fluid Framework
service that is much smaller (tinier!) than Routerlicious, the reference implementation of the service.

Tinylicious is intended for testing and development only.

## Azure Fluid Relay service

Microsoft Azure Fluid Relay service is a hosted Fluid service. You can provision Fluid Relay services as part of your
Microsoft Azure subscription and use the [@fluidframework/azure-client]({{< relref "azure-client.md" >}}) library to
create and load Fluid containers.

{{% callout important %}}

Azure Fluid Relay service is currently in *Private Preview*.

{{% /callout %}}

## Self-hosted Routerlicious

Fluid Framework's original service implementation, called [Routerlicious](https://github.com/microsoft/FluidFramework/tree/main/server), is part of the Fluid Framework open source
project. Routerlicious is not formally supported as a production-quality service, but its micro-service architecture is suitable for
deployment in cloud environments.

{{% callout tip %}}

The easiest way to try out Fluid is with Tinylicious or Azure Fluid Relay service.

{{% /callout %}}
