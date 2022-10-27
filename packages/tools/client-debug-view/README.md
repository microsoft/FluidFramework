# @fluid-tools/client-debug-view

This package exposes a [React](https://reactjs.org/)-based viewer for [Fluid](https://fluidframework.com/docs/) Client data.
For now, this data is centered around [Container](https://fluidframework.com/docs/build/containers/) and [Audience](https://fluidframework.com/docs/build/audience/) data.

The library is intended to be extensible and customizable.

Visualizers for new or custom forms of Fluid data (in particular, [DDS](https://fluidframework.com/docs/build/dds/)es) may be provided, and some pre-packed visualization defaults may be overridden.

<!-- AUTO-GENERATED-CONTENT:START (README_INSTALLATION_SECTION:includeHeading=TRUE&devDependency=TRUE) -->

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluid-tools/client-debug-view -D
```

<!-- AUTO-GENERATED-CONTENT:END -->

## Usage

This library is intended to be consumed as a component in an existing React app.
The suggested use pattern is to hide the `ClientDebugView` component behind some dev/debug-only flag, and allow developers to toggle it on as needed to analyze / adjust local state.

## Library TODOs

-   More default data object visualizers should be added.
    -   Likely including SharedTree (both new and old), and perhaps others.
-   Layout and styling should be improved.
    This was created by an engineer with less-than-substantial front-end development experience.
    It could use some attention from a designer at some point.
-   Add a garbage collection viewer with history.

### Ops Stream View TODOs

-   Display local pending ops in Ops Steam view.
    -   The Container API does not currently make it easy to get access to pending local op state.
        We should consider making this information easier to access, and display it in our local view in a form that clearly differentiates it from other (non-pending) ops.
-   Display (optional) complete history of ops in Ops Stream view.
    -   Currently, we only display data about the ops we have seen since the component was first rendered.
        The Container API does not make it easy to get access to older ops.
        We should consider
-   Associate ops with the data objects with which they are associated.
    -   Currently, there isn't a way to distinguish ops associated with the container from ops associated with a data object, nor a way to distinguish between ops associated with different data objects, etc.
        This would be useful information to present to the user.
-   Associate ops with the audience members from whom they originated.
    -   Including being able to filter ops by user ID

### initialObjects Tree View TODOs

-   Better data presentation
    -   The current accordion-style drop-down hierarchy will not scale well for large trees.
        It's nice for very simple apps like our playground, but won't scale to scenarios with deeper tree structures.
-   Add utility for dumping tree contents to disk / clipboard
-   Currently, the view offers no data editing affordances. At the very least for "simple" data, we should allow users to edit data in place.
    -   This could be especially valuable during the prototyping state of an application.

### Audience View TODOs

-   Add a way to view the history of changes.

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- Links -->
