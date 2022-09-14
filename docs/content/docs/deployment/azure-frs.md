---
title: Connect to Azure Fluid Relay
menuPosition: 2
---

[Azure Fluid Relay](https://aka.ms/azurefluidrelay) is a cloud-hosted Fluid service.
You can connect your Fluid application to an Azure Fluid Relay instance using the `AzureClient` in the [@fluidframework/azure-client]({{< relref "/docs/apis/azure-client.md" >}}) package.
AzureClient handles the logic of connecting your [Fluid container]({{< relref "containers.md" >}}) to the service while keeping the container object itself service-agnostic.
You can use one instance of this client to manage multiple containers.

To learn more about using AzureClient and Azure Fluid Relay, see [Connect to an Azure Fluid Relay service](https://docs.microsoft.com/azure/azure-fluid-relay/how-tos/connect-fluid-azure-service).
