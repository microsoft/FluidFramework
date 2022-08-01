---
title: SharedCounter
menuPosition: 5
---

## Introduction

The `SharedCounter` distributed data structure (DDS) is use to store an integer counter value that can be modified collaboratively.
The data structure affords incrementing and decrementing the shared value via its `increment` method. Decrements are done by providing a negative value.

The `SharedCounter` is a specialized [optimistic DDS]({{< relref "dds.md#optimistic-data-structures" >}}).
It operates on communicated _deltas_ (amounts by which the shared value should be incremented or decremented), rather than direct changes to the shared value.
In this way, it avoids the pitfalls of DDSes with simpler merge strategies, in which one user's edit may clobber another's (see [below](#why-a-specialized-dds)).

Note that the `SharedCounter` only operates on integer values.

### Why a specialized DDS?

You may be asking yourself, why not just store the shared integer value directly in another DDS like a [SharedMap][]?
Why incur the overhead of another runtime type?

The key to the answer here is that DDSes with simpler merge strategies (like `SharedMap`) take a somewhat brute-force approach to merging concurrent edits.
For a semantic data type like a counter, this can result in undesirable behavior.

#### SharedMap Example

Let's illustrate the issue with an example.

Here, we will use a `SharedMap` to store our shared integer value.
For simplicity, it will be stored under a static key: `counter-key`.

Let's say that two users are collaborating on an app with a counter widget.
We will refer to these users as User A and User B.
The current value of that widget is 42.

What if User A and User B both simultaneously press the `+` button in their UI to increment the current value by 1?
Behind the scenes, this increment is implemented by writing the updated value to the map.
That edit is then sequenced and broadcast to other collaborators.

Here, we would expect that, after both users have processed all incoming edits, the resulting value of the counter would be 44.
Each user pressed the `+` button once.
42 + 1 + 1 = 44, right?

In fact, because `SharedMap` employs a _last-write-wins_ merge strategy, if User A and User B make their edits at the same time, one of the two updates will be sequnced after the other, and that value will win.
So in this case, both users would see the value 43, rather than 44.

This is a problem!
If this shared counter value was being used to track store inventory, for example, that inventory would now be incorrect!

The solution to this problem is a specialized DDS that tracks changes to the shared value as _increments_ and _decrements_, which can be summed together in any order and still reach eventual consistency.

## Creation

The `FluidContainer` provides a container schema for defining which DDSes you would like to load from it.
It provides two separate fields for establishing an initial roster of objects and dynamically creating new ones.

- For general guidance on using the `ContainerSchema`, see [Data modeling]({{< relref "data-modeling.md" >}}).
- For guidance on how to create and load a Fluid container using a service-specific client, see [Containers - Creating and loading]({{< relref "containers.md#creating--loading" >}}).

The following example illustrates how you can use the `ContainerSchema` with `SharedCounter`.

There are two key workflows to consider here.

1. Creating a new Fluid Container.
2. Connecting to an existing Fluid Container.

In either case, you will first define the schema.

```javascript
const schema = {
    initialObjects: {
        sharedCounter: SharedCounter,
    }
}
```

### Creating a new Fluid Container

Here, you will generate a new  `SharedCounter` as part of the initial roster of objects you have available in the container, using the schema defined above.

```javascript
const { container, services } = await client.createContainer(schema);

const counter = container.initialObjects.sharedCounter;
```

At this point, you can directly start using the `counter` object within your application.
Including the `SharedCounter` as part of initial objects ensures that the DDS is available the moment the async call to `createContainer` finishes.

### Connecting to an existing Fluid Container

Similarly, if you are connecting to an existing container, the process stays largely identical with the only difference being that you use `getContainer` instead of `createContainer`.

```javascript
const { container, services } = await client.getContainer(id, schema);

const counter = container.initialObjects.sharedCounter;
```

### Dynamically Creating `SharedCounter`s

Finally, if you would like to dynamically create `SharedCounter` instances as part of the application lifecycle (i.e. if there are user interactions in the applications that require a new `SharedCounter` instance to be created at runtime), you can add the `SharedCounter` type to the `dynamicObjectTypes` field in the schema and call the container's `create` function.

```javascript
const schema = {
    /*...*/,
    dynamicObjectTypes: [ SharedCounter ]
}

const { container, services } = await client.getContainer(id, schema);

const newCounter = await container.create(SharedCounter); // Create a new SharedCounter
```

Once the async call to `create` returns, you can treat it the same as you were using the `SharedCounter` instances from your initial objects above.
The only caveat here is that you will need to maintain a handle to your newly created object.
To store it in another DDS like a `SharedMap`, please see [Storing shared objects]({{< relref "map.md#storing-shared-objects" >}}).
For general guidance on storing DDS references as handles, please see [Using handles to store and retrieve shared objects]({{< relref "data-modeling.md#using-handles-to-store-and-retrieve-shared-objects" >}}).

## Usage

The `SharedCounter` object provides a simple API surface for managing a shared integer whose value may be incremented and decremented by collaborators.

A new `SharedCounter` value will be initialized with its value set to `0`.
If you wish to initialize the counter to a different value, you may [modify the value](#incrementing--decrementing-the-value) before attaching the container, or before storing it in another shared object like a `SharedMap`.

### Incrementing / decrementing the value

Once you have created your `SharedCounter`, you can change its value using the [increment]({{< relref "isharedcounter.md#increment-MethodSignature" >}}) method.
This method accepts a positive or negative *integer* to be applied to the shared value.


```javascript
sharedCounter.increment(3); // Adds 3 to the current value
sharedCounter.increment(-5); // Subtracts 5 from the current value
```

### `incremented` event

The [incremented]({{< relref "isharedcounterevents.md#_call_-CallSignature" >}}) event is sent when a client in the collaborative session changes the counter value via the `increment` method.

Signature:

```javascript
(event: "incremented", listener: (incrementAmount: number, newValue: number) => void)
```

By listening to this event, you can receive and apply the changes coming from other collaborators.
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

In the code above, whenever a user presses either the Increment or Decrement button, the `sharedCounter.increment` is called with +/- 1.
This causes the `incremented` event to be sent to all of the clients who have this container open.

Since `updateCounterValueLabel` is listening for all `incremented` events, the view will always refresh with the appropriate updated value any time a collaborator increments or decrements the counter value.

## API Documentation

For a comprehensive view of the `counter` package's API documentation, see [the SharedCounter API docs]({{< ref "docs/apis/counter.md" >}}).
