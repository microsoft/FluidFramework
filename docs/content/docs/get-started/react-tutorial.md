---
title: 'Tutorial: Create a Fluid Framework application with React'
menuPosition: 4
---

In this tutorial, you'll learn about using the Fluid Framework by building a simple  application that enables every client of the application to change a dynamic time stamp on itself and all other clients almost instantly. This animated GIF shows what the application looks like when it is open in four clients.

![Animated GIF showing the application open in four clients](https://user-images.githubusercontent.com/1434956/111496992-faf2dc00-86fd-11eb-815d-5cc539d8f3c8.gif)

The development framework for this tutorial is [React](https://reactjs.org/).

{{< callout note >}}

This tutorial assumes that you are familiar with the [Fluid Framework Overview](../overview.md) and that you have completed the [QuickStart](./quick-start.md). You should also be familiar with the basics of [React](https://reactjs.org/), [creating React projects](https://reactjs.org/docs/create-a-new-react-app.html#create-react-app), and [React Hooks](https://reactjs.org/docs/hooks-intro.html).

{{< /callout >}}

## Create the project

1. Open a Command Prompt and navigate to the parent folder where you want to create the project; e.g., `c:\My Fluid Projects`.
1. Run the following command at the prompt. (Note that the CLI is np**x**, not npm. It was installed when you installed npm.)

    ```dotnetcli
    npx create-react-app fluid-react-tutorial --use-npm --template typescript
    ```

1. The project is created in a subfolder named `fluid-react-tutorial`. Navigate to it with the command `cd fluid-react-tutorial`.
1. The project uses three Fluid libraries:

    |Library |Description |
    |---|---|
    |fluid&#x2011;static |Manages creating and getting Fluid [containers](https://fluidframework.com/docs/concepts/containers-runtime/).|
    |data&#x2011;objects |Contains the KeyValue [DataObject](https://fluidframework.com/docs/glossary/#dataobject) that synchronizes data across clients. _This object will hold the most recent timestamp update made by any client._|
    |get&#x2011;container&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;   |Defines the service connection to a local Fluid server that runs on localhost.|
    &nbsp;

    Run the following command to install the libraries.

    ```dotnetcli
    npm install @fluid-experimental/fluid-static @fluid-experimental/data-objects @fluid-experimental/get-container
    ```

## Code the project

1. Open the file `\src\App.tsx` in your code editor. Delete all the default `import` statements except the one that imports `React`. Then delete all the markup from the `return` statement. The file should look like the following:

    ```ts
    import React from 'react';
    
    function App() {
      return ();
    }
    
    export default App;
    ```

1. Add the following `import` statements:

    ```ts
    import { Fluid } from "@fluid-experimental/fluid-static";
    import { KeyValueDataObject } from "@fluid-experimental/data-objects";
    import { TinyliciousService } from "@fluid-experimental/get-container";
    ```

### Create a container ID helper function

Add the following helper function to the file below the `import` statements. Note the following about this code:

- Every [container](https://fluidframework.com/docs/glossary/#container) must have a unique ID. For the ID, this application will use a truncated version of the UNIX epoch time when the container is first created.
- The ID is stored in the `window.location.hash` property.
- The function is called in a useEffect hook that you create in a later step, so it is called every time the application (re)renders.

```ts
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

### Create the hooks

The Fluid server will bring changes made to the timestamp from any client to the current client. But Fluid is agnostic about the UI framework. We need to get the shared `KeyValueDataObject` into the React application's state, so add the following code at the top of the App() function (above the `return` statement). You will replace the `TODO` in a later step.

```ts
const [fluidKVObject, setFluidKVObject] = React.useState<KeyValueDataObject>();

// TODO 1: Call the useState hook for a timestamp state value.
```

To create the hook that will run when the application first renders and then again whenever a change in the timestamp causes the application to rerender, add the following code just below the lines you added above. Note about this code:

- The `fluidKVObject` state is undefined only when the `App` component is rendering for the first time.
- Passing `fluidKVObject` in the second parameter of the `useEffect` hook ensures that the hook will not pointlessly run if `fluidKVObject` has not changed since the last time the `App` component rendered.

```ts
React.useEffect(() => {
  if (fluidKVObject === undefined) {

    // TODO 2: Create and load the container and KeyValueDataObject.

  } else {
        
    // TODO 3: Set the value of the timestamp state object that will appear in the UI.
    // TODO 4: Register handlers.
    // TODO 5: Delete handler registration when the React App component is unMounted.

  }
}, [fluidKVObject]);
```

#### Create the App component's first render

1. Replace `TODO 2` with the following code. Note that `TinyliciousService` is a Fluid server that runs on localhost.

    ```ts
    const { containerId, isNew } = getContainerId();
    const load = async () => {
        const service = new TinyliciousService();
        // TODO 2a: Get the container from the service.
        // TODO 2b: Get the KeyValueDataObject from the service.
        // TODO 2c: Set the application's setFluidKVObject state.  
    }
    
    load();
    ```

2. Replace `TODO 2a` with the following code. Note that `isNew` was returned by the `getContainerId` helper method and it is true if the application has no Fluid container yet.

    ```ts
    const fluidContainer = isNew
            ? await Fluid.createContainer(service, containerId, [KeyValueDataObject])
            : await Fluid.getContainer(service, containerId, [KeyValueDataObject]);
    ```

3. Replace `TODO 2b` with the following code. Note that `timestamp` is the ID of the `KeyValueDataObject` object and it must be unique within the container.

    ```ts
    const keyValueDataObject: KeyValueDataObject = isNew
            ? await fluidContainer.createDataObject(KeyValueDataObject, 'timestamp')
            : await fluidContainer.getDataObject('timestamp');
    ```

4. Replace `TODO 2c` with the following code. This sets the value of the application's `fluidKVObject` state. It also triggers a rerendering of the `App` component, _so this `useEffect` hook will run again immediately_. On the second execution, `fluidKVObject` is not undefined, so the `else` path of the hook runs.

    ```ts
    setFluidKVObject(keyValueDataObject);
    ```

#### Create the App component's second render

The timestamp that is rendered in the application's UI does not come directly from the `fluidKVObject` state object because that object can be changed by other clients and these changes do not call the `setFluidKVObject` method, so they do not trigger a rerender of the `App` component. Thus, remote changes would not appear in the current client's UI.

To ensure that both local and remote changes to the timestamp are reflected in the UI, create a second application state value for the timestamp and ensure that it is updated (with a state-updating function) whenever any client changes the `fluidKVObject` value.

1. Create the new state value by replacing `TODO 1` with the following code.

    ```ts
    const [timestamp, setTimestamp] = React.useState<{ time: any }>({time: ""});
    ```

2. In the second render of the `App` component, set the value of the timestamp by replacing `TODO 3` with the following code. Note that the Fluid `DataObject.query` method returns the data of the `DataObject` (in this case the `KeyValueDataObject` object), which is roughly the `DataObject` without any of its methods. So the `setTimestamp` function is setting the `timestamp` state to a copy of the data of the `KeyValueDataObject` object.

    ```ts
    const updateTimestamp = () => setTimestamp(fluidKVObject.query());
    updateTimestamp();
    ```

3. To ensure that the `timestamp` state is updated whenever the `fluidKVObject` is changed even by other clients, replace `TODO 4` with the following code. Note that because `updateTimestamp` calls the state-setting function `setTimestamp`, a rerender is triggered whenever any client changes the Fluid `fluidKVObject`.

    ```ts
    fluidKVObject.on("changed", updateTimestamp);
    ```

4. It is a good practice to deregister event handlers when the React component unmounts, so replace `TODO 5` with the following code.

    ```ts
    return () => { fluidKVObject.off("changed", updateTimestamp) };
    ```

### Create the view

Below the `useEffect` hook, replace the `return ();` line with the following code. Note about this code:

- If the `fluidKVObject` has not been initialized, a blank screen is rendered.
- The `fluidKVObject.set` method sets the _key_ of the `fluidKVObject` object to "time" and the _value_ to the current UNIX epoch time. This triggers the `changed` event on the object, so the `updateTimestamp` function runs and sets the `timestamp` state to the same object; for example, `{time: "1615996266675"}`. The `App` component rerenders and the `<span>` is updated with the latest timestamp.
- All other clients update too because the Fluid server propagates the change to the `fluidKVObject` on all of them and this `changed` event updates the `timestamp` state on all of them.

```ts
if (!fluidKVObject) return (<div />);

return (
    <div className="App">
        <button onClick={() => fluidKVObject.set("time", Date.now().toString())}>
            Get time
        </button>
        <span>{timestamp["time"]}</span>
    </div>
);
```

## Start the Fluid server and run the application

In the Command Prompt, run the following command to start the Fluid server. A new Command Prompt window will open and the Fluid server will start in it.

```dotnetcli
start npx tinylicious@0.4.17169
```

In the original Command Prompt, start the application server with the following command. The application opens in your browser.

```dotnetcli
npm run start
```

{{< callout note >}}

If you are prompted to run the application server on another port, press Enter to accept.

{{< /callout >}}

Paste the URL of the application into the address bar of another tab or even another browser to have more than one client open at a time. Press the **Get time** button on any client and see the value change and synchronize on all the clients. 

## Next steps

- Try extending the demo with more key/value pairs and a more complex UI
- Consider using the [Fluent UI React controls](https://developer.microsoft.com/fluentui#/) to give the application the look and feel of Microsoft 365. To install them in your project run the following in the command prompt: `npm install @fluentui/react`.
- Try extending the KeyValueDataObject class and adding your own custom functionality.

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "/docs/concepts/containers-runtime.md" >}}

<!-- Packages -->

[Aqueduct]: {{< relref "/apis/aqueduct.md" >}}
[undo-redo]: {{< relref "/apis/undo-redo.md" >}}

<!-- Classes and interfaces -->

[ContainerRuntimeFactoryWithDefaultDataStore]: {{< relref "/apis/aqueduct/containerruntimefactorywithdefaultdatastore.md" >}}
[DataObject]: {{< relref "/apis/aqueduct/dataobject.md" >}}
[DataObjectFactory]: {{< relref "/apis/aqueduct/dataobjectfactory.md" >}}
[Ink]: {{< relref "/apis/ink/ink.md" >}}
[SharedCell]: {{< relref "/apis/cell/sharedcell.md" >}}
[SharedCounter]: {{< relref "SharedCounter" >}}
[SharedDirectory]: {{< relref "/apis/map/shareddirectory.md" >}}
[SharedMap]: {{< relref "/apis/map/sharedmap.md" >}}
[SharedMatrix]: {{< relref "SharedMatrix" >}}
[SharedNumberSequence]: {{< relref "SharedNumberSequence" >}}
[SharedObjectSequence]: {{< relref "/apis/sequence/sharedobjectsequence.md" >}}
[SharedSequence]: {{< relref "SharedSequence" >}}
[SharedString]: {{< relref "SharedString" >}}
[Quorum]: {{< relref "/apis/protocol-base/quorum.md" >}}

<!-- Sequence methods -->

[sequence.insert]: {{< relref "/apis/sequence/sharedsequence.md#sequence-sharedsequence-insert-Method" >}}
[sequence.getItems]: {{< relref "/apis/sequence/sharedsequence.md#sequence-sharedsequence-getitems-Method" >}}
[sequence.remove]: {{< relref "/apis/sequence/sharedsequence.md#sequence-sharedsequence-getitems-Method" >}}
[sequenceDeltaEvent]: {{< relref "/apis/sequence/sequencedeltaevent.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
