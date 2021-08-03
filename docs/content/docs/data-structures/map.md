---
title: SharedMap
menuPosition: 4
---
## Introduction

The `SharedMap` distributed data structure (DDS) is use to store key-value data. It provides the same API as the [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) built-in object that is provided in JavaScript, but also ensures that any edits being made to the object are simultaneously transmitted to all clients.

For example, in a traditional `Map`, setting a key would only set it on the local object. In a `SharedMap`, the moment one client sets that key, that update is automatically sent to all of the other connected clients who will update their local state with the new remote change. From a development standpoint, this allows you to develop against the `SharedMap` DDS as you would with a traditional `Map`, while ensuring that the data being updated is synced between all clients with all of the logic for managing and merging the changes abstracted away.

{{% callout tip "Differences between Map and SharedMap" %}}
- SharedMaps *must* use string keys.
- You must only store *plain objects* -- those that are safely JSON-serializable -- as values in a SharedMap. If you store class instances, for example, then data synchronization will not work as expected.
- When storing objects as values in a SharedMap, changes to the object will be synchronized whole-for-whole. This means that individual changes to the properties of an object are not merged during synchronization. If you need this behavior you should store individual properties in the SharedMap instead of full objects. See [Picking the right data structure]({{< relref "dds.md#picking-the-right-data-structure" >}}) for more information.
{{% /callout %}}

For additional background on DDSes and a general overview of their design, please take a look [here]({{< relref "dds.md" >}}).

## Creation

There are two paths to create an instance of the `SharedMap`:
1.  Using the [FluidContainer]({{< relref "containers.md" >}}) for when you'd like to directly interface with the `SharedMap` in your application
2. Using the DDS API directly for when you'd like to use it within your own custom data object

### Using FluidContainer

The `FluidContainer` provides us with a container schema for defining which DDSes you would like to load from it. It provides two separate fields for establishing an initial roster of objects and dynamically creating new ones. For general guidance on using the `ContainerSchema`, please see [here]({{< relref "data-modeling.md" >}}) and for guidance on how to create/load a container using a service-specific client, please see [here]({{< relref "containers.md#creating--loading" >}}).

Let's take a look at how you would specifically use the `ContainerSchema` for `SharedMap`.

The following example loads a `SharedMap` as part of the initial roster of objects you have available in the container.

```javascript
const schema = {
    name: "example-container",
    initialObjects: {
        customMap: SharedMap,
    }
}

const { fluidContainer, containerServices } = await client.createContainer(/*service config*/, schema);

const map = fluidContainer.initialObjects.customMap;
```

At this point, you can directly start using the `map` object within your application. Including the `SharedMap` as part of initial objects ensures that the DDS is available the moment the async call to `createContainer` finishes.

Similarly, if you are loading an existing container, the process stays largely identical with the only difference being that you use `getContainer` instead of `createContainer`.

```javascript
const schema = {
    name: "example-container",
    initialObjects: {
        customMap: SharedMap,
    }
}

const { fluidContainer, containerServices } = await client.getContainer(/*service config*/, schema);

const map = fluidContainer.initialObjects.customMap;
```

Finally, if you'd like to dynamically create `SharedMap` instances as part of the application lifecycle (i.e. if there are user interactions in the applications that require a new DDS to be created at runtime), you can add the `SharedMap` type to the `dynamicObjectTypes` field in the schema and call the container's `create` function.

```javascript
const schema = {
    /*...*/,
    dynamicObjectTypes: [ SharedMap ]
}

const { fluidContainer, containerServices } = await client.getContainer(/*service config*/, schema);

const newMap = await container.create(SharedMap); // Create a new SharedMap
```

Once the async call to `create` returns, you can treat it the same as you were using the `SharedMap` instances from your initial objects above. The only caveat here is that you will need to maintain a pointer to your newly created object. To store it in another `SharedMap`, please see the **Storing shared objects** section below and for general guidance on storing DDS references as handles, please see [here]({{< relref "dds.md#creating-and-storing-distributed-data-structures" >}})

