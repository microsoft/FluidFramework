# DataObjects and interfaces

In the previous section we introduced distributed data structures and demonstrated how to use them. Fluid provides a way
for us to combine those distributed data structures and our own code (business logic) into a modular, reusable
piece. This in turn enables us to modularize pieces of our application -- data included -- and re-use them or embed them
elsewhere.

## The @fluidframework/aqueduct package

![Aqueduct](https://publicdomainvectors.org/photos/johnny-automatic-Roman-aqueducts.png)

The Aqueduct is a library designed to provide a thin layer over the existing Fluid Framework interfaces that allows
developers to get started quickly with Fluid development.

You don't have to use the Aqueduct. It is an example of an abstraction layer built on top of the base Fluid Framework
with a focus on making Fluid development easier, and as such you can choose to use Fluid without it.

Having said that, if you're new to Fluid, we think you'll be more effective with it than without it.


## A note about Containers

::: tip

Coming soon

:::

## DataObject

```ts
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";

class MyDataObject extends DataObject implements IFluidHTMLView { }
```


[DataObject][] is a base class that contains a [SharedDirectory][] and task manager. It ensures that both are created
and ready for you to access within your component.

### The `root` SharedDirectory

DataObject has a `root` property that is a SharedDirectory. Typically you will create your distributed data structures
during the initialization of the DataObject, as described below.

### DataObject lifecycle

DataObject defines three _lifecycle methods_ that you can override to create and initialize distributed data
structures:

```ts
/**
 * Called the first time -- and *only* the first time -- the DataObject is initialized.
 */
protected async initializingFirstTime(): Promise<void> { }

/**
  * Called every time *except* the first time the DataObject is initialized.
  */
protected async initializingFromExisting(): Promise<void> { }

/**
  * Called every time the DataObject is initialized after create or when loaded from existing.
  */
protected async hasInitialized(): Promise<void> { }
```

#### initializingFirstTime

`initializingFirstTime` is called only once. It is executed only by the _first_ client to open the component and
all work will resolve before the component is presented to any user. You should overload this method to perform
component setup, which can include creating distributed data structures and populating them with initial data.
The `root` SharedDirectory can be used in this method.

The following is an example from the Badge DataObject.

```ts{5,10,19}
protected async initializingFirstTime() {
    // Create a cell to represent the Badge's current state
    const current = SharedCell.create(this.runtime);
    current.set(this.defaultOptions[0]);
    this.root.set(this.currentId, current.handle);

    // Create a map to represent the options for the Badge
    const options = SharedMap.create(this.runtime);
    this.defaultOptions.forEach((v) => options.set(v.key, v));
    this.root.set(this.optionsId, options.handle);

    // Create a sequence to store the badge's history
    const badgeHistory =
        SharedObjectSequence.create<IHistory<IBadgeType>>(this.runtime);
    badgeHistory.insert(0, [{
        value: current.get(),
        timestamp: new Date(),
    }]);
    this.root.set(this.historyId, badgeHistory.handle);
}
```

Notice that three distributed data structures are created and populated with initial data, then stored within the `root`
SharedDirectory.

::: tip See also

- [Creating and storing distributed data structures](./dds.md#creating-and-storing-distributed-data-structures)

:::

#### componentInitializingFromExisting

The `componentInitializingFromExisting` method is called each time the DataObject is loaded _except_ the first time it
is created. Note that you _do not_ need to overload this method in order to load data in your distributed data
structures. Data stored within DDSs is automatically loaded into the DDS during initialization; there is no separate
load step that needs to be accounted for.

In simple scenarios, you probably won't need to overload this method, since data is automatically loaded, and you'll use
`initializingFirstTime` to create your data model initially. However, as your data model changes, this method provides
an entrypoint for you to run upgrade or schema migration code as needed.

#### hasInitialized

The `hasInitialized` method is called _each time_ the DataObject is loaded. One common use of this method is to stash
local references to distributed data structures so that they're available for use in synchronous code. Recall that
retrieving a value from a DDS is _always_ an asynchronous operation, so they can only be retrieved in an async function.
`hasInitialized` serves that purpose in the example below.

```ts
protected async hasInitialized() {
  this.currentCell = await this.root.get<IFluidHandle<SharedCell>>("myCell").get();
}
```

Now any synchronous code can access the SharedCell using `this.currentCell`.


## DataObjectFactory

DataObjects, like distributed data structures, are created asynchronously using a factory pattern. Therefore you must
export a factory class for a DataObject, as the following code illustrates:

```ts
export const BadgeInstantiationFactory = new DataObjectFactory(
    BadgeName, // string
    Badge,
    [
        SharedMap.getFactory(),
        SharedCell.getFactory(),
        SharedObjectSequence.getFactory(),
    ],
    {},
);
```

The first argument is the string name of the DataObject

## Learn more

The Aqueduct contains much more than just DataObject. To dive deeper into the details, see the [Aqueduct package
README](https://github.com/microsoft/FluidFramework/blob/master/packages/framework/aqueduct/README.md)

---

A Fluid component is at its core a JavaScript object. Or, stated differently, any JavaScript object _could_ be a Fluid
component. What makes that object "Fluid" is the interfaces that it exposes through the Fluid component model's feature
detection mechanism.

Wow, that was a mouthful! What it means is that Fluid components are just JavaScript objects that implement specific
interfaces. The Fluid Framework defines an interface, IComponent, which is then augmented using [TypeScript's interface
merging capabilities](https://www.typescriptlang.org/docs/handbook/declaration-merging.html#merging-interfaces). The
specifics of how these interfaces are declared is not relevant until you want to define your own interfaces. We'll cover
that in a later section.

One of the primary design principles in the Fluid component design is to support delegation and feature detection
patterns. **Feature detection** is a technique to dynamically determine the capabilities of another component, while
**delegation** means that the implementation of an interface can be delegated to another object.

Using these features within the Fluid Framework itself we define several interfaces, such as `IComponentLoadable`, and
use the feature detection mechanism to find JavaScript objects that implement that interface. These patterns are
described in more detail below.

## Feature detection and delegation

The Fluid component model supports a delegation and feature detection mechanism. As is typical in JavaScript, a feature
detection pattern can be used to determine what capabilities are exposed by a component. The `IComponent` interface
serves as a Fluid-specific form of TypeScript's `any` that developers can cast objects to in order to probe for
implemented component interfaces.

For example, if you need to determine the capabilities that a component exposes, you first cast the object as an
`IComponent`, and then access the property on the `IComponent` that matches the interface you are testing for. For
example:

```typescript
let component = anyObject as IComponent;
// We call bar on the component if it supports it.
const isFooBar = component.IComponentFooBar;
if (isFooBar) {
    await component.bar();
}
```

In the example above, the code is checking to see if the component supports `IComponentFooBar`. If it does, an object will
be returned and `bar()` will be called on it. If the component does not support `IComponentFooBar`, then it will return
`undefined`.

In addition to the feature detection mechanism, Fluid also supports a delegation pattern. Rather than implementing
`IComponent*` interfaces itself, a component may instead delegate that responsibility by implementing
`IProvideComponent*` interfaces. This requires the component to implement a property that returns the appropriate
`IComponent*` interface.

For example, consider the `IProvideComponentLoadable` interface:

```typescript
export interface IProvideComponentLoadable {
    readonly IComponentLoadable: IComponentLoadable;
}
/**
 * A shared component has a URL from which it can be referenced
 */
export interface IComponentLoadable extends IProvideComponentLoadable {
    // Absolute URL to the component within the document
    readonly url: string;

    // Handle to the loadable component
    handle: IComponentHandle;
}
```

Notice that there is an inheritance relationship between the `IProvideComponentLoadable` and `IComponentLoadable`
interfaces. When implementing only the `IProvideComponentLoadable` interface, the component still must be able to return
an `IComponentLoadable` object, but it does not need to implement that interface itself and can instead delegate to a
different object.

## Fluid component interfaces

On top of this simple `IComponent`-based model, Fluid defines a few interfaces, like `IComponentLoadable`, for use
within the framework. But the full power of the model comes as we explore conventions around advanced scenarios like
cross-component communication, shared commanding UX, copy/paste, etc.

::: danger TODO

We are experimenting with a variety of additional interfaces for specific purposes; see the [need link] for more info.

:::

These interfaces will be optional in many contexts but could be required by certain applications. For example, an
application may refuse to load components that don't implement certain interfaces. This could include supporting
capabilities such as search, cursoring, clipboard support, and much more.


!!!include(links.md)!!!
