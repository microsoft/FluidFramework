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

1. Write the view.
1. Define the interface the model will expose.
1. Write the model using the Fluid Framework.
1. Include the model in a container.
1. Connect the container to the service for collaboration.
1. Connect the model instance to the view for rendering.


## Write the view

In this app, you render the view without any UI libraries such as React, Vue, or Angular. Use [TypeScript](https://www.typescriptlang.org/) and HTML/DOM methods. However, Fluid is impartial to how you write your view, so you could use your favorite view framework instead.

Since you haven't created your model yet, hardcode a "1" and log to the console when the button is clicked.

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
        // Unicode 0x2680-0x2685 are the sides of a die (⚀⚁⚂⚃⚄⚅).
        diceCharDiv.textContent = String.fromCodePoint(0x267F + diceValue);
        diceCharDiv.style.color = `hsl(${diceValue * 60}, 70%, 50%)`;
    };
    updateDiceChar();
}
```

## Define the model interface

To clarify what your model needs to support, start by defining its public interface.

```ts
export interface IDiceRoller extends EventEmitter {
    readonly value: number;
    roll: () => void;
    on(event: "diceRolled", listener: () => void): this;
}
```

As you might expect, you have the ability to read its value and command it to roll. However, you also need to declare an event `"diceRolled"` in your interface. Fire this event whenever the die is rolled (using [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter)).

This event is particularly important because you're building a collaborative experience. It's how each client will observe that other clients have rolled the die remotely, so they know to update with the new value.

## Implement the model

Up to this point, you've used TypeScript. To implement the model for your collaborative DiceRoller, you'll now use features from the Fluid Framework.

The Fluid Framework provides a class called **[DataObject][]** which you can extend to build your model. You'll use a few features from DataObject, but first take a look at the following code:

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

- `initializingFirstTime()` runs when a client creates the DiceRoller for the first time. It does not run when additional clients connect to the application. Use this to provide an initial value for the die.

- `hasInitialized()` runs when clients load the DiceRoller. Use this to hook up our event listeners to respond to data changes made in other clients.

DataObject also provides a `root` **distributed data structure (DDS)**. DDSes are collaborative data structures that you use like local data structures, but as each client modifies the data, all other clients will see the changes. This `root` DDS is a SharedDirectory which stores key/value pairs and works very similarly to a [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map), providing methods like `set()` and `get()`. However, it also fires a `"valueChanged"` event so you can observe changes to the data coming in from other users.

To instantiate the DataObject, the Fluid Framework needs a corresponding factory. Since you used the DataObject class, you also use the [DataObjectFactory][] which pairs with it. You need to provide it with a unique name ("dice-roller" in this case) and the class constructor. The third and fourth parameters provide additional options that are not used in this example.

```ts
export const DiceRollerInstantiationFactory = new DataObjectFactory(
    "dice-roller",
    DiceRoller,
    [],
    {},
);
```

And that's it -- your DiceRoller model is done!

## Define the container contents

In your app, you only need a single instance of this single model for your single die. However, in more complex scenarios you might have multiple model types with many model instances. The code you'll write to specify the type and number of data objects your application uses is the **container code**.

Since you only need a single die, the Fluid Framework provides a class called [ContainerRuntimeFactoryWithDefaultDataStore][] that you use as your container code. Give it two arguments: the type of the model factory that you want a single instance of, and the list of model types that your container code needs (in this case, just the single model type). This list is called the **container registry**.

```ts
export const DiceRollerContainerRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
    DiceRollerInstantiationFactory,
    new Map([
        DiceRollerInstantiationFactory.registryEntry,
    ]),
);
```

Now you've defined all the pieces and it's just time to put them all together!

## Connect container to service for collaboration

To orchestrate the collaboration, you need to connect to a service to send and receive the updates to the data. To do this, connect a [Fluid container][] object to the service and load your container code into it.

For now, run on a local test service called Tinylicious, and to make it easier to connect to this service we've provided a helper function `getTinyliciousContainer()`. The helper function takes a unique ID to identify your **document** (the collection of data used by your app), the container code, and a flag to indicate whether you want to create a new document or load an existing one. Use any app logic you'd like to generate the ID and determine whether to create a new document. In the [example repository](https://github.com/microsoft/FluidHelloWorld/blob/main/src/app.ts), we use the timestamp and URL hash as just one way of doing it.

```ts
const container =
    await getTinyliciousContainer(documentId, DiceRollerContainerRuntimeFactory, createNew);
```

This will look a little different when moving to a production service, but you'll still ultimately get a reference to a `Container` object running your code and connect to a service.

After you've connected the `Container` object, your container code will have already run to create an instance of your model. Because you used a `ContainerRuntimeFactoryWithDefaultDataStore` to build your container code, you can also use a helper function Fluid provides called `getDefaultObjectFromContainer` to get a reference to the model instance.

```ts
const diceRoller: IDiceRoller = await getDefaultObjectFromContainer<IDiceRoller>(container);
```

## Connect the model instance to view for rendering

Now that you have a model instance, wire it to our view! Update the function to take an `IDiceRoller`, connect your button to the `roll()` method, listen to the `"diceRolled"` event to detect value changes, and read that value from the model.

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

    // Call the roll method to modify the shared data when the button is clicked.
    rollButton.addEventListener("click", diceRoller.roll);
    wrapperDiv.append(diceCharDiv, rollButton);

    // Get the current value of the shared data to update the view whenever it changes.
    const updateDiceChar = () => {
        // Unicode 0x2680-0x2685 are the sides of a die (⚀⚁⚂⚃⚄⚅).
        diceCharDiv.textContent = String.fromCodePoint(0x267F + diceRoller.value);
        diceCharDiv.style.color = `hsl(${diceRoller.value * 60}, 70%, 50%)`;
    };
    updateDiceChar();

    // Use the diceRolled event to trigger the re-render whenever the value changes.
    diceRoller.on("diceRolled", updateDiceChar);
}
```

## Run the app

The [full code for this application is available](https://github.com/microsoft/FluidHelloWorld) for you to try out. Try opening it in multiple browser windows to see the changes reflected between clients.

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers.md" >}}

<!-- Classes and interfaces -->

[ContainerRuntimeFactoryWithDefaultDataStore]: {{< relref "containerruntimefactorywithdefaultdatastore.md" >}}
[DataObject]: {{< relref "dataobject.md" >}}
[DataObjectFactory]: {{< relref "dataobjectfactory.md" >}}
[PureDataObject]: {{< relref "puredataobject.md" >}}
[PureDataObjectFactory]: {{< relref "puredataobjectfactory.md" >}}
[SharedCounter]: {{< relref "/docs/data-structures/counter.md" >}}
[SharedMap]: {{< relref "/docs/data-structures/map.md" >}}
[SharedNumberSequence]: {{< relref "sequences.md#sharedobjectsequence-and-sharednumbersequence" >}}
[SharedObjectSequence]: {{< relref "sequences.md#sharedobjectsequence-and-sharednumbersequence" >}}
[SharedSequence]: {{< relref "sequences.md" >}}
[SharedString]: {{< relref "string.md" >}}
[TaskManager]: {{< relref "/docs/data-structures/task-manager.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
