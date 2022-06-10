---
title: 'Tutorial: DiceRoller application'
menuPosition: 2
aliases:
  - "/docs/get-started/tutorial/"
  - "/start/tutorial/"
---

In this walkthrough, you'll learn about using the Fluid Framework by examining the DiceRoller application at <https://github.com/microsoft/FluidHelloWorld>. To get started, go through the [Quick Start]({{< relref "quick-start.md" >}}) guide.

{{< fluid_bundle_loader idPrefix="dice-roller"
    bundleName="dice-roller.2021-09-24.js" >}}

In the DiceRoller app, users are shown a die with a button to roll it. When the die is rolled, the Fluid Framework syncs the data across clients so everyone sees the same result. To do this, complete the following steps:

1. [Set up the application](#set-up-the-application).
2. [Create a Fluid container](#create-a-fluid-container).
3. [Write the dice view](#write-the-dice-view).
4. [Connect the view to Fluid data](#connect-the-view-to-fluid-data).

All of the work in this demo will be done in the [app.js](https://github.com/microsoft/FluidHelloWorld/blob/main/src/app.js) file.

## Set up the application

Start by creating a new instance of the Tinylicious client. Tinylicious is the Fluid Framework's local testing server, and a client is responsible for creating and loading containers.

The app creates Fluid containers using a schema that defines a set of *initial objects* that will be available in the container. Learn more about initial objects in [Data modeling]({{< relref "data-modeling.md" >}}).

Lastly, `root` defines the HTML element that the Dice will render on.

```js
import { SharedMap } from "fluid-framework";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";

const client = new TinyliciousClient();

const containerSchema = {
      initialObjects: { diceMap: SharedMap }
  };

const root = document.getElementById("root")
```

\* To create a Fluid application that can be deployed to Azure, check out the [Azure Fluid Relay]({{< relref "azure-frs.md" >}}).

## Create a Fluid container

Fluid data is stored within containers, and these containers need to be created before other users can load them. Since creation and loading of containers both happen in the browser, a Fluid application needs to be capable of handling both paths.

### Create a new container

The creation section of the application starts with calling `createContainer` and passing in a schema defining which shared objects will be available on the new `container`. After a new container is created, default data can be set on the shared objects before the container is attached to the Tinylicious service.

The attach call returns the `id` of the container, which the app can later use to load this container. Once attached, any further changes to the shared objects, made by the rendered app, will be communicated to all collaborators.

```js
const createNewDice = async () => {
    const { container } = await client.createContainer(containerSchema);
    // Set default data
    container.initialObjects.diceMap.set("dice-value-key", 1);
    // Attach container to service and return assigned ID
    const id = container.attach();
    // load the dice roller
    renderDiceRoller(container.initialObjects.diceMap, root);
    return id;
  }
```

### Loading an existing container

Loading a container is more straightforward than creating a new one. When loading, the container already contains data, and is already attached, so those steps are irrelevant. You need only to pass the `id` of the container you wish to load in the `getContainer()` function along with the same schema used when creating the container.

```js
const loadExistingDice = async (id) => {
  const { container } = await client.getContainer(id, containerSchema);
  renderDiceRoller(container.initialObjects.diceMap, root);
}

```

### Switching between loading and creating

The application supports both creating a new container and loading an existing container using its `id`.
To control which state the app is in, this sample app stores the container ID in the URL hash.
If the URL has a hash, the app will load that existing container.
Otherwise, the app creates a new container, attaches it, and sets the returned `id` as the hash.

Because both the `getContainer` and `createContainer` methods are async, the `start` function needs to be created and then called, catching any errors that are returned.

```js
async function start() {
  if (location.hash) {
    await loadExistingDice(location.hash.substring(1))
  } else {
    const id = await createNewDice();
    location.hash = id;
  }
}
start().catch((error) => console.error(error));

```

## Write the dice view

The Fluid Framework is view framework agnostic and works well with React, Vue, Angular and web components. This example uses standard HTML/DOM methods to render a view. You can see examples of the previously mentioned frameworks in the [FluidExamples repo](https://github.com/microsoft/FluidExamples/tree/main/multi-framework-diceroller).

### Start with a static view

It is simplest to create the view using local data without Fluid, then add Fluid by changing some key pieces of the app. This tutorial uses this approach.

The `renderDiceRoller` function appends the `diceTemplate` to the passed in HTML element, and creates a working dice roller with a random dice value each time the "Roll" button is clicked. The `diceMap` will be used in the next few steps.

```js
const diceTemplate = document.createElement("template");

diceTemplate.innerHTML = `
  <div class="wrapper">
    <div class="dice"></div>
    <button class="roll"> Roll </button>
  </div>
`
function renderDiceRoller(diceMap, elem) {
    elem.appendChild(diceTemplate.content.cloneNode(true));
    const rollButton = elem.querySelector(".roll");
    const dice = elem.querySelector(".dice");

    rollButton.onclick = () => updateDice(Math.floor(Math.random() * 6)+1);

    const updateDice = (value) => {
        // Unicode 0x2680-0x2685 are the sides of a die (⚀⚁⚂⚃⚄⚅).
        dice.textContent = String.fromCodePoint(0x267f + value);
    };
    updateDice(1);
}
```

## Connect the view to Fluid data

### Modifying Fluid data

To begin using Fluid in the application, the first thing to change is what happens when the user clicks the `rollButton`. Instead of updating the local state directly, the button updates the number stored in the `value` key of the passed in `diceMap`. Because the `diceMap` is a Fluid `SharedMap`, changes will be distributed to all clients. Any changes to the `diceMap` will cause a `valueChanged` event to be emitted, and an event handler can trigger an update of the view.

This pattern is common in Fluid because it enables the view to behave the same way for both local and remote changes.

```js
    rollButton.onclick = () => diceMap.set("dice-value-key", Math.floor(Math.random() * 6)+1);
```


### Relying on Fluid data

The next change that needs to be made is to change the `updateDice` function so it no longer accepts an arbitrary value. This means the app can no longer directly modify the local dice value. Instead, the value will be retrieved from the `SharedMap` each time `updateDice` is called.

```js
    const updateDice = () => {
        const diceValue = diceMap.get("dice-value-key");
        dice.textContent = String.fromCodePoint(0x267f + diceValue);
    };
    updateDice();
```

### Handling remote changes

The values returned from `diceMap` are only a snapshot in time. To keep the data up to date as it changes an event handler must be set on the `diceMap` to call `updateDice` each time that the `valueChanged` event is sent. See the [documentation for SharedMap][SharedMap] to get a list of events fired and the values passed to those events.

```js
    diceMap.on("valueChanged", updateDice);
```


## Run the app

The [full code for this application is available](https://github.com/microsoft/FluidHelloWorld) for you to try out. Try opening it in multiple browser windows to see the changes reflected between clients.

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers.md" >}}

<!-- Classes and interfaces -->

[FluidContainer]: {{< relref "fluidcontainer.md" >}}
[IFluidContainer]: {{< relref "ifluidcontainer.md" >}}
[SharedCounter]: {{< relref "/docs/data-structures/counter.md" >}}
[SharedMap]: {{< relref "/docs/data-structures/map.md" >}}
[SharedSequence]: {{< relref "sequences.md" >}}
[SharedString]: {{< relref "string.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
