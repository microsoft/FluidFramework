# @fluid-example/cra-demo
This is an experimental learning tutorial demonstrating an integration between [`create-react-app`](https://create-react-app.dev/) and Fluid.

Concepts you will learn:
1. How to integrate Fluid into a React application
2. How to run and connect your application to a local Fluid service (Tinylicious)
3. How to create and get Fluid Containers and DataObjects
4. How to use a single KeyValuePair (KVPair) DataObject to sync data between connected clients


\* This demo is a work in progress. There will be rough sections that need refactoring or refinement

## Demo introduction

In this demo you will be doing the following:

1. [Install Create-React-App](#cra)
2. [Install Fluid Package Dependencies](#install)
3. [Import and Initialize Dependencies](#import)
4. [Connect React to Fluid Data](#init)
5. [Update the view](#view)
6. [Fire up the servers](#servers)
7. [Next Steps](#next)

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

\* Don't start the React application yet. We'll do that at the end.

## 2. <a style="position: relative; top: 20px" name="install"></a> Install Fluid Package Dependencies

There are three packages to install to get started with Fluid:

`@fluid-experimental/fluid-static` - Manages creating and getting Fluid containers
`@fluid-experimental/data-objects` - Contains the KVPair DataObject you will use to sync data
`@fluid-experimental/get-container` - Defines the service connection to our local Fluid server

### Using NPM
```bash
npm install @fluid-experimental/fluid-static @fluid-experimental/data-objects @fluid-experimental/get-container
```

### Using Yarn
```bash
yarn add @fluid-experimental/fluid-static @fluid-experimental/data-objects @fluid-experimental/get-container
```

\* These are still experimental packages, and not ready for production

Lastly, open up the `App.js` file, as that will be the only file we need to edit.

## 3. <a style="position: relative; top: 20px" name="import"></a> Import and Initialize Fluid Dependencies

`Fluid` provides methods for creating a [Fluid container](https://fluidframework.com/docs/glossary/#container) with a default set of [DataObjects](https://fluidframework.com/docs/glossary/#dataobject)

`KeyValueDataObject` is the DataObject that we will initialize on our container, and will give us an API to set and retrieve key value pairs from Fluid.

> `KeyValueDataObject` is a rudimentary data object that is useful for powering small projects and getting started learning Fluid. If you need more than a flat key/value data structure, considering forking the existing [KVPair data object](https://github.com/microsoft/FluidFramework/blob/main/experimental/framework/data-objects/src/kvpair/DataObject.ts), and learning more about [DDS'es](https://fluidframework.com/docs/concepts/dds/).

```js
// App.js
import Fluid from "@fluid-experimental/fluid-static";
import { KeyValueDataObject } from "@fluid-experimental/data-objects";
import { TinyliciousService } from "@fluid-experimental/get-container";
```

### 3.a Create unique container IDs

Fluid collaboration happens in [containers](https://fluidframework.com/docs/glossary/#container), which have unique identifiers (like a document filename). For this example we'll use the hash part of the URL as the identifier, and generate a new one if there isn't one present already. The `getContainerId` function will automate this for you.

```jsx
// below imports
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

### 3.b Initialize Fluid with the appropriate service

The Fluid import can be initialized with a number of different services. The `TinyliciousService` defines the schema for connecting to a locally deployed [tinylicious](https://www.npmjs.com/package/tinylicious) Fluid service. You'll use different provided services, like `RouterliciousService`, when connecting to production Fluid services.

```js
Fluid.init(new TinyliciousService());
```

## 4. <a style="position: relative; top: 20px" name="init"></a>  Connect React to Fluid Data

Before we can actually render our view we need to create, or get, our Fluid container and KeyValueDataObject. We can do this within the React lifecycle by using the React hooks, `useState` and `useEffect`.

[`useState`](https://reactjs.org/docs/hooks-state.html) provides storage that we can modify over the lifecycle of the component, and [`useEffect`](https://reactjs.org/docs/hooks-effect.html) is a method that gets called as soon as the component renders, and again any time state changes.

All of the code in step 4 will go before the `return` method.

### 4.a Create a place to store state

Since changes to the data in Fluid won't trigger an update to our React view, we need to store the view's `data` in React state and then modify that state each time our view should update.

We will also need to store the `KeyValueDataObject` because it will only be created after we create the Fluid container.

```jsx
function App() {
    const [data, setData] = React.useState({});
    const [dataObject, setDataObject] = React.useState();

    // render
};
```

Now that we have state, we need a way to update that state when our React component loads. That's where we turn to `useEffect`.

### 4.b Load container and subscribe to changes to Fluid data

React's `useEffect` takes a function as its first parameter that fires as soon as the component loads and then fires again if any of its dependencies change (in our case the `dataObject` state variable, specified in the second parameter).

Our `useEffect` will end up firing twice. The first time, on component load, it will either create or load the container depending on if it's a new 'document'.

The second time `useEffect` fires, the `dataObject` will have been set and we can set up a listener to update the view's data each time the `changed` event is fired. For this example, we are updating all of the Fluid data on any change, but you could be more selective here if desired.

```jsx
function App() {

    const [data, setData] = React.useState<{ [key: string]: any }>({});
    const [dataObject, setDataObject] = React.useState<KeyValueDataObject>();

    React.useEffect(() => {
        if (dataObject === undefined) {
        // First time: create/get the Fluid container, then create/get KeyValueDataObject
            const { containerId, isNew } = getContainerId();
            const containerConfig = {
                name: 'demo-container',
                initialObjects: { kvpair: KeyValueDataObject }
            };
            const load = async () => {
                const fluidContainer = isNew
                    ? await Fluid.createContainer(containerId, containerConfig)
                    : await Fluid.getContainer(containerId, containerConfig);

                const initialObjects = fluidContainer.initialObjects;
                setDataObject(initialObjects.kvpair);
            }

            load();
        } else {
        // Second time: set our local state with a query from the KeyValueDataObject
            const updateData = () => setData(dataObject.query());
            updateData();
            dataObject.on("changed", updateData);
            return () => { dataObject.off("changed", updateData) }
        }

    }, [dataObject]);

    // render
}
```




## 5. <a style="position: relative; top: 20px" name="view"></a>  Update the view

In this simple multi-user app, we are going to build a button that, when pressed, shows the current timestamp. We will store that timestamp in Fluid. This allows co-authors to automatically see the most recent timestamp at which any author pressed the button.

To make sure we don't render the app too soon, we return a blank `<div />` until the `dataObject` is defined. Once that's done, we'll render a button that sets the `time` key in our `KeyValueDataObject` to the current timestamp. Anytime this button is pressed, every user will see the latest value stored in the `time` key of `data`.

```jsx
function App() {

    const [data, setData] = React.useState<{ [key: string]: any }>({});
    const [dataObject, setDataObject] = React.useState<KeyValueDataObject>();

    React.useEffect(() => {
        if (dataObject === undefined) {
        // First time: create/get the Fluid container, then create/get KeyValueDataObject
            const { containerId, isNew } = getContainerId();
            const containerConfig = {
                name: 'demo-container',
                initialObjects: { kvpair: KeyValueDataObject }
            };
            const load = async () => {
                const fluidContainer = isNew
                    ? await Fluid.createContainer(containerId, containerConfig)
                    : await Fluid.getContainer(containerId, containerConfig);

                const initialObjects = fluidContainer.initialObjects;
                setDataObject(initialObjects.kvpair);
            }

            load();
        } else {
        // Second time: set our local state with a query from the KeyValueDataObject
            const updateData = () => setData(dataObject.query());
            updateData();
            dataObject.on("changed", updateData);
            return () => { dataObject.off("changed", updateData) }
        }

    }, [dataObject]);

    // update the view below

    if (!dataObject) return <div />;

    return (
        <div className="App">
            <button onClick={() => dataObject.set("time", Date.now().toString())}>
                click
            </button>
            <span>{data["time"]}</span>
        </div>
    )
}
```

## 6. <a style="position: relative; top: 20px" name="servers"></a>  Fire up the servers

To see this application working we first need to fire up a local Fluid server called Tinylicious

```bash
npx tinylicious
```

Then we're ready to start our React app

```bash
npm run start
```

When the app loads it will update the URL. Copy that new URL into a second browser and note that if you click the button in one browser, the other browser updates as well.

![cra](https://user-images.githubusercontent.com/1434956/111496992-faf2dc00-86fd-11eb-815d-5cc539d8f3c8.gif)

## 7. <a style="position: relative; top: 20px" name="next"></a>  Next Steps

- Try extending the demo with more key/value pairs and a more complex UI
  - `npm install @fluentui/react` is a great way to add [UI controls](https://developer.microsoft.com/en-us/fluentui#/)
- Try extending the [KeyValueDataObject ](https://github.com/microsoft/FluidFramework/blob/release/0.36/experimental/framework/data-objects/src/kvpair/DataObject.ts) class and adding your own custom functionality
