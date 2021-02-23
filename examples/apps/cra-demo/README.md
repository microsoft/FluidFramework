# @fluid-example/cra-demo
This is an experimental example of a completed integration between [`create-react-app`](https://create-react-app.dev/) and Fluid. Below you will find instructions to how to start from `create-react-app` and get to this completed state.

1. Install Create-React-App with Typescript
2. Install Fluid and Fluid Data Objects
3. Import KVpair and Fluid Static
4. Update the view
5. Start a custom hook
6. Loading the KVPair data object
7. Syncing our app state with Fluid data

## 1. Install Create-React-App with Typescript

```bash
npx create-react-app my-app-name --template typescript
```

## 2. Install Fluid and Fluid Data Objects

```bash
cd my-app-name
npm install @fluid-experimental/fluid-static @fluid-experimental/data-objects
```

Lastly, open up the `App.tsx` file, as that will be the only file we need to edit.

## 3. Import KVpair and Fluid Static

Fluid gives you access to methods to boostrap a new Fluid container and attach DataObjects to it.

`KeyValueDataObject` will provide you with a fully scaffolded DDS to store your data and subscribe to change events. The `KeyValueInstantiationFactory` is required by `Fluid` to instantiate the `KeyValueDataObject`.

```js
// App.tsx
import { Fluid } from "@fluid-experimental/fluid-static";
import { KeyValueDataObject, KeyValueInstantiationFactory } from "@fluid-experimental/data-objects";
```

### 3.a Add the `getContainerId` function

The `Fluid` class helps you create or load a Fluid container. As you build your application, you'll eventually track these containers yourself. For now, `getContainerId` function either loads the container identified by the hash in the URL or creates a new container for you.

This is an area we'd like to improve, but, for now, paste this code below your imports.

```tsx
// below imports
const getContainerId = (): { containerId: string; isNew: boolean } => {
    let isNew = false;
    if (location.hash.length === 0) {
        isNew = true;
        location.hash = Date.now().toString();
    }
    const containerId = location.hash.substring(1);
    return { containerId, isNew };
};
```


## 4. Update the view

In this simple multi-user app, we are going to build a button that, when pressed, shows the current time stamp. This allows co-authors to see the most recent timestamp at which any author pressed the button.

To start, remove all of the existing Create-React-App returned markup and replace it as shown below.

You can see that this UI requires a `data` object and `setPair` functions to work, so we'll add those above and pull them out of a function we need to write, called `useKVPair`. The plan is for `data` to be a simple JavaScript object, where `setPair` sets a key value pair on that object. This allows us to write out `data.time` once the value is set by the button click.

```tsx
function App() {
  const [ data, setPair ] = useKVPair();

  if (!setPair) return <div />;

  return (
    <div className="App">
      <button onClick={() => setPair("time", Date.now().toString())}>
        click
      </button>
      <span>{data.time}</span>
    </div>
  );
}
```

## 5. Start a custom hook

Working in React, one of the best ways to abstract complex, reusable functionality is via a custom hook. Custom hooks are functions that have access to the built in React hooks like `useState` and `useEffect` which we'll need in order to load our Fluid DataObject, and track our local state.

Hooks are just functions with stateful return values. So our hook will return data of type `KVData`, and a method of type `SetKVPair` which will pulled in async.

These two returns are all that we'll need to build out our sample app. In more complex scenarios you might use a `reducer` pattern to pass down a set of dispatchable actions, rather than giving direct access to the `SetKVPair`.

```tsx

type KVData = { [key: string]: any };
type SetKVPair = (key: string, value: any) => void;

function useKVPair(): [KVData, SetKVPair | undefined] {
    return [data, setPair]
};
```

## 6. Loading the KVPair data object

The first part of our hook will load the KVPair Data Object into a place where we can use all of its built in functionality. With the KVPair we'll be able to `set` data onto the Fluid data structure, listen for changes via the `on` method, and update our local app state anytime those changes occur. With a few lines of code we'll have a UI that reads, writes and reacts to incoming changes from this multi user application.

### 6.a Create a place to store our dataObject

Since we're working with async functions, we will need a place to store our KeyValueDataObject once it is loaded. This is why we're using React hooks, because inside of a hook, we can use React's `useState` to create a stateful value and a method to modify that state.

```tsx
// inside useKVPair
const [dataObject, setDataObject] = React.useState<KeyValueDataObject>();
```

### 6.b Create/Load the Fluid document and data object
Now that we have a setter method, we need to make sure that our create/get flow runs just once, on app load. Here we'll use React's `useEffect` because it allows code to be ran as soon as the component loads, and re-run only when specific values change, which by setting the dependency array to `[]`, means never.

The bulk of this `useEffect` hooks is the async `load` function that starts by getting or creating the `fluidDocument`. The `FluidDocument` class then allows use to get or create one or more data objects. This could be multiple KVPairs, or other DataObjects that you define.


```jsx
// inside useKVPair
React.useEffect(() => {
    const { containerId, isNew } = getContainerId();

    const load = async () => {
        const fluidDocument = isNew
            ? await Fluid.createDocument(containerId, [KeyValueInstantiationFactory.registryEntry])
            : await Fluid.getDocument(containerId, [KeyValueInstantiationFactory.registryEntry]);

        const keyValueDataObject: KeyValueDataObject = isNew
            ? await fluidDocument.createDataObject(KeyValueInstantiationFactory.type, 'kvpairId')
            : await fluidDocument.getDataObject('kvpairId');

        setDataObject(keyValueDataObject);
    }

    load();

}, [])
```

Once the DataObject is returned we assign it to our `dataObject` state variable, and now we have access to all of the KVPair's methods, including `set` which we pass down as the `setPair` function.

Here's our hook so far.


```tsx
function useKVPair(): [KVData, SetKVPair | undefined] {
    const [dataObject, setDataObject] = React.useState<KeyValueDataObject>();

    React.useEffect(() => {
        const { containerId, isNew } = getContainerId();

        const load = async () => {...
        }

        load();

    }, [])

    const setPair = dataObject?.set;

    return [data, setPair];
}
```

## 7. Syncing our app state with Fluid data

It is possible to avoid syncing data between Fluid and app state, but I've found that it can cause as many problems as it solves. So for this demo we will have app state drive our UI updates, and sync Fluid data into our view's state any time that it changes. The advantages of this approach are:

1. We leverage React's ability to update its UI based on changing state (vs forcing a re-render)
2. In the real world, view state will often be a subset of the entire Fluid state
3. A MVC/MVP approach will require Fluid data (as the app database) to be translated into queries passed into views anyway

### 7.a Create a place to store our KVPair data

Just like in our `dataObject` example, we are going to use React's `useState` to store the data we sync in from Fluid. In our case, we're going to dump the entire store into state, but in real life examples this syncing would be selective based on if data pertinent to this view had changed.

This state is shaped like a normal JavaScript object (great for view frameworks), and we'll start with an empty default value so that we don't need to worry about an undefined state.

```tsx
// inside useKVPair
const [data, setData] = React.useState<{ [key: string]: any }>({});
```

### 7.b Listen for changes and sync data

Setting up listeners is a common usecase for `useEffect`, and this is exactly what we're going to do. The main difference between this example and the one above is that on first render we won't have access to the`dataObject` yet, and we need to wait for it to load. So this time we will only set up our listener if the `dataObject` is defined, and we'll make sure the `useEffect` is fired any time that the `dataObject` changes.


```tsx
// inside useKVPair
React.useEffect(() => {
    if (dataObject) {
        const updateData = () => setData(dataObject.query());
        dataObject.on("changed", updateData);
        return () => { dataObject.off("change", updateData) }
    }
}, [dataObject]);
```

Now, once the `dataObject` gets set, this `useEffect` will fire a second time. We first create the method `updateData` that sets our state `data` to `dataObject.query()` (which returns an object with all of the key value pairs). Then we set `updateData` to be called any time that the `dataObjects`'s `changed` event fires.

Lastly we return the `off` method to remove the listener as soon as this React view is removed.

## A working application

To see this application working we first need to fire up a local Fluid server called Tinylicious

```bash
npx tinylicious
```

Then we're ready to start our React app

```bash
npm run start
```

> They both happen to use port 3000, so CRA will ask if you want to use 3001. Just hit enter

When the app loads it will update the URL. Copy that new URL into a second browser and note that if you click the button in one browser, the other browser updates as well.
