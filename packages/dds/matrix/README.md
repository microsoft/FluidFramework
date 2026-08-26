# @fluidframework/matrix

SharedMatrix is a rectangular 2D array of values. Matrix values are a superset of JSON serializable types that includes embedded IFluidHandle references to Fluid object.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

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
npm i @fluidframework/matrix
```

## Importing from this package

This package uses [package.json exports](https://nodejs.org/api/packages.html#exports) to separate APIs by support level.
For information about the support guarantees, read [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

Import the `public` ([Semantic Versioning (SemVer)](https://semver.org/)) APIs from `@fluidframework/matrix`.

Import the `legacy` APIs from `@fluidframework/matrix/legacy`.

## API Documentation

Read the **@fluidframework/matrix** API documentation at <https://fluidframework.com/docs/apis/matrix>.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Operations

The SharedMatrix currently supports the following operations:

-   `insertCols(col, numCols)` / `removeCols(col, numCols)`
-   `insertRows(row, numRows)` / `removeRows(row, numRows)`
-   `setCells(row, col, numCols, values)` (values is a 1D array in row-major order)

Insertion / removal operations are reconciled using Fluid sequence semantics, while setCells() uses Fluid map semantics.

## Implementation

The SharedMatrix data structure is comprised of:

-   Two 'PermutationVectors', which are used to process row/col insertion and removal ops
-   A sparse quadtree-like "physical store" for holding the cell values

### Permutation Vectors

The 'PermutationVectors' provide a layer of indirection between the current logical row/col (e.g., `R2`) and the `[x,y]`
coordinate in the physical store where the cell value is stored.

For example, to store the following matrix:

```
                        A B C D <- logical col
                      +--------
                    1 | . . . 3
    logical row ->  2 | . . . .
                    3 | 8 . . .
                    4 | C . . F
```

The SparseMatrix allocates 3 rows and 2 columns from the physical storage:

```
                     0 . . 1 <- column allocs
                   +--------
                 0 | . . . 3
                 . | . . . .
   row allocs -> 1 | 8 . . .
                 2 | C . . F
```

And writes the cell values to these locations:

```
                    0 1 <- physical col
                  +----
                0 | . 3
physical row -> 1 | 8 .
                2 | C F
```

The next row/column to be inserted is assigned the next available physical address, regardless of
where the row/col was logically inserted. Deleted rows/cols are recycled after clearing the physical store.

This indirection between logical row/col and storage row/col provides three functions:

1. It is used to elide empty rows & cols, increasing the storage density.
2. It avoids copying cell values when rows/cols are inserted and removed (just the logical -> storage vector is
   updated).
3. It enables us to "time-travel" to previous matrix versions when reconciling ops from remote clients.

To support reconciliation, we use a MergeTree for each PermutationVector. MergeTree is a B-Tree of order 7 that
temporarily maintains some extra metadata to reconcile ops while they are within the current collab window.

### Physical Storage

Cell data is stored in a quadtree-like data structure that is a recursive subdivision of 16x16 tiles. The
implementation leverages [Morton coding](https://en.wikipedia.org/wiki/Z-order_curve) to implement this as a cascade of
fast 1D array accesses.

```ts
const keyHi = r0c0ToMorton2x16(row >>> 16, col >>> 16);
const keyLo = r0c0ToMorton2x16((row << 16) >>> 16, (col << 16) >>> 16);

const level0 = this.root[keyHi];
if (level0 !== undefined) {
	const level1 = level0[byte0(keyLo)];
	if (level1 !== undefined) {
		const level2 = level1[byte1(keyLo)];
		if (level2 !== undefined) {
			const level3 = level2[byte2(keyLo)];
			if (level3 !== undefined) {
				return level3[byte3(keyLo)];
			}
		}
	}
}
return undefined; // Empty region
```

A benefit of storing the cell data in [Z-order](https://en.wikipedia.org/wiki/Z-order_curve) is that both row-major and
col-major traversal benefit from prefetching and cache coherence. Reading/writing to the physical storage along either
axis is typically within an order of magnitude compared to sequentially accessing a cache hot native JavaScript array.

### Switching From Last Write Win(LWW) to First Write Win(FWW) mode

Shared Matrix allows a one-way switch from LWW to FWW. This is introduced in order to handle conflict
when multiple clients at once initialize a cell. Using FWW, will help clients to receive a `conflict` event in case
their change was rejected. They can resolve conflicts with the new information that they received in the event.
This event is only emitted when the SetCell Resolution Policy is First Write Win(FWW). This is emitted when two clients
race and send changes without observing each other changes, the changes that gets sequenced last would be rejected, and
only client whose changes were rejected would be notified via this event, with expectation that it will merge its changes
back by accounting new information (state from winner of the race).

Some cases which document how the Set op changes are applied or rejected during LWW -> FWW switch as some clients will
be in FWW mode and some will in LWW mode. When app calls `switchSetCellPolicy` the policy is changed to FWW mode
immediately and then later communicated to other clients via next SetOp which is made on the matrix.

**Case 1:** When all clients have switched to FWW mode, then any race between 2 Set Op, will result in a `conflict` event
at the loser client until it receives its own latest Set op. For example, client has sent op for cell C1. It receives remote
ops R1 and R2 for cell C1. It will first raise `conflict` event when it receives R1 and then another `conflict` event when
it receives R2. This will keep happening until it receives its own op, so that its changes are not lost due to conflict.

**Case 2:** Client switches policy to FWW locally. No SetOp is made yet. This client has no pending changes yet. On receiving
remote Set ops, this client will apply them all.

**Case 3:** Client switches policy to FWW locally. This client has pending changes for cell C1. On
receiving remote LWW Set op for C1, this client will reject it as its own op will finally be applied. So the first FWW
SetOp is still treated as LWW op in a way. Now lets say it has received a remote FWW op for C1 instead of a LWW op, then
the remote op would have been applied causing client's policy to shift to FWW with that op. It will also raise a conflict
event locally as its Op for cell c1 will be rejected by other clients as it is a loser op.

**Case 4:** In FWW mode, when there is no conflict, clients will still be able to overwrite cells. We track the sequence
number for each cell when it was last edited and also track the clientId which made that change. If the receive a Op for
cell C1, and its ref Sequence number is >= to sequence number at which it was last edited, then the cell would be
overwritten. Otherwise, if the same client made the changes, then the op will still be applied as the client knew about
the previous edit.

**Case 5: Reconnection:** When a client makes an op in LWW mode in disconnected state for cell C1, then when it comes online
later on, and catches up it sees a FWW op for C1, it will raise a `conflict` event for C1 and will not send it own op.
It can receive many ops for C1 during catchup and will raise `conflict` event for each of those in case they are winner
ops for C1.

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

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

-   Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
-   Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [Fluid Framework wiki](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact [opencode@microsoft.com](mailto:opencode@microsoft.com).

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
When you use these trademarks or logos, follow Microsoft's [Trademark and Brand Guidelines](https://www.microsoft.com/trademarks).
Do not use Microsoft trademarks or logos in a modified version of this project if the use causes confusion or implies Microsoft sponsorship.

## Help

Read the [Fluid Framework documentation](https://fluidframework.com/docs/) for information about Fluid Framework concepts and APIs.

To request information that the documentation does not contain, [create an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
