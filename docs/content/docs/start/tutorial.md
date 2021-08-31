---
title: 'Tutorial: Create a Fluid Framework application'
menuPosition: 2
status: outdated
aliases:
  - "/docs/get-started/tutorial/"
  - "/start/tutorial/"
---

In this walkthrough, you'll learn about using the Fluid Framework by examining the DiceRoller application at [https://github.com/microsoft/FluidHelloWorld](https://github.com/microsoft/FluidHelloWorld). To get started, go through the [Quick Start]({{< relref "quick-start.md" >}}) guide.

{{< fluid_bundle_loader idPrefix="dice-roller"
    bundleName="dice-roller.12142020.js" >}}

In the DiceRoller app, users are shown a die with a button to roll it. When the die is rolled, the Fluid Framework syncs the data across clients so everyone sees the same result. To do this, complete the following steps:

1. Set up the application.
2. Create a Fluid container.
3. Write the dice view.
4. Connect the view to Fluid data.

The first two steps can be viewed in the DiceRoller's [app.ts](https://github.com/microsoft/FluidHelloWorld/blob/main/src/app.ts), while the last two are done in [jsView.ts](https://github.com/microsoft/FluidHelloWorld/blob/main/src/view/jsView.ts).

## Set up the application

To create a Fluid application that connects to the [Azure Fluid Relay service]({{< relref "azure-frs.md" >}}), start by creating a new instance of the Azure Fluid Relay service client. The client is responsible for creating and loading containers as well as communicating changes between all of the collaborators. Learn more about configuring the client at [Azure Fluid Relay service client]({{< relref "azure-frs.md" >}}).

The app creates Fluid containers using a configuration that defines a set of *initial objects* that will be available in the container. Learn more about initial objects in [Data modeling]({{< relref "data-modeling.md" >}}).

Lastly, `root` defines the HTML element that the Dice will render on.

```js
const client = new AzureClient(localConfig);

const containerConfig = {
      initialObjects: { diceMap: SharedMap }
  };

const root = document.getElementById("root")
```

## Create a Fluid container

Fluid data is stored within containers, and these containers need to be created before other users can load them. Since creation and loading of containers both happen in the browser, a Fluid application needs to be capable of handling both paths.

### Create a new container

The create path of the application starts with calling `createContainer` and passing in a schema defining which shared objects will be available on the new `container`.

After setting some default values on the `diceMap`, the container is attached by calling the `attach` function. Attaching allows changes to be sent to and from the client, and returns the assigned container id that will be used in the load path.

Now that the app has a connected container and default data, the dice roller view is ready to render.

```js
const createNewDice = async () => {
    const { container } = await client.createContainer(containerConfig);
    // Set default data
    container.initialObjects.diceMap.set("value", 1);
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
  const { container } = await client.getContainer(id, containerConfig);
  renderDiceRoller(container.initialObjects.diceMap, root);
}

```

### Switching between loading and creating

The application supports both creating a new container and loading an existing container using its `id`. To control which state the app is in, it stores the container id in the URL hash. If the URL has a hash, the app will load that existing container, otherwise the app creates a new container, attaches it, and sets the returned `id` as the hash.

Because both the `getContainer` and `createContainer` methods are async, the `start` function needs to be created and then called, catching any errors that are returned.

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

## Write the dice view

The Fluid Framework is view framework agnostic and works well with React, Vue, Angular and web components. This example uses standard HTML/DOM methods to render a view. You can see this example, as well as examples of the previously mentioned frameworks, in our [HelloWorld repo](https://github.com/microsoft/FluidHelloWorld).

### Start with a static view

It is simplest to create the view using local data without Fluid, then add Fluid by changing some key pieces of the app. This tutorial uses this approach.

The `renderDiceRoller` function below takes an HTML element to attach to, and displays a working dice roller with a random dice value each time the "Roll" button is clicked. Note that the included code snippets omit the styles for brevity.

```js
function renderDiceRoller(diceMap, elem) {
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

## Connect the view to Fluid data

### Modifying Fluid data

To begin using Fluid in the application, the first thing to change is what happens when the user clicks the `rollButton`. Instead of updating the local state directly, the button updates the number stored in the `value` key of the passed in `diceMap`. Because the `diceMap` is a Fluid `SharedMap`, changes will be distributed to all clients. Any changes to the `diceMap` will cause a `valueChanged` event to be emitted, and an event handler can trigger an update of the view.

Pushing local state out to Fluid shared objects is a common pattern that allows the view to react the same way for both local and remote changes.

```js
    rollButton.onclick = () => diceMap.set("value", Math.floor(Math.random() * 6));
```


### Relying on Fluid data

The next change that needs to be made is to change the `updateDice` function so it no longer accepts an arbitrary value. This means the app can no longer directly modify the local dice value. Instead, the value will be retrieved from the `SharedMap` each time `updateDice` is called.

```js
    const updateDice = () => {
        const diceValue = diceMap.get("value");
        dice.textContent = String.fromCodePoint(0x2680 + diceValue);
    };
    updateDice();
```

### Handling remote changes

The values returned from `diceMap` are only a snapshot in time. To keep the data up to date as it changes an event handler must be set on the `diceMap` to call `updateDice` each time that the `valueChanged` event is sent. See the documentation for individual DDSes to get a list of events fired and the values passed to those events.

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
