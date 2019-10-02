/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
# Component Clipboard Model

## Introduction

Component Clipboard Model is a specification of patterns used for components to interact
with the system clipboard when they are being hosted by other components and/or host
nested components.

The following considerations were taken into account in shaping this model.

1. Components can host nested components in a hierarchical manner.
2. The underlying Fluid model is private to the component.
3. The rendering DOM is custom to the component and used only for rendering (it has no semantic
   value). It might not exists (e.g., component may not render anything) or might exist only
   partially (e.g., in the case of DOM virtualization).
4. Components might have a custom internal model, which is also private.
5. Selection is custom to each component (e.g., text range, list, two-dimensional range).

Based on these considerations, each component needs to be asked for its clipboard data in a generic
manner, that allows it to assemble the data from its nested components with its own. Conversely,
on paste, each component needs to be given an opportunity to insert the pasted content and instantiate
any nested component.

## Copy

Components should all register for the browser clipboard events on any of their HTML elements.
If a component is the outermost component in the selection, i.e., if it owns the selection, it
should handle these events by constructing and setting the copied content on the clipboard. All
other components should ignore these events. Instead, they will report their copied content, if any,
via a different interface described below.

Host components can use their “selection” or equivalent concept to identify any nested
components involved. If the selection includes nested components, the host component
should use the **IComponentClipboardProvider** interface on each of these nested component to acquire
their contribution to the copied content, and combine it with its own copied content. These nested
components should do the same with their own nested components. What content a component provides is
entirely up to it.

The **ComponentClipboardHelper.shouldHandleClipboardEvent** helper indicates if a component is the
owner of the selection, i.e., responsible for setting the copied data on the clipboard. For this helper
to work, all components need to have called **ComponentClipboardHelper.setComponentBoundaryAttributes**
previously, for example at instantiation time. **setComponentBoundaryAttributes** accepts two parameters,
the HTMLElement that is the outermost element for the component and the component's fluid-id that identifies
this component.

Nested components might need to contribute multiple formats of clipboard data to their host components
(e.g. plain-text, HTML).

In addition, a nested component can specify query parameters in the **fluidUrlAttributeName** attribute
of its containing HTML element that will be used during paste (see below).

The host component is then responsible for constructing the final nested component url and store it
in that same **fluidUrlAttributeName** attribute, retaining these query parameters. This will
ensure that the proper component is instantiated on paste.

## Cut

On cut, in addition to the actions of copy, the host component is responsible for deleting nested
components as necessary.

If the nested components support partial selection, then it might need to let their host know whether
to delete them entirely or not (partial selection). Currently partial selection is not supported for
nested components. As such, this functionality is currently left out of the interface.

## Paste

On paste, the target component of the paste event should do the following:

1. Insert appropriate internal data for the content being pasted
2. Either create nested components based on their **fluidUrlAttributeName** attribute found
   in the clipboard content, or, alternatively just use the HTML representation of that nested component
   any way they wish.

At the moment, we support two different options for nested components:

1. They are a linked copy and retrieve their content from fluid based on the **fluidUrlAttributeName**
   attribute written during copy
2. They are a new instance and can optionally retrieve content or state from the query parameters
   appended to the **fluidUrlAttributeName** attribute

Choosing between the options above might require user input.

To instantiate a nested components, the target component should call createComponent on the target
context (i.e. IComponentContext) using the component identifier found in the **fluidUrlAttributeName**
attribute on the nested component's HTML element. 

Some components implement **IComponentPastable.getComponentUrlOnPaste** to provide an alternate component
identifier. In this case, this alternate component should be loaded instead of the original component. In 
essence, the first loaded component may act as a factory for the component that will actually be used. 
The target component should call **IComponentPastable.getComponentUrlOnPaste** on the first component with
any query parameters found in the value of the **fluidUrlAttributeName** attribute.

If that component returns an alternate component identifier, this component identified should be used
to load the component during paste and discard the original one. If first component does not return an 
alternate identifier or does not implement this interface, it will be loaded.
