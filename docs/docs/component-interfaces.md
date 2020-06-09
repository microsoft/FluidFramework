# Fluid component interfaces

We break these set of interfaces into three categories:

* Fluid **Rendering** interfaces
* Fluid **Data** interfaces
* Fluid **Experience integration** interfaces

Note that these interfaces will be optional in many contexts and can be used in various combinations. However, they
could be required by certain applications. For example, an application may refuse to load components that don't
implement certain interfaces.


## Fluid rendering interfaces

::: warning TODO

Needs review.

:::

The Fluid Component model is built on top of Web technologies, where core rendering uses the DOM and HTML, CSS,
JavaScript, etc. Fluid does not and will not attempt to abstract or replace HTML. Rather, it provides a framework for
easier re-use of HTML-based components along with other rich capabilities such as the distributed data model.

Fluid does provide a set of core interfaces on how components can be placed into containers or web experiences.

### Core rendering (IComponentHTMLView):

::: warning TODO

Needs review.

:::

The base interface for a Fluid component that wants to draw on the screen is `IComponentHTMLView`. It supports a single
method `render`, where HTML is written to output the display for the component.

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

## Fluid data interfaces

::: warning TODO

Needs review.

:::

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

## Fluid experience interfaces

::: warning TODO

Needs review.

:::

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
