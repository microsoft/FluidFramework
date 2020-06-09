---
uid: component-model
---

# Fluid component model

This section will provide an overview of the Fluid Framework Component Model, including a description of the layered approach,
interfaces, examples, and links to relevant resources.

For an overview of Fluid, please read [What is Fluid?](../what-is-fluid.md)

---

[[toc]]

---

## What makes a component a 'Fluid Component?'

A Fluid component is at its core a JavaScript object. Its relationship to the Fluid Framework is defined by the
interfaces it exposes through the Fluid component model's feature detection convention.

One of the primary design principles in the Fluid component design is to support delegation and feature detection
patterns. Feature detection is a technique to dynamically determine the capabilities of another component, while
delegation means that the implementation of an interface can be delegated to another object. These patterns are
described in more detail below.

### Feature detection and delegation

The Fluid component model supports a delegation and feature detection mechanism. As is typical in JavaScript, a feature
detection pattern can be used to determine what capabilities are exposed by a component. The `IComponent` interface serves
as a Fluid-specific form of TypeScript's `any` that clients can cast objects to in order to probe for implemented component
interfaces. For example, if you need to determine the capabilities that a component exposes, you first cast the object
as an `IComponent`, and then access the property on the `IComponent` that matches the interface you are testing for. For
example:

```typescript
let component = result.value as IComponent;
// We call bar on the component if it supports it.
const foo = component.IComponentFooBar;
if (foo) {
    await component.bar();
}
```

In the example above, the code is checking to see if the component supports `IComponentFooBar`. If it does, an object will
be returned and `bar()` will be called on it. If the component does not support `IComponentFooBar`, then it will return
undefined.

In addition to the feature detection mechanism, Fluid also supports a delegation pattern. Rather than implementing
`IComponent*` interfaces itself, a component may instead delegate that responsibility by implementing `IProvideComponent*`
interfaces. By implementing the IProvide interfaces, the component is only required to implement a property that returns
the appropriate `IComponent*` interface.

For example, consider the `IComponentReactViewableInterface`. This interface indicates that the component uses React for
rendering.

```typescript
export interface IProvideComponentReactViewable {
    readonly IComponentReactViewable: IComponentReactViewable;
}
 /**
  * If something is React viewable then render can simply return a JSX Element
  */
export interface IComponentReactViewable extends IProvideComponentReactViewable {
    createJSXElement(props?: {}): JSX.Element;
}
```

Notice that there is an inheritance relationship between the `IProvideComponentReactViewable` and `IComponentReactViewable`
interfaces. When implementing only the `IProvideComponentReactViewable` interface, the component still must be able to
return an `IComponentReactViewable` object, but it does not need to implement that interface itself and can instead
delegate to a different object.

## Fluid component capabilities

Fluid Components will typically leverage the rich capabilities of Fluid including the rich distributed data structures,
rendering system, and integration in app experiences.

Note that these are all optional and can be used in various combinations. For instance, a component could choose to do
rendering but not have a need for distributed data structures. Alternatively a component might want access to the
distributed data structures but have no need for rendering. Here are some examples:

Additionally components can implement experience integration interfaces, which will be optional in many contexts but
could be required by certain applications (i.e. an application may refuse to load components that don't implement
certain interfaces). This would include supporting capabilities such as search, presence, cursoring, clipboard support,
and much more.

We'll break these set of interfaces into three categories:

* Fluid **Rendering** Interfaces
* Fluid **Data** Interfaces
* Fluid **Experience Integration** Interfaces

## Fluid Rendering Interfaces

The Fluid Component model is built on top of Web technologies, where core rendering uses the DOM and HTML, CSS,
JavaScript, etc. Fluid does not and will not attempt to abstract or replace HTML. Rather it provides a framework for
easier re-use of HTML-based components along with other rich capabilities such as the distributed data model.

Fluid does provide a set of core interfaces on how components can be placed into containers or web experiences.

