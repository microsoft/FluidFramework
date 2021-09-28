---
title: Tinylicious
menuPosition: 1
editor: sdeshpande3
---

## What is Tinylicious?

Tinylicious is a local, in-memory service used for prototyping and development purpose. You can find the code for the [Tinylicious service](https://github.com/microsoft/FluidFramework/tree/main/server/tinylicious) and [Tinylicious client](https://github.com/microsoft/FluidFramework/tree/main/packages/framework/tinylicious-client). It can be instantiated against both `AzureClient` and `TinyliciousClient` for testing purpose.

## Using Tinylicious locally

You can run tinylicious locally by executing the following command,

```sh
npx tinylicious
```

By default, Tinylicious runs on port `7070`, however you can change port by navigating to `server/tinylicious` and running the below command on `Windows Powershell` by specifying the port number,

```sh
$env:PORT=6502
npm run start
```

Now, you can navigate to `http://localhost:6502` on your browser to see Tinylicious service up and running.

## How to deploy using Tinylicious

The `AzureClient` supports both instantiating against a deployed Azure Fluid Relay service instance for production scenarios, as well as against a local, in-memory service instance, known as Tinylicious, for development purposes.

You can connect to a live Azure Fluid Relay instance by passing in the tenant ID as `local`, the orderer and storage URLs  pointing to the Tinylicious instance on the default values of `http://localhost:7070` to connect to a local Tinylicious server for development purposes. You can use `InsecureTokenProvider` for token resolution while running the service locally for development purposes.

In the below code snippet, `AzureClient` is pointing to Tinylicious service. This is providing you with an added feature to work with both the local Tinylicious service and the deployed Azure Fluid Relay service. `TinyliciousClient` only works with local Tinylicous service.

```typescript
import { AzureFunctionTokenProvider, AzureClient, AzureConnectionConfig } from "@fluidframework/azure-client";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";

const user = {
    id: "UserId",
    name: "Test User",
};

const connectionConfig: AzureConnectionConfig = {
    tenantId: "local",
    tokenProvider: new InsecureTokenProvider("fooBar", user),
    // if you're running Tinylicious on a non-default port, you'll need change these URLs
    orderer: "http://localhost:7070",
    storage: "http://localhost:7070",
};

const client = new AzureClient(connectionConfig);
```

To launch the local Tinylicious service instance, run `npx tinylicious` from your terminal window.

## Using custom domains with Tinylicious

You can use `ngrok` which lets you expose port on your local machine to the internet. Ngrok gives you a random hostname for each tunnel. This tool enables you to attach domains/subdomains against those tunnels.

1. Navigate to [ngrok](https://ngrok.com/) and Sign-up. There would be an `AUTH_TOKEN` generated on signing up.

2. Download [ngrok](https://ngrok.com/download) and unzip the folder

3. Connect to your account by running the following command,

```sh
ngrok authtoken AUTH_TOKEN
```

Running this command will add your authtoken to the default ngrok.yml configuration file.

4. Run Tinylicious service locally

```sh
npx tinylicious
```

5. Fire ngrok

```sh
ngrok http PORT_NUMBER
```

By default, Tinylicious is running on port 7070, so the `PORT_NUMBER` in the above command would be `7070`. If you are running againt a non-default port, the `PORT_NUMBER`  would vary. After running this command, you will see the `Forwarding` url in your terminal, which can be used to access Tinylicious.

If you are using the `Free` subscription of `ngrok`, there would random hexadecimal names generated to the HTTP tunnel opened for you. If you want to specify your subdomain, you would have to upgrade to their [paid plans](https://dashboard.ngrok.com/billing/plan). Once upgraded, you can run the below command by specifying your custom domain name and port number on which your local Tinylicious service is running.

```sh
ngrok http -hostname CUSTOM_DOMAIN_NAME PORT_NUMBER
```
