---
title: Using Fluid with React
menuPosition: 1
aliases:
  - "/start/react-tutorial/"
---

In this tutorial, you'll learn about using the Fluid Framework by building a simple application that enables every client of the application to change a dynamic time stamp on itself and all other connected clients. You'll also learn how to connect the Fluid data layer with a view layer made in [React](https://reactjs.org/).

The following image shows finished application loaded into four browsers. Each browser contains a button and a timestamp. When the button is pressed in any of the browsers, the timestamp is updated in all four browsers.

![cra](https://user-images.githubusercontent.com/1434956/111496992-faf2dc00-86fd-11eb-815d-5cc539d8f3c8.gif)

{{< callout note >}}

This tutorial assumes that you are familiar with the [Fluid Framework Overview]({{< relref "/docs/_index.md" >}}) and that you have completed the [QuickStart]({{< relref "quick-start.md" >}}). You should also be familiar with the basics of [React](https://reactjs.org/), [creating React projects](https://reactjs.org/docs/create-a-new-react-app.html#create-react-app), and [React Hooks](https://reactjs.org/docs/hooks-intro.html).

{{< /callout >}}

Concepts you will learn:
1. How to integrate Fluid into a React application
2. How to run and connect your application to a local Fluid service (Tinylicious)
3. How to create and get Fluid Containers and collaborative objects
4. How to use a [SharedMap distributed data structure (DDS)](https://fluidframework.com/docs/apis/map/sharedmap/) to sync data between connected clients


\* Just want to see the code? Jump to the [finished tutorial.](https://github.com/microsoft/FluidExamples/blob/main/cra-demo/src/App.js).

## Demo introduction

In this example you will do the following:

  - [Use Create React App](use-create-react-app)
  - [Install Fluid package dependencies](install-fluid-package-dependencies)
  - [Import and initialize Fluid dependencies](import-and-initialize-fluid-dependencies)
  - [Get the Fluid SharedMap](get-the-fluid-sharedmap)
  - [Update the view](update-the-view)

## Use Create React App

### Using NPM
```bash
npx create-react-app my-app-name --use-npm
cd my-app-name
```

### Using Yarn
```bash
npx create-react-app my-app-name
cd my-app-name
```

### Start the app

The `tinylicious` server will be needed to run this demo locally.

```bash
npx tinylicious
```

Open up a new terminal tab and start up the React app

```bash
npm run start
```

## Install Fluid package dependencies

There are two packages to install to get started with Fluid:

`fluid-framework` -- The primary Fluid package that contains the SharedMap we'll use to sync data.

`@fluidframework/tinylicious-client` -- Defines the client used to get the Fluid [container](https://fluidframework.com/docs/glossary/#container) for local development.

### Using NPM
```bash
npm install fluid-framework @fluidframework/tinylicious-client
```

### Using Yarn
```bash
yarn add fluid-framework @fluidframework/tinylicious-client
```

Lastly, open up the `App.js` file, as that will be the only file edited.

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
