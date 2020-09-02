---
title: Tutorial
menuPosition: 3
---

In this walkthrough, we'll learn about using Fluid Framework by building a simple
[DiceRoller](https://github.com/microsoft/FluidHelloWorld) application together. To get started, and follow along, go
through our [Quick Start](./quick-start.md) guide.

{{< fluid_bundle_loader idPrefix="dice-roller"
bundleName="dice-roller.9af6bdd702e6cd4ad6cf.js" >}}

In our DiceRoller app we'll show users a dice with a button to roll it.  When the dice is rolled, we'll use Fluid Framework to sync the data across clients so everyone sees the same result.  We'll do this in 6 parts:

1. Write the view
1. Define the interface our model will expose
1. Write the model using Fluid Framework
1. Include our model in our container
1. Connect our container to the service for collaboration
1. Connect our model instance to our view for rendering


### The view

In this app we're just going to render our view without any UI libraries such as React, Vue or Angular. We'll be using [Typescript](https://www.typescriptlang.org/) and HTML/DOM methods.  Fluid is impartial to how you write your view, so you could use your favorite view framework instead if you'd like.

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

To clarify what our model needs to support, let's start by defining its public interface.

```ts
export interface IDiceRoller extends EventEmitter {
    readonly value: number;
    roll: () => void;
    on(event: "diceRolled", listener: () => void): this;
}
```

As you might expect, we have the ability to read its value and command it to roll.  However, we also need to declare an event `"diceRolled"` in our interface.  We'll fire this event whenever the dice is rolled (using [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter)).

This event is particularly important because we're building a collaborative experience. It's how each client will observe that other clients have rolled the dice remotely, so they know to update with the new value.

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

- `hasInitialized()` runs when clients load the DiceRoller. We'll use this to hook up our event listeners to respond to
  data changes made in other clients.

DataObject also provides a "root" **Distributed Data Structure (DDS)**.  DDSes are collaborative data structures that you'll use like local data structures, but as each client modifies the data, all other clients will see the changes.  This "root" DDS is a [SharedDirectory][] which stores key/value pairs and works very similarly to a [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map), providing methods like `set()` and `get()`.  However, it also fires a `"valueChanged"` event so we can observe changes to the data coming in from other users.

To instantiate the DataObject, Fluid Framework needs a corresponding factory. Since we're using the DataObject
class, we'll also use the [DataObjectFactory][] which pairs with it. In this case we just need to provide it with a unique
name ("dice-roller" in this case) and the class constructor. The third and fourth parameters provide additional options that we will not be using in this example:

```ts
export const DiceRollerInstantiationFactory = new DataObjectFactory(
    "dice-roller",
    DiceRoller,
    [],
    {},
);
```

And that's it -- our DiceRoller model is done!


### Defining the container contents

In our app, we only need a single instance of this single model for our single dice.  However, in more complex scenarios we might have multiple model types with many model instances.  The code you'll write to specify the type and number of data objects your application uses is the **container code**.

Since we only need a single dice, Fluid Framework provides a class called [ContainerRuntimeFactoryWithDefaultDataStore][] that we can use as our container code.  We'll give it two arguments:  the type of the model factory that we want a single instance of, and the list of model types that our container code needs (in this case, just the single model type).  This list is called the **container registry**.

```ts
export const DiceRollerContainerRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
    DiceRollerInstantiationFactory.type,
    new Map([
        DiceRollerInstantiationFactory.registryEntry,
    ]),
);
```

Now we've defined all the pieces and it's just time to put them all together!


### Connect container to service for collaboration

To orchestrate the collaboration, we need to connect to a service to send and receive the updates to the data.  The way we do this is to connect a Fluid [Container][] object to the service and load our container code into it.

For now, we'll just run on a local test service called [Tinylicious][], and to make it easier to connect to this service we've provided a helper function `getTinyliciousContainer()`.  The helper function takes a unique ID to identify our **document** (the collection of data used by our app), the container code, and a flag to indicate whether we want to create a new document or load an existing one.  You can use any app logic you'd like to generate the ID and determine whether to create a new document.  In the [example repository](https://github.com/microsoft/FluidHelloWorld/blob/main/src/app.ts) we use the timestamp and URL hash as just one way of doing it.

```ts
const container = await getTinyliciousContainer(documentId, DiceRollerContainerRuntimeFactory, createNew);
```

This will look a little different when moving to a production service, but you'll still ultimately be getting a reference to a `Container` object running your code and connected to a service.

After we have the connected `Container` object, our container code will have already run to create an instance of our model.  We used a `ContainerRuntimeFactoryWithDefaultDataStore` to build our container code, which adds the ability to request the model from the `Container` object using a URL of "/":

```ts
const response = await container.request({ url: "/" });

// Verify the response to make sure we got what we expected.
if (response.status !== 200 || response.mimeType !== "fluid/object") {
    throw new Error("Unable to retrieve data object");
} else if (response.value === undefined) {
    throw new Error("Empty response");
}
const diceRoller: IDiceRoller = response.value;
```


### Connect model instance to view for rendering

That's it, now that we have a model instance, we can wire it to our view!  We'll update the function to take an `IDiceRoller`, connect our button to the `roll()` method, listen to the `"diceRolled"` event to detect value changes, and read that value from the model.

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


### Running the app

At this point we can run our app.  The [full code for this application is available](https://github.com/microsoft/FluidHelloWorld) for you to try out.  Try opening it in multiple browser windows to see the changes reflected between clients.

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
