# DataObjects and interfaces

In the previous section we introduced distributed data structures and demonstrated how to use them. Now let's discuss
how to leverage those distributed data structures from our own code (business logic) to create modular, reusable
pieces. These pieces fall into the category of the `fluid objects` discussed in the last section,
along with DDSs themselves.

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

## Feature Detection via IFluidObject

In the course of writing code to manipulate DDSes and interact with other `fluid objects`, you will find yourself dealing
with Javascript objects you know almost nothing about. To interact with such an object, you'll use Fluid's
feature detection mechanism, which centers around a special type called `IFluidObject`.

In order to detect features supported by an unknown object, you cast it `IFluidObject` and then query it for a specific
interface that it may support. The interfaces exposed via `IFluidObject` include many core Fluid interfaces,
such as `IFluidHandle` or `IFluidLoadable`, and this list can be augmented using
[TypeScript's interface merging capabilities](https://www.typescriptlang.org/docs/handbook/declaration-merging.html#merging-interfaces).
This enables any Fluid code to "register" an interface as queryable from other Fluid code that imports it.
The specifics of how these interfaces are declared is not relevant until you want to define your own interfaces,
which we'll cover in a later section.

Let's look at an example of feature detection using `IFluidObject`:

```typescript
let fluidObject = anyObject as IFluidObject;
// Query the object to see if it supports IFluidFoo
const foo = fluidObject.IFluidFoo; // foo: IFluidFoo | undefined
if (foo !== undefined) {
    // foo: IFluidFoo
    // It does! Now we have an IFluidFoo and can safely call member function bar()
    await foo.bar();
}
```

The magic is in the `fluidObject.IFluidFoo` expression. You may think of that `.` almost like a cast operator
that returns `undefined` if the cast fails - similar to the C# snippet `fluidObject as IFluidFoo`
(_Note: `as` DOES NOT work that way in TypeScript!_).

## Delegation and the IProvide pattern

Let's dig a little deeper into how `IFluidObject` works to see how it also satisfies our design principal around delegation.
Remember when we said that `fluidObject.IFluidFoo` is almost like a cast? Well, the emphasis is now on the word _almost_.
In fact, `fluidObject` itself need not implement `IFluidFoo`. Rather, it must _provide_ an implementation of `IFluidFoo`.
This is where delegation comes in - `fluidObject.IFluidFoo` may return `fluidObject` itself under the covers,
or it may delegate by returning another object implementing that interface.

If you search through the FluidFramework codebase, you'll start to notice that many interfaces come in pairs, such as
`IFluidLoadable` and `IProvideFluidLoadable`. Let's take a look at `IProvideFluidLoadable`:

```typescript
export interface IProvideFluidLoadable {
    readonly IFluidLoadable: IFluidLoadable;
}
```

If you have an `IProvideFluidLoadable`, you may call `.IFluidLoadable` on it to get an `IFluidLoadable`.
Looks familiar, right? Remember `fluidObject.IFluidFoo` in the example above? Well it turns out that `IFluidObject`
is simply a special combination of `IProvide` interfaces.

As mentioned above, the implementation of `.IFluidLoadable` may actually return the object itself.
In fact this is quite common, and is facilitated by a convention where `IFluidFoo extends IProvideFluidFoo`.
Returning to our `IFluidLoadable` example:

```typescript
export interface IFluidLoadable extends IProvideFluidLoadable {
    ...
}
```

Let's look at an example that shows how a class may implement the `IProvide` interfaces
two different ways:

```typescript
export abstract class PureDataObject<...>
    extends ...
    implements IFluidLoadable, IFluidRouter, IProvideFluidHandle
{
    ...
    private readonly innerHandle: IFluidHandle<this>;
    ...
    public get IFluidLoadable() { return this; }
    public get IFluidHandle() { return this.innerHandle; }
```

`PureDataObject` implements `IProvideFluidLoadable` via `IFluidLoadable`, and thus simply returns `this` in that case.
But for `IProvideFluidHandle`, it delegates to a private member. It's not the concern of the caller which strategy
is in play - it simply asks for `fluidObject.IFluidLoadable` or `fluidObject.IFluidHandle` and continues on its merry way.


!!!include(links.md)!!!
