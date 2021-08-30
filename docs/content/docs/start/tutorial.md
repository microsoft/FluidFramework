---
title: 'Tutorial: Create a Fluid Framework application'
menuPosition: 2
status: outdated
aliases:
  - "/docs/get-started/tutorial/"
  - "/start/tutorial/"
---

In this walkthrough, you'll learn about using the Fluid Framework by building a simple [DiceRoller](https://github.com/microsoft/FluidHelloWorld) application. To get started, go
through the [Quick Start]({{< relref "./quick-start.md" >}}) guide.

{{< fluid_bundle_loader idPrefix="dice-roller"
    bundleName="dice-roller.12142020.js" >}}

In the DiceRoller app, users are shown a die with a button to roll it. When the die is rolled, Fluid Framework syncs the data across clients so everyone sees the same result. To do this, complete the following steps:

1. Write the view
2. Create a Fluid Container
3. Connect view to Fluid data
4. Modify Fluid data on dice roll




## Application setup

To create a Fluid application that connects to the [Azure Fluid Relay service]({{< relref "../../deployment/azure-frs.md" >}}), start by creating a new instance of the Fluid Azure Client. The client is responsible for creating and loading containers as well as communicating changes between all of the collaborators. Learn more about configuring the [Azure FRS Client]({{< relref "../../deployment/azure-frs.md" >}}).

The containers our app creates require a configuration which defines the set of initial Distributed Data Structures that will be attached to the returned container. View our full list of [Distributed Data Structures]({{< relref "../../data-structures/overview.md" >}})

Lastly, `root` defines the HTML element that the Dice will render on.

```js

const client = new AzureClient(localConfig);

const containerConfig = {
      initialObjects: { diceMap: SharedMap }
  };

const root = document.getElementById("root")
```

## Container creation


Fluid collaboration happens in containers, which have unique identifiers (like a document filename) that must be created before other users can load them. Since creation and loading of containers both happen in the client our application needs to be capable of handling both paths.

### Create a new dice flow

The first path in the application needs to include the creation of a container, and return an `id` associated with that container. In the `createNewDice` function below the app creates a container with the `containerConfig` defined above. This configuration assures that `initialObjects` will include a `diceMap` key containing a fully connected `SharedMap` DDS.

At this point the application can set up default values for any newly created dice. To enable collaboration, sending and recieving ops to and from the client, the container must first call `attach()` which returns the `id` the app can later use to retrieve this container.

Now that our app has a connected container and default data, the dice roller view is ready to render.

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
### Loading an existing dice flow

The second path in the application is much more straight forward. The default data is already set, the container is already attached, and the `id` is passed into the function, rather than returned.

```js

const loadExistingDice = async (id) => {
  const { container } = await client.getContainer(id, containerConfig);
  renderDiceRoller(root, container.initialObjects.diceMap);
}

```

## Starting the app

Since our application can be in one of two states, creating, or loading from an `ID`, we can simulate those states by storying the container `id` in the URL hash. If the URL has a hash the app will load that existing container, otherwise the app creates a new container and sets the returned `id` as the hash.

Again, these are all async methods, so the `start` function needs to be created and then called, catching any errors that are returned.

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

Fluid is framework agnostic and works well with React, Vue, Angular and web components. This example will use nothing more than standard HTML/DOM methods, but you can see this full demo, and examples of other frameworks in our [HelloWorld repo](https://github.com/microsoft/FluidHelloWorld/tree/main/src/view).

### Start with a static view

This view, given an HTML element to attach to, creates a working dice roller that displays a random dice value each time the "Roll" button is clicked. Note that demo code ommits the styles for brevity.

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

The first thing we want to do is change the `rollButton` to set the `value` key of the `diceMap`, instead of updating the local state directly. Pushing local state out to Fluid state is a common pattern because the view should react to local and remote changed in the same flow.

```js
    rollButton.onclick = () => diceMap.set("value", Math.floor(Math.random() * 6));
```


### Relying on Fluid data

Secondly, the `updateDice` function will no longer take in any arbitrary value. Now, the only way to update the dice value is to modify the `value` key on the `diceMap` data structure.

```js
    const updateDice = () => {
        const value = fluid.get("value");
        dice.textContent = String.fromCodePoint(0x2680 + value);
    };
    updateDice();
```

### Listening for Fluid changes

Fluid data needs to be fetched each time that the value changes. The app can listening for changes on any DDS, and call an update method each time that the event fires. Below `updateDice` is being called each time the `valueChanged` event fires on the `SharedMap`.

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
