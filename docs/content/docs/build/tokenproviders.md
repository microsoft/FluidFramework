---
title: "Tutorial: Writing a TokenProvider with an Azure Function"
menuPosition: 3
editor: sdeshpande3
---

In the [Fluid Framework](https://fluidframework.com/), TokenProviders are responsible for creating and signing tokens that the `@fluidframework/azure-client` uses to make requests to the Azure Fluid Relay service. Each Fluid service must implement a custom TokenProvider based on the particular service's authentication and security considerations.

To learn more about using TokenProviders, see [How to: Write a TokenProvider with an Azure Function](https://learn.microsoft.com/azure/azure-fluid-relay/how-tos/azure-function-token-provider).