### Using the DDS API

A `SharedMap` instance can also be created from within your own custom data object. Each extension of the `DataObject` class has access to its own `runtime` that manages the object's own data store. `SharedMap` provides a static `create` function on its API that accepts this runtime and will provide you with a new instance of the DDS.

```javascript
const newMap = SharedMap.create(this.runtime, id);
```

`DataObject` classes also provide by default a `root` [SharedDirectory]({{< relref "directory.md" >}}) object that is always available and provides a location to store the map. The `SharedMap` itself also provides a [handle]({{< relref "data-modeling.md#using-handles-to-store-and-retrieve-fluid-objects" >}}) property that can be thought of as a serializable form of the map. Now that you have a way to serialize the map and a place where to put it, you can do the following to store the map in the `root`:
```javascript
const newMapKey = "uniqueMapId";
this.root.set(newMapKey, newMap.handle);
```
And then, you can load it back in the following manner:
```javascript
const newMapHandle = this.root.get(newMapKey);
const newMapLoaded = await newMapHandle.get();
```
`newMapLoaded` now points to the same DDS as your initial `newMap`

## API Functionality

The `SharedMap` object provides a number of functions to allow you to edit the key/value pairs stored on the object. As stated earlier, these are intended to match the `Map` API. However, the keys used in `SharedMap` must be strings. Each edit will also trigger a `valueChanged` event which will be discussed in the **Events** section below.

- `set(key, value)` - Used for updating the value stored at `key` with the new provided value
- `get(key)` - Returns the latest value stored on the key or `undefined` if it does not exist
- `has(key)` - Checks to see if the key is available in the SharedMap.
- `keys()` - Returns all the keys that have been set for this map
- `entries()` - Returns an iterator for all values stored on the map.
- `delete(key)` - Removes the key/value from the map
- `forEach(callbackFn)` - Applies the provided function to each entry in the map. For example, the following will print out all of the key/value pairs in the map
```javascript
this.map.forEach((value, key) => console.log(`${key}-${value}`));
```

- `clear()` - Removes all data from the map, deleting all of the keys and values stored within it

## Events

The `SharedMap` object will emit events on changes from local and remote clients. There are two events emitted: 
- `valueChanged` - Sent anytime the map is modified due to a key being added, updated, or removed
- `clear` - Sent when `clear()` is called to alert clients that all data from the map has been removed

If client A and client B are both updating the same `SharedMap` and client B triggers a `set` call to update a value, both client A and B's local `SharedMap` objects will fire the `valueChanged` event. You can use these events in order to keep your application state in sync with all changes various clients are making to the map.

Consider the following example where you have a label and a button. When clicked, the button updates the label contents to be a random number.

```javascript
const map = fluidContainer.initialObjects.customMap;
const dataKey = "data";
const button = document.createElement('button');
button.textContent = "Randomize!";
const label = document.createElement('label');
    
button.addEventListener('click', () =>
    // Set the new value on the SharedMap
    map.set(dataKey, Math.random())
);

// This function will update the label from the SharedMap. It is connected to the SharedMap's valueChanged event
// and will be called each time a value in the SharedMap is changed.
const updateLabel = () => {
    const value = map.get(dataKey) || 0;
    label.textContent = `${value}`;
};
map.on('valueChanged', updateLabel);

// Make sure updateLabel is called at least once.
updateLabel();
```

In the code above, whenever a user clicks the button, it sets a new random value on your map's `dataKey`. This causes a `valueChanged` event to be sent on all of the clients who have this container open. Since `updateLabel` is a callback set up to update the view anytime this event gets fired, the view will always refresh with the new value for all users whenever any of the users clicks on the button.

The `valueChanged` event listener can also take in as parameters:
- a `changed` object of type `IValueChanged` which provides the `key` that was updated and what the `previousValue` was
- a `local` boolean that indicates if the current client was the one that initiated the change

Your event listener can be more sophisticated by using the additional information provided in the event arguments.

