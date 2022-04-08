---
title: Available Fluid services
menuPosition: 1
---

The Fluid Framework can be used with any compatible service implementation. Some services, like Tinylicious, are intended only for testing and development, while other hosted options provide the high scalability needed for production-quality applications.

## Tinylicious

[Tinylicious]({{< relref "tinylicious.md" >}}) is a minimal, self-contained implementation of the Fluid Framework service that is much smaller (tinier!) than Routerlicious, the reference implementation of the service.

Tinylicious is intended for testing and development only.

{{% callout tip %}}

The easiest way to try out Fluid is with Tinylicious or Azure Fluid Relay.

{{% /callout %}}

## Azure Fluid Relay

Microsoft [Azure Fluid Relay](https://aka.ms/azurefluidrelay) is a hosted Fluid service. You can [provision Fluid Relay services](https://docs.microsoft.com/azure/azure-fluid-relay/how-tos/provision-fluid-azure-portal) as part of your Microsoft Azure subscription and use the [@fluidframework/azure-client]({{< relref "azure-client.md" >}}) library to create and load Fluid containers.

Learn more in the [Azure Fluid Relay documentation](https://aka.ms/azurefluidrelaydocs).

## Self-hosted Routerlicious

Fluid Framework's original service implementation, called [Routerlicious][r11s], is part of the Fluid Framework open source project. Routerlicious is not formally supported as a production-quality service, but you can run it using Docker. See the [Routerlicious readme][r11s] for more information about running it.

[r11s]: https://github.com/microsoft/FluidFramework/tree/main/server#readme
