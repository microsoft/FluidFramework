---
title: Using Fluid with React
menuPosition: 1
aliases:
  - "/start/react-tutorial/"
---

In this tutorial, you'll learn about using the Fluid Framework by building a simple application that enables every client of the application to change a dynamic time stamp on itself and all other clients almost instantly. You'll also learn how to connect the Fluid data layer with a view layer made in [React](https://reactjs.org/). The following image shows the time stamp application open in four browsers. Each has a button labelled **click** and beside it a UNIX Epoch time. The same time in all four. The cursor is on the button in one browser.

![Four browsers with the Timestamp app open in them.](https://fluidframework.blob.core.windows.net/static/images/Four-clients-1.PNG)

The following image shows the same four clients one second after the **click** button was pressed. Note that the timestamp has updated to the very same time in all four browsers.

![Four browsers with the Timestamp app open in them one second after the button has been pushed.](https://fluidframework.blob.core.windows.net/static/images/Four-clients-2.PNG)

{{< callout note >}}

This tutorial assumes that you are familiar with the [Fluid Framework Overview]({{< relref "/docs/_index.md" >}}) and that you have completed the [QuickStart]({{< relref "quick-start.md" >}}). You should also be familiar with the basics of [React](https://reactjs.org/), [creating React projects](https://reactjs.org/docs/create-a-new-react-app.html#create-react-app), and [React Hooks](https://reactjs.org/docs/hooks-intro.html).

{{< /callout >}}


Concepts you will learn:
1. How to integrate Fluid into a React application
2. How to run and connect your application to a local Fluid service (Tinylicious)
3. How to create and get Fluid Containers and collaborative objects
4. How to use a [SharedMap distributed data structure (DDS)](https://fluidframework.com/docs/apis/map/sharedmap/) to sync data between connected clients


\* Just want to see the code? Jump to the [finished tutorial.](https://github.com/microsoft/FluidExamples/blob/main/cra-demo/src/App.js).

## What to expect

In this example you will do the following:

  - [Create the project](#create-the-project)
  - [Install Fluid package dependencies](#install-fluid-package-dependencies)
  - [Import and initialize Fluid dependencies](#import-and-initialize-fluid-dependencies)
  - [Get the Fluid SharedMap](#get-the-fluid-sharedmap)
  - [Update the view](#update-the-view)

## Create the project

1. Open a Command Prompt and navigate to the parent folder where you want to create the project; e.g., `c:\My Fluid Projects`.
1. Run the following command at the prompt. (Note that the CLI is np**x**, not npm. It was installed when you installed Node.js.)

    ```dotnetcli
    npx create-react-app fluid-react-tutorial --use-npm
    ```

1. The project is created in a subfolder named `fluid-react-tutorial`. Navigate to it with the command `cd fluid-react-tutorial`.
1. The project uses two Fluid libraries:

    |Library |Description |
    |---|---|
    |fluid&#x2011;framework&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;    |Contains the SharedMap [distributed data structure]({{< relref "dds.md" >}}) that synchronizes data across clients. *This object will hold the most recent timestamp update made by any client.*|
    |fluidframework/tinylicious&#x2011;client&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;   |Defines the connection to a Fluid service server and defines the starting schema for the [Fluid container][]|
    &nbsp;

    Run the following command to install the libraries.

    ```dotnetcli
    npm install @fluidframework/tinylicious-client fluid-framework
    ```

## Import and initialize Fluid dependencies

`TinyliciousClient` is a client for `Tinylicious`, a local Fluid server used for testing the application. The client will include a method for creating a [Fluid container]({{< relref "containers.md" >}}) with a set of initial [DDSes]({{< relref "dds.md" >}}) or [shared objects]({{< relref "glossary.md#shared-objects" >}}) that are defined in the `containerSchema`.

> The Fluid container interacts with the processes and distributes operations, manages the lifecycle of Fluid objects, and provides a request API for accessing Fluid objects.

`SharedMap` is the DDS that will be initialized on the container.

```js
// App.js
// Add to the top of the file

import React from "react";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { SharedMap } from "@fluid-experimental/fluid-framework";
```

### Configure the service client

This demo illustrates using the Tinylicious for local development, so the client is a new instance of the `TinyliciousClient`.

```js
// add below imports
const client = new TinyliciousClient();
```

Before the client can create any containers, it needs a `containerSchema` that will define, by name, the data objects used in this application.

```js
const containerSchema = {
    initialObjects: { myMap: SharedMap }
};
```

It's a common pattern to store important map keys as constants, rather than typing the raw string each time.

```js
const timeKey = "time-key";
```

## Get the Fluid `SharedMap`

Fluid applications can be loaded in one of two states, creating or loading. This demo differentiates these states by the presence, or absence of a hash string (`localhost:3000/#abc`), which will also serves as the container `id`. The function below will return the `myMap` SharedMap, defined above, from either a new container, or an existing container, based on the presence of a hash long enough to include an `id` value.


```js
const getMyMap = async () => {
    let container;
    if (location.hash <= 1) {
        ({ container } = await client.createContainer(containerSchema));
        container.initialObjects.myMap.set(timeKey, Date.now().toString());
        const id = await container.attach();
        location.hash = id;
    } else {
        const id = location.hash.substring(1);
        ({ container } = await client.getContainer(id, containerSchema));
    }
    return container.initialObjects.myMap;
}
```


### Get the SharedMap on load

Now that the app has defined how to get the Fluid map, you need to tell React to call `getMyMap` on load, and then store the result in state.
React's [useState hook](https://reactjs.org/docs/hooks-state.html) will provide the storage needed, and [useEffect](https://reactjs.org/docs/hooks-effect.html) will allow us to call `getMyMap` on render, passing the returned value into `setFluidMap`.

By setting an empty dependency array at the end of the `useEffect`, the app ensure that this function only gets called once.

```jsx
// Add to the top of the App
const [fluidMap, setFluidMap] = React.useState(undefined);

React.useEffect(() => {
    getMyMap().then(myMap => setFluidMap(myMap));
}, []);
```

### Sync Fluid and view data

Syncing Fluid and view data requires that the app create an event listener, which is another opportunity for `useEffect`. This second `useEffect` function will return early if `fluidMap` is not defined and run again once `fluidMap` has been set thanks to the added dependency.

To sync the data we're going to create a `syncView` function, call that function once to initialize the view, and then continue calling that function each time the map's "valueChanged" event is raised.



```jsx
// Add below the previous useEffect
const [viewData, setViewData] = React.useState(undefined);

React.useEffect(() => {
    if (fluidMap !== undefined) {
        // sync Fluid data into view state
        const syncView = () => setViewData({ time: fluidMap.get(timeKey) });
        // ensure sync runs at least once
        syncView();
        // update state each time the map changes
        fluidMap.on("valueChanged", syncView);
        // turn off listener when component is unmounted
        return () => { fluidMap.off("valueChanged", syncView) }
    }
}, [fluidMap])
```


## Update the view

In this simple multi-user app, you are going to build a button that, when pressed, shows the current timestamp. You will store that timestamp in Fluid so that each co-authors will automatically see the most recent timestamp at which any author pressed the button.

To make sure the app does not render too soon, it returns a blank `<div />` until the `viewData` is defined. Once that's done, it renders a button that sets the `timeKey` key in `myMap` to the current timestamp. Each time this button is pressed, every user will see the latest value stored in the `time` state variable.

```jsx
    // update the App return

    if (!viewData) return <div/>;

    return (
        <div className="App">
            <button onClick={() => fluidData.mySharedMap.set(timeKey, Date.now().toString())}>
                click
            </button>
            <span>{viewData.time}</span>
        </div>
    )
```

Paste the URL of the application into the address bar of another tab or even another browser to have more than one client open at a time. Press the **Get Time** button on any client and see the value change and synchronize on all the clients.

## Next steps

- Try extending the demo with more key/value pairs and a more complex UI
- Consider using the [Fluent UI React controls](https://developer.microsoft.com/fluentui/) to give the application the look and feel of Microsoft 365. To install them in your project run the following in the command prompt: `npm install @fluentui/react`.
- Try changing the container schema to use a different shared data object type or specify multiple objects in `initialObjects`.

{{< callout tip >}}

When you make changes to the code the project will automatically rebuild and the application server will reload. However, if you make changes to the container schema, they will only take effect if you close and restart the application server. To do this, give focus to the Command Prompt and press Ctrl-C twice. Then run `npm run start` again.

{{< /callout >}}

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
