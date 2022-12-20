# @fluid-tools/client-debugger

The Fluid Client Debugger library contains a simple API for initializing debug sessions for recording and propogating information about a given Fluid [Container][] and its [Audience][].

<!-- AUTO-GENERATED-CONTENT:START (README_INSTALLATION_SECTION:includeHeading=TRUE&devDependency=TRUE) -->

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluid-tools/client-debugger -D
```

<!-- AUTO-GENERATED-CONTENT:END -->

## Usage

Initialization and cleanup of debugger sessions can fit cleanly into your application's Fluid setup and teardown process easily.

### Initialization

To initialize a debugger session for your container, see [initializeFluidClientDebugger](https://fluidframework.com/docs/apis/client-debugger#initializefluidclientdebugger-function).

### Clean-up

To clean up a debugger session during your application's tear-down, or when closing an individual [Container][], see [closeFluidClientDebugger](https://fluidframework.com/docs/apis/client-debugger#closefluidclientdebugger-function)

## Related Tooling

TODO: link to other tools (visualizer library, chrome extension) once they have been published.

## Working in the package

### Build

To build the package locally, first ensure you have run `npm install` from the root of the mono-repo.
Next, to build the code, run `npm run build` from the root of the mono-repo, or use [fluid-build](https://github.com/microsoft/FluidFramework/tree/main/build-tools/packages/build-tools#running-fluid-build-command-line) via `fluid-build -s build`.

-   Note: Once you have run a build from the root, assuming no other changes outside of this package, you may run `npm run build` directly within this directory for a faster build.
    If you make changes to any of this package's local dependencies, you will need to run a build again from the root before building again from directly within this package.

### Test

To run the tests, first ensure you have followed the [build](#build) steps above.
Next, run `npm run test` from a terminal within this directory.

## Library TODOs

The following are TODO items to enhance the functionality of this library.

-   Accept a "nickname" for the container when registering.
    -   This will allow consumers to differentiate their debugger / container instances in a meaningful way, such that finding them is easier in visual tooling, etc.

### Ideas

-   Accept renderer hook options?
    -   This seems like a violation of

<!-- AUTO-GENERATED-CONTENT:START (README_API_DOCS_SECTION:includeHeading=TRUE) -->

## API Documentation

API documentation for **@fluid-tools/client-debugger** is available at <https://fluidframework.com/docs/apis/client-debugger>.

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- Links -->

[audience]: https://fluidframework.com/docs/build/audience
[container]: https://fluidframework.com/docs/build/containers