### Core Rendering (IComponentHTMLView):

The base interface for a Fluid Component that wants to draw on the screen is IComponentHTMLView. It supports a single
method `render`, where HTML is written to output the display for the control.

Here is the interface definition:

```typescript
export interface IComponentHTMLView {
    render(elm: HTMLElement, options?: IComponentHTMLOptions): void;
}
```

Here is a sample implementation:

```typescript
class MyDisplayComponent implements IComponentHTMLView {
  public render(parent: HTMLElement) {
    if (parent) {
      const div = document.createElement("div");
      div.innerHTML = "<b>Hello World</b>";
    }
  }
}
```

In this very simple example the component is always outputting "Hello World" in bold. In a more sophisticated component
this `render` method would contain all of the display code for the component.

The `IComponentHTMLOptions` interface provides an optional mechanism for parameterization. Additional options can and
will be added. Here is a current base definition for the interface:

```typescript
export interface IComponentHTMLOptions {
    display?: "block" | "inline";
}
```

### Fluid Data Interfaces

For an introduction to the Fluid Data model, please read [What is Fluid?](../what-is-fluid.md)

The Fluid distributed data structures can be instantiated and accessed via methods in the core Runtime and implementing
the `IComponentLoadable` interface.

However, we expect most component developers to access the data model via the base classes in Fluid's Aqueduct package
(this package contains implementations of the Fluid Framework interfaces that help developers to quickly get started),
specifically [PrimedComponent][], and then use distributed data structures via their APIs (SharedDirectory, SharedMap,
SharedString, etc).

[PrimedComponent][] ensures that a root distributed data structure is created and ready for the developer to use. The
root is a SharedDirectory, which is a Map-like data structure. Additional distributed data structures can be added
easily. [PrimedComponent][] is the recommended starting point for building a component.

[PrimedComponent][] exposes some component lifecycle functions that components can override. For example, a component
might override the `componentInitializingFirstTime` function to set up any state that should be configured only once
during a components life, or override the `componentHasInitialized` method which will be called every time the component
has initialized.

### Fluid Experience Interfaces

Fluid will also support a set of interfaces to allow for consistent experiences and application integration. For
instance, components will want to participate in larger concepts such as presence, search, clipboard, cursoring, etc.

As a general principle these interfaces will be optional, though some applications or hosts may require them if critical
for basic operation.

Below is a partial list of possible interfaces. Note that most of these do not yet exist in the Fluid Framework – this
list is aspirational and illustrative:

* Presence
* Commanding (e.g. toolbars/menus)
* Clipboard
* Cursoring
* Search
* Formatting
* Component layout
* Keyboard handling

A good example of such an interface is `IComponentCursor`:

```typescript
export interface IProvideComponentCursor {
    readonly IComponentCursor: IComponentCursor;
}

export interface IComponentCursor extends IProvideComponentCursor {
    enter(direction: ComponentCursorDirection): void;
    // leave returns true if cursor leaves the component
    leave(direction: ComponentCursorDirection): void;
    fwd(): boolean;
    rev(): boolean;
}

/**
 * Direction from which the cursor has entered or left a component.
 */
 export enum ComponentCursorDirection {
    Left,
    Right,
    Up,
    Down,
    Airlift,
    Focus,
}
```

[IComponentHTMLView]: ../api/fluid-component-core-interfaces.icomponenthtmlview.md
[IComponentReactViewable]: ../api/fluid-aqueduct-react.icomponentreactviewable.md
[IProvideComponentHTMLView]: ../api/fluid-component-core-interfaces.iprovidecomponenthtmlview.md
[PrimedComponent]: ../api/fluid-aqueduct.primedcomponent.md
[SharedDirectory]: ../api/fluid-map.shareddirectory.md
[SharedMap]: ../api/fluid-map.sharedmap.md
[undo-redo]: ../api/fluid-undo-redo.md
