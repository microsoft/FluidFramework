---
uid: component-model
---

# Fluid component model

In the previous section we introduced distributed data structures and demonstrated how to use them. The Fluid component
model enables us to combine those distributed data structures and our own code (business logic) into a modular, reusable
piece. This in turn enables us to modularize pieces of our application -- data included -- and re-use them or embed them
elsewhere.

The key things to understand are:

---

[[toc]]

---

## What makes a component a 'Fluid Component?'

A Fluid component is at its core a JavaScript object. Or, stated differently, any JavaScript object _could_ be a Fluid
component. What makes that object "Fluid" is the interfaces that it exposes through the Fluid component model's feature
detection mechanism.

Wow, that was a mouthful! What it means is that Fluid components are just JavaScript objects that implement specific
interfaces. The Fluid Framework defines an interface, IComponent, which is then augmented using [TypeScript's interface
merging capabilities](https://www.typescriptlang.org/docs/handbook/declaration-merging.html#merging-interfaces). The
specifics of how these interfaces are declared is not relevant until you want to define your own interfaces. We'll cover
that [in a later section.]()

One of the primary design principles in the Fluid component design is to support delegation and feature detection
patterns. **Feature detection** is a technique to dynamically determine the capabilities of another component, while
**delegation** means that the implementation of an interface can be delegated to another object.

Using these features, within the Fluid Framework itself we define several interfaces, such as `IComponentLoadable`, and
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

For example, consider the `IProvideComponentLoadable` interface.

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

We are experimenting with a variety of additional interfaces for specific purposes; see the <need link> for more info.

:::

These interfaces will be optional in many contexts but could be required by certain applications. For example an
application may refuse to load components that don't implement certain interfaces. This could include supporting
capabilities such as search, cursoring, clipboard support, and much more.

## Next: a ride on the Aqueduct



[IComponentHTMLView]: ../api/fluid-component-core-interfaces.icomponenthtmlview.md
[IComponentReactViewable]: ../api/fluid-aqueduct-react.icomponentreactviewable.md
[IProvideComponentHTMLView]: ../api/fluid-component-core-interfaces.iprovidecomponenthtmlview.md
[PrimedComponent]: ../api/fluid-aqueduct.primedcomponent.md
[SharedDirectory]: ../api/fluid-map.shareddirectory.md
[SharedMap]: ../api/fluid-map.sharedmap.md
[undo-redo]: ../api/fluid-undo-redo.md
