# Component Clipboard Model

## Introduction

Component Clipboard Model is a specification of patterns used for components to interact
with the system clipboard when they are being hosted by other components and/or host
nested components.

The following considerations were taken into account in shaping this model.

1. Components can host nested components in a hierarchical manner.
2. The underlying Fluid model is private to the component.
3. The rendering DOM is custom to the component and used only for rendering (it has no semantic
   value). It might not exist (e.g., component may not render anything) or might exist only
   partially (e.g., in the case of DOM virtualization).
4. Components might have a custom internal model, which is also private.
5. Selection is custom to each component (e.g., text range, list, two-dimensional range).

Based on these considerations, each component needs to be asked for its clipboard data in a generic
manner, that allows it to assemble the data from its nested components with its own. Conversely,
on paste, each component needs to be given an opportunity to insert the pasted content and instantiate
any nested component.

## Copy

Hosts can use their “selection” or equivalent concept to identify any nested components involved.
If the selection includes nested components, the host should use the **IComponentClipboardData**
interface on each of these nested component to acquire their contribution to the copied content,
and combine it with its own copied content. These nested components should do the same with their
own nested components. What content a component provides is entirely up to it.

Nested components might need to contribute multiple formats of clipboard data to their host components
(e.g. plain-text, HTML).

In addition, a nested component should specify their complete fluid url in the **fluidUrlAttributeName**
data- attribute of its containing HTML element to ensure that the proper component is instantiated on paste.

## Cut

On cut, in addition to the actions of copy, the host is responsible for deleting nested
components as necessary.

If the nested components support partial selection, then it might need to let their host know whether
to delete them entirely or not (partial selection). Currently partial selection is not supported for
nested components. As such, this functionality is currently left out of the interface.

## Paste

On paste, the target of the paste event should do the following:

1. Insert appropriate internal data for the content being pasted
2. Either create nested components based on their **fluidUrlAttributeName** data- attribute found
   in the clipboard content, or, alternatively just use the HTML representation of that nested component
   any way they wish.

At the moment, we support two different options for nested components:

1. They are a linked copy and retrieve their content from fluid based on the **fluidUrlAttributeName**
   data- attribute written during copy
2. They are a new instance and can optionally retrieve content or state from the **fluidUrlAttributeName**
   data- attribute.

Choosing between the options above might require user input.

Components may implement **IComponentClipboardConsumer.getComponentFromClipboardHTML** to provide an
alternate component identifier to be instantiated during the paste operation. This alternate component
should be instantiated on paste instead of the original component component identifier that was serialized
on copy. In essence, the first instantiated component (serialized component identifier) may act as a
factory for the component that will actually be instantiated.

Disclaimer: These interfaces are experimental and are subject to change.
