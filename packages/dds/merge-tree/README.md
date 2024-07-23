# @fluidframework/merge-tree

MergeTree is not a complete DDS by itself, but provides a reusable data structure for DDSes that must maintain a
sequence of collaboratively edited items. MergeTree is used in both SharedSequence and SharedMatrix.

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on the Fluid Framework and packages within.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER:) -->

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
npm i @fluidframework/merge-tree
```

## Importing from this package

This package leverages [package.json exports](https://nodejs.org/api/packages.html#exports) to separate its APIs by support level.
For more information on the related support guarantees, see [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

To access the `public` ([SemVer](https://semver.org/)) APIs, import via `@fluidframework/merge-tree` like normal.

To access the `legacy` APIs, import via `@fluidframework/merge-tree/legacy`.

## API Documentation

API documentation for **@fluidframework/merge-tree** is available at <https://fluidframework.com/docs/apis/merge-tree>.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Operations

The three basic operations provided by MergeTree are:

-   `insert(start, segment)`
-   `remove(start, end)`
-   `annotate(start, end, propertySet)`

## Implementation

MergeTrees represent a sequence as an ordered list of segments.  Each segment contains one or more consecutive values in
the sequence. For example, a SharedString contains segments of characters:

```
["The cat"], [" sat on the mat."]
```

Traversing all segments in order produces the current sequence as understood by the local client.

```
"The cat sat on the mat."
```

(Note that how the items contained in the MergeTree are grouped into segments is a MergeTree implementation detail and
changes over time.)

### Local Operations

To process operations like insertion and removal, the MergeTree maps positions in the sequence to the containing segment
and offset of the position within the segment.  While the MergeTree implementation uses a B+Tree to accelerate this
mapping, to understand the semantics of the MergeTree it is easier to consider a naïve implementation that searches
for the containing (segment, offset) by walking all segments in order.  This naïve search subtracts the length of each
segment from the desired position until it reaches the segment that contains the remaining offset.

```
position 10 -> { segment: [" sat on the mat."], offset: 2 }
```

Initially considering only local edit operations, insertion and deletion work by inserting new segments or tombstoning
removed segments. Tombstoned segments retain their position in the sequence, but have a length of zero when traversing
the tree.

When an insertion/deletion occurs at a position contained within an existing segment the original segment is "split".
In the case of insertion, the newly inserted segment is inserted between the two halves of the original.  In the case of
removal, the removed part of the subdivided segment is tombstoned.

```
insert(12, "quietly") -> ["The cat"], [" sat "], ["quietly "], ["on the mat."]
remove(19, 30) -> ["The cat"], [" sat "], ["quietly"], [del: " "], [del: "on the mat"], ["."]
```

### Remote Operations

To support merging edit operations from remote clients, we need to extend our original search function
`(position) -> (segment, offset)` to account for the state of a remote client's MergeTree at the time the
remote client performed the operation on its MergeTree.

Conceptually, this is done by adjusting our naive linear search for the (segment, offset) in the following way:

-   Segments inserted "after" the remote client's operation are skipped (i.e., have length 0)
-   Segments tombstoned "after" the remote client's operation, but were inserted "prior" are included
    (i.e., have their original length prior to tombstoning.)

...where "after" means the remote client's MergeTree had not yet applied the operation that inserted and/or
tombstoned the segment.

For clients to be able to reason about which segment insertions/removals other clients have processed the
MergeTree we do two things:

1. The MergeTree tracks which client inserted/removed each segment and the sequence number (abbreviated "seq") assigned by the Fluid service to the
   insertion/removal operation.
2. When sending a MergeTree op, the client includes the last seq# it has processed from the Fluid service. This number
   is known as an op's "reference sequence number" or "refSeq#"

The 'client' and 'refSeq' become new arguments to our search function:

```
(client, refSeq, position) -> (segment, offset)
```

A segment was inserted and/or removed on the remote client at the time client sent the operation if either:

-   The referenced sequence number is greater than or equal the server-assigned sequence number of the operation
    that inserted/removed the segment.
-   The client sent the operation that resulted in insertion/removal. (In which case, the client hadn't yet received
    their sequenced op from the server but was aware of the insertion/removal because the client produced it locally.)

If both above conditions are false, then the insertion/removal happened "after" the remote operation, and
consequently should be ignored during the search.

Note that any locally applied operations that are still pending sequencing by the Fluid service are unknown to
remote clients and should be ignored when processing remote ops.

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER:) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Minimum Client Requirements

These are the platform requirements for the current version of Fluid Framework Client Packages.
These requirements err on the side of being too strict since within a major version they can be relaxed over time, but not made stricter.
For Long Term Support (LTS) versions this can require supporting these platforms for several years.

It is likely that other configurations will work, but they are not supported: if they stop working, we do not consider that a bug.
If you would benefit from support for something not listed here, file an issue and the product team will evaluate your request.
When making such a request please include if the configuration already works (and thus the request is just that it becomes officially supported), or if changes are required to get it working.

### Supported Runtimes

-   NodeJs ^20.10.0 except that we will drop support for it [when NodeJs 20 loses its upstream support on 2026-04-30](https://github.com/nodejs/release#release-schedule), and will support a newer LTS version of NodeJS (22) at least 1 year before 20 is end-of-life. This same policy applies to NodeJS 22 when it is end of life (2027-04-30).
-   Modern browsers supporting the es2022 standard library: in response to asks we can add explicit support for using babel to polyfill to target specific standards or runtimes (meaning we can avoid/remove use of things that don't polyfill robustly, but otherwise target modern standards).

### Supported Tools

-   TypeScript 5.4:
    -   All [`strict`](https://www.typescriptlang.org/tsconfig) options are supported.
    -   [`strictNullChecks`](https://www.typescriptlang.org/tsconfig) is required.
    -   [Configuration options deprecated in 5.0](https://github.com/microsoft/TypeScript/issues/51909) are not supported.
    -   `exactOptionalPropertyTypes` is currently not fully supported.
        If used, narrowing members of Fluid Framework types types using `in`, `Reflect.has`, `Object.hasOwn` or `Object.prototype.hasOwnProperty` should be avoided as they may incorrectly exclude `undefined` from the possible values in some cases.
-   [webpack](https://webpack.js.org/) 5
    -   We are not intending to be prescriptive about what bundler to use.
        Other bundlers which can handle ES Modules should work, but webpack is the only one we actively test.

### Module Resolution

[`Node16`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) resolution should be used with TypeScript compilerOptions to follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).
Node10 resolution is not supported as it does not support Fluid Framework's API structuring pattern that is used to distinguish stable APIs from those that are in development.

### Module Formats

-   ES Modules:
    ES Modules are the preferred way to consume our client packages (including in NodeJs) and consuming our client packages from ES Modules is fully supported.
-   CommonJs:
    Consuming our client packages as CommonJs is supported only in NodeJS and only for the cases listed below.
    This is done to accommodate some workflows without good ES Module support.
    If you have a workflow you would like included in this list, file an issue.
    Once this list of workflows motivating CommonJS support is empty, we may drop support for CommonJS one year after notice of the change is posted here.

    -   Testing with Jest (which lacks [stable ESM support](https://jestjs.io/docs/ecmascript-modules) due to [unstable APIs in NodeJs](https://github.com/nodejs/node/issues/37648))

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

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
