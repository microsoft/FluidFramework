# @fluidframework/container-runtime

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
npm i @fluidframework/container-runtime
```

## Importing from this package

This package leverages [package.json exports](https://nodejs.org/api/packages.html#exports) to separate its APIs by support level.
For more information on the related support guarantees, see [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

To access the `public` ([SemVer](https://semver.org/)) APIs, import via `@fluidframework/container-runtime` like normal.

To access the `legacy` APIs, import via `@fluidframework/container-runtime/legacy`.

## API Documentation

API documentation for **@fluidframework/container-runtime** is available at <https://fluidframework.com/docs/apis/container-runtime>.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Data Virtualization For DataStores (Work in Progress)

It's a capability to exclude some content from initial snapshot (used when loading container) and thus improve boot
performance of a container. Excluded content could be loaded at a later time when it's required.

### Motivation for Data Virtualization

This section talks about how the system used to work before Data virtualization. Currently, the content of whole file
is downloaded in one go. Due to limitation of data virtualization, FF holds all blobs in snapshot as those might be
required in the future. Any delayed loading (through FF APIs) results in loading state of datastores at a sequence
number of snapshot we booted from, up until the current sequence number by applying the pending ops for that datastore.
While application may choose not to load some data stores immediately on boot (and realize some saving in time and
memory by not allocating appropriate app state for such datastores), FF still pays the costs for such content. It also
continues to pay the cost for all such content indefinitely, even if those datastores were loaded.

### Improvement with Data Virtualization

With this, we will provide a capability to:

-   Exclude some sub-trees from snapshot payload, thus allowing faster transfer times / boot times and smaller initial
    memory footprint.
-   Ability to delay-load data stores later.

Container Runtime Apis like IContainerRuntimeBase.createDataStore and IContainerRuntimeBase.createDetachedDataStore
provides an argument `loadingGroupId` which allows apps to mark a datastore at time of creation currently. Every data
store is assigned a groupID. Not providing groupID (on API) means that default ID is used. This groupId represents the
group of the datastore within a container or its snapshot. When a container is loaded initially, only datastores which
belongs to default group are fetched from service and can be loaded on demand when requested by user. This decreases
the amount of data which needs to be fetched during load and hence provides faster boot times for the container.
Attempting to load any datastore within a non-default group results in fetching all content/datastores marked with same
groupId. So, one network will be required to fetch content for a group when a datastore from a group is requested by an
application.
In advanced app scenarios, app would want to make datastores with a specific group Id, based on how it wants to load a
certain group at once, and not load the datastores that aren't part of the group. By effectively using groupID, app
will be able to improve boot times by not fetching unnecessary groups at load.
So to summarize, when datastore is assigned to a group, content of such data store will not be loaded with initial load
of container. It will be loaded only when any datastore with such groupID is realized.
This will improve the boot perf. Data virtualization or providing the `loadingGroupId` will however decrease the
performance of loading of those datastores as one network call would be required before loading. However,
providing same `loadingGroupId` to put some data stores in same group, would improve performance for their loading as
compared to providing a different group Id to each of these datastores as then one network call will be required to
fetch snapshot for that group of datastores rather than one network call for each datastore. So, the datastores which
can get fairly big in size content wise and which are not required to be loaded on boot, can be put under a non-default
groupId.

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Minimum Client Requirements

The following are the platform requirements for using Fluid Framework client libraries.
These requirements err on the side of being conservative.
Policies may be relaxed within a major version series, but not made stricter.
For Long Term Support (LTS) versions, this can require supporting these platforms for several years.

It is likely that other configurations will work, but they are not supported.
We do not consider it a bug if such configurations stop working in the future.
If you would benefit from support for something not listed here, file an issue and the product team will evaluate your request.
When making such a request, please include whether the configuration already works (and thus the request is just that it becomes officially supported), or if changes are required to get it working.

### Supported Runtimes

-   Node.js versions 22 and 24 for as long as they are receiving [upstream support](https://nodejs.org/en/about/previous-releases).
    -   Support for version 22 will be dropped [when it loses upstream support on 2027-04-30](https://github.com/nodejs/release#release-schedule).
    -   Running Fluid in a Node.js environment with the `--no-experimental-fetch` flag is not supported.
-   Modern browsers supporting the ES2022 standard library.

### Supported Tools

-   [TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0):
    -   All [`strict`](https://www.typescriptlang.org/tsconfig) options are supported.
    -   Build targets (`lib`, `target`) must specify `ES2022` or later.
    -   [`strictNullChecks`](https://www.typescriptlang.org/tsconfig) is required.
    -   [Configuration options deprecated in 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0#breaking-changes-and-deprecations-in-typescript-6-0) are not supported.
    -   `exactOptionalPropertyTypes` is currently not fully supported.
        If used, narrowing members of Fluid Framework types types using `in`, `Reflect.has`, `Object.hasOwn` or `Object.prototype.hasOwnProperty` should be avoided as they may incorrectly exclude `undefined` from the possible values in some cases.
-   [webpack](https://webpack.js.org/) 5
    -   We are not intending to be prescriptive about what bundler to use.
        Other bundlers which can handle ES Modules should work, but webpack is the only one we actively test.

### Module Resolution

[`Node16`, `Node20`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) resolution should be used with TypeScript compilerOptions to follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).

`Node10` resolution is not supported.

### Module Formats

-   ES Modules:
    ES Modules are the required way to consume our client packages (including in NodeJs).
-   CommonJs:
    CommonJs is no longer officially supported as of version 3.0.

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