```javascript {linenos=inline,hl_lines=["14-15"]}
const map = fluidContainer.initialObjects.customMap;
const dataKey = "data";
const button = document.createElement('button');
button.textContent = "Randomize!";
const label = document.createElement('label');
    
button.addEventListener('click', () =>
    map.set(dataKey, Math.random())
);

// Get the current value of the shared data to update the view whenever it changes.
const updateLabel = (changed, local) => {
    const value = map.get(dataKey) || 0;
    label.textContent = `${value} from ${local ? "me" : "someone else"}`;
    label.style.color = changed?.previousValue > value ? "red" : "green";
};
updateLabel(undefined, false);
    // Use the changed event to trigger the rerender whenever the value changes.
map.on('valueChanged', updateLabel);
```
Now, with the changes in `updateLabel`, the label will update to say if the value was last updated by the current user or by someone else. It will also compare the current value to the last one, and if the value has increased, it will set the text color to green. Otherwise, it will be red.

## Usage guides

`SharedMap` supports storing
- primitives (strings, numbers, booleans, etc.)
- [objects](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) 
- shared objects (DDSes, data objects)

Let's walk through each of these different types and look at best practices on how to use them with the `SharedMap` APIs.

### Storing primitives

As demonstrated in the examples above, you can store and fetch primitive values from a `SharedMap` using the `set`/`get` functions on the same key. The typical pattern is as follows:
1. Create an event listener that updates app state using `get` to fetch the latest data. Connect this listener to the SharedMap's `valueChanged` event.
2. Add some app functionality to call `set` with new data. This could be from a user action as in the example above or some other mechanism.

Because the local `set` call causes the `valueChanged` event to be sent, and you're handling those changes by updating your application state, then all local and remote clients see all of their local app states getting updated.

### Storing objects

Storing objects in a `SharedMap` is very similar to storing primitives. However, one thing to note is that all values in `SharedMap` are merged using a last writer wins (LWW) strategy. This means that if multiple clients are writing values to the same key, whoever made the last update will "win" and overwrite the others. While this is fine for primitives, you should be mindful when storing objects in `SharedMaps` if you are looking for individual fields within the object to be independently modified. See [Picking the right data structure]({{< relref "dds.md#picking-the-right-data-structure" >}}) for more information.

{{< callout warning >}}

If your application requires different fields in an object to be edited simultaneously by multiple people, do NOT store the entire object under one key. Instead, store each field under its own separate key such that each one of them can be updated separately.

{{< /callout >}}

To understand this distinction, consider a scenario where you are building a task management tool where you'd like to assign various task to different people.

Here, each person may have multiple fields such as 
```json
{
    "name": "Joe Schmo",
    "email": "joeschmo@email.com",
    "address": "1234 Fluid Way"
}
```
And each task may also have multiple fields, including the person that it is assigned to, such as
```json
{
    "title": "Awesome Task",
    "description": "Doing the most awesome things",
    "assignedTo": {
        "name": "Joe Schmo",
        "email": "joeschmo@email.com",
        "address": "1234 Fluid Way"
    }
}
```

Now, the next question to ask is which of these fields you'd like to be individually collaborative. For the sake of this example, assume that the `title` and `description` are user-entered values that you'd like people to be able to edit together whereas the `assignedTo` person data is something that you receive from a backend service call that you'd like to store with your object. You can change which person the task gets assigned to but the actual metadata of each person is based off of the returned value from the backend service.

The most direct -- *but ultimately flawed* -- approach here would be to just to store the entire object into the `SharedMap` under a singular key.

This would look something like this:
```json
{
    "task1": {
        "title": "Awesome Task",
        "description": "Doing the most awesome things",
        "assignedTo": {
            "name": "Joe Schmo",
            "email": "joeschmo@email.com",
            "address": "1234 Fluid Way"
        }
    }
}
```
Now consider the scenario where two users begin to edit the task at the same time. For example, User A begins editing the `title` while User B is editing the `description`.

