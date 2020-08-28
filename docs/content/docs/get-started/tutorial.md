---
title: Tutorial
menuPosition: 3
---

In this walkthrough, we'll learn about using the Fluid Framework by building a simple
[Hello World](https://github.com/microsoft/FluidHelloWorld) Fluid application together. To get started, and follow along, go
through our [Quick Start](./quick-start.md) guide.


## The DiceRoller app

{{< fluid_bundle_loader idPrefix="dice-roller"
bundleName="dice-roller.9af6bdd702e6cd4ad6cf.js" >}}

In our DiceRoller app we'll show users a dice with a button to roll it.  When the dice is rolled, we'll use the Fluid Framework to sync the data across clients so everyone sees the same result.  We'll do this in four parts:

1. Write the view
1. Write the model for the dice using Fluid Framework
1. Define how the Fluid Framework should instantiate and use our model
1. Connect our model to the service for collaboration, and also to the view for rendering


### The view

In this app we're just going to render our view using plain Typescript and DOM methods.  Fluid is impartial to how you write your view, so you could use your favorite view framework instead if you'd like.

Since we haven't created our model yet, we'll just hardcode a "1" and log to the console when the button is clicked.

```ts
export function renderDiceRoller(div: HTMLDivElement) {
    const wrapperDiv = document.createElement("div");
    wrapperDiv.style.textAlign = "center";
    div.append(wrapperDiv);
    const diceCharDiv = document.createElement("div");
    diceCharDiv.style.fontSize = "200px";
    const rollButton = document.createElement("button");
    rollButton.style.fontSize = "50px";
    rollButton.textContent = "Roll";

    rollButton.addEventListener("click", () => { console.log("Roll!"); });
    wrapperDiv.append(diceCharDiv, rollButton);

    const updateDiceChar = () => {
        const diceValue = 1;
        // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
        diceCharDiv.textContent = String.fromCodePoint(0x267F + diceValue);
        diceCharDiv.style.color = `hsl(${diceValue * 60}, 70%, 50%)`;
    };
    updateDiceChar();
}
```


### The model interface

Before we implement our model, let's start by defining its public interface.

```ts
export interface IDiceRoller extends EventEmitter {
    readonly value: number;
    roll: () => void;
    on(event: "diceRolled", listener: () => void): this;
}
```

As you might expect, we have the ability to read its value and command it to roll.  However, we also declare an event `"diceRolled"` in our interface.  We'll fire this event whenever the dice is rolled (using [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter)).

This event is particularly important since we're building a collaborative experience. It's how each client will observe that other clients have rolled the dice remotely.

### Implementing the model

Up to this point, we've just been using Typescript.  Now that we're implementing the model for our collaborative DiceRoller, we'll start to use features from Fluid Framework.

Fluid Framework provides a class called **[DataObject][]** which we can extend to build our model.  We'll use a few features from DataObject, but let's take a look at the code first:

```ts
export class DiceRoller extends DataObject implements IDiceRoller {
    protected async initializingFirstTime() {
        this.root.set(diceValueKey, 1);
    }

    protected async hasInitialized() {
        this.root.on("valueChanged", (changed: IValueChanged) => {
            if (changed.key === diceValueKey) {
                this.emit("diceRolled");
            }
        });
    }

    public get value() {
        return this.root.get(diceValueKey);
    }

    public readonly roll = () => {
        const rollValue = Math.floor(Math.random() * 6) + 1;
        this.root.set(diceValueKey, rollValue);
    };
}
```

Since the models you create will be persisted over time as users load and close the app, DataObject provides lifecycle methods to control the first-time creation and subsequent loading of your model.

- `initializingFirstTime()` runs when a client creates the DiceRoller for the first time. It does not run when additional clients
  connect to the application. We'll use this to provide an initial value for the dice.

- `hasInitialized()` runs when clients load the DiceRoller -- we'll use this to hook up our event listeners to respond to
  data changes made in other clients.

DataObject also provides a "root" **Distributed Data Structure (DDS)**.  DDSes are collaborative data structures that you'll use like local data structures, but as each client modifies the data, all other clients will see the changes.  This "root" DDS is a [SharedDirectory][] which stores key/value pairs and works very similarly to a [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map), providing methods like `set()` and `get()`.  However, it also fires a `"valueChanged"` event so we can observe changes to the data coming in from other users.

To instantiate the DataObject, the Fluid Framework needs a corresponding factory. Since we're using the DataObject
class, we'll also use the [DataObjectFactory][] which pairs with it. In this case we just need to provide it with a unique
name ("dice-roller" in this case) and the class. The third and fourth parameters are not used:

```ts
export const DiceRollerInstantiationFactory = new DataObjectFactory(
    "dice-roller",
    DiceRoller,
    [],
    {},
);
```

![](/docs/get-started/images/data-object.png)

And that's it -- our DiceRoller model is done!


### The container code

Our container code will define the contents of our container and how we'll access them -- in our case, just a single
DiceRoller. We can accomplish this using a [ContainerRuntimeFactoryWithDefaultDataStore][] -- this will create a
single DiceRoller and make it available to be retrieved from the container. We'll provide it with the name of the
default data object and a mapping of the name to factory.

![](/docs/get-started/images/container-code.png)

*containerCode.ts*

```ts
export const DiceRollerContainerRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
    DiceRollerInstantiationFactory.type,
    new Map([
        DiceRollerInstantiationFactory.registryEntry,
    ]),
);
```

In more complex scenarios where we want multiple data objects or specialized routing we might customize this more, but
it's not necessary for this app.

### Integrating into our app

![](/docs/get-started/images/app-integration.png)

Now that we've created our data object and configured container code to use it, we're ready to load that container code
into a container and access it in our app. We'll also connect the container to the service that orchestrates the
collaboration. For now, we'll just run on a local test service called [Tinylicious][].

To make this easier we've provided a helper function `getTinyliciousContainer()` -- this will look a little different
when moving to a production service, but you'll still ultimately be getting a reference to a container. This helper
function takes a unique ID to identify our document, the container code, and a flag to indicate whether we want to
create a new document or load an existing one.

*app.ts*

```ts
const container = await getTinyliciousContainer(documentId, DiceRollerContainerRuntimeFactory, createNew);
```

Now that we have a container, we can make a request against it to get a reference to our data object. Since we built our
container code using a ContainerRuntimeFactoryWithDefaultDataStore, our data object can be requested using a URL of "/".

*app.ts*

```ts
const url = "/";
const response = await container.request({ url });

// Verify the response to make sure we got what we expected.
if (response.status !== 200 || response.mimeType !== "fluid/object") {
    throw new Error(`Unable to retrieve data object at URL: "${url}"`);
} else if (response.value === undefined) {
    throw new Error(`Empty response from URL: "${url}"`);
}
const diceRoller: IDiceRoller = response.value;
```

At this point the Fluid Framework work is done and our DiceRoller is ready to be used. We can now read its value to
render it into the DOM and provide a button to roll the dice by calling its roll() method. We'll also register a
listener for "diceRolled" to learn when the value changes and update the rendering. You could use a view framework of
your choice here if you'd like.

*view.ts*

```ts
export function renderDiceRoller(diceRoller: IDiceRoller, div: HTMLDivElement) {
    const wrapperDiv = document.createElement("div");
    wrapperDiv.style.textAlign = "center";
    div.append(wrapperDiv);
    const diceCharDiv = document.createElement("div");
    diceCharDiv.style.fontSize = "200px";
    const rollButton = document.createElement("button");
    rollButton.style.fontSize = "50px";
    rollButton.textContent = "Roll";

    // Call the roll method to modify the shared data when the button is clicked
    rollButton.addEventListener("click", diceRoller.roll);
    wrapperDiv.append(diceCharDiv, rollButton);

    // Get the current value of the shared data to update the view whenever it changes.
    const updateDiceChar = () => {
        // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
        diceCharDiv.textContent = String.fromCodePoint(0x267F + diceRoller.value);
        diceCharDiv.style.color = `hsl(${diceRoller.value * 60}, 70%, 50%)`;
    };
    updateDiceChar();

    // Use the diceRolled event to trigger the rerender whenever the value changes.
    diceRoller.on("diceRolled", updateDiceChar);
}
```

And then all that's left to do is render using the view:

*app.ts*

```ts
const div = document.getElementById("content") as HTMLDivElement;
renderDiceRoller(diceRoller, div);
```

Once the application loads the container will communicate with the server to exchange DDS data:

![](/docs/get-started/images/full-structure.png)

The [full code for this application is available](https://github.com/microsoft/FluidHelloWorld) for you to try out.


REMOVE/REHOME:

## Key terms and concepts

There are a handful of key concepts to understand.

- **Distributed data structures (DDSes)** -- DDSes are the data structures Fluid Framework provides for locally storing copies of the
  collaborative data. As collaborators modify the data, the changes will be reflected to all other collaborators.

- **Data objects** -- You'll write data objects to organize DDSes into semantically meaningful groupings for your
  scenario. You can define their API surface to control how collaborators will modify the data.

- **Container code** -- You'll write container code to register the type and number of data objects your application uses and how
  you'll access them.

- **Container** -- The container is your application's entry point to Fluid Framework. It runs your container
  code and is the object through which you'll retrieve your data objects.

- **Fluid service** -- The container will connect to a service to send and receive changes to collaborative data.

![](/docs/get-started/images/full-structure.png)



<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=_includes/links.md) -->
<!-- Links -->

[ContainerRuntimeFactoryWithDefaultDataStore]: {{< relref "/apis/aqueduct/containerruntimefactorywithdefaultdatastore.md" >}}

[DataObject]: {{< relref "/apis/aqueduct/dataobject.md" >}}

[DataObjectFactory]: {{< relref "/apis/aqueduct/dataobjectfactory.md" >}}

[SharedDirectory]: {{< relref "/apis/map/shareddirectory.md" >}}
[shareddirectory]: {{< relref "/apis/map/shareddirectory.md" >}}

[SharedObjectSequence]: {{< relref "/apis/sequence/sharedobjectsequence.md" >}}
[sharedobjectsequence]: {{< relref "/apis/sequence/sharedobjectsequence.md" >}}

[SharedMap]: {{< relref "/apis/map/sharedmap.md" >}}
[sharedmap]: {{< relref "/apis/map/sharedmap.md" >}}

[undo-redo]: {{< relref "/apis/undo-redo.md" >}}


<!-- Sequences -->

[sequence.insert]: {{< relref "/apis/sequence/sharedsequence.md#sequence-sharedsequence-insert-Method" >}}
[sequence.getItems]: {{< relref "/apis/sequence/sharedsequence.md#sequence-sharedsequence-getitems-Method" >}}
[sequence.remove]: {{< relref "/apis/sequence/sharedsequence.md#sequence-sharedsequence-getitems-Method" >}}
[sequenceDeltaEvent]: {{< relref "/apis/sequence/sequencedeltaevent.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
