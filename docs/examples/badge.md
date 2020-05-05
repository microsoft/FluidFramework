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

Badge has two primary pieces: a React component, and a [PrimedComponent][]. We'll discuss the PrimedComponent piece first.

### PrimedComponent

[PrimedComponent][] is a base class "primed" with a `root` [SharedDirectory][] property. PrimedComponent ensures that
this SharedDirectory is initialized and available to the developer at initialization time. We can then store other
distributed data structures' handles in the SharedDirectory to create our distributed data model.

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


#### Lifecycle methods

PrimedComponent also provides _lifecycle methods_ that we can override in our subclass. This is where we can initialize
our data model. There are three lifecycle methods that can be overridden:

1. `componentInitializingFirstTime` -- Called exactly once during the life of a component; useful to initialize distributed
   data structures.
1. `componentInitializingFromExisting` -- Called each time the component is initialized *except* the first time.
1. `componentHasInitialized` -- Called each time the component is initialized, after either
   `componentInitializingFirstTime` or `componentInitializingFromExisting` are called.



::: important
All lifecycle methods are `async`.
:::

<mermaid>
stateDiagram
  state "IComponentFactory.instantiateComponent()" as Constructor
  state "Does component exist?" as Exists
  state "componentHasInitialized()" as Initialized
  state "componentInitializingFirstTime()" as FirstTime
  state "componentInitializingFromExisting()" as FromExisting
  [*] --> Constructor
  Constructor --> Exists
  Exists --> FirstTime : No
  Exists --> FromExisting : Yes
  FirstTime --> Initialized
  FromExisting --> Initialized
  Initialized --> [*]
</mermaid>

`componentInitializingFirstTime()` is called _exactly once_ during the life of a component. Thus, you can override it to
create distributed data structures and store them within the `root` SharedDirectory.

```typescript{9-27}
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

Once the component has initialized, the `componentHasInitialized` method will be called. It will be called _every time
the component loads_, even if it already exists and contains data. This is where you can handle any common logic that
should be run on every component load.

In Badge, we use the `componentHasInitialized` method to store local references to the distributed data structures so
they're accessible from synchronous code.

```typescript
protected async componentHasInitialized() {
  this.currentCell =
    await this.root.get<IComponentHandle<SharedCell>>(this.currentId).get();
  this.optionsMap =
    await this.root.get<IComponentHandle<SharedMap>>(this.optionsId).get();
  this.historySequence =
    await this.root.get<IComponentHandle<SharedObjectSequence<IHistory<IBadgeType>>>>(this.historyId).get();
}
```

The third lifecycle method, `componentInitializingFromExisting`, is the opposite of the `componentInitializingFirstTime`
method. It is called _each time the component is loaded *except* the first time_. Badge doesn't override this method.

##### A note about component handles

You probably noticed some confusing code above. What are handles? Why do we store the SharedMap's _handle_ in the `root`
SharedDirectory instead of the SharedMap itself? The underlying reasons are beyond the scope of this example, but the
important thing to remember is this:

**When you store a distributed data structure within another distributed data structure, you store the _handle_ to the
DDS, not the DDS itself. Similarly, when loading a DDS that is stored within another DDS, you must first get the DDS
handle, then get the full DDS from the handle.**

### React component

In order to render the Badge, we use a React component called `BadgeView`. It's a standard class-based React component
that is "Fluid-aware." That is, `BadgeView` expects to be passed Fluid distributed data structures as props that it will
use directly. This design is simple and makes it easier to see how Fluid works, but is not typical React code. For a
more typical design see [React context and Fluid]().

```typescript{7,8}
export interface IBadgeViewProps {
  currentCell: ISharedCell;
  optionsMap: ISharedMap;
  historySequence: SharedObjectSequence<IHistory<IBadgeType>>;
}

export class BadgeView
  extends React.Component<IBadgeViewProps, IBadgeViewState>
```

As described earlier, the data model is composed of three distributed data structures, so all three are passed as props.

#### Handling events from distributed data structures

Distributed data structures can be changed by both local code and remote clients. In the `componentDidMount` method, we
also register a function to be called each time the current selected cell changes, or when any of the options -- the
items in the [SharedMap][] -- are changed. When that happens, we update the internal state of the component and React
re-renders the visual component as needed.

```typescript
public async componentDidMount(): Promise<void> {
  this.props.currentCell.on("valueChanged", () => {
    this.setState({ current: this.props.currentCell.get() });
  });

  this.props.optionsMap.on("valueChanged", () => {
    this.setState({ items: this._getItemsFromOptionsMap(this.props.optionsMap) });
  });
}
```

#### Updating distributed data structures

In the previous step we showed how to use event listeners with distributed data structures to respond to remote data
changes. But how do we update the data based on _user_ input? To do that, we need to listen to some DOM events as users
interact with the component. Since the `BadgeView` class handles the rendering, that's where the DOM events will be
handled.

For example, consider the custom status UI:

![Color picker and custom status UI](./badge-color-picker.png)

When a user adds a new status and saves it, the `_onSave` method is called within the React component:

```typescript{15,16}
private _onSave(): void {
  if (this.state.customText !== "") {
    const newItem: IBadgeType = {
      key: this.state.customText,
      text: this.state.customText,
      iconProps: {
        iconName: "Contact",
        style: {
          color: this.state.customColor.str,
        },
      },
    };

    // Add to the badge options
    this.props.optionsMap.set(this.state.customText, newItem);
    this._setCurrent(newItem);
    this.setState({ customText: "" });
  }

  this._closeDialog();
}

// ...

private _setCurrent(newItem: IBadgeType): void {
  if (newItem.key !== this.state.current.key) {
    // Save current value into history
    this.props.historySequence.insert(
      this.props.historySequence.getItemCount(), // insert at end
      [
        {
          value: newItem,
          timestamp: new Date(),
        },
      ],
    );

    // Set new value
    this.props.currentCell.set(newItem);
  }
}
```

This method creates the new status from the data entered by the user, then, in line 15, that new status is stored within
the [SharedMap][] that was passed in as a prop. The `_setCurrent` method is also called, which saves the currently selected
status into the history [SharedObjectSequence][] and updates the [SharedCell][] to contain the newly created status.

Because of the event handlers we registered in the `componentDidMount` method, as the Fluid distributed data structures
are changed, either by local code or remote clients, the event handlers will be called and the internal component state
(that is, the React component's local state) will update, which will in turn cause React to re-render the UI as needed
to reflect the new state.


```ts
export interface IBadgeViewState {
  isDialogVisible: boolean;
  customText: string;
  customColor: IColor;
  current: IBadgeType;
  items: any;
}
```

<!-- Links -->

[IComponentHTMLView]: ../api/fluid-component-core-interfaces.icomponenthtmlview.md
[IComponentReactViewable]: ../api/fluid-aqueduct-react.icomponentreactviewable.md
[IProvideComponentHTMLView]: ../api/fluid-component-core-interfaces.iprovidecomponenthtmlview.md
[PrimedComponent]: ../api/fluid-aqueduct.primedcomponent.md
[SharedDirectory]: ../api/fluid-map.shareddirectory.md
[SharedMap]: ../api/fluid-map.sharedmap.md
[undo-redo]: ../api/fluid-undo-redo.md
