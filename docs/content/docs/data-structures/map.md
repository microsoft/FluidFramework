---
title: SharedMap
menuPosition: 2
---

## Introduction

The `SharedMap` distributed data structure (DDS) is used to store key-value data.
It provides the same API as the built-in [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) object that is provided in JavaScript, but also ensures that any edits being made to the object are simultaneously transmitted to all clients.

For example, in a traditional `Map`, setting a key would only set it on the local object. In a `SharedMap`, the moment one client sets that key, that update is automatically sent to all of the other connected clients who will update their local state with the new remote change. From a development standpoint, this allows you to develop against the `SharedMap` DDS as you would with a traditional `Map`, while ensuring that the data being updated is synced between all clients with all of the logic for managing and merging the changes abstracted away.

{{% callout tip "Differences between Map and SharedMap" %}}

- SharedMaps *must* use string keys.
- You must only store the following as values in a `SharedMap`:
  - *Plain objects* -- those that are safely JSON-serializable.
    If you store class instances, for example, then data synchronization will not work as expected.
  - [Handles]({{< relref "handles.md" >}}) to other Fluid DDSes
- When storing objects as values in a SharedMap, changes to the object will be synchronized whole-for-whole. This means that individual changes to the properties of an object are not merged during synchronization. If you need this behavior you should store individual properties in the SharedMap instead of full objects. See [Picking the right data structure]({{< relref "dds.md#picking-the-right-data-structure" >}}) for more information.
{{% /callout %}}

For additional background on DDSes and a general overview of their design, see [Introducing distributed data structures]({{< relref "dds.md" >}}).

## Usage

### Installation

