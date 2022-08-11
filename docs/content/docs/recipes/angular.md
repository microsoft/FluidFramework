---
title: Using Fluid with Angular
menuPosition: 2
author: scottn12
aliases:
  - "/start/angular-tutorial/"
---

In this tutorial, you'll learn about using the Fluid Framework by building a simple application that enables every client of the application to change a dynamic time stamp on itself and all other clients almost instantly. You'll also learn how to connect the Fluid data layer with a view layer made in [Angular](https://angular.io).

To jump ahead into the finished demo, check out the [Angular demo in our FluidExamples repo](https://github.com/microsoft/FluidExamples/tree/main/angular-demo).

The following image shows the time stamp application open in four browsers. Each has a button labeled **Get Time** and beside it a Unix epoch time. The same time is in all four. The cursor is on the button in one browser.

![Four browsers with the Timestamp app open in them.](https://fluidframework.blob.core.windows.net/static/images/angular-demo-1.png)

The following image shows the same four clients one second after the **Get Time** button was pressed. Note that the timestamp has updated to the very same time in all four browsers.

![Four browsers with the Timestamp app open in them one second after the button has been pushed.](https://fluidframework.blob.core.windows.net/static/images/angular-demo-2.png)

{{< callout note >}}

This tutorial assumes that you are familiar with the [Fluid Framework Overview]({{< relref "/docs/_index.md" >}}) and that you have completed the [QuickStart]({{< relref "quick-start.md" >}}). You should also be familiar with the basics of [Angular](https://angular.io), [creating Angular projects](https://angular.io/guide/setup-local), and [Angular Hooks](https://angular.io/guide/lifecycle-hooks).

{{< /callout >}}


## Prerequisites

1. Node.js must be installed on your local machine. To install, follow the instructions [here](https://nodejs.org/en/download/).
1. Angular CLI must be installed on your local machine. To install, run the following command (after Node.js is installed).

    ```dotnetcli
    npm install -g @angular/cli
    ```

## Create the project

1. Open a Command Prompt and navigate to the parent folder where you want to create the project; e.g., `c:\My Fluid Projects`.
1. Run the following command at the prompt.

    ```dotnetcli
    ng new fluid-angular-tutorial
    ```

1. The project is created in a subfolder named `fluid-angular-tutorial`. Navigate to it with the command `cd fluid-angular-tutorial`.
1. The project uses two Fluid libraries:

    |Library |Description |
    |---|---|
    | `fluid-framework` |Contains the SharedMap [distributed data structure]({{< relref "dds.md" >}}) that synchronizes data across clients. *This object will hold the most recent timestamp update made by any client.*|
    | `@fluidframework/tinylicious-client` |Defines the connection to a Fluid service server and defines the starting schema for the [Fluid container][].|
    {.table}

    Run the following command to install the libraries.

    ```dotnetcli
    npm install @fluidframework/tinylicious-client fluid-framework
    ```

## Code the project

1. Open the file `\src\app\app.component.ts` in your code editor. Delete all the default `import` statements. Then delete the line declaring the `title` property. The file should look like the following:

    ```js
    @Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css']
    })
    export class AppComponent {
    }
    ```

1. Add the following `import` statements at the beginning of the file:

    ```js
    import { Component, OnInit, OnDestroy } from '@angular/core';
    import { SharedMap } from 'fluid-framework';
    import { TinyliciousClient } from '@fluidframework/tinylicious-client';
    ```

1. Define the following component properties inside of the `AppComponent` class. These will be used later. Note about this code:
    - `localTimestamp` has the `{ time: string | undefined }` type. This is represented as the `TimestampDataModel` interface in the completed demo in our repo.

    ```js
    sharedTimestamp: SharedMap | undefined;
    localTimestamp: TimestampDataModel | undefined;
    updateLocalTimestamp: (() => void) | undefined;
    ```

1. Ensure the `AppComponent` class implements the `OnInit` and `OnDestroy` classes. Then define the `ngOnInit` and `ngOnDestroy` functions. Your `AppComponent` class should now look like this:

    ```js
    export class AppComponent implements OnInit, OnDestroy {

      sharedTimestamp: SharedMap | undefined;
      localTimestamp: TimestampDataModel | undefined;
      updateLocalTimestamp: (() => void) | undefined;

      async ngOnInit() {
      }

      ngOnDestroy() {
      }
    }
    ```

    Note: `ngOnInit` has been declared as an asynchronous function.

### Get the Fluid Data

1. The Fluid runtime will bring changes made to the timestamp from any client to the current client. But Fluid is agnostic about the UI framework. You can use a helper function to get the Fluid data, from the SharedMap object, into the component layer. Add the following code inside the `AppComponent` class. This function will be called when the application loads the first time, and the value it returns is assigned to the `sharedTimestamp` component level property.

    ```js
    async getFluidData() {

      // TODO 1: Configure the container.
      // TODO 2: Get the container from the Fluid service.
      // TODO 3: Return the Fluid timestamp object.
    }
    ```

1. Replace `TODO 1` with the following code. Note that there is only one object in the container: a SharedMap holding the timestamp. Note also that `sharedTimestamp` is the ID of the `SharedMap` object and it must be unique within the container.

    ```js
    const client = new TinyliciousClient();
    const containerSchema = {
      initialObjects: { sharedTimestamp: SharedMap }
    };
    ```

1. Replace `TODO 2` with the following code. Note that `containerId` is being stored on the URL hash, and if there is no `containerId` we create a new container instead.

    ```js
    let container;
    const containerId = location.hash.substring(1);
    if (!containerId) {
      ({ container } = await client.createContainer(containerSchema));
      const id = await container.attach();
      location.hash = id;
    }
    else {
      ({ container } = await client.getContainer(containerId, containerSchema));
    }
    ```

1. Replace `TODO 3` with the following code.

    ```js
    return container.initialObjects.sharedTimestamp as SharedMap;
    ```

### Keep the Fluid data synchronized

To ensure that both local and remote changes to the timestamp are reflected in the UI, we will use the `localTimestamp` component property to store the local timestamp value and ensure that it is updated whenever any client changes the `fluidSharedObjects` value.

1. Below the preceding `getFluidData` function add the following code.

    ```js
    syncData() {
      // Only sync if the Fluid SharedMap object is defined.
      if (this.sharedTimestamp) {
        // TODO 4: Set the value of the localTimestamp object that will appear in the UI.

        // TODO 5: Register handlers.
      }
    }
    ```

1. Replace `TODO 4` with the following code. Note about this code:

    - `this.sharedTimestamp` is an instance of a `SharedMap` which exposes the ability to set/get from the API. The `updateLocalTimestamp` function is setting the `localTimestamp` property to the value of the key `"time"` on the `sharedTimestamp`. (The "time"key is created in a later step. It will have been set by the time this code runs the first time.)
    - `updateLocalTimestamp` is called immediately to ensure that `localTimestamp` is initialized with the current shared timestamp value.

    ```js
    this.updateLocalTimestamp = () => { this.localTimestamp = { time: this.sharedTimestamp!.get("time") } };
    this.updateLocalTimestamp();
    ```

1. To ensure that the `localTimestamp` state is updated whenever the `sharedTimestamp` is changed *even by other clients*, replace `TODO 5` with the following code. Note that because `updateLocalTimestamp` calls the state-setting function `setTimestamp`, a rerender is triggered whenever any client changes the Fluid `sharedTimestamp`.

    ```js
    this.sharedTimestamp!.on('valueChanged', this.updateLocalTimestamp!);
    ```

1. It is a good practice to deregister event handlers when the Angular component dismounts, so add the following code to the `ngOnDestroy` function we previously defined.

    ```js
    // Delete handler registration when the Angular App component is dismounted.
    this.sharedTimestamp!.off('valueChanged', this.updateLocalTimestamp!);
    ```

    Now that we've defined how to get and synchronize our Fluid data, we need to tell Angular to call `getFluidData` and `syncData` when the application starts up and then store the result in component properties. So add the following code to the `ngOnInit` function we defined previously.

    ```js
    this.sharedTimestamp = await this.getFluidData();
    this.syncData();
    ```

1. In order to update the Fluid Data across all clients, we need to define an additional function in the `AppComponent`. This function will be called to update the time of the `sharedTimestamp` object whenever a user clicks the "Get Time" button in the UI. Add the following code under the perviously defined `syncData` function. Note about this code:

    - The `sharedTimestamp.set` function sets the `sharedTimestamp` object's "time" *key's* *value* to the current UNIX epoch time. This triggers the `valueChanged` event on the object, so the `updateLocalTimestamp` function runs and sets the `localTimestamp` state to the same object; for example, `{time: "1615996266675"}`.
    - All other clients update too because the Fluid server propagates the change to the `sharedTimestamp` on all of them and this `valueChanged` event updates the `localTimestamp` state on all of them.

    ```js
    onButtonClick() {
      this.sharedTimestamp?.set('time', Date.now().toString());
    }
    ```

### Create the UI

1. Open the file `\src\app\app.component.html` in your code editor. Delete all the default code in the file and replace it with the following. Note about this code:

    - If the `localTimestamp` state has not been initialized, a blank screen is rendered.

    ```html
    <div class="app" *ngIf="localTimestamp">
      <button (click)="onButtonClick()">
        Get Time
      </button>
      <span>{{ localTimestamp.time }}</span>
    </div>
    ```

## Start the Fluid server and run the application

In the Command Prompt, run the following command to start the Fluid service. Note that `tinylicious` is the name of the Fluid service that runs on localhost.

```dotnetcli
npx tinylicious
```

Open a new Command Prompt and navigate to the root of the project; for example, `C:/My Fluid Projects/fluid-angular-tutorial`. Start the application server with the following command. The application opens in your browser. This may take a few minutes.

```dotnetcli
npm run start
```

Paste the URL of the application into the address bar of another tab or even another browser to have more than one client open at a time. Press the **Get Time** button on any client and see the value change and synchronize on all the clients.

{{< callout note >}}

You may need to install an additional dependency to make this demo compatible with Webpack 5. If you receive a compilation error related to a "buffer" package, please run `npm install -D buffer` and try again. This will be resolved in a future release of Fluid Framework.

{{< /callout >}}

## Next steps

- You can find the completed code for this example in our Fluid Examples GitHub repository [here](https://github.com/microsoft/FluidExamples/tree/main/angular-demo).
- Try extending the demo with more key/value pairs and a more complex UI.
- Try changing the container schema to use a different shared data object type or specify multiple objects in `initialObjects`.

{{< callout tip >}}

When you make changes to the code the project will automatically rebuild and the application server will reload. However, if you make changes to the container schema, they will only take effect if you close and restart the application server. To do this, give focus to the Command Prompt and press Ctrl-C twice. Then run `npm run start` again.

{{< /callout >}}

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers.md" >}}

<!-- Classes and interfaces -->

[FluidContainer]: {{< relref "fluidcontainer.md" >}}
[IFluidContainer]: {{< relref "ifluidcontainer.md" >}}
[SharedCounter]: {{< relref "/docs/data-structures/counter.md" >}}
[SharedMap]: {{< relref "/docs/data-structures/map.md" >}}
[SharedSequence]: {{< relref "sequences.md" >}}
[SharedString]: {{< relref "string.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
