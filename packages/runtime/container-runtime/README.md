# @fluidframework/container-runtime

<!-- markdown-magic:begin {"transform":"library-readme-header","headingLevel":2} -->
<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

For a dependency on a Fluid Framework library's public APIs, we recommend a `^` (caret) version range.
For example, use `^1.3.4`.

For a dependency on an unstable API, such as a `beta` API, we recommend a more restrictive version range.
For example, use a `~` version range.

## Installation

Run this command to install the package:

```bash
npm i @fluidframework/container-runtime
```

## Importing from this package

This package uses [package.json exports](https://nodejs.org/api/packages.html#exports) to separate APIs by support level.
For information about the support guarantees, read [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

Import the `public` APIs from `@fluidframework/container-runtime`.

Import the `legacy` APIs from `@fluidframework/container-runtime/legacy`.

## API Documentation

Read the **@fluidframework/container-runtime** API documentation at <https://fluidframework.com/docs/apis/container-runtime>.

<!-- prettier-ignore-end -->
<!-- markdown-magic:end -->

## Native checkpoints (experimental prototype)

New documents created with `Fluid.ContainerRuntime.NativeCheckpoints` can store native checkpoints.
This is an internal prototype, not a production persistence or backup contract.
Capture requires acknowledged state; the returned catalog entry is durable only after its store op is acknowledged.

Storage first computes a byte-range delta against the previous checkpoint.
An aligned 32-byte base index finds unchanged ranges even when edits move subsequent bytes.
Matches are verified byte-for-byte; collisions can reduce compression but cannot change reconstructed content.
The writer compares the **compressed** full and delta payloads and stores the smaller representation.
A chain has at most four delta edges: cold random access needs at most five attachment reads.
This bounds read amplification and retention dependencies rather than claiming globally optimal deduplication.
The warm capture cache holds only one materialized checkpoint.

Compression uses the web-standard gzip streams, with the existing LZ4 dependency as a writer fallback.
Readers of gzip payloads need `DecompressionStream`; integrity checks need Web Crypto.
Frames carry explicit lengths, and SHA-256 validates both the base and reconstructed bytes.
The prototype limits payloads and decompression to 64 MiB.
Legacy JSON checkpoints remain readable; new summary binary blobs use base64 rather than numeric arrays.
Image content stays in its original attachment: checkpoints retain routes, not duplicate image bytes.

The codec test compares the same deterministic 27-point history in both storage modes.
Its synthetic native-summary-shaped fixture has 16 stores with edited text, tables, directories, cyclic handle references, and a shared image reference.
This is a codec comparison, not a live-service benchmark or actual DDS serialization benchmark.
On Node 26.13.0 with gzip, the recorded payload totals were:

| Storage mode | Total bytes |
| --- | ---: |
| Uncompressed structural payloads | 3,454,823 |
| Compression-only independent checkpoints | 415,569 |
| Bounded deltas plus compression | 100,466 |

Deltas reduced storage by 75.8% relative to compression alone on this fixture, including required independent anchors.
The test reconstructs every checkpoint and checks exact bytes.
Set `FLUID_NATIVE_CHECKPOINT_METRICS_PREFIX` to a project-relative output prefix when running `nativeCheckpoint.spec.js` in this package to write the comparison through the existing benchmark reporter.

`pruneNativeCheckpoints({ minAgeMs?, targetCount? })` provides **host-triggered** age/count retention.
The defaults keep at least 30 days of history and the latest 100 catalog entries.
The count is a soft target: recent history, unknown legacy ages, required delta bases, and the current restored checkpoint can keep the catalog above 100.
No timer, capture hook, or background scheduler invokes this policy automatically.
Without a host pruning call, history remains unbounded.
Explicit options can change either default; both must be non-negative safe integers.

Age starts at the service timestamp of the acknowledged checkpoint store op.
The submitted capture result has no timestamp; read the acknowledged catalog for `timestamp` and `storeSequenceNumber`.
Pruning uses the prune op's service timestamp, never a client wall clock.
An entry becomes age-eligible at `minAgeMs`, including the exact boundary, but is removed only if it is also outside the latest `targetCount` entries and not otherwise protected.
Legacy entries missing either timestamp or store sequence metadata are retained conservatively.
The prune request records the caller's observed sequence number.
Any capture stored after that boundary survives the stale request, even if it reuses a removed checkpoint ID.

`retainNativeCheckpoints(ids)` remains a low-level explicit keep-list operation, not the age/count policy.
It can remove recent history and does not provide the policy API's stale-request fence.
Both operations sequence retention with capture and restore.
It preserves the requested entries, their base chains, and the current restore boundary.
Entries retained only as dependencies remain visible in the catalog.
Other entries and their image roots leave the catalog; normal GC decides when unreferenced attachments can be collected.
It does not delete shared image bytes or service history.
Retention during an ordered restore is ignored, and capture whose base was concurrently removed does not enter the catalog.
Callers must observe the acknowledged catalog, not assume a submitted capture or retention request won a race.

Restore recovery does not depend on the original publisher.
`getNativeCheckpointRestore()` reports an ordered boundary, an observed publication acknowledgement, or a boundary loaded from a restored snapshot.
A fresh summary-authorized client replays an unfinished boundary and calls `publishNativeCheckpointRestore()`.
If publication was already acknowledged or the restored snapshot was loaded, it only resubmits completion; it does not upload another summary.
An acknowledgement timeout rejects the attempt without undoing the sequenced boundary.
Reload and inspect the state before retrying; service upload failures are surfaced without hidden retries.

The loader's internal `loadContainerAfterNativeCheckpointRestore(props, boundary, clearPersistedState)` helper provides the host reload contract.
Stop using the closed old container and await the host callback that clears document-scoped pending state and caches.
The helper discards pending state and version headers, disables loader caching, and forces driver snapshot and version fetches to use `FetchSource.noCache`.
It verifies the restored boundary in the downloaded catalog before starting the runtime.
An older boundary, a mismatched ID at the same sequence number, a missing catalog, or failed host eviction rejects the load.
Pass an unversioned document URL; a version embedded in the URL can still pin the request and will be rejected if stale.
This does not assume ODSP's fire-and-forget cache eviction on error disposal has finished.
ODSP live-service validation remains required; local and Tinylicious tests do not establish that service's restore authorization or cache semantics.

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

<!-- markdown-magic:begin {"transform":"readme-footer","headingLevel":2} -->
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

- The configuration works but needs official support.
- The configuration does not work and requires changes.

### Supported Runtimes

- Fluid Framework supports Node.js versions 22 and 24 while they receive [upstream support](https://nodejs.org/en/about/previous-releases).
  - Fluid Framework will stop support for version 22 [when upstream support ends on 2027-04-30](https://github.com/nodejs/release#release-schedule).
  - Fluid Framework does not support Node.js with the `--no-experimental-fetch` flag.
- Fluid Framework supports modern browsers that support the ES2022 standard library.

### Supported Tools

- [TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0):
  - Fluid Framework supports all [`strict`](https://www.typescriptlang.org/tsconfig) options.
  - Set the build targets (`lib`, `target`) to `ES2022` or later.
  - Enable [`strictNullChecks`](https://www.typescriptlang.org/tsconfig).
  - Fluid Framework does not support [configuration options deprecated in TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0#breaking-changes-and-deprecations-in-typescript-6-0).
  - Fluid Framework does not fully support `exactOptionalPropertyTypes`.
    If you enable this option, do not use `in`, `Reflect.has`, `Object.hasOwn`, or `Object.prototype.hasOwnProperty` to narrow members of Fluid Framework types.
    These methods can incorrectly exclude `undefined` from the possible values.
- [webpack](https://webpack.js.org/) 5
  - We do not require a specific bundler.
    Other bundlers that handle ES Modules can work, but we actively test only webpack.

### Module Resolution

In TypeScript `compilerOptions`, use [`Node16`, `Node20`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) module resolution.
These settings follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).

Do not use `Node10` module resolution.

### Module Formats

- ES Modules:
  Use ES Modules to consume Fluid Framework client packages, including in Node.js.
- CommonJS:
  Fluid Framework does not officially support CommonJS in version 3.0 or later.

## Contribution Guidelines

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

- Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
- [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
- Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
- [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [repo documentation](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact <opencode@microsoft.com>.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Read the [Fluid Framework documentation](https://fluidframework.com/docs/) for information about Fluid Framework concepts and APIs.

To request information that the documentation does not contain, [create an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->
<!-- markdown-magic:end -->