Each time that User A makes an edit, `map.set("task1", editedTask)` will get called where `editedTask` will hold the new `title` values. Similarly, whenever User B makes an edit, `map.set("task1", editedTask)` will also be called but `description` will now hold the updated values. However, since `SharedMap` uses the LWW merge strategy, whichever user sent their `editedTask` last will overwrite the others edit. If User A's `set` occurs last, `task1` will now hold the updates to the `title` but will have overwritten User B's updates to `description`. Similarly, if User B's `set` occurs last, `description` will be updated but not `title`.

There are two strategies to avoid this behavior:
1. We can store each of these values in their own key and only hold the key at which they are stored in the `task1` object itself. This would mean your `SharedMap` could have an object like:

```json
{
    "task1": {
        "titleKey": "task1Title",
        "descriptionKey": "task1Description",
        "assignedTo": "task1AssignedTo"
    },
    "task1Title": "Awesome Task",
    "task1Description": "Doing the most awesome things",
    "task1AssignedTo": {
        "name": "Joe Schmo",
        "email": "joeschmo@email.com",
        "address": "1234 Fluid Way"
    }
}
```

With this, when user A is editing the title, they could be executing the following code:

```javascript
const task = map.get("task1");
map.set(task.titleKey, editedTitle)
```

Similarly, when user B is editing the description, they could be executing the following:

```javascript
const task = map.get("task1");
map.set(task.descriptionKey, editedDescription)
```

Now each user is updating the fields independently and would not overwrite each other, because the parent `task1` object isn't the one that is being set each time but rather just holding the references to each of the separate fields being edited.

2. One of the caveats of the above approach is that both the tasks as well as their values are now all stored at the same level within the map. I.e. if you call `map.values()`, it will provide both the tasks themselves as well as each of their individual fields. Instead, you can have each task be stored in its own `SharedMap` and have a parent `SharedMap` that keeps track of all of the different tasks under it. We will take a look at this in the **Nested shared objects example** section below.

You can follow this same pattern for the `assignedTo` object. However, since the data in `assignedTo` is coming as a singular blob from a service, there's no need to edit individual properties independently, so you can take the simpler approach of storing the whole object in the SharedMap in this case.

```javascript
// This function (implementation not shown) fetches an array of users from an external service.
const users = await getAvailableUsers();

// Let's say that the user the task is assigned to is at index pickedUserIndex
const pickedUser = users[pickedUserIndex];

// Now store this user object as a whole into the SharedMap
const task = map.get("task1");
map.set(task.assignedToKey, pickedUser)
```

This will work as expected **because the entire object is being stored each time** instead of specific fields.

One way to think about this is that each value stored into the `SharedMap` is the smallest simultaneously editable piece of data. Any time you want users to be able to simultaneously edit individual pieces of an object, you should store those properties in separate keys.

### Storing shared objects

One of the powerful features of DDSes is that they are nestable. A DDS can be stored in another DDS allowing you to dynamically set up your data hierarchy as best fits your application needs.

When storing a DDS within another DDS, you must store its [handle]({{< relref "data-modeling.md#using-handles-to-store-and-retrieve-fluid-objects" >}}), not the DDS itself. Similarly, when retrieving DDSes nested within other DDSes, you need to first get the object’s handle then get the object from the handle. This reference based approach allows the Fluid Framework to virtualize the data underneath, only loading objects when they are requested.

That’s all you need to know about handles in order to use DDSes effectively. If you want to learn more about handles, see [Fluid handles]({{< relref "handles.md" >}}).

The following example demonstrates nesting DDSes using `SharedMap`. You specify an initial SharedMap as part of the `initialObjects` in the `ContainerSchema` and add the `SharedMap` type to `dynamicObjectTypes`.

```javascript
const schema = {
    name: "example-container",
    initialObjects: {
        initalMap: SharedMap,
    },
    dynamicObjectTypes: [SharedMap]
}
```

Now, you can dynamically create additional `SharedMap` instances and store their handles into the initial map that is always provided in the container.

