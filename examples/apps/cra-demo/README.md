# @fluid-example/cra-demo
This is an experimental learning tutorial demonstrating a completed integration between [`create-react-app`](https://create-react-app.dev/) and Fluid. Below you will find instructions to how to start from `create-react-app` and get to this completed state.

Concepts you will learn:
1. How to integrate Fluid into a React application
2. How run and connect your application to a local Fluid service
3. How to create and get Fluid Containers and DataObjects
4. How to use a single KeyValuePair (KVPair) DataObject to sync data between connected clients


\* This demo is a work in progress. There will be rough sections that need refactoring or refinement

## Demo introduction

In this demo you will be doing the following:

1. Install Create-React-App with Typescript
2. Install Fluid Package Dependencies
3. Import KVpair and Fluid Static
4. Initialize React component
5. Update the view
6. Run the app!

## 1. Use Create-React-App with Typescript

### Using NPM
```bash
npx create-react-app my-app-name --use-npm --template typescript
cd my-app-name
```

### Using Yarn
```bash
npx create-react-app my-app-name --template typescript
cd my-app-name
```

## 2. Install Fluid Package Dependencies

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

Lastly, open up the `App.tsx` file, as that will be the only file we need to edit.

## 3. Import Fluid and KeyValueDataObject

`Fluid` provides methods for creating a [Fluid container](https://fluidframework.com/docs/glossary/#container) and attaching [DataObjects](https://fluidframework.com/docs/glossary/#dataobject) to it.

`KeyValueDataObject` is the DataObject that we will attach to this app's container, and will give us an API to set and retrieve key value pairs from Fluid.

```js
// App.tsx
import { Fluid } from "@fluid-experimental/fluid-static";
import { KeyValueDataObject } from "@fluid-experimental/data-objects";
import { TinyliciousService } from "@fluid-experimental/get-container";

```

### 3.a Create unique container IDs

Fluid collaboration happens in [containers](https://fluidframework.com/docs/glossary/#container), which have unique identifiers (like a document filename). For this example we'll use the hash part of the URL as the identifier, and generate a new one if there isn't one present already. The `getContainerId` function will automate this for you.

```tsx
// below imports
const getContainerId = (): { containerId: string; isNew: boolean } => {
    let isNew = false;
    if (window.location.hash.length === 0) {
        isNew = true;
        window.location.hash = Date.now().toString();
    }
    const containerId = window.location.hash.substring(1);
    return { containerId, isNew };
};
```


## 4. Initialize React component

Before we can actually render our view we need to create our Fluid container and data objects. We can do this within the React lifecycle by using the React hooks, `useState` and `useEffect`.

`useState` provides storage that we can modify over the lifecycle of the component, and `useEffect` is a method that gets called as soon as the component renders, and again any time state changes.

All of the code in step 4 will go before the `return` method.

### 4.a Create a place to store state

In this application we need a place to store the view's `data`, and a method to modify state each time our view should update. We will also need to store the `KeyValueDataObject` in state because it will only be created after we create the Fluid container.

```tsx
function App() {
    const [data, setData] = React.useState<{ [key: string]: any }>({});
    const [dataObject, setDataObject] = React.useState<KeyValueDataObject>();

    // render
};
```

Now that we have state, we need a way to update that state as soon as the component loads. That's where we turn to `useEffect`.

### 4.b Load container and subscribe to changes to Fluid data

React's `useEffect` is passed a function that fires as soon as the component loads and then fires again if any of its dependencies change (in our case the `dataObject` state variable).

Our `useEffect` will end up firing twice. The first time, on component load, it will either create or load the container and `dataObject` based on if this is a new "document" (no hash in URL) or existing "document" (has hash in URL) .

> `TinyliciousService` is the service we are using to handle the Fluid data for this local demo. You'll use different services if you load your app in Azure, Teams or Sharepoint.

The second time `useEffect` fires, the `dataObject` will have been set, so we set up a listener to call `updateData` each time the `changed` event is fired. `UpdateData` will sync the view state with the necessary Fluid data. For this example, we're just pulling all of the Fluid data.

```jsx
function App() {

    const [data, setData] = React.useState<{ [key: string]: any }>({});
    const [dataObject, setDataObject] = React.useState<KeyValueDataObject>();

    React.useEffect(() => {
        if (dataObject !== undefined) {
        // First time: create/get the Fluid container, then create/get KeyValueDataObject
            const { containerId, isNew } = getContainerId();
            const load = async () => {
                const service = new TinyliciousService();
                const fluidContainer = isNew
                    ? await Fluid.createContainer(service, containerId, [KeyValueDataObject])
                    : await Fluid.getContainer(service, containerId, [KeyValueDataObject]);

                const keyValueDataObject: KeyValueDataObject = isNew
                    ? await fluidContainer.createDataObject(KeyValueDataObject, 'someUniqueId')
                    : await fluidContainer.getDataObject('someUniqueId');

                setDataObject(keyValueDataObject);
            }

            load();
        } else {
        // Second time: set our local state with a query from the KeyValueDataObject
            const updateData = () => setData(dataObject.query());
            updateData();
            dataObject.on("changed", updateData);
            return () => { dataObject.off("change", updateData) }
        }

    }, [dataObject]);

    // render
}
```




## 5. Update the view

In this simple multi-user app, we are going to build a button that, when pressed, shows the current timestamp. We will store that timestamp in Fluid. This allows co-authors to automatically see the most recent timestamp at which any author pressed the button.

To make sure we don't render the app too soon, we return a blank `<div />` until the `dataObject` is defined. Once that's done, we'll render a button that sets the `time` key in our `KeyValueDataObject` to the current timestamp. Anytime this button is pressed, every user will see the latest value stored in the `time` key of `data`.

```tsx
function App() {

    const [data, setData] = React.useState<{ [key: string]: any }>({});
    const [dataObject, setDataObject] = React.useState<KeyValueDataObject>();

    React.useEffect(() => {
        if (!dataObject) {
            const { containerId, isNew } = getContainerId();

            const load = async () => {
                const service = new TinyliciousService();
                const fluidContainer = isNew
                    ? await Fluid.createContainer(service, containerId, [KeyValueDataObject])
                    : await Fluid.getContainer(service, containerId, [KeyValueDataObject]);

                const keyValueDataObject: KeyValueDataObject = isNew
                    ? await fluidContainer.createDataObject(KeyValueDataObject, 'kvpairId')
                    : await fluidContainer.getDataObject('kvpairId');

                setDataObject(keyValueDataObject);
            }

            load();
        } else {
            const updateData = () => setData(dataObject.query());
            updateData();
            dataObject.on("changed", updateData);
            return () => { dataObject.off("change", updateData) }
        }
    }, [dataObject]);

    if (!dataObject) return <div />;

    return (
        <div className="App">
            <button onClick={() => dataObject.set("time", Date.now().toString())}>
                click
            </button>
            <span>{data.time}</span>
        </div>
    )
}
```

## 7. A working application

To see this application working we first need to fire up a local Fluid server called Tinylicious

```bash
npx tinylicious@0.4.17169
```

Then we're ready to start our React app

```bash
npm run start
```

> They both happen to use port 3000, so CRA will ask if you want to use 3001. Just hit enter. This issue is [fixed](https://github.com/microsoft/FluidFramework/pull/5447) in the next release.

When the app loads it will update the URL. Copy that new URL into a second browser and note that if you click the button in one browser, the other browser updates as well.
