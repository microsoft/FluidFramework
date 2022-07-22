---
title: SharedCounter
menuPosition: 5
---

## Introduction

The `SharedCounter` distributed data structure (DDS) is use to store an integer counter value that can be modified collaboratively.
The data structure affords incrementing and decrementing the shared value via its `increment` method (decrements are handled by providing a negative delta value).

The `SharedCounter` is a specialized, [Optimistic DDS]({{< relref "dds.md#optimistic-data-structures" >}}).
It operates on communicated deltas, rather than direct changes to the shared value.
In this way, it avoids the pitfalls of DDSes with simpler merge strategies, in which one user's edit may clobber another's.

Note that the `SharedCounter` only operates on integer values.
Floating point arithmatic is order dependent.
Since DDSes are required to be eventually consistent, `SharedCounter` is an Optimistic DDS, it cannot support floating point values.

## Creation

The `FluidContainer` provides a container schema for defining which DDSes you would like to load from it.
It provides two separate fields for establishing an initial roster of objects and dynamically creating new ones.

- For general guidance on using the `ContainerSchema`, please see [Data modeling]({{< relref "data-modeling.md" >}}).
- For guidance on how to create/load a container using a service-specific client, please see [Containers - Creating and loading]({{< relref "containers.md#creating--loading" >}}).

Let's take a look at how you would specifically use the `ContainerSchema` for `SharedCounter`.

The following example loads a `SharedCounter` as part of the initial roster of objects you have available in the container.

```javascript
const schema = {
    initialObjects: {
        sharedCounter: SharedCounter,
    }
}

const { container, services } = await client.createContainer(schema);

const counter = container.initialObjects.sharedCounter;
```

At this point, you can directly start using the `counter` object within your application.
Including the `SharedCounter` as part of initial objects ensures that the DDS is available the moment the async call to `createContainer` finishes.

Similarly, if you are loading an existing container, the process stays largely identical with the only difference being that you use `getContainer` instead of `createContainer`.

```javascript
const schema = {
    initialObjects: {
        sharedCounter: SharedCounter,
    }
}

const { container, services } = await client.getContainer(id, schema);

const counter = container.initialObjects.sharedCounter;
```

Finally, if you'd like to dynamically create `SharedCounter` instances as part of the application lifecycle (i.e. if there are user interactions in the applications that require a new DDS to be created at runtime), you can add the `SharedCounter` type to the `dynamicObjectTypes` field in the schema and call the container's `create` function.

```javascript
const schema = {
    /*...*/,
    dynamicObjectTypes: [ SharedCounter ]
}

const { container, services } = await client.getContainer(id, schema);

const newCounter = await container.create(SharedCounter); // Create a new SharedCounter
```

Once the async call to `create` returns, you can treat it the same as you were using the `SharedCounter` instances from your initial objects above.
The only caveat here is that you will need to maintain a pointer to your newly created object.
To store it in another DDS like a `SharedMap`, please see [Storing shared objects]({{< relref "map.md#storing-shared-objects" >}}).
For general guidance on storing DDS references as handles, please see [Using handles to store and retrieve shared objects]({{< relref "data-modeling.md#using-handles-to-store-and-retrieve-shared-objects" >}}).

## Usage

The `SharedCounter` object provides a simple API surface for managing a shared counter value.
A new `SharedCounter` value will be initialized with its value set to `0`.
If you wish to initialize the counter to a different value, you may [modify the value](#incrementing--decrementing-the-value) before attaching the Container, or before inserting it into an existing shared object like a `SharedMap`.

### Incrementing / decrementing the value

Once you have created your `SharedCounter`, making changes to the value is as simple as calling its [increment]({{< relref "isharedcounter.md#increment-MethodSignature" >}}) method.
This method accepts a positive or negative *integer* delta to be applied to the shared value.

- Note:

```javascript
sharedMap.increment(3); // Adds 3 to the current value
sharedMap.increment(-5); // Subtracts 5 from the current value
```

### [incremented]({{< relref "isharedcounterevents.md#_call_-CallSignature" >}}) event

The `incremented` event is sent when a client in the collaborative session changes the counter value via `increment`.

> Signature: `(event: "incremented", listener: (incrementAmount: number, newValue: number) => void)`

By registering with this event, you can receive and apply the necessary deltas coming from other collaborators.
Consider the following code example for configuring a Counter widget:

```javascript
const sharedCounter = container.initialObjects.sharedCounter;
let counterValue = sharedCounter.value;

const incrementButton = document.createElement('button');
button.textContent = "Increment";
const decrementButton = document.createElement('button');
button.textContent = "Decrement";

// Increment / decrement shared counter value when the corresponding button is clicked
incrementButton.addEventListener('click', () => sharedCounter.increment(1));
decrementButton.addEventListener('click', () => sharedCounter.increment(-1));

const counterValueLabel = document.createElement('label');
counterValueLabel.textContent = `${counterValue}`;

// This function will be called each time the shared counter value is incremented
// (including increments from this client).
// Update the local counter value and the corresponding label being displayed in the widget.
const updateCounterValueLabel = (delta) => {
    counterValue += delta;
    counterValueLabel.textContent = `${counterValue}`;
};

// Register to be notified when the counter is incremented
sharedCounter.on("incremented", updateCounterValueLabel);
```

In the code above, whenever a user presses either the `Increment` or `Decrement` button, the shared `sharedCounter.increment` is called with +/- 1.
This causes the `incremented` event to be sent to all of the clients who have this container open.

Since `updateCounterValueLabel` is registered for all `incremented` events, the view will always refresh with the appropriate updated value any time a collaborator increments or decrements the counter value.

## API Documentation

For a comprehensive view of the `counter` package's API documentation, see [here]({{< relref "apis/counter.md" >}}).
