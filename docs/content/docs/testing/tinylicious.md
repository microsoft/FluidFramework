---
title: Tinylicious
menuPosition: 1
editor: sdeshpande3
---

## What is Tinylicious?

Tinylicious is a local, in-memory Fluid service intended for prototyping and development purpose. You can use both [AzureClient]]({{< relref "azureclient.md" >}}) and [TinyliciousClient]({{< relref "tinyliciousclient.md" >}}) with Tinylicious for testing purposes.

## Using Tinylicious locally

You can run Tinylicious locally by executing the following command:

```sh
npx tinylicious@latest
```

By default, Tinylicious runs on port `7070`. You can change port by setting the `PORT` environment variable when running Tinylicious. Setting environment variables will vary based on the shell you are using. For example, the `Windows PowerShell` commands below will run Tinylicious on port `6502`.

```sh
$env:PORT=6502
npx tinylicious@latest
```

Now Tinylicious is listening on port `6502`.

## How to deploy using Tinylicious

The `AzureClient` supports Tinylicious for development purposes in addition to deployed Azure Fluid Relay service instances for production scenarios.

`AzureClient` can be connected to a Tinylicious instance by passing in the configuration values shown below. You can use `InsecureTokenProvider` for token resolution while running the service locally for development purposes.

In the below code snippet, `AzureClient` is pointing to Tinylicious service. This is providing you with an added feature to work with both the local Tinylicious service and the deployed Azure Fluid Relay service. `TinyliciousClient` only works with local Tinylicous service.

```typescript
import { AzureClient, AzureConnectionConfig, LOCAL_MODE_TENANT_ID } from "@fluidframework/azure-client";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";

const user = {
    id: "UserId",
    name: "Test User",
};

const config: AzureConnectionConfig = {
    tenantId: LOCAL_MODE_TENANT_ID,
    tokenProvider: new InsecureTokenProvider("anyValue", user),
    // if you're running Tinylicious on a non-default port, you'll need change these URLs
    orderer: "http://localhost:7070",
    storage: "http://localhost:7070",
};

const clientProps = {
  connection: config,
}

const client = new AzureClient(clientProps);
```

To launch the local Tinylicious service instance, run `npx tinylicious@latest` from your terminal window.

##  Testing with Tinylicious and multiple clients

When testing, it can be useful to make Tinylicious available outside localhost. You can use a service like [ngrok](https://ngrok.com/) to expose the Tinylicious port on your local machine to the internet. ngrok gives you a random hostname for each tunnel you create and routes requests to your locally-running Tinylicious service.

To use Tinylicious with ngrok, use the following steps. If you do not have an ngrok account, you can sign up at <https://ngrok.com/>.

1. Sign in to the ngrok dashboard and click "Your Authtoken". You will need this token to authenticate with ngrok.

2. [Download ngrok](https://ngrok.com/download) and unzip the file.

3. Connect to your account by running the following command.

```sh
ngrok authtoken <YOUR NGROK AUTHTOKEN>
```

Running this command will add your authtoken to the default ngrok.yml configuration file.

4. Run Tinylicious service locally

```sh
npx tinylicious@latest
```

5. Fire ngrok. By default, Tinylicious is running on port 7070, so the `PORT_NUMBER` in the below command would be `7070`. If you are running againt a non-default port, the `PORT_NUMBER` would vary.

```sh
ngrok http PORT_NUMBER
```

After running this command, you will see the `Forwarding` URL in your terminal, which can be used to access Tinylicious by replacing the `orderer` and `storage` URLs in the `AzureConnectionConfig`.

If your ngrok account includes the capability to set custom domains or subdomains, you can use the following command to use a custom domain instead of a randomly-generated one.

```sh
ngrok http -hostname CUSTOM_DOMAIN_NAME PORT_NUMBER
```