The `SharedMap` library can be found in the [fluid-framework](https://www.npmjs.com/package/fluid-framework) package.

To get started, run the following from a terminal in your repository:

```bash
npm install fluid-framework
```

### Creation

The `FluidContainer` provides a container schema for defining which DDSes you would like to load from it.
It provides two separate fields for establishing an initial roster of objects and dynamically creating new ones.

- For general guidance on using the `ContainerSchema`, please see [Data modeling]({{< relref "data-modeling.md" >}}).
- For guidance on how to create/load a container using a service-specific client, please see [Containers - Creating and loading]({{< relref "containers.md#creating--loading" >}}).

Let's take a look at how you would specifically use the `ContainerSchema` for `SharedMap`.

The following example loads a `SharedMap` as part of the initial roster of objects you have available in the container.

```javascript
const schema = {
    initialObjects: {
        customMap: SharedMap,
    }
}

const { container, services } = await client.createContainer(schema);

const map = container.initialObjects.customMap;
```

At this point, you can directly start using the `map` object within your application. Including the `SharedMap` as part of initial objects ensures that the DDS is available the moment the async call to `createContainer` finishes.

Similarly, if you are loading an existing container, the process stays largely identical with the only difference being that you use `getContainer` instead of `createContainer`.

```javascript
const schema = {
    initialObjects: {
        customMap: SharedMap,
    }
}

const { container, services } = await client.getContainer(id, schema);

const map = container.initialObjects.customMap;
```

Finally, if you'd like to dynamically create `SharedMap` instances as part of the application lifecycle (i.e. if there are user interactions in the applications that require a new DDS to be created at runtime), you can add the `SharedMap` type to the `dynamicObjectTypes` field in the schema and call the container's `create` function.

```javascript
const schema = {
    /*...*/,
    dynamicObjectTypes: [ SharedMap ]
}

const { container, services } = await client.getContainer(id, schema);

const newMap = await container.create(SharedMap); // Create a new SharedMap
```

Once the async call to `create` returns, you can treat it the same as you were using the `SharedMap` instances from your initial objects above. The only caveat here is that you will need to maintain a pointer to your newly created object. To store it in another `SharedMap`, please see the [Storing shared objects]({{< relref "#storing-shared-objects" >}}) section below and for general guidance on storing DDS references as handles, please see [Using handles to store and retrieve shared objects]({{< relref "data-modeling.md#using-handles-to-store-and-retrieve-shared-objects" >}}).

### API

The `SharedMap` object provides a number of methods to allow you to edit the key/value pairs stored on the object.
As stated earlier, these are intended to match the `Map` API.
However, the keys used in `SharedMap` must be strings.
Each edit will also trigger a `valueChanged` event which will be discussed in the [Events]({{< relref "#events" >}}) section below.

- `set(key, value)` -- Updates the value stored at `key` with the new provided value
- `get(key)` -- Returns the latest value stored on the key, or `undefined` if the key does not exist
- `has(key)` -- Returns whether or not the key is exists in the SharedMap
- `keys()` -- Returns an iterator for all the keys that have been set in the map
- `entries()` -- Returns an iterator for all key/value pairs stored in the map
- `delete(key)` -- Removes the key/value pair from the map
- `forEach(callbackFn: (value, key, map) => void)` -- Applies the provided function to each entry in the map.
  For example, the following will print out all of the key/value pairs in the map

    ```javascript
    this.map.forEach((value, key) => console.log(`${key}-${value}`));
    ```

- `clear()` -- Removes all data from the map, deleting all of the keys and values stored within it

### Events

The `SharedMap` object will emit events on changes from local and remote clients. There are two events emitted:

#### `valueChanged`

- Signature: `(event: "valueChanged", listener: (changed, local) => void)`
- Description: This event is sent anytime the map is modified due to a key being added, updated, or removed. It takes in as parameters a `changed` object which provides the `key` that was updated and what the `previousValue` was, and a `local` boolean that indicates if the current client was the one that initiated the change

#### `clear`

- Signature: `(event: "clear", listener: (local) => void)`
- Description: This event is sent when `clear()` is called to alert clients that all data from the map has been removed. The `local` boolean parameter indicates if the current client is the one that made the function call.

If client A and client B are both updating the same `SharedMap`, and client B triggers a `set` call to update a value, both client A's and B's local `SharedMap` objects will fire the `valueChanged` event.
You can use these events in order to keep your application state in sync with all changes various clients are making to the map.

Consider the following example where you have a label and a button. When clicked, the button updates the label contents to be a random number.

```javascript
const map = container.initialObjects.customMap;
const dataKey = "data";
const button = document.createElement('button');
button.textContent = "Randomize!";
const label = document.createElement('label');

button.addEventListener('click', () =>
    // Set the new value on the SharedMap
    map.set(dataKey, Math.random())
);

// This function will update the label from the SharedMap.
// It is connected to the SharedMap's valueChanged event,
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

Your event listener can be more sophisticated by using the additional information provided in the arguments listed above in the `valueChanged` event's `listener` signature.

```javascript {linenos=inline,hl_lines=["14-15"]}
const map = container.initialObjects.customMap;
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

There are two strategies you can use to avoid this behavior.

#### Storing values in separate keys

You can store each of these values in their own key and only hold the key at which they are stored in the `task1` object itself. This means your `SharedMap` would have an object like this:

```json
{
    "task1": {
        "titleKey": "task1Title",
        "descriptionKey": "task1Description",
        "assignedToKey": "task1AssignedTo"
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
map.set(task.titleKey, editedTitle);
```

Similarly, when user B is editing the description, they could be executing the following:

```javascript
const task = map.get("task1");
map.set(task.descriptionKey, editedDescription);
```

Now each user is updating the fields independently and would not overwrite each other, because the parent `task1` object isn't the one that is being set each time but rather just holding the references to each of the separate fields being edited.

#### Storing values in separate SharedMaps

One of the caveats of the above approach is that both the tasks as well as their values are now all stored at the same level within the map. For example, if you call `map.values()`, it will return both the tasks themselves as well as each of their individual fields. Instead, you can have each task be stored in its own `SharedMap` and have a parent `SharedMap` that keeps track of all of the different tasks under it. See the [Nested shared objects example]({{< relref "#nested-shared-objects-example" >}}) to see how to do this.

#### When values do not need to be separately stored

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

When storing a DDS within another DDS, you must store its [handle]({{< relref "data-modeling.md#using-handles-to-store-and-retrieve-shared-objects" >}}), not the DDS itself. Similarly, when retrieving DDSes nested within other DDSes, you need to first get the object's handle and then get the object from the handle. This reference based approach allows the Fluid Framework to virtualize the data underneath, only loading objects when they are requested.

That's all you need to know about handles in order to use DDSes effectively. If you want to learn more about handles, see [Fluid handles]({{< relref "handles.md" >}}).

The following example demonstrates nesting DDSes using `SharedMap`. You specify an initial SharedMap as part of the `initialObjects` in the `ContainerSchema` and add the `SharedMap` type to `dynamicObjectTypes`.

```javascript
const schema = {
    initialObjects: {
        initialMap: SharedMap,
    },
    dynamicObjectTypes: [SharedMap]
}
```

Now, you can dynamically create additional `SharedMap` instances and store their handles into the initial map that is always provided in the container.

```javascript
const { container, services } = await client.getContainer(id, schema);

const initialMap = container.initialObjects.initialMap;

// Create a SharedMap dynamically at runtime
const newSharedMap = await container.create(SharedMap);

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

You can further extend the example from the [Storing objects]({{< relref "#storing-objects" >}}) section above to see how it can be updated to use nested `SharedMaps`. This will introduce a hierarchy to the data to make it easier to work with. To do so, consider the earlier data model but with two tasks.

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

To break this apart, you can have each task itself be its own `SharedMap` and have a parent `SharedMap` hold all of the handles to each task. Then the initial map would look like:

```json
{
    "task1": task1MapHandle,
    "task2": task2MapHandle
}
```

And the `task1` map would look like:

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

And the `task2` map would look like:

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

With this nested map structure, you can both ensure that each field that will be simultaneously edited is stored separately and that you have a hierarchy in how you store the data in your `SharedMap` that reflects the app's data model.

Whenever a new task is created, you can call `container.create` to create a new `SharedMap` instance and store its handle in the `initialMap` that is provided as an `initialObject`. Since each additional task map will need its own unique key, you can use a random string generator, such as [uuid](https://www.npmjs.com/package/uuid), to create a new one each time and avoid ID conflicts.

```javascript
const schema = {
    initialObjects: {
        initialMap: SharedMap,
    },
    dynamicObjectTypes: [SharedMap]
}

const { container, services } = await client.getContainer(id, schema);

const initialMap = container.initialObjects.initialMap;

const newTask = await container.create(SharedMap);
const newTaskId = uuid();

initialMap.set(newTaskId, newTask.handle);
```

At this point, you can use `initialMap.keys()` to retrieve the IDs of all the tasks or `initialMap.values()` to return the handles to the `SharedMaps` for each task.

For example, if you wanted to fetch task with ID `task123` and allow the user to edit its description, you would use code like this:

```javascript
const taskHandle = initialMap.get("task123");
const task = await taskHandle.get();
task.set("description", editedDescription)
```

Since each task is stored in a separate `SharedMap` and all of the fields within the task object are being stored in their own unique keys, your data now has a hierarchical structure that reflects the app's data model while individual tasks' properties can be edited independently.
