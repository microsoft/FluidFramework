---
title: "Tutorial: Writing a TokenProvider with an Azure Function"
menuPosition: 3
editor: sdeshpande3
---

In the [Fluid Framework](https://fluidframework.com/), TokenProviders are responsible for creating and signing tokens that the `@fluidframework/azure-client` uses to make requests to the Azure Fluid Relay service. The Fluid Framework provides a simple, insecure TokenProvider for development purposes, aptly named **InsecureTokenProvider**. Each Fluid service must implement a custom TokenProvider based on the particular service's authentication and security considerations.

Each Azure Fluid Relay resource you create is assigned a **tenant ID** and its own unique **tenant secret key**. The secret key is a **shared secret**. Your app/service knows it, and the Azure Fluid Relay service knows it. TokenProviders must know the secret key to sign requests, but the secret key can't be included in client code.

To learn more about using TokenProviders, see [How to: Write a TokenProvider with an Azure Function](https://learn.microsoft.com/en-us/azure/azure-fluid-relay/how-tos/azure-function-token-provider).
