---
title: Feature detection via FluidObject
draft: true
status: outdated
aliases:
  - "/docs/advanced/feature-detection-iprovide/"
---

In an earlier section we introduced the Data Object, a convenient way to combine distributed data structures and our own
code (business logic) into a modular, reusable piece. This in turn enables us to modularize pieces of our application --
data included.

Fluid can be a very dynamic system. There are scenarios in which your code will call certain members of an object, *if
and only if*, the object has certain capabilities; that is, it implements certain interfaces. So, your code needs a way
of detecting whether the object implements specific interfaces. To make this easier, Fluid has a feature detection
mechanism, which centers around a special type called `FluidObject`. Feature detection is a technique by which one
Data Object can dynamically determine the capabilities of another Data Object.

In order to detect features supported by an unknown object, you cast it to an `FluidObject` and then query the object
for a specific interface that it may support. The interfaces available via `FluidObject` include many core Fluid
interfaces, such as `IFluidHandle` or `IFluidLoadable`. This
discovery system (see example below) enables any Data Object to record what interfaces it implements and make it
possible for other Data Objects to discover them. The specifics of how these interfaces are declared is not relevant
until you want to define your own interfaces, which we'll cover in a later section.

The following is an example of feature detection using `FluidObject`:

```typescript
const anUnknownObject = anyObject as FluidObject<IFluidLoadable>;

// Query the object to see if it supports IFluidLoadable
const loadable = anUnknownObject.IFluidLoadable; // loadable: IFluidLoadable | undefined

if (loadable) { // or if (loadable !== undefined)
    // It does! Now we know definitively that loadable's type is IFluidLoadable and we can safely call a method
    await loadable.method();
}
```

Note the `anUnknownObject.IFluidLoadable` expression and the types of the objects. If the object supports IFluidLoadable,
then an IFluidLoadable will be returned; otherwise, `undefined` will be returned.


## Delegation and the *IProvide* pattern

In the example above, `fluidObject.IFluidLoadable` is a *property* that is of type IFluidLoadable. `fluidObject` itself
need not implement IFluidLoadable. Rather, it must *provide* an implementation of IFluidLoadable. We call this
*delegation* -- `fluidObject.IFluidLoadable` may return `fluidObject` itself in its implementation, or it may delegate by
returning another object that implements IFluidLoadable.

If you search through the Fluid Framework code, you'll notice that many interfaces come in pairs, such as
`IFluidLoadable` and `IProvideFluidLoadable`. `IProvideFluidLoadable` is defined as follows:

```typescript
export interface IProvideFluidLoadable {
  readonly IFluidLoadable: IFluidLoadable;
}
```

We call this the *IProvide pattern*. This interface definition means that if we have an `IProvideFluidLoadable`, we may
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
