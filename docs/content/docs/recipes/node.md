---
title: Using Fluid with NodeJs
menuPosition: 3
author: sdeshpande3
aliases:
  - "/start/nodejs-tutorial/"
---

In this tutorial, you'll learn about using the Fluid Framework by building a simple application in NodeJS that enables connected clients to generate random numbers and display the result of any changes to the shared state.  You'll also learn how to connect the Fluid data layer in [Node](https://nodejs.org/).

To jump ahead into the finished demo, check out the [React demo in our FluidExamples repo](https://github.com/microsoft/FluidExamples/tree/main/node-demo).

The following image shows the random values generated open in four terminals....

<!-- image -->

The following image shows the same two clients one second later. Note that the value has updated to the very same time in four terminals.

<!-- image -->

{{< callout note >}}

This tutorial assumes that you are familiar with the [Fluid Framework Overview]({{< relref "/docs/_index.md" >}}) and that you have completed the [QuickStart]({{< relref "quick-start.md" >}}). You should also be familiar with the basics of [Node](https://nodejs.org/en/) and [creating Node projects](https://nodejs.org/en/about/).

{{< /callout >}}

## Create the project

1. Open a Command Prompt and navigate to the parent folder where you want to create the project; e.g., `c:\My Fluid Projects\fluid-node-tutorial`. The project is created in a subfolder named `fluid-node-tutorial`.

1. Run the following command at the prompt.

   ```dotnetcli
   npm init
   ```

1. The project uses two Fluid libraries:

    |Library |Description |
    |---|---|
    | `fluid-framework`    |Contains the SharedMap [distributed data structure]({{< relref "dds.md" >}}) that synchronizes data across clients. *This object will hold the most recent timestamp update made by any client.*|
    | `@fluidframework/tinylicious-client`   |Defines the connection to a Fluid service server and defines the starting schema for the [Fluid container][].|
    {.table}

    Run the following command to install the libraries.

    ```dotnetcli
    npm install @fluidframework/tinylicious-client fluid-framework readline-async
    ```

## Code the project

1. Create `\src\index.js` file in your code editor and add the imports. The file should look like the following:

   ```js
   import { TinyliciousClient } from "@fluidframework/tinylicious-client";
   import { SharedMap } from "fluid-framework";
   import readlineAsync from "readline-async";
   ```

### Move Fluid data to the terminal

1. The Fluid runtime will bring changes made to the timestamp from any client to the current client. But Fluid is agnostic about the UI framework. You can use a helper method to get the Fluid data, from the SharedMap object, into the view layer (the React state). Add the following code below the import statements. This method is called when the application loads the first time, and the value that is returned form it is assigned to a React state property.

    ```js
    const getFluidData = async () => {

        // TODO 1: Configure the container.
        // TODO 2: Get the container from the Fluid service.
        // TODO 3: Return the Fluid timestamp object.
    }
    ```

1. Replace `TODO 1` with the following code. Note that there is only one object in the container: a SharedMap holding the timestamp. Note also that `sharedRandomNumber` is the ID of the `SharedMap` object and it must be unique within the container.

    ```js
      const client = new TinyliciousClient();
      const containerSchema = {
          initialObjects: { sharedRandomNumber: SharedMap }
      };
    ```

1. Replace `TODO 2` with the following code. Note that `containerId` is being stored on the URL hash, and if there is no `containerId` we create a new container instead.

    ```js
    let container;
    let containerId = await readInput();
    if (!containerId) {
        ({ container } = await client.createContainer(containerSchema));
        const id = await container.attach();
        containerId = id;
    } else {
        ({ container } = await client.getContainer(containerId, containerSchema));
    }
    ```

1. Replace `TODO 3` with the following code.

    ```js
    return container.initialObjects;
    ```

### Get the Fluid data on application startup

### Keep the terminal synchronized with the Fluid data

## Start the Fluid server and run the application

In the Command Prompt, run the following command to start the Fluid service. Note that `tinylicious` is the name of the Fluid service that runs on localhost.

   ```dotnetcli
   npx tinylicious@latest
   ```

Open a new Command Prompt and navigate to the root of the project; for example, `C:/My Fluid Projects/fluid-node-tutorial`. Start the application server with the following command. The application opens in your terminal.

   ```dotnetcli
   npm run start:client
   ```

To create a new Fluid container press Enter. The container id will be printed in the terminal. Copy the container id, launch a new terminal window, and type/paste the initial container id to have multiple collaborative NodeJS clients.

## Next steps

- You can find the completed code for this example in our Fluid Examples GitHub repository [here](https://github.com/microsoft/FluidExamples/tree/main/node-demo).
- Try extending the demo with more key/value pairs and a more complex framework such as Express.
- Try changing the container schema to use a different shared data object type or specify multiple objects in `initialObjects`.

{{< callout tip >}}

When you make changes to the code the project will automatically rebuild and the application server will reload. However, if you make changes to the container schema, they will only take effect if you close and restart the application server. To do this, give focus to the Command Prompt and press Ctrl-C twice. Then run `npm run start:client` again.

{{< /callout >}}

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers.md" >}}

<!-- Classes and interfaces -->

[FluidContainer]: {{< relref "fluidcontainer.md" >}}
[IFluidContainer]: {{< relref "ifluidcontainer.md" >}}
[SharedCounter]: {{< relref "/docs/data-structures/counter.md" >}}
[SharedMap]: {{< relref "/docs/data-structures/map.md" >}}
[SharedNumberSequence]: {{< relref "sequences.md#sharedobjectsequence-and-sharednumbersequence" >}}
[SharedObjectSequence]: {{< relref "sequences.md#sharedobjectsequence-and-sharednumbersequence" >}}
[SharedSequence]: {{< relref "sequences.md" >}}
[SharedString]: {{< relref "string.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
