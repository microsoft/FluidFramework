---
title: Using TaskManager
draft: true
author: scottn12
---

In this tutorial, you'll learn how to use [TaskManager]({{< relref "docs/data-structures/task-manager.md" >}}) in a Fluid application. `TaskManager` is a specialized DDS designed to facilitate the distrubution of tasks that should be exclusively executed by a single client to avoid errors and mitigate redundancy.

This example is based on the [DiceRoller]({{< relref "docs/start/tutorial.md" >}}) application, but with the additional constraint that only one client can "roll" the dice at a time. To accomplish this, `TaskManager` ensures only one of the connected clients is able to generate the new dice roll, log the result, and update the `SharedMap` dice value. To jump ahead to the finished demo, click [here](TODO_LINK_HERE).

The following shows the app open in two browsers. Note that the left client is currently assigned the task and is logging each new dice roll.

![Two browsers with the app open.](/images/task-manager-diceroller-1.png)

The next image shows the same two clients after the left client clicks on the "Abandon" button. This will cause the left client to lose the task assignment, and the right client to be assigned the task. Note that the right client is now assigned and is logging each new dice roll.

![Two browsers with the app open after the left client clicks "Abandon"](/images/task-manager-diceroller-2.png)

{{< callout note >}}

This tutorial assumes that you are familiar with the [Fluid Framework Overview]({{< relref "/docs/_index.md" >}}) and that you have completed the [Quick Start]({{< relref "quick-start.md" >}}). You should also be familiar with the basics of [React](https://reactjs.org/), [creating React projects](https://reactjs.org/docs/create-a-new-react-app.html#create-react-app), and [React Hooks](https://reactjs.org/docs/hooks-intro.html).

{{< /callout >}}

## Create the project

1. Open a Command Prompt and navigate to the parent folder where you want to create the project, e.g., `C:\My Fluid Projects`.
1. Run the following command at the prompt. (Note that the CLI is np**x**, not npm. It was installed when you installed Node.js.)

    ```dotnetcli
    npx create-react-app task-manager-diceroller --template typescript
    ```

1. Navigate to the root of the project with the command `cd task-manager-diceroller`.
1. The project uses three Fluid libraries:

    |Library |Description |
    |---|---|
    | `fluid-framework`    |Bundles commonly used Fluid packages. We will be using the [SharedMap DDS]({{< relref "docs/data-structures/map.md" >}}) to sync data.|
    | `@fluidframework/tinylicious-client`   |Defines the connection to a Fluid server and defines the starting schema for the [Fluid container]({{< relref "containers.md" >}}).|
    | `@fluidframework/task-manager`   |Contains the `TaskManager` class and `ITaskManager` interface.|
    {.table}

    Run the following command to install the libraries.

    ```dotnetcli
    npm install fluid-framework @fluidframework/tinylicious-client @fluidframework/task-manager
    ```

## Code the project

1. Open the file `\src\App.tsx` in your code editor. Delete all the default `import` statements except the one that imports `App.css`. Then delete all the code in the `App()` function. The file should look like the following:

    ```ts
    import "./App.css";

    function App() {

    }

    export default App;
    ```

1. Add the following `import` statements. Note about this code:

    - `TinyliciousClient` is a Fluid service that runs on the local development computer.
    - `SharedMap` is the DDS we will use to sync the current dice roll.
    - `TaskManager` is the DDS that facilitates task distribution.

    ```ts
    import React from "react";
    import { TinyliciousClient } from "@fluidframework/tinylicious-client";
    import { ContainerSchema, IFluidContainer, ISharedMap, SharedMap } from "fluid-framework";
    import { ITaskManager, TaskManager } from "@fluid-experimental/task-manager";
    ```

### Move Fluid data to the view

1. The Fluid runtime will bring changes made to DDSes from any client to the current client. But Fluid is agnostic about the UI framework. You can use a helper method to get the Fluid data, from the `SharedMap` and `TaskManager` objects, into the view layer (the React state). Add the following code below the import statements. This method is called when the application loads the first time, and the value that is returned form it is assigned to a React state property.

    ```ts
    const getInitialObjects = async () => {
      // TODO 1: Configure the container.
      // TODO 2: Get the container from the Fluid service.
      // TODO 3: Return the Fluid SharedMap and TaskManager DDS objects.
    };
    ```

1. Replace `TODO 1` with the following code.

    ```ts
    const client = new TinyliciousClient();
    const containerSchema: ContainerSchema = {
      initialObjects: {
        sharedMap: SharedMap,
        taskManager: TaskManager,
      },
    };
    ```

1. Replace `TODO 2` with the following code. Note that `containerId` is being stored on the URL hash, and if there is no `containerId` a new container is created instead.

    ```ts
    let container: IFluidContainer;
    const containerId = window.location.hash.substring(1);
    if (!containerId) {
      ({ container } = await client.createContainer(containerSchema));
      const id = await container.attach();
      window.location.hash = id;
    } else {
      ({ container } = await client.getContainer(containerId, containerSchema));
    }
    ```

1. Replace `TODO 3` with the following code.

    ```ts
    return {
      sharedMap: container.initialObjects.sharedMap as ISharedMap,
      taskManager: container.initialObjects.taskManager as ITaskManager,
    };
    ```

### Get the Fluid data on application startup

Now that you have defined how to get our Fluid data, you need to tell React to call `getInitialObjects()` when the application starts up and then store the result in state. Add the following at the top of the `App()` function.

  ```ts
  // TODO 1: Setup const values
  // TODO 2: Setup state
  // TODO 3: Get Fluid data on app startup
  ```

1. Replace `TODO 1` with the following code. These values will be used when interacting with our DDSes.

    ```ts
    const diceKey = "dice-key";
    const diceRollTaskId = "diceRollTaskId";
    ```

2. Replace `TODO 2` with the following code. Note about this code:
   - These are the state variables that will be used by the React app.
   - Some of these values are only used in the debug information display. Feel free to remove any that are not applicable in your applicaiton.

    ```ts
    const [sharedMap, setSharedMap] = React.useState<ISharedMap>();
    const [taskManager, setTaskManager] = React.useState<ITaskManager>();
    const [diceValue, setDiceValue] = React.useState<number>();
    const [assigned, setAssigned] = React.useState<boolean>(false);
    const [queued, setQueued] = React.useState<boolean>(false);
    const [subscribed, setSubscribed] = React.useState<boolean>(false);
    ```

3. Finally, replace `TODO 3` with the following code. Note about this code:
    - Passing an empty dependency array as the last parameter of `useEffect` ensures that this function is called only once.
    - Since `setSharedMap` and `setTaskManager` are state-changing methods, it will cause the React `App` component to immediately rerender.

    ```ts
    React.useEffect(() => {
      getInitialObjects().then((initialObjects) => {
        setSharedMap(initialObjects.sharedMap);
        setTaskManager(initialObjects.taskManager);
      });
    }, []);
    ```

### Setup TaskManager logic

Now that you have your Fluid DDSses in the React state, you can begin writing the application logic. Under the previously added code, add the following. Note about this code:
  - The `sharedMap` and `taskManager` state objects are undefined only when the `App` component is rendering for the first time.
  - Passing `sharedMap` and `taskManager` in the second parameter of the `useEffect` hook ensures that the hook will not pointlessly run if the objects have not changed since the last time the `App` component rendered.

    ```ts
    React.useEffect(() => {
      if (sharedMap !== undefined && taskManager !== undefined) {
        // TODO 1: Setup state helper function
        // TODO 2: Register SharedMap handler
        // TODO 3: Setup dice roller helper function
        // TODO 4: Register TaskManager handlers
        // TODO 5: Subscribe to the task
        // TODO 6: Delete handler registrations when the React App component is dismounted.
      }
    }, [sharedMap, taskManager]);
    ```

  1. Replace `TODO 1` with the following code. This code will update the the state variables. This was consolidated into a single function for convenience.

      ```ts
      const updateState = () => {
        setDiceValue(sharedMap.get(diceKey) ?? 1);
        setAssigned(taskManager.assigned(diceRollTaskId));
        setQueued(taskManager.queued(diceRollTaskId));
        setSubscribed(taskManager.subscribed(diceRollTaskId));
      };
      ```

  1. Replace `TODO 2` with the following code. This code will update the the state variables when the `sharedMap` object is changed.

      ```ts
      sharedMap.on("valueChanged", updateState);
      ```

  1. Replace `TODO 3` with the following code. Note about this code:

       - `rollInterval` is used to store the interval timer that rolls the dice every 1.5 seconds (if the local client is assigned the task).
       - `rollDice` will update the `sharedMap` with a random number between 1 and 6 and logs the result. This will only be called by the assigned client.

      ```ts
      let rollInterval: ReturnType<typeof setInterval> | undefined;

      const rollDice = () => {
        const roll = Math.floor(Math.random() * 6) + 1;
        sharedMap.set(diceKey, roll);
        console.log(`New dice roll: ${roll}`);
      };
      ```

  1. Replace `TODO 4` with the following code. Note about this code:

      - This application takes the same action for both the `lost` and `completed` events. This may be the case in your application.
      - You should check the value of `taskId` in each handler to ensure you are responding to the correct task.

      ```ts
      const startRollingDice = (taskId: string) => {
        if (taskId !== diceRollTaskId) {
          return;
        }
        // Once we are assigned the task we can start rolling the dice.
        rollDice();
        rollInterval = setInterval(rollDice, 1500);

        updateState();
      };

      const stopRollingDice = (taskId: string) => {
        if (taskId !== diceRollTaskId) {
          return;
        }
        // If we lose the task assignment we should stop rolling the dice.
        clearInterval(rollInterval);
        rollInterval = undefined;

        updateState();
      };

      // Register TaskManager handlers
      taskManager.on("assigned", startRollingDice);
      taskManager.on("lost", stopRollingDice);
      taskManager.on("completed", stopRollingDice);
      ```

  2. Once all of the listeners are setup, you can finally subscribe to the task. To do so, replace `TODO 5` with the following code.

        ```ts
        taskManager.subscribeToTask(diceRollTaskId);
        ```


  1. It is a good practice to deregister event handlers when the React component dismounts, so replace `TODO 6` with the following code.

      ```ts
      return () => {
        sharedMap.off("valueChanged", updateState);
        taskManager.off("assigned", startRollingDice);
        taskManager.off("lost", stopRollingDice);
        if (rollInterval !== undefined) {
          clearInterval(rollInterval);
        }
      };
      ```

### Move the Fluid Data to the view

Finally, you can add the code to render the diceroller and debug information view. Follow the below steps and add the code at the bottom of the `App()` function.

  1. Add the following `if` statement. This code ensures the app will not try to render the view until our initial data is defined.

      ```ts
      if (!taskManager || !diceValue) return <div />;
      ```

  2. Next, add the following function definitions. They will be used to manually perform `TaskManager` operations. If you are not interested in the debug controls, you can skip this step.

      ```ts
      const abandon = () => taskManager.abandon(diceRollTaskId);
      const volunteer = () => taskManager.volunteerForTask(diceRollTaskId);
      const subscribe = () => taskManager.subscribeToTask(diceRollTaskId);
      const complete = () => taskManager.complete(diceRollTaskId);
      ```

  3. At the bottom of the `App()` function, add the following code. This code will render the dice roller and debug controls.

      ```ts
        return (
          <div>
            {/* TODO 1: Add dice roller view*/}
            {/* TODO 2: Add debug information and controls view*/}
          </div>
        );
      ```

  4. Replace `TODO 1` with the following code. This code will render the dice based on the value stored in the `diceValue` state variable. Additionally, it will render a message indicating if the local client is the assigned client.

        ```ts
        <div className="dice-roller">
          <div style={{ fontSize: 300, color: `hsl(${diceValue * 60}, 70%, 50%)` }}>
            {String.fromCodePoint(0x267f + diceValue)}
          </div>
          <div>
            {assigned
              ? "This Client is currently: Task Assignee"
              : "This Client is currently: Not Task Assignee"}
          </div>
        </div>
        ```

  5. Replace `TODO 2` with the following code. This code will render debug information about the task and provide controls to manually perform `TaskManager` actions. If you are not interested in the debug controls, you can skip this step.

        ```ts
        <div className="debug-info">
          <strong>Debug Info</strong>
          <div>Queued: {taskManager.queued(diceRollTaskId).toString()}</div>
          <div>Assigned: {taskManager.assigned(diceRollTaskId).toString()}</div>
          <div>Subscribed: {taskManager.subscribed(diceRollTaskId).toString()}</div>

          <div className="debug-controls">
            <button disabled={!queued} onClick={abandon} className="debug-controls button">
              Abandon
            </button>
            <button disabled={queued} onClick={volunteer} className="debug-controls button">
              Volunteer
            </button>
            <button
              disabled={queued && subscribed}
              onClick={subscribe}
              className="debug-controls button"
            >
              Subscribe
            </button>
            <button
              disabled={!assigned}
              onClick={complete}
              className="debug-controls button"
            >
              Complete
            </button>
          </div>
        </div>
        ```

## Start the Fluid server and run the application

1. In the Command Prompt, run the following command to start the Fluid service. Note that `tinylicious` is the name of the Fluid service that runs on localhost.

    ```dotnetcli
    npx tinylicious
    ```

    If tinylicious is not installed, you will be prompted to install it. When the Fluid service is running, you will see `info: Listening on port ...` in the Command Prompt.

1. Open a new Command Prompt and navigate to the root of the project; for example, `C:\My Fluid Projects\collaborative-text-area-tutorial`. Start the application server with the following command. The application opens in your browser.

    ```dotnetcli
    npm run start
    ```

    {{< callout note >}}

    If you receive a compilation error related to a "buffer" package, then you need to install an additional dependency to make this demo compatible with Webpack 5. Run `npm install -D buffer` and try again. This will be resolved in a future release of Fluid Framework.

    {{< /callout >}}

1. Paste the URL of the application into the address bar of another tab or even another browser to have more than one client open at a time. Edit the text on any client and see the text change and synchronize on all the clients.

## Next steps

- Consider using the [Fluent UI React controls](https://aka.ms/fluentui/) to give the application the look and feel of Microsoft 365. To install them in your project run the following in the command prompt: `npm install @fluentui/react`.
- For an example that will scale to larger applications and larger teams, check out the [React Starter Template in the FluidExamples repo](https://github.com/microsoft/FluidExamples/tree/main/react-starter-template).

{{< callout tip >}}

When you make changes to the code the project will automatically rebuild and the application server will reload. However, if you make changes to the container schema, they will only take effect if you close and restart the application server. Then run `npm run start` again.

{{< /callout >}}
