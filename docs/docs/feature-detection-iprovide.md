## Feature detection via IFluidObject

In the previous section we introduced the DataObject, a convenient way to combine distributed data structures and our own
code (business logic) into a modular, reusable piece. This in turn enables us to modularize pieces of our application –-
data included.

Fluid can be a very dynamic system. In the course of writing code to manipulate DDSes and interact with other Fluid
objects, you will find yourself dealing with JavaScript objects you know almost nothing about. To interact with such an
object, you can use Fluid's feature detection mechanism, which centers around a special interface called `IFluidObject`.
Feature detection is a technique to dynamically determine the capabilities of another Fluid object.

In order to detect features supported by an unknown object, you cast it to an `IFluidObject` and then query the object
for a specific interface that it may support. The interfaces exposed via `IFluidObject` include many core Fluid
interfaces, such as IFluidHandle or IFluidLoadable, and this list can be augmented using [TypeScript's interface merging
capabilities](https://www.typescriptlang.org/docs/handbook/declaration-merging.html#merging-interfaces). This enables
any Fluid code to register an interface as queryable from other Fluid code that imports it. The specifics of how these
interfaces are declared is not relevant until you want to define your own interfaces, which we'll cover in a later
section.

The following is an example of feature detection using `IFluidObject`:

```typescript
const anUnknownObject = anyObject as IFluidObject;

// Query the object to see if it supports IFluidLoadable
const loadable = fluidObject.IFluidLoadable; // loadable: IFluidLoadable | undefined

if (loadable) { // or if (loadable !== undefined)
    // It does! Now we know definitively that loadable's type is IFluidLoadable and we can safely call a method
    await loadable.method();
}
```

Note the `fluidObject.IFluidLoadable` expression and the types of the objects. If the object supports IFluidLoadable,
then an IFluidLoadable will be returned; otherwise, it will return `undefined`.


## Delegation and the _IProvide_ pattern

In the example above, `fluidObject.IFluidLoadable` is a _property_ that is of type IFluidLoadable. `fluidObject` itself
need not implement IFluidLoadable. Rather, it must _provide_ an implementation of IFluidLoadable. We call this
_delegation_ -- `fluidObject.IFluidLoadable` may return `fluidObject` itself in its implementation, or it may delegate by
returning another object that implements IFluidLoadable.

If you search through the Fluid Framework code, you'll notice that many interfaces come in pairs, such as
`IFluidLoadable` and `IProvideFluidLoadable`. `IProvideFluidLoadable` is defined as follows:

```typescript
export interface IProvideFluidLoadable {
  readonly IFluidLoadable: IFluidLoadable;
}
```

We call this the _IProvide pattern_. This interface definition means that if we have an `IProvideFluidLoadable`, we may
call `.IFluidLoadable` on it and get an `IFluidLoadable` back -- which is what we did in the code sample above.

As mentioned earlier, an object that implements IFluidLoadable may choose to return itself. This is quite common in
practice and is facilitated by the following convention: `IFluidFoo extends IProvideFluidFoo`.

Returning to our `IFluidLoadable` example:

```typescript
export interface IFluidLoadable extends IProvideFluidLoadable {
    ...
}
```

The following example shows how a class may implement the IProvide* interfaces two different ways:

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
But for `IProvideFluidHandle`, it delegates to a private member. The caller does not need to know how the property is
implemented -- it simply asks for `fluidObject.IFluidLoadable` or `fluidObject.IFluidHandle` and either gets back an
object of the correct type or `undefined`.


!!!include(links.md)!!!
