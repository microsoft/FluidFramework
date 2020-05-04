---
title: Badge
sidebarDepth: 2
---

# Badge component

Badge is a Fluid component that allows users to create an in-line badge within a document to represent the status
of the overall document or a section of it.

<style>
  iframe#badge {
    height: 250px;
    width: 800px;
  }
</style>

<iframe id="badge" src="/fluid/badge.html"></iframe>

## Features

### Custom status

Badge includes four preset statuses: Drafting, Reviewing, Complete, and Archived.

You can also set a custom status with any text or color.

![Color picker and custom status UI](./badge-color-picker.png)

### History

The history of the Badge is also shown on hover, so users can see how the status has evolved over time.

![Status history UI](./badge-history.png)

## Set up your dev environment

If you haven't already, [set up your Fluid Framework development
environment](../guide/README.md#set-up-your-development-environment).

### Clone the tutorial repository

<vue-markdown v-if="$themeConfig.DOCS_AUDIENCE === 'internal'">

First, clone the Badge repository here: <https://github.com/microsoft/fluid-tutorial-badge>.

</vue-markdown>
<vue-markdown v-else>

First, clone the Badge repository here:
<https://dev.azure.com/FluidDeveloperProgram/Developer%20Preview/_git/fluid-badge>.

</vue-markdown>

Since the Git repository is authenticated, it is easiest to visit the link above and click the "Clone" button in the
top-right corner of the UI. Follow the resulting instructions to clone the repo.

Once you've cloned the repo, you'll need to set up access to the [private Fluid npm feed](../guide/package-feed.md). On
Windows, you can run the `npm run auth` command to automate this process.

Now that you have access to the private feed, run `npm install` in the root of the repository to install dependencies.

Finally, you can open the folder in Visual Studio Code.

## Run the sample

After you've cloned the sample repo and installed dependencies using `npm install`, you can then use `npm start` to start
a local dev environment for testing and debugging. Visit <http://localhost:8080/> in a browser to load the Fluid
development server, which will load two instances of the component side by side.

!!!include(browsers.md)!!!

## Deep dive

Badge has two primary pieces: a React component, and a PrimedComponent. We'll discuss the PrimedComponent piece first.

### PrimedComponent

PrimedComponent is a base class "primed" with a `root` SharedDirectory property. PrimedComponent ensures that this SharedDirectory
is initialized and available to the developer at initialization time. We can then store other distributed data
structures' handles in the SharedDirectory to create our distributed data model.

#### Distributed data structures

Badge uses the following distributed data structures to support the features described above:

**SharedMap**

:   Stores the status options for the Badge.

    By storing this data in a SharedMap, we can easily support custom statuses. When users add new options, they're stored
    in the SharedMap and are thus available to all clients.

**SharedCell**

:   Stores the Badge's current status.

    A SharedCell enables us to store an object within it and then listen for changes to that object. As the current status is
    changed, the SharedCell triggers an event notifying listeners that the data has changed.

**SharedObjectSequence**

:   Stores the history of status changes.


PrimedComponent also provides _lifecycle methods_ that we can override in our subclass. This is where we can initialize
our data model.

##### Option A

<mermaid>
stateDiagram
  state "IComponentFactory.instantiateComponent()" as Start
  state "Does component exist?" as AskExist
  <!-- state "Uninitialized" as Uninitialized -->
  [*] --> Start
  Start --> AskExist
  AskExist --> Exists : Yes
  Exists --> Initialized : componentInitializingFromExisting()
  AskExist --> Uninitialized : No
  Uninitialized --> Initializing : componentInitializingFirstTime()
  Initializing --> Initialized
  Initialized --> [*] : componentHasInitialized()
</mermaid>

##### Option B

<mermaid>
stateDiagram
  state "IComponentFactory.instantiateComponent()" as Start
  <!-- state "Exists" as Exists -->
  <!-- state "Uninitialized" as Uninitialized -->
  [*] --> Start
  Start --> Exists
  Exists --> Uninitialized : componentInitializingFromExisting()
  Start --> Uninitialized : componentInitializingFirstTime()
  Uninitialized --> Initialized
  Initialized --> [*] : componentHasInitialized()
</mermaid>

::: important
All lifecycle methods are `async`.
:::

`componentInitializingFirstTime()` is called _exactly once_ during the life of a component. Thus, you can override it to
create distributed data structures and store them within the `root` SharedDirectory.

```typescript
export class Badge extends PrimedComponent
  implements IComponentHTMLView, IComponentReactViewable {
  currentCell: SharedCell;
  optionsMap: SharedMap;
  historySequence: SharedObjectSequence<IHistory<IBadgeType>>;

  // ...

  protected async componentInitializingFirstTime() {
    // Create a cell to represent the Badge's current state
    const current = SharedCell.create(this.runtime);
    current.set(this.defaultOptions[0]);
    this.root.set(this.currentId, current.handle);

    // Create a map to represent the options for the Badge
    const options = SharedMap.create(this.runtime);
    this.defaultOptions.forEach((v) => options.set(v.key, v));
    this.root.set(this.optionsId, options.handle);

    // Create a sequence to store the badge's history
    const history = SharedObjectSequence.create<IHistory<IBadgeType>>(this.runtime);
    history.insert(0, [{
      value: current.get(),
      timestamp: new Date(),
    }]);
    this.root.set(this.historyId, history.handle);
  }
}
```

In the `componentInitializingFirstTime` method we're creating the data model. Each DDS is created using the `create()`
method, populated with default data, then stored within the `root` SharedDirectory. Note that we do not store the DDS
itself; instead, we store the *handle* to the DDS. We'll talk about handles in more detail a little later.

Until a DDS is stored within another DDS (via its handle), the data within it is not distributed to other clients. In a
sense, the DDS is "offline" in this case. This means that you can safely populate distributed data structures with
default data without concerning yourself with concurrency until you call `this.root.set`.

Once the component has initialized, the `componentHasInitialized` method will be called. It will be called every time
the component loads, even if it already exists.

```typescript
protected async componentHasInitialized() {
  this.currentCell = await this.root.get<IComponentHandle<SharedCell>>(this.currentId).get();
  this.optionsMap = await this.root.get<IComponentHandle<SharedMap>>(this.optionsId).get();
  this.historySequence = await this.root.get<IComponentHandle<SharedObjectSequence<IHistory<IBadgeType>>>>(this.historyId).get();
}
```
