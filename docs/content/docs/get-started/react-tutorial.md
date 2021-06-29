---
title: 'Tutorial: Create a Fluid Framework application with React'
menuPosition: 4
---

In this tutorial, you'll learn about using the Fluid Framework by building a simple application that enables every client of the application to change a dynamic time stamp on itself and all other clients almost instantly. You'll also learn how to connect the Fluid data layer with a View layer made in [React](https://reactjs.org/). This animated GIF shows what the application looks like when it is open in four clients.

![Animated GIF showing the application open in four clients](https://user-images.githubusercontent.com/1434956/111496992-faf2dc00-86fd-11eb-815d-5cc539d8f3c8.gif)

{{< callout note >}}

This tutorial assumes that you are familiar with the [Fluid Framework Overview](../overview.md) and that you have completed the [QuickStart](./quick-start.md). You should also be familiar with the basics of [React](https://reactjs.org/), [creating React projects](https://reactjs.org/docs/create-a-new-react-app.html#create-react-app), and [React Hooks](https://reactjs.org/docs/hooks-intro.html).

{{< /callout >}}

## Create the project

1. Open a Command Prompt and navigate to the parent folder where you want to create the project; e.g., `c:\My Fluid Projects`.
1. Run the following command at the prompt. (Note that the CLI is np**x**, not npm. It was installed when you installed npm.)

    ```dotnetcli
    npx create-react-app fluid-react-tutorial --use-npm
    ```

1. The project is created in a subfolder named `fluid-react-tutorial`. Navigate to it with the command `cd fluid-react-tutorial`.
1. The project uses two Fluid libraries:

    |Library |Description |
    |---|---|
    |fluid&#x2011;experimental/fluid&#x2011;framework |Contains the SharedMap [DataObject](https://fluidframework.com/docs/glossary/#dataobject) that synchronizes data across clients. _This object will hold the most recent timestamp update made by any client._|
    |fluid&#x2011;experimental/tinylicious&#x2011;client&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;   |Defines the service connection to a local Fluid server that runs on localhost, and the starting schema for the [container](https://fluidframework.com/docs/concepts/containers-runtime/).|
    &nbsp;

    Run the following command to install the libraries.

    ```dotnetcli
    npm install @fluid-experimental/tinylicious-client @fluid-experimental/fluid-framework
    ```

## Code the project

1. Open the file `\src\App.js` in your code editor. Delete all the default `import` statements except the one that imports `App.css`. Then delete all the markup from the `return` statement. The file should look like the following:

    ```js
    import './App.css';
    
    function App() {
      return (
  
      );
    }
    
    export default App;
    ```

1. Add the following `import` statements:

    ```js
    import React from "react";
    import TinyliciousClient from "@fluid-experimental/tinylicious-client";
    import { SharedMap } from "@fluid-experimental/fluid-framework";
    ```

### Create a container ID helper function

Add the following helper function to the file below the `import` statements. Note the following about this code:

- Every [container](https://fluidframework.com/docs/glossary/#container) must have a unique ID. For the ID, this application will use a truncated version of the UNIX epoch time when the container is first created.
- The ID is stored in the `window.location.hash` property.
- The function is called in a useEffect hook that you create in a later step, so it is called every time the application (re)renders.

```js
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

### Initialize the service client

When developing a Fluid application, you use a Fluid service called Tinylicious that runs on localhost. TinyliciousClient manages the communication with this service. The client needs to be initialized when the application starts up, so add the following line below the container ID helper.

```js
TinyliciousClient.init();
```

### Move Fluid data to the view

1. The Fluid server will bring changes made to the timestamp from any client to the current client. But Fluid is agnostic about the UI framework. We need a helper method to get the Fluid data, from the SharedMap object, into the view layer (the React state). Add the following code below the TinyliciousClient initialization. This method will be called when the application loads the first time and the returned value assigned to a React state property. 

    ```js
    const getFluidData = async () => {

        // TODO 1: Configure the container.
        // TODO 2: Get the container from the Tinylicious service.
        // TODO 3: Return the Fluid timestamp object.
    }
    ```

1. Replace `TODO 1` with the following code. Note that the Tinylicious service doesn't require a lot of configuration, and that there is only one object in the container: a SharedMap holding the timestamp. Note also that `timestamp` is the ID of the `SharedMap` object and it must be unique within the container.

    ```js
    const { containerId, isNew } = getContainerId();
    const serviceConfig = {id: containerId};
    const containerSchema = {
        name: 'fluid-react-tutorial-container',
        initialObjects: { sharedTimestamp: SharedMap }
    };
    ```

1. Replace `TODO 2` with the following code. Note that `isNew` was returned by the `getContainerId` helper method and it is true if the application has no Fluid container yet.

    ```js
    const [container] = isNew
        ? await TinyliciousClient.createContainer(serviceConfig, containerSchema)
        : await TinyliciousClient.getContainer(serviceConfig, containerSchema);
    ```

1. Replace `TODO 3` with the following code. 

    ```js
    return container.initialObjects;
       ```

### Get the Fluid data on first render

Now that we've defined how to get our Fluid data, we need to tell React to call `getFluidData` when the application starts up and then store the result in state. So add the following code at the top of the App() function (above the `return` statement). Note about this this code: 

- By setting an empty dependency array at the end of the useEffect, we ensure that this function only gets called once.
- Since `setFluidSharedMap` is a state-changing method, it will cause the React `App` component to immediately rerender. 

```js
const [fluidSharedMap, setFluidSharedMap] = React.useState();

React.useEffect(() => {
    getFluidData()
    .then(data => setFluidSharedMap(data));
}, []);
```

### Create the App component's second render

The timestamp that is rendered in the application's UI does not come directly from the `fluidSharedMap` state object because that object can be changed by other clients and these changes do not call the `setFluidSharedMap` method, so they do not trigger a rerender of the `App` component. Thus, remote changes would not appear in the current client's UI.

To ensure that both local and remote changes to the timestamp are reflected in the UI, create a second application state value for the timestamp and ensure that it is updated (with a state-updating function) whenever any client changes the `fluidSharedMap` value.

1. Below the preceding `useEffect` add the following code. Note about this code:

- The `fluidSharedMap` state is undefined only when the `App` component is rendering for the first time.
- Passing `fluidSharedMap` in the second parameter of the `useEffect` hook ensures that the hook will not pointlessly run if `fluidSharedMap` has not changed since the last time the `App` component rendered. 

    ```js
    const [timestamp, setTimestamp] = React.useState();

    React.useEffect(() => {
        if (fluidSharedMap) {
    
            // TODO 4: Set the value of the timestamp state object that will appear in the UI.
            // TODO 5: Register handlers.
            // TODO 6: Delete handler registration when the React App component is unMounted.
    
        } else {
            return; // Do nothing since there is no Fluid SharedMap object yet.
        }
    }, [fluidSharedMap])
    ```

1. Replace `TODO 4` with the following code. Note that the Fluid `SharedObject.get` method returns the data of the `SharedObject` (in this case the `SharedMap` object), which is roughly the `SharedObject` without any of its methods. So the `setTimestamp` function is setting the `timestamp` state to a copy of the data of the `SharedMap` object. (The key "time" that is passed to `SharedObject.get` is created in a later step. It will have been set by the time this code runs the first time.)

    ```js
    const { sharedTimestamp } = fluidSharedMap;
    const updateTimestamp = () => setTimestamp({ time: sharedTimestamp.get("time") });
    updateTimestamp();
    ```

1. To ensure that the `timestamp` state is updated whenever the `fluidSharedMap` is changed _even by other clients_, replace `TODO 5` with the following code. Note that because `updateTimestamp` calls the state-setting function `setTimestamp`, a rerender is triggered whenever any client changes the Fluid `fluidSharedMap`.

    ```js
    sharedTimestamp.on("valueChanged", updateTimestamp);
   ```

1. It is a good practice to deregister event handlers when the React component unmounts, so replace `TODO 6` with the following code.

    ```js
    return () => { sharedTimestamp.off("valueChanged", updateTimestamp) }
   ```


### Create the view

Below the `useEffect` hook, replace the `return ();` line with the following code. Note about this code:

- If the `timestamp` state has not been initialized, a blank screen is rendered.
- The `sharedTimestamp.set` method sets the _key_ of the `fluidSharedMap` object to "time" and the _value_ to the current UNIX epoch time. This triggers the `changed` event on the object, so the `updateTimestamp` function runs and sets the `timestamp` state to the same object; for example, `{time: "1615996266675"}`. The `App` component rerenders and the `<span>` is updated with the latest timestamp.
- All other clients update too because the Fluid server propagates the change to the `fluidSharedMap` on all of them and this `changed` event updates the `timestamp` state on all of them.

```js
if (timestamp) {
    return (
        <div className="App">
            <button onClick={() => fluidSharedMap.sharedTimestamp.set("time", Date.now().toString())}>
                Get Time
            </button>
            <span>{timestamp.time}</span>
        </div>
    )
} else {
     return <div/>;
}
```

## Start the Fluid server and run the application

In the Command Prompt, run the following command to start the Fluid server. A new Command Prompt window will open and the Fluid server will start in it.

```dotnetcli
npx tinylicious
```

In the original Command Prompt, start the application server with the following command. The application opens in your browser.

```dotnetcli
npm run start
```

{{< callout note >}}

If you are prompted to run the application server on another port, press Enter to accept.

{{< /callout >}}

Paste the URL of the application into the address bar of another tab or even another browser to have more than one client open at a time. Press the **Get Time** button on any client and see the value change and synchronize on all the clients. 

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
