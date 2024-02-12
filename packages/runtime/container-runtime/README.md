# @fluidframework/container-runtime

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_PACKAGE_README:scripts=FALSE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluidframework/container-runtime
```

## API Documentation

API documentation for **@fluidframework/container-runtime** is available at <https://fluidframework.com/docs/apis/container-runtime>.

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

## Data Virtualization For DataStores

This is the ability of container to delay load datastores at any point in time by asking for the datastore snapshot at
anytime, not caring about from where it is coming and then using that to load that datastore and return it to the app.

### How Current System Works

Fluid (through its APIs) does expose some levels of data virtualization. But under covers, there is almost none. The
whole content of the file is downloaded in one go. Due to limitation of data virtualization, FF holds ALL blobs in
snapshot as those might be required in the future. Any delayed loading (through FF APIs) results in loading state of
DDSs at a sequence number of snapshot we booted from, and application of all the ops up till current sequence number.
While application may choose not to load some data stores immediately on boot (and realize some saving in time and
memory by not allocating appropriate app state for such datastores), FF still pays the costs for such content.
It also continues to pay the cost for all such content indefinitely, even if those datastores were loaded (this could
theoretically be optimized, but now there is no good way for driver to learn what blobs are safe to discard due to
limitations in interface and lack of appropriate semantics at driver API layer).

### Improvement with Data Virtualization

With this, we will provide a capability to:

- Exclude some sub-trees from snapshot payload, thus allowing faster transfer times / boot times and smaller initial
memory footprint.
- Ability to safely (in current system, i.e., without introducing any new breaking behaviors) to delay-load data
stores later.

Container Runtime Apis like IContainerRuntimeBase.createDataStore and IContainerRuntimeBase.createDetachedDataStore
provides an argument `dataStoreGroupIdForSnapshotFetch` which allows apps to put a datastore in group at time of
creation currently. This represents the group of the datastore within a container or its snapshot. When not specified
the datastore will belong to a `default` group. When a container is loaded initially, only datastores which belongs to
`default` group are fetched from service and can be loaded on demand when requested by user. This decreases the amount
of data which needs to be fetched during load and hence provides faster boot times for the container. Snapshot for all
datastores within a non-default datastore groupId will be fetched from service when any of the datastores within a
group is requested by application, then snapshot for that particular group will be fetched using a network call at that
time. So, 1 network will be required to fetch snapshot for a group when a datastore from a group is requested by an
application. This allows applications to put a datastore in a group, when it thinks that, that particular datastore
will not be requested on boot and will be loaded later on like on some user action like a button click. This will
improve the boot perf. Also, if application thinks that on that particular user action more than 1 datastore will be
loaded, then all those datastores can be provided same `dataStoreGroupIdForSnapshotFetch` on creation, so that snapshot
for all those datastores will be fetched in 1 network call. Data virtualization or providing the
`dataStoreGroupIdForSnapshotFetch` will however decrease the performance of loading of those datastores while improving
the overall performance of container load. However, providing same `dataStoreGroupIdForSnapshotFetch`
to put some data stores in same group which application thinks that it will delay load at around same time, would
improve performance for their loading as compared to providing a different group Id to each of these datastores as then
1 network call will be required to fetch snapshot for that group of datastores rather than 1 network call for each
datastore. So, the datastores which can get fairly big in size and which are not required to be loaded on boot, can
be put under a non-default groupId.

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
