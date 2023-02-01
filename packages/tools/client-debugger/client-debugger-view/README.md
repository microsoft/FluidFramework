# @fluid-tools/client-debugger-view

The Fluid Client Debug View library contains hooks and components for rendering debug information related to a Fluid [Container][] and its [Audience][].

This library is designed to be used with [@fluid-tools/client-debugger][]. It also powers our [Chrome Extension](https://developer.chrome.com/docs/extensions/overview/): [@fluid-tools/client-debugger-chrome-extension][].

The package exposes 2 primary entry-points:

-   [renderClientDebuggerView](https://fluidframework.com/docs/apis/client-debugger-view/docs/apis/client-debugger-view#renderclientdebuggerview-function): A general-purpose function for rendering the debug view to a provided [DOM]() element.

-   [FluidClientDebugger](https://fluidframework.com/docs/apis/client-debugger-view/docs/apis/client-debugger-view#fluidclientdebugger-function): A [React Component](https://reactjs.org/docs/react-component.html) for embedding the debug view into your own React tree.

The library is intended to be extensible and customizable.

Visualizers for new or custom forms of Fluid data (in particular, [DDS](https://fluidframework.com/docs/build/dds/)es) may be provided, and some pre-packed visualization defaults may be overridden.

<!-- AUTO-GENERATED-CONTENT:START (README_INSTALLATION_SECTION:includeHeading=TRUE&devDependency=TRUE) -->

<!-- prettier-ignore-start -->

<!-- This section is automatically generated. To update it, make the appropriate changes to docs/md-magic.config.js or the embedded content, then run 'npm run build:md-magic' in the docs folder. -->

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluid-tools/client-debugger-view -D
```

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Usage

This library is intended to be consumed as a component in an existing React app.
The suggested use pattern is to hide the `ClientDebugView` component behind some dev/debug-only flag, and allow developers to toggle it on as needed to analyze / adjust local state.

## Working in the package

### Build

To build the package locally, first ensure you have run `pnpm install` from the root of the mono-repo.
Next, to build the code, run `npm run build` from the root of the mono-repo, or use [fluid-build](https://github.com/microsoft/FluidFramework/tree/main/build-tools/packages/build-tools#running-fluid-build-command-line) via `fluid-build -s build`.

-   Note: Once you have run a build from the root, assuming no other changes outside of this package, you may run `npm run build` directly within this directory for a faster build.
    If you make changes to any of this package's local dependencies, you will need to run a build again from the root before building again from directly within this package.

### Test

To run the tests, first ensure you have followed the [build](#build) steps above.
Next, run `npm run test` from a terminal within this directory.

### Test Sandbox App

This package has a simple testing app that sets up a Container with some simple data for testing the debug view, as well as some interactive controls for testing live editing / collaboration scenarios.

To run the app, navigate to the root of this package and run `npm run start:test-app`.

-   This will launch a local [Tinylicious](https://fluidframework.com/docs/testing/tinylicious/) service and serve the app at <http://localhost:8080/>.

## Library TODOs

-   More default data object visualizers should be added.
    -   Likely including SharedTree (both new and old), and perhaps others.
-   Layout and styling should be improved.
    This was created by an engineer with less-than-substantial front-end development experience.
    It could use some attention from a designer at some point.
-   Add a garbage collection viewer with history.

### Ops Stream View TODOs

-   Display local pending ops in Ops Stream view.
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

<!-- AUTO-GENERATED-CONTENT:START (README_API_DOCS_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->

<!-- This section is automatically generated. To update it, make the appropriate changes to docs/md-magic.config.js or the embedded content, then run 'npm run build:md-magic' in the docs folder. -->

## API Documentation

API documentation for **@fluid-tools/client-debugger-view** is available at <https://fluidframework.com/docs/apis/client-debugger-view>.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->

<!-- This section is automatically generated. To update it, make the appropriate changes to docs/md-magic.config.js or the embedded content, then run 'npm run build:md-magic' in the docs folder. -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- Links -->

[@fluid-tools/client-debugger]: https://github.com/microsoft/FluidFramework/tree/main/packages/tools/client-debugger/client-debugger
[@fluid-tools/client-debugger-chrome-extension]: https://github.com/microsoft/FluidFramework/tree/main/packages/tools/client-debugger/client-debugger-chrome-extension
[audience]: https://fluidframework.com/docs/build/audience
[container]: https://fluidframework.com/docs/build/containers
