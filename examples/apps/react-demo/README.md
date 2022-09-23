# @fluid-example/react-demo
This is an experimental learning tutorial demonstrating the integration of Fluid into [`create-react-app`](https://create-react-app.dev/).

Concepts you will learn:
1. How to integrate Fluid into a React application
2. How to run and connect your application to a local Fluid service (Tinylicious)
3. How to create and get Fluid Containers and collaborative objects
4. How to use a [SharedMap distributed data structure (DDS)](https://fluidframework.com/docs/data-structures/map/) to sync data between connected clients


\* Just want to see the code? Jump to the [finished tutorial.](./src/App.js).

## Demo introduction

In this example you will do the following:

  - [Use Create React App](#use-create-react-app)
  - [Install Fluid package dependencies](#install-fluid-package-dependencies)
  - [Import and initialize Fluid dependencies](#import-and-initialize-fluid-dependencies)
  - [Get the Fluid SharedMap](#get-the-fluid-sharedmap)
  - [Update the view](#update-the-view)
  - [Next steps](#next-steps)

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

Open up a new terminal tab and start up our React app

```bash
npm run start
```

## Install Fluid package dependencies

There are two packages to install to get started with Fluid:

`fluid-framework` -- The primary Fluid package that contains the SharedMap we'll use to sync data.

`@fluidframework/tinylicious-client` -- Defines the client we'll use to get our Fluid [container](https://fluidframework.com/docs/glossary/#container) for local development.

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

`TinyliciousClient` is a client for `Tinylicious`, a local Fluid server used for testing our application. The client will include a method for creating a [Fluid container]({{< relref "containers.md" >}}) with a set of initial [DDSes]({{< relref "dds.md" >}}) or [shared objects]({{< relref "glossary.md#shared-objects" >}}) that are defined in the `containerSchema`.

> The Fluid container interacts with the processes and distributes operations, manages the lifecycle of Fluid objects, and provides a request API for accessing Fluid objects.

`SharedMap` is the DDS that will be initialized on our container.

```js
// App.js
// Add to the top of the file

import React from "react";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { SharedMap } from "fluid-framework";
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

Now that the app has defined how to get our Fluid map, you need to tell React to call `getMyMap` on load, and then store the result in state.
React's [useState hook](https://reactjs.org/docs/hooks-state.html) will provide the storage needed, and [useEffect](https://reactjs.org/docs/hooks-effect.html) will allow us to call `getMyMap` on render, passing the returned value into `setFluidMap`. 

By setting an empty dependency array at the end of the `useEffect`, the app ensure that this function only gets called once.

```jsx
// Add to the top of our App
const [fluidMap, setFluidMap] = React.useState(undefined);

React.useEffect(() => {
    getMyMap().then(myMap => setFluidMap(myMap));
}, []);
```

### Sync Fluid and view data

Syncing our Fluid and view data requires that the app create an event listener, which is another opportunity for `useEffect`. This second `useEffect` function will return early if `fluidMap` is not defined and run again once `fluidMap` has been set thanks to the added dependency.

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
        // update state each time our map changes
        fluidMap.on("valueChanged", syncView);
        // turn off listener when component is unmounted
        return () => { fluidMap.off("valueChanged", syncView) }
    }
}, [fluidMap])
```


## Update the view

In this simple multi-user app, you are going to build a button that, when pressed, shows the current timestamp. We will store that timestamp in Fluid so that each co-authors will automatically see the most recent timestamp at which any author pressed the button.

To make sure the app does not render too soon, it returns a blank `<div />` until the `viewData` is defined. Once that's done, it renders a button that sets the `timeKey` key in `myMap` to the current timestamp. Each time this button is pressed, every user will see the latest value stored in the `time` state variable.

```jsx
    // update the App return

    if (!viewData) return <div />;

    // business logic could be passed into the view via context
    const setTime = () => fluidMap.set(timeKey, Date.now().toString());

    return (
        <div>
            <button onClick={setTime}> click </button>
            <span>{viewData.time}</span>
        </div>
    )
```

When the app loads it will update the URL. Copy that new URL into a second browser and note that if you click the button in one browser, the other browser updates as well.

![react-demo](https://user-images.githubusercontent.com/1434956/111496992-faf2dc00-86fd-11eb-815d-5cc539d8f3c8.gif)

## Next steps

- Try extending the example with more key/value pairs and a more complex UI
  - `npm install @fluentui/react` is a great way to add [UI controls](https://developer.microsoft.com/en-us/fluentui#/)
- Try using other DDSes such as the [SharedString](https://fluidframework.com/docs/apis/sequence/sharedstring/)
