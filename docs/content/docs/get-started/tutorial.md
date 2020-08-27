---
title: Tutorial
menuPosition: 3
---

In this walkthrough, we'll go over some of the basics of using the Fluid Framework by examining a simple
[Hello World](https://github.com/microsoft/FluidHelloWorld) Fluid application. To get started, and follow along, go
through our [Quick Start](./quick-start.md) guide.

## Key terms and concepts

There are a handful of key concepts to understand.

- **Distributed data structures (DDSes)** -- DDSes are the data structures Fluid Framework provides for storing the
  collaborative data. As collaborators modify the data, the changes will be reflected to all other collaborators.

- **Data objects** -- You'll write data objects to organize DDSes into semantically meaningful groupings for your
  scenario. You can define their API surface to control how collaborators will modify the data.

- **Container code** -- You'll write container code to define which data objects your scenario uses and how
  you'll access them.

- **Container** -- The container is your application's entry point to Fluid Framework. It runs your container
  Code and is the object through which you'll retrieve your data objects.

- **Fluid service** -- The container will connect to a service to send and receive changes to collaborative data.

![](/docs/get-started/images/full-structure.png)


## The DiceRoller app

![](/docs/get-started/images/dice-roller.gif)

To explore these concepts, we'll be looking at a simple app that enables all connected clients to roll a dice and view
the result. We'll do this by writing a data object to represent the dice, configuring container code to use that Data
Object, and finally loading that container code into a container to integrate into our app.


### The data object

![](/docs/get-started/images/data-object.png)

First, we'll define our data object's public interface. We'll expose the dice's value as a number, a method to roll it,
and an event to fire (using [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter)) when the value
changes. This event listener is particularly important since we're building a collaborative experience. It's how we'll
observe that other collaborators have rolled the dice remotely.

*dataObject.ts*

```ts
export interface IDiceRoller extends EventEmitter {
    readonly value: number;
    roll: () => void;
    on(event: "diceRolled", listener: () => void): this;
}
```

Next, we'll implement our data object by extending the [DataObject](/apis/aqueduct/dataobject.md) class. The DataObject class provides tools to
make data object development easier.

One of these tools is a "root" DDS, which is a
[Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)-like data structure called
[SharedDirectory](/apis/map/shareddirectory.md). We'll be storing the dice value on it with root.set(), retrieving the value with root.get(), and
observing changes to the value with the "valueChanged" event.

Data objects are persisted over time by the Fluid service and will be loaded from the service when clients connect.
Correspondingly, the DataObject class provides lifecycle methods to control these flows.

- `initializingFirstTime()` runs when a client creates the DiceRoller for the first time -- we'll use this to provide an
  initial value for the dice.

- `hasInitialized()` runs when clients load the DiceRoller -- we'll use this to hook up our event listeners to respond to
  data changes made in other clients.

*dataObject.ts*

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
        const rollValue = Math.floor(Math.random() \* 6) + 1;
        this.root.set(diceValueKey, rollValue);
    };
}
```

In this scenario we only needed a single DDS, so the root SharedDirectory is sufficient. More complex data objects may
create additional DDSes to manage their data.

To instantiate the data object, the Fluid Framework needs a corresponding factory. Since we're using the DataObject
class, we'll use the [DataObjectFactory](/apis/aqueduct/dataobjectfactory.md) which pairs with it. In this case we just need to provide it with a unique
name ("@fluid-example/dice-roller" in this case) and the class; the third and fourth parameters are not used:

*dataObject.ts*

```ts
export const DiceRollerInstantiationFactory = new DataObjectFactory(
    "@fluid-example/dice-roller",
    DiceRoller,
    [],
    {},
);
```

And that's it -- our DiceRoller data object is done!


### The container code

Our container code will define the contents of our container and how we'll access them -- in our case, just a single
DiceRoller. We can accomplish this using a [containerRuntimeFactoryWithDefaultDataStore](/apis/aqueduct/containerruntimefactorywithdefaultdatastore.md) -- this will create a
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
