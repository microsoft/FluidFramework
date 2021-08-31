---
title: 'Tutorial: Create a Fluid Framework application'
menuPosition: 2
status: outdated
aliases:
  - "/docs/get-started/tutorial/"
  - "/start/tutorial/"
---

In this walkthrough, you'll learn about using the Fluid Framework by building a simple [DiceRoller](https://github.com/microsoft/FluidHelloWorld) application. To get started, go through the [Quick Start]({{< relref "./quick-start.md" >}}) guide.

{{< fluid_bundle_loader idPrefix="dice-roller"
    bundleName="dice-roller.12142020.js" >}}

In the DiceRoller app, users are shown a die with a button to roll it. When the die is rolled, Fluid Framework syncs the data across clients so everyone sees the same result. To do this, complete the following steps:

1. Application setup
2. Create a Fluid Container
3. Write the dice view
4. Connect view to Fluid data


## Application setup

To create a Fluid application that connects to the [Azure Fluid Relay service]({{< relref "../../deployment/azure-frs.md" >}}), start by creating a new instance of the Fluid Azure Client. The client is responsible for creating and loading containers as well as communicating changes between all of the collaborators. Learn more about configuring the [Azure FRS Client]({{< relref "../../deployment/azure-frs.md" >}}).

The containers our app creates require a configuration which defines the set of initial Distributed Data Structures that will be attached to the returned container. View our full list of [Distributed Data Structures]({{< relref "../../data-structures/overview.md" >}})

Lastly, `root` defines the HTML element that the Dice will render on.

```js
import { AzureClient } from "@fluidframework/azure-client";
import { SharedMap } from "fluid-framework";

const client = new AzureClient(localConfig);

const containerConfig = {
      initialObjects: { diceMap: SharedMap }
  };

const root = document.getElementById("root")
```

## Create a Fluid Container

Fluid collaboration happens in containers, which have unique identifiers (like a document filename) that must be created before other users can load them. Since creation and loading of containers both happen in the client our application needs to be capable of handling both paths.

### Create a new container

The create path of the application starts with calling `createContainer` and passing in the `containerConfig` defining which DDSes will be retuned on the `container`.

After setting some default values on the `diceMap`, the function attaches the `container`, allowing ops to be sent to and from the `client`, and returns the assigned `id` that will be used in the load path.

Now that the app has a connected container and default data, the dice roller view is ready to render.

```js
const createNewDice = async () => {
    const { container } = await client.createContainer(containerConfig);
    // Set default data
    container.initialObjects.diceMap.set("value", 1);
    // Attach container to service and return assigned ID
    id = container.attach();
    // load the dice roller
    renderDiceRoller(root, container.initialObjects.diceMap);
    return id;
  }
```
### Loading an existing container

The second path in the application is much more straight forward. The default data is already set, the container is already attached, and the `id` is passed into the function, rather than returned. Note that the same `containerConfig` needs to be passed in to both `createContainer` and `getContainer`.

```js
const loadExistingDice = async (id) => {
  const { container } = await client.getContainer(id, containerConfig);
  renderDiceRoller(root, container.initialObjects.diceMap);
}

```

### Switching between loading and creating

Since the application can be in one of two states, creating, or loading from an `id`, the app can simulate those states by storing the `id` in the URL hash. If the URL contains a hash the app will call `loadExistingDice` with that `id`, otherwise the app creates a new container and sets the hash to the returned `id`.

The create and load methods are both async, so the app needs to be wrapped in an async `start` function and then called, handling any errors returned.

```js

async function start() {
  if (location.hash) {
    await loadExistingDice(location.hash.substring[1])
  } else {
    const id = await createNewDice();
    location.hash = id;
  }
}
start().catch((error) => console.error(error));

```

## Defining the Dice view

Fluid is framework agnostic and works well with React, Vue, Angular and web components. This example will use nothing more than standard HTML/DOM methods, but you can see examples of other frameworks, as well as this example in full, in our [HelloWorld repo](https://github.com/microsoft/FluidHelloWorld).

### Start with a static view

In this tutorial we will start with a dice roller that works without Fluid locally, and then show how to add collaboration by changing a few key pieces.

This `renderDiceRoller`, given an HTML element to attach to, creates a working dice roller that displays a random dice value each time the "Roll" button is clicked. Note that this demo code omits styles for brevity.

```js
function renderDiceRoller(elem, diceMap) {
    const dice = document.createElement("div");

    const rollButton = document.createElement("button");
    rollButton.textContent = "Roll";
    rollButton.onclick = () => updateDice(Math.floor(Math.random() * 6));
    
    elem.append(dice, rollButton);

    const updateDice = (value) => {
        // Unicode 0x2680-0x2685 are the sides of a die (⚀⚁⚂⚃⚄⚅).
        dice.textContent = String.fromCodePoint(0x2680 + value);
    };
    updateDice(1);
}
```

### Modifying Fluid data

The first thing to change is what happens when the user clicks the `rollButton`. Instead of having the button update the state directly, the button updates the `value` key on the `diceMap`. This creates a new op on the client which will be communicated with all of the other collaborators.

Pushing local state out to Fluid data is a common pattern in Fluid applications because the view should react to local and remote changes in the same way.

```js
    rollButton.onclick = () => diceMap.set("value", Math.floor(Math.random() * 6));
```


### Relying on Fluid data

Secondly, the `updateDice` function will no longer take in an arbitrary value. The app can no longer directly modify the `dice.textContent`, the value is always retrieved from the Fluid `diceMap`.

```js
    const updateDice = () => {
        const value = diceMap.get("value");
        dice.textContent = String.fromCodePoint(0x2680 + value);
    };
    updateDice();
```

### Listening for Fluid changes

The values returned from `diceMap` are only a snapshot in time. To keep the data up to date as it changes an event listener must be set on the `diceMap` to call `updateDice` each time that the `valueChanged` event is fired. Visit each DDSes docs to see a list of events fired and the values passed to those events.

```js
    diceMap.on("valueChanged", () => updateDice());
```


## Run the app

The [full code for this application is available](https://github.com/microsoft/FluidHelloWorld) for you to try out. Try opening it in multiple browser windows to see the changes reflected between clients.

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers.md" >}}

<!-- Classes and interfaces -->

[ContainerRuntimeFactoryWithDefaultDataStore]: {{< relref "apis/aqueduct/containerruntimefactorywithdefaultdatastore.md" >}}
[DataObject]: {{< relref "apis/aqueduct/dataobject.md" >}}
[DataObjectFactory]: {{< relref "apis/aqueduct/dataobjectfactory.md" >}}
[Ink]: {{< relref "data-structures/ink.md" >}}
[PureDataObject]: {{< relref "apis/aqueduct/puredataobject.md" >}}
[PureDataObjectFactory]: {{< relref "apis/aqueduct/puredataobjectfactory.md" >}}
[SharedCell]: {{< relref "data-structures/cell.md" >}}
[SharedCounter]: {{< relref "data-structures/counter.md" >}}
[SharedDirectory]: {{< relref "data-structures/directory.md" >}}
[SharedMap]: {{< relref "data-structures/map.md" >}}
[SharedMatrix]: {{< relref "data-structures/matrix.md" >}}
[SharedNumberSequence]: {{< relref "data-structures/sequences.md" >}}
[SharedObjectSequence]: {{< relref "data-structures/sequences.md" >}}
[SharedSequence]: {{< relref "data-structures/sequences.md" >}}
[SharedString]: {{< relref "data-structures/string.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
