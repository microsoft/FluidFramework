# @fluidframework/merge-tree

MergeTree is not a complete DDS by itself, but provides a reusable data structure for DDSes that must maintain a
sequence of collaboratively edited items. MergeTree is used in both SharedSequence and SharedMatrix.

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on the Fluid Framework and packages within.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER:) -->

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
npm i @fluidframework/merge-tree
```

## Importing from this package

This package uses [package.json exports](https://nodejs.org/api/packages.html#exports) to separate APIs by support level.
For information about the support guarantees, read [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

Import the `public` APIs from `@fluidframework/merge-tree`.

Import the `legacy` APIs from `@fluidframework/merge-tree/legacy`.

## API Documentation

Read the **@fluidframework/merge-tree** API documentation at <https://fluidframework.com/docs/apis/merge-tree>.

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

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

-   Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
-   Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [repo documentation](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact [opencode@microsoft.com](mailto:opencode@microsoft.com).

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

<!-- AUTO-GENERATED-CONTENT:END -->
