---
title: Tutorial
menuPosition: 3
---


In this walkthrough, we'll go over some of the basics of using Fluid Framework by examining a simple application. You
can [get the application
here](https://github.com/microsoft/FluidFramework/tree/master/examples/hosts/app-integration/external-views) to try it
yourself -- we recommend trying it out first and following along in the code.


## Key terms and concepts

There are a handful of key concepts\<link? Concept overview?\> to
understand.

![](media/image1.png)

- **Distributed Data Structures (DDSes)** -- DDSs are the data structures Fluid Framework provides for storing the
  collaborative data. As collaborators modify the data, the changes will be reflected to all other collaborators.

- **Data Objects** -- You'll write Data Objects to organize DDSs into semantically meaningful groupings for your
  scenario. You can define their API surface to control how collaborators will modify the data.

- **Container Code** -- You'll write Container Code to define which Data Objects your scenario uses and how
  you'll access them.

- **Container** -- The Container is your application's entry point to Fluid Framework. It runs your Container
  Code and is the object through which you'll retrieve your Data Objects.

- **Fluid Service** -- The Container will connect to a service to send and receive changes to collaborative data.

## The DiceRoller app


![](media/image2.png)

\<show .gif of two tabs side by side rolling the dice\>

To explore these concepts, we'll be looking at a simple app that enables all connected clients to roll a dice and view
the result. We'll do this by writing a Data Object to represent the dice, configuring Container Code to use that Data
Object, and finally loading that Container Code into a Container to integrate into our app.

### The Data Object


![](media/image3.png)

First, we'll define our Data Object's public interface. We'll expose the dice's value as a number, a method to roll it,
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

Next, we'll implement our Data Object by extending the DataObject class\<link\>. The DataObject class provides tools to
make Data Object development easier.

One of these tools is a "root" DDS, which is a
[Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)-like data structure called
SharedDirectory\<link\>. We'll be storing the dice value on it with root.set(), retrieving the value with root.get(),
and observing changes to the value with the "valueChanged" event.

Data Objects are persisted over time by the Fluid service and will be loaded from the service when clients connect.
Correspondingly, the DataObject class provides lifecycle methods to control these flows.

- initializingFirstTime() runs when a client creates the DiceRoller for the first time -- we'll use this to provide an
  initial value for the dice.

- hasInitialized() runs when clients load the DiceRoller -- we'll use this to hook up our event listeners to respond to
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

In this scenario we only needed a single DDS, so the root SharedDirectory is sufficient. More complex Data Objects may
create additional DDSs \<link, DDS entrypoint\> to manage their data.

To instantiate the Data Object, the Fluid Framework needs a corresponding factory. Since we're using the DataObject
class, we'll use the DataObjectFactory\<link\> which pairs with it. In this case we just need to provide it with a
unique name ("\@fluid-example/dice-roller" in this case) and the class; the third and fourth parameters are not used:

*dataObject.ts*

```ts
export const DiceRollerInstantiationFactory = new DataObjectFactory(
    "@fluid-example/dice-roller",
    DiceRoller,
    [],
    {},
);
```

And that's it -- our DiceRoller Data Object is done!

### The Container Code

![](media/image4.png)

Our Container Code will define the contents of our Container and how we'll access them -- in our case, just a single
DiceRoller. We can accomplish this using a containerRuntimeFactoryWithDefaultDataStore\<link\> -- this will create a
single DiceRoller and make it available to be retrieved from the Container. We'll provide it with the name of the
default Data Object and a mapping of the name to factory.

*containerCode.ts*

```ts
export const DiceRollerContainerRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
    DiceRollerInstantiationFactory.type,
    new Map([
        DiceRollerInstantiationFactory.registryEntry,
    ]),
);
```

In more complex scenarios where we want multiple Data Objects or specialized routing we might customize this more \<link
to example?\>, but it's not necessary for this app.

### Integrating into our app

![](media/image5.png)

Now that we've created our Data Object and configured Container Code to use it, we're ready to load that Container Code
into a Container and access it in our app. We'll also connect the Container to the service that orchestrates the
collaboration. For now, we'll just run on a local test service called Tinylicious\<link\>.

To make this easier we've provided a helper function getTinyliciousContainer()\<link\> -- this will look a little
different when moving to a production service, but you'll still ultimately be getting a reference to a Container. This
helper function takes a unique ID to identify our document, the Container Code, and a flag to indicate whether we want
to create a new document or load an existing one. \<Q for review: are we ok using the term "document" here?\>

*app.ts*

```ts
const container = await getTinyliciousContainer(documentId, DiceRollerContainerRuntimeFactory, createNew);
```

Now that we have a Container, we can make a request against it to get a reference to our Data Object. Since we built our
Container Code using a ContainerRuntimeFactoryWithDefaultDataStore, our Data Object can be requested using a URL of "/".

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

![](media/image1.png)

The full code for this application is available \<here\> for you to try out.
