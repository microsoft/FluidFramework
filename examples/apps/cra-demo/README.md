# @fluid-example/cra-demo
This is an experimental learning tutorial demonstrating the integration of Fluid into [`create-react-app`](https://create-react-app.dev/).

Concepts you will learn:
1. How to integrate Fluid into a React application
2. How to run and connect your application to a local Fluid service (Tinylicious)
3. How to create and get Fluid Containers and collaborative objects
4. How to use a [SharedMap distributed data structure (DDS)](https://fluidframework.com/docs/apis/map/sharedmap/) to sync data between connected clients


\* Just want to see the code? Jump to the [finished tutorial.](./src/App.js).

## Demo introduction

In this demo you will be doing the following:

1. [Install Create-React-App](#cra)
2. [Install Fluid Package Dependencies](#install)
3. [Import and Initialize Dependencies](#import)
4. [Get Fluid Data](#init)
5. [Update the view](#view)
6. [Next Steps](#next)

## 1. <a style="position: relative; top: 20px" name="cra"></a> Use Create-React-App

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

### 1.a Start the app

The `tinylicious` server will be needed to run this demo locally.

```bash
npx tinylicious
```

Open up a new terminal tab and start up our React app

```bash
npm run start
```

## 2. <a style="position: relative; top: 20px" name="install"></a> Install Fluid Package Dependencies

There are two packages to install to get started with Fluid:

`@fluid-experimental/frs-client` - Defines the client we'll use to connect to our Fluid [container](https://fluidframework.com/docs/glossary/#container), both locally and if deployed
`@fluidframework/map` - Contains the SharedMap you will use to sync data

### Using NPM
```bash
npm install @fluid-experimental/frs-client @fluidframework/map
```

### Using Yarn
```bash
yarn add @fluid-experimental/frs-client @fluidframework/map
```

\* These are still experimental packages, and not ready for production

Lastly, open up the `App.js` file, as that will be the only file we need to edit.

## 3. <a style="position: relative; top: 20px" name="import"></a> Import and Initialize Fluid Dependencies

`FrsClient` is a client for `Tinylicious`, a local test Fluid server while testing our application. It provides methods to create a [Fluid container](https://fluidframework.com/docs/glossary/#container) with a set of initial [DDSes](https://fluidframework.com/docs/concepts/dds/) or [DataObjects](https://fluidframework.com/docs/glossary/#dataobject) that are defined in the `containerSchema`.

> The Fluid container interacts with the processes and distributes operations, manages the lifecycle of Fluid objects, and provides a request API for accessing Fluid objects.

`InsecureTokenProvider` is a class that we will use to provide temporary credentials to our `Tinylicious` server. In production this would be replaced with an official token provider.

`SharedMap` is the DDS that we will initialize on our container.

```js
// App.js
// Add to the top of the file

import React from "react";
import { FrsClient, InsecureTokenProvider } from "@fluid-experimental/frs-client";
import { SharedMap } from "@fluidframework/map";
```

### 3.a Create unique container IDs

Fluid collaboration happens in [containers](https://fluidframework.com/docs/glossary/#container), which have unique identifiers (like a document filename). For this example we'll use the hash part of the URL as the identifier, and generate a new hash if there isn't one present already. The `getContainerId` function will automate this for us.

```jsx
// add below imports
const getContainerId = () => {
    let isNew = false;
    if (window.location.hash.length === 0) {
        isNew = true;
        window.location.hash = Date.now().toString();
    }
    const containerId = window.location.hash.substring(1);
    return { containerId, isNew };
};
```

### 3.b Configure the service client

This demo illustrates using a local configuration, but in a production environment you could swap this out with a production configuration without changing your application.

```js
// add below getContainerId
const localConfig = {
    tenantId: "local",
    tokenProvider: new InsecureTokenProvider("tenantId", { id: "userId" }),
    orderer: "http://localhost:7070",
    storage: "http://localhost:7070",
};
```

## 4. <a style="position: relative; top: 20px" name="init"></a> Get Fluid Data

Before we can access any Fluid data, we need to create our configured FRS `client` and define our container schema.

- `containerSchema` is going to include a string `name` and a collection of the data types our application will use.

The following `getFluidData` function utilizes the `getContainerId` to return a unique ID and determine if this is an existing document (`getContainer`) or if we need to create a new one (`createContainer`).

Since this `getFluidData` function is an async, we'll need to wait for the `initialObjects` to be returned. Once returned, each `initialObjects` key will point to a connected data structure as defined in the schema.

```jsx
// after creating an instance
const getFluidData = async () => {
    const { containerId, isNew } = getContainerId();

    const client = new FrsClient(localConfig);

    const containerSchema = {
        name: 'cra-demo-container',
        initialObjects: { mySharedMap: SharedMap }
    };

    const { fluidContainer } = isNew
        ? await client.createContainer({id: containerId}, containerSchema)
        : await client.getContainer({id: containerId}, containerSchema);
    // returned initialObjects are live Fluid data structures
    return fluidContainer.initialObjects;
}
```

### 4.a getFluidData on load

Now that we've defined how to get our Fluid data, we need to tell React to call `getFluidData` on load and then store the result in state.
React's [`useState`](https://reactjs.org/docs/hooks-state.html) will provide the storage we need, and [`useEffect`](https://reactjs.org/docs/hooks-effect.html) will allow us to call `getFluidData` on render, passing the returned value into `fluidData`. By setting an empty dependency array at the end of the `useEffect`, we ensure that this function only gets called once.

```jsx
// Add to the top of our App
const [fluidData, setFluidData] = React.useState();

React.useEffect(() => {
    // Get/Create container and return live Fluid data
    getFluidData().then(data => setFluidData(data));
}, []);
```

### 4.b Sync Fluid and View data

Syncing our Fluid and View data requires that we set up an event listener, which is another usecase for `useEffect`. This second `useEffect` function will return early if `fluidData` is not defined and be ran again once `fluidData` has been set thanks to the added dependency.

To sync the data we're going to create a `syncView` function, call that function once to initialize the data, and then keep listening for the `mySharedMap` "valueChanged" event, and fire the function again each time. Now React will handle updating the view each time the new `viewData` state is modified.



```jsx
// Add below the previous useEffect

const [viewData, setViewData] = React.useState();

React.useEffect(() => {
    if (!fluidData) return;

    const { mySharedMap } = fluidData;
    // sync Fluid data into view state
    const syncView = () => setViewData({ time: mySharedMap.get("time") });
    // ensure sync runs at least once
    syncView();
    // update state each time our map changes
    mySharedMap.on("valueChanged", syncView);
    return () => { mySharedMap.off("valueChanged", syncView) }

}, [fluidData])
```


## 5. <a style="position: relative; top: 20px" name="view"></a>  Update the view

In this simple multi-user app, we are going to build a button that, when pressed, shows the current timestamp. We will store that timestamp in Fluid. This allows co-authors to automatically see the most recent timestamp at which any author pressed the button.

To make sure we don't render the app too soon, we return a blank `<div />` until the `map` is defined. Once that's done, we'll render a button that sets the `time` key in our `map` to the current timestamp. Each time this button is pressed, every user will see the latest value stored in the `time` state variable.

```jsx
    // update the App return

    if (!viewData) return <div/>;

    return (
        <div className="App">
            <button onClick={() => fluidData.mySharedMap.set("time", Date.now().toString())}>
                click
            </button>
            <span>{viewData.time}</span>
        </div>
    )
```

When the app loads it will update the URL. Copy that new URL into a second browser and note that if you click the button in one browser, the other browser updates as well.

![cra](https://user-images.githubusercontent.com/1434956/111496992-faf2dc00-86fd-11eb-815d-5cc539d8f3c8.gif)

## 6. <a style="position: relative; top: 20px" name="next"></a>  Next Steps

- Try extending the demo with more key/value pairs and a more complex UI
  - `npm install @fluentui/react` is a great way to add [UI controls](https://developer.microsoft.com/en-us/fluentui#/)
- Try using other DDSes such as the [SharedString](https://fluidframework.com/docs/apis/sequence/sharedstring/)
