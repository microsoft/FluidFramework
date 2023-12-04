# @fluidframework/container-runtime

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_PACKAGE_README:scripts=FALSE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

Note that when depending on a library version of the form `2.0.0-internal.x.y.z`, called the Fluid internal version scheme,
you must use a `>= <` dependency range (such as `>=2.0.0-internal.x.y.z <2.0.0-internal.w.0.0` where `w` is `x+1`).
Standard `^` and `~` ranges will not work as expected.
See the [@fluid-tools/version-tools](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/version-tools/README.md)
package for more information including tools to convert between version schemes.

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluidframework/container-runtime
```

## API Documentation

API documentation for **@fluidframework/container-runtime** is available at <https://fluidframework.com/docs/apis/container-runtime>.

# Topics discussed in this document
- [Container Runtime, Data Stores and DDSs](#Container-Runtime,-Data-Stores-and-DDSs)
   - [Data stores](#Data-stores)
   - [DDSs](#DDS)
   - [Flexibility & stock implementations](#Flexibility-and-stock-implementations)
- [Handles](#Handles)
- [Summarizer topics](#Summarizer-Topics)
- [Garbage Collection](#Garbage-Collection)
- [Ops](#Ops)
- [Signals](#Signals)
- [Compatibility](#Compatibility)
- [ID Compressor](#ID-Compressor)
- [Contribution Guidelines](#Contribution-Guidelines)
- [Help](#Help)
- [Trademark](#Trademark)

## Container Runtime, Data Stores and DDSs
[Architecture](../../docs/content/docs/concepts/architecture\index.md) is a good starting point into overall architecture of Fluid Framework.

This package provides the following key building blocks / capabilities:
- `ContainerRuntime` class. It's main purpose is
    - A collection of data stores. Provides capabilities to create data stores, find named data stores
	- Routing of ops and signals to appropriate data stores.
	- Manages attachment blbobs, and provides capabilities to create and load attachment blobs.
- Summarization facilities. Please see [Summarizer topics](#Summarizer-Topics).
- While [Garbage Collection](#Garbage-Collection) is its own topic, it's very tight to summarization. Container Runtime facilitates processes around garbage collection.

### Data stores
Data stores (`FluidDataStoreRuntime` class) provides the following capabilities:
- Data store could be thought as a "component" or "library". While it usually hosts a number of DDSs (Distributed data structures), it usually hides actual data representation and exposes custom API to the rest of the world. For example, one could build a text editor and use data store to represent one instance of such editor in the document. A text editor would expose its own custom API to manipulate text, but under the covers will use a number of DDSs as a backing storage.
- Route ops and signals to DDSs under data stores.
- Facilitate summarization and garbage collection processes.

Custom implementations of data stores is possible. It's abstracted away as `IFluidDataStoreChannel` interface - that's the interface / implementation container runtime expects from data store layer.

### DDSs
Please consider the following materials:
- [Introducing distributed data structures](../docs/content/docs/build/dds.md) - Talks about merge behaviors, performance, optimistic vs. consensus based DDSs.
- [DDS anatomy](../../docs/content/docs/deep/dds-anatomy.md) goes into Distributed Data Structure topics, like what is DDS, types of DDSs, how to use DDSs, various merge policies & conflict resolution, etc.
Container runtime could be thought as a home / parent of data stores, and data stores are used to group and provide access (indirectly) to DDSs hosted by data stores.
- [DDS types](../../docs/content/docs/data-structures/overview.md) discusses different types of DDSs available.

### Flexibility and stock implementations
It's worth pointing out that Fluid Runtime is very flexible and allows extensibility / pluggability at every layer. Here are some examples of that:
- Loader / Hosting layer does not make any assumptions in terms of how this layer is implemented, what capabilities it provides and what are the building blobs underndeath. A custom implementation of `IRuntime`` interface could be provided as implementation of Container Runtime layer that might have no data stores, no DDSs, and maybe no handles or garbage collection (topics discusssed below). That said, all the basics (ops, signals, summaries) are there.
- Custom implementaitons of Data stores may not have DDSs. They themselves could act like DDSs, or maybe host other data stores.
- DDSs do not need to follow same [CRDT](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type) paradigm that most of DDSs use in Fluid repo. They could be built based on [Operational Transform](https://en.wikipedia.org/wiki/Operational_transformation) or other techniques. More over, these might not be general purpose data structures, for example it could be a vertical implementation of a text editor, with its own custom storage implementation.

Thus, components that Fluid Runtime provides should be though as stock implementations. They are powerful and likely large chunk of scenarios, but custom scenarios might require custom solutions.

## Handles
[Handles](../../docs/content/docs/concepts/handles.md) document describe Fluid handles. Handles are used to connect different nodes (data stores, DDSs) in the system, where one node can point to anohter node. Handles are used to (delay) load objects. They also create a graph of references in the document that is used by [Garbage Collection](#Garbage-Collection) to make decisions on what objects are unreferenced and could be collected eventually.

## Summarizer Topics
[Summarizer](../../docs/content/docs/concepts/summarizer.md) document describes everything about summaries and summarizer. Fluid is based on ops, but it's too late to 
[Summary Telemetry](../../docs/content/docs/deep/summaryTelemetry.md) describes summarizer telemetry, how to understand what happens in the system, including debugging summarizer issues.

## Garbage Collection
[This document](./src/gc/garbageCollection.md) describes how Fluid runtime deals with garbage - data stores and DDSs that are not reachable anymore in the document, and should be collected (deleted) from the file when it's safe to do.

## Ops
[Total order broadcast & eventual consistency](../../docs/content/docs/concepts/tob.md) document discusses topics like
- What are ops
- Total order braodcast & eventual consistency
- Data persistence
- Intro into summaries

[Ops Lifetime](../../docs/content/docs/concepts/architecture/OpsLifetime.md) discusses liftime of ops, how they move between various services & client.

[Ops Transformations](./src/opLifecycle/README.md) document covers topics like
- **Ops grouping**: automatic grouping of ops, ensuring that all ops produced in one JS turn are sent and applied together, without interleaving, aiding with correctness of application.
- **Ops content compression**: reduces bytes over the wire, and in most cases - improves ops latency
- **Ops grouping & chunking**: reduces number of ops on the wire, and thus reduce costs and throttling

## Signals
[Sgnals](../../docs/content/docs/concepts/signals.md) describes Signals - communication mechanism similar to ops, but more lightweight, and without persistence. Signals could be great for fire-and-forget scenarios, communicating ambient information that changes rapidly, like user's cursor position on the screen

## Compatibility
[Compatibility](../../docs/content/docs/deep/compatibility.md) document goes into compatibility topics - API compatibility, schema / protocol compatibility. These are the topics every engineer designing Fluid solutions should be familiar with, as they impact long-terms strategy and success of products build on top of Fluid.

## ID Compressor
[This document](./src/id-compressor/README.md) describes runtime capability to to generate compact unique IDs in Fluid documents. There is often a need to generate uuids in documents, but they are large/long and take too much space in storge. This library allows us to generate integer-sized uuids (in most cases).

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out our [GitHub
Wiki](https://github.com/microsoft/FluidFramework/wiki) or [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an
issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
