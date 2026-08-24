# @fluidframework/undo-redo

This package provides an implementation of an in-memory undo redo stack, as well as handlers for the SharedMap and
SharedSegmentSequence distributed data structures.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library's public APIs, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

If using any of Fluid Framework's unstable APIs (for example, its `beta` APIs), we recommend using a more constrained version range, such as `~`.

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluidframework/undo-redo
```

## API Documentation

API documentation for **@fluidframework/undo-redo** is available at <https://fluidframework.com/docs/apis/undo-redo>.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Undo Redo Stack Manager

The undo redo stack manager is where undo and redo commands are issued, and it holds the stack of all undoable and
redoable operations. The undo redo stack manager is a stack of stacks.

The outer stack contains operations, and the inner stack contains all the IRevertible objects that make up that
operation. This allows the consumer of the undo redo stack manager to determine the granularity of what is undone or
redone.

For instance, you could define a text operation at the word level, so as a user types you could close the current
operation whenever the user types a space. By doing this when the user issues an undo mid-word the characters typed
since the last space would be undone, if they issue another undo the previous word would then be undone.

As mentioned above, operations are a stack of IRevertible objects. As suggested by the name, these objects have the
ability to revert some change which usually means two things. They must be able to track what was changed, and store
enough metadata to revert that change.

In order to create IRevertible object there are provided undo redo handlers for commonly used data structures.

## Shared Map Undo Redo Handler

The SharedMapUndoRedoHandler generates IRevertible objects, SharedMapRevertible for all local changes made to a SharedMap and pushes them to the current operation on the undo redo stack. These objects are created via the valueChanged event of the SharedMap. This handler will never close the current operation on the stack. This is a fairly simple handler, and a good example to look at for understanding how IRevertible objects should work.

## Shared Segment Sequence Undo Redo Handler

The SharedSegmentSequenceUndoRedoHandler generates IRevertible objects, SharedSegmentSequenceRevertible for any
SharedSegmentSequence based distributed data structures like SharedString.

This handler pushes an SharedSegmentSequenceRevertible for every local Insert, Remove, and Annotate operations made to
the sequence. The objects are created via the sequenceDelta event of the sequence. Like the SharedMapUndoRedoHandler
this handler will never close the current operation on the stack.

This handler is more complex than the SharedMapUndoRedoHandler. The handler itself batches the SharedSegmentSequence
changes into the smallest number of IRevertible objects it can to minimize the memory and performance overhead on the
SharedSegmentSequence of tracking changes for revert.

### Shared Segment Sequence Revertible

The SharedSegmentSequenceRevertible does the heavy lifting of tracking and reverting changes on the underlying
SharedSegmentSequence. This is accomplished via TrackingGroup objects. A TrackingGroup creates a bi-direction link
between itself and the segment. This link is maintained across segment movement, splits, merges, and removal. When a
sequence delta event is fired the segments contained in that event are added to a TrackingGroup. The TrackingGroup is
then tracked along with additional metadata, like the delta type and the annotate property changes. From the
TrackingGroup's segments we can find the ranges in the current document that were affected by the original change even
in the presence of other changes. The segments also contain the content which can be used. With the ranges, content,
and metadata we can revert the original change on the sequence.

As called out above, there is some memory and performance overhead associated with undo redo. This overhead is from the
TrackingGroup. This overhead manifests in a few ways:

-   Removed segments in a TrackingGroup will not be garbage collected from the backing tree structure.
-   Segments can only be merged if they have all the same TrackingGroups.

This object minimizes the number of TrackingGroups created, so this overhead is very low. This undo redo infrastructure
is entirely in-memory so it does not affect other users or sessions. If custom IRevertible objects use TrackingGroups
this overhead should be kept in mind to avoid possible performance issues.

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Minimum Client Requirements

Fluid Framework client libraries support the platforms in this document.
These requirements are intentionally restrictive.
Within a major version series, we can relax these requirements, but we cannot make them stricter.
For a Long Term Support (LTS) version, we might need to support these platforms for several years.

Other configurations can work, but Fluid Framework does not support them.
If an unsupported configuration stops working, we do not classify this as a bug.
To request support for a configuration that is not listed, file an issue.
The product team will evaluate your request.
In the issue, specify the current status of the configuration:

-   The configuration works but needs official support.
-   The configuration does not work and requires changes.

### Supported Runtimes

-   Fluid Framework supports Node.js versions 22 and 24 while they receive [upstream support](https://nodejs.org/en/about/previous-releases).
    -   Fluid Framework will stop support for version 22 [when upstream support ends on 2027-04-30](https://github.com/nodejs/release#release-schedule).
    -   Fluid Framework does not support Node.js with the `--no-experimental-fetch` flag.
-   Fluid Framework supports modern browsers that support the ES2022 standard library.

### Supported Tools

-   [TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0):
    -   Fluid Framework supports all [`strict`](https://www.typescriptlang.org/tsconfig) options.
    -   Set the build targets (`lib`, `target`) to `ES2022` or later.
    -   Enable [`strictNullChecks`](https://www.typescriptlang.org/tsconfig).
    -   Fluid Framework does not support [configuration options deprecated in TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0#breaking-changes-and-deprecations-in-typescript-6-0).
    -   Fluid Framework does not fully support `exactOptionalPropertyTypes`.
        If you enable this option, do not use `in`, `Reflect.has`, `Object.hasOwn`, or `Object.prototype.hasOwnProperty` to narrow members of Fluid Framework types.
        These methods can incorrectly exclude `undefined` from the possible values.
-   [webpack](https://webpack.js.org/) 5
    -   We do not require a specific bundler.
        Other bundlers that handle ES Modules can work, but we actively test only webpack.

### Module Resolution

In TypeScript `compilerOptions`, use [`Node16`, `Node20`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) module resolution.
These settings follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).

Do not use `Node10` module resolution.

### Module Formats

-   ES Modules:
    Use ES Modules to consume Fluid Framework client packages, including in Node.js.
-   CommonJS:
    Fluid Framework does not officially support CommonJS in version 3.0 or later.

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README?
Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for?
Please [file an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
