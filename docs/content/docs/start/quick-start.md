---
title: Quick Start
menuPosition: 1
codeCopyButton: true
aliases:
  - "/docs/get-started/quick-start/"
  - "/start/quick-start/"
  - "/docs/start/"

---

In this Quick Start you will be getting a dice roller Fluid application up and running first on your computer's
localhost, then deploy it to an Azure Fluid Relay instance to collaborate with others.

{{< fluid_bundle_loader idPrefix="dice-roller"
bundleName="dice-roller.12142020.js" >}}

## Set up your development environment

To get started you need the following installed.

- [Node.js](https://nodejs.org/en/download) -- {{< include file="_includes/node-versions.md" >}}
- Code editor -- we recommend [Visual Studio Code](https://code.visualstudio.com/).

We also recommend that you install the following:

- [Git](https://git-scm.com/downloads)

## Getting started

Open a new command window and navigate to the folder you where you want to install the project, and then clone the
[FluidHelloWorld repo](https://github.com/microsoft/FluidHelloWorld) with the following commands. The cloning process
will create a subfolder named FluidHelloWorld with the project files in it.

```bash
git clone https://github.com/microsoft/FluidHelloWorld.git
```

{{< callout note >}}

If you don't have Git installed you can [click here](https://github.com/microsoft/FluidHelloWorld/archive/main.zip) to
download a zip of the FluidHelloWorld repo. Once the file downloads, extract the contents of the .zip file and run the
following steps.

{{< /callout >}}

Navigate to the newly created folder and install required dependencies.

```bash
cd FluidHelloWorld
npm install
```

Start both the client and a local server.

```bash
npm start
```

A new browser tab will open to <http://localhost:8080> and you will see the dice roller appear! To see collaboration in
action copy the full URL in the browser, including the ID, into a new window or even a different browser. This opens a
second client for your dice roller application. With both windows open, click the **Roll** button in either and note
that the state of the dice changes in both clients.

## Running against the Azure Fluid Relay service

To run against the Azure Fluid Relay service, you'll make a code change to ```app.ts```. The app is configured to use a
local in-memory service called Tinylicious, which runs on port 7070 by default.

To use an Azure Fluid Relay instance instead, replace the configuration values with your Azure Fluid Relay tenant ID,
orderer, and storage URLs that were provided as part of the onboarding process. Then pass that configuration object into
the `AzureClient` constructor:

```typescript
// This configures the AzureClient to use a remote Azure Fluid Relay Service instance.
const config: AzureConnectionConfig = {
    tenantId: "myTenantId",
    // IMPORTANT: this token provider is suitable for testing ONLY. It is NOT secure.
    tokenProvider: new InsecureTokenProvider("myTenantKey", { id: "UserId", name: "Test User" }),
    orderer: "https://myOrdererUrl",
    storage: "https://myStorageUrl",
}

const client = new AzureClient(config);
```

### TokenProvider

The Azure Fluid Relay onboarding process provides you with a secret key for your tenant. You can use
InsecureTokenProvider to generate and sign auth tokens such that the Azure Fluid Relay service service will accept it.
**To ensure that the secret doesn't get exposed, this should be replaced with another implementation of ITokenProvider
that fetches the token from a secure, developer-provided backend service prior to releasing to production.**

### Build and run the client only

Now that you've updated the `AzureClient` configuration, now run just the client to test it. You no longer need to run a
local service, because you're using the remote Azure Fluid Relay service instance!

```bash
npm run start:client
```

🥳**Congratulations**🎉 You have successfully taken the first step towards unlocking the world of Fluid collaboration.