```javascript
const { fluidContainer, containerServices } = await client.getContainer(/*service config*/, schema);

const initialMap = fluidContainer.initialObjects.initialMap;

// Create a SharedMap dynamically at runtime
const newSharedMap = fluidContainer.create(SharedMap);

// BAD: This call won't work; you must store the handle, not the SharedMap itself.
// initialMap.set("newSharedMapKey", newSharedMap);

// GOOD: This call correctly stores the DDS via its handle.
initialMap.set("newSharedMapKey", newSharedMap.handle);
```

To load the `newSharedMap` at a later time, you first retrieve the handle and then retrieve the object from the handle.

```javascript
const newSharedMapHandle = initialMap.get("newSharedMapKey");
const newSharedMap = await newSharedMapHandle.get();
```

{{< callout tip >}}

Loading any DDS from its handle is an asynchronous operation. You will need to use an `await` or chain Promises on the `handle.get()` call to retrieve nested DDSes.

{{< /callout >}}

#### Nested shared objects example

Let's take another look at the example from the **Storing objects** section above to see how it can be updated to use nested `SharedMaps`. This will introduce some data hierarchy and avoid having a flat map that has both the tasks and their fields themselves on the same level. To do so, let's start from the earlier model but with two tasks now.

```json
{
    "task1": {
        "title": "Awesome Task",
        "description": "Doing the most awesome things",
        "assignedTo": {
            "name": "Joe Schmo",
            "email": "joeschmo@email.com",
            "address": "1234 Fluid Way"
        }
    },
    "task2": {
        "title": "Even More Awesome Task",
        "description": "Doing even more awesome things",
        "assignedTo": {
            "name": "Jane Doe",
            "email": "janedoe@email.com",
            "address": "5678 Framework Street"
        }
    }
}
```
Here, you can have each task itself be its own `SharedMap` and have a parent `SharedMap` hold all of the handles to each task.

Then, the initial map would look like:
```json
{
    "task1": task1MapHandle,
    "task2": task2MapHandle
}
```
And the `task1` map would have:
```json
{
    "title": "Awesome Task",
    "description": "Doing the most awesome things",
    "assignedTo": {
        "name": "Joe Schmo",
        "email": "joeschmo@email.com",
        "address": "1234 Fluid Way"
    }
}
```
And the `task2` map would have:
```json
{
    "title": "Even More Awesome Task",
    "description": "Doing even more awesome things",
    "assignedTo": {
        "name": "Jane Doe",
        "email": "janedoe@email.com",
        "address": "5678 Framework Street"
    }
}
```
With this nested map structure, you are able to both ensure that each field that will be collaboratively edited is stored separately and that you have a hierarchy in how you store the data in your `SharedMap` that reflects the app's data model.

Whenever a new task is created, you can call `container.create` to get a new `SharedMap` instance and store its handle into the `initialMap` that is provided as an `initialObject`. Since each additional task map would need its own unique key, you can use a random string generator, such as [uuid](https://www.npmjs.com/package/uuid), to create a new one each time and avoid any clashes.

```javascript
const schema = {
    name: "example-container",
    initialObjects: {
        initalMap: SharedMap,
    },
    dynamicObjectTypes: [SharedMap]
}

const { fluidContainer, containerServices } = await client.getContainer(/*service config*/, schema);

const initialMap = fluidContainer.initialObjects.initialMap;

const newTask = fluidContainer.create(SharedMap);
const newTaskId = uuid();

initialMap.set(newTaskId, newTask.handle);
```

At this point, you can use `intialMap.keys()` to see all of the various task IDs that are available or `initialMap.values()` to return all of the task handles.

Say you wanted to fetch back a specific task, with ID `task123` and allow the user to edit its description.

```javascript
const taskHandle = initialMap.get("task123");
const task = await taskHandle.get();
task.set("description", editedDescription)
```

Since each task is being in a separate map and all of the fields within the task object are being stored in their own unique keys, you can now have both a hiearchical structure in your data and avoid any clashes in edits between multiple users.
