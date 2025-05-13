# @fluidframework/matrix

SharedMatrix is a rectangular 2D array of values. Matrix values are a superset of JSON serializable types that includes embedded IFluidHandle references to Fluid object.

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
npm i @fluidframework/matrix
```

## Importing from this package

This package leverages [package.json exports](https://nodejs.org/api/packages.html#exports) to separate its APIs by support level.
For more information on the related support guarantees, see [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

To access the `public` ([SemVer](https://semver.org/)) APIs, import via `@fluidframework/matrix` like normal.

To access the `legacy` APIs, import via `@fluidframework/matrix/legacy`.

## API Documentation

API documentation for **@fluidframework/matrix** is available at <https://fluidframework.com/docs/apis/matrix>.

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

Shared Matrix allows to make to make one way switch from LWW to FWW. This is introduced in order to handle conflict
when multiple clients at once initialize a cell. Using FWW, will help clients to receive a `conflict` event in case
their change was rejected. They can resolve conflict with the new information that they received in the event.
This event is only emitted when the SetCell Resolution Policy is First Write Win(FWW). This is emitted when two clients
race and send changes without observing each other changes, the changes that gets sequenced last would be rejected, and
only client who's changes rejected would be notified via this event, with expectation that it will merge its changes
back by accounting new information (state from winner of the race).

Some cases which documents how the Set op changes are applied or rejected during LWW -> FWW switch as some clients will
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

These are the platform requirements for the current version of Fluid Framework Client Packages.
These requirements err on the side of being too strict since within a major version they can be relaxed over time, but not made stricter.
For Long Term Support (LTS) versions this can require supporting these platforms for several years.

It is likely that other configurations will work, but they are not supported: if they stop working, we do not consider that a bug.
If you would benefit from support for something not listed here, file an issue and the product team will evaluate your request.
When making such a request please include if the configuration already works (and thus the request is just that it becomes officially supported), or if changes are required to get it working.

### Supported Runtimes

-   NodeJs ^20.10.0 except that we will drop support for it [when NodeJs 20 loses its upstream support on 2026-04-30](https://github.com/nodejs/release#release-schedule), and will support a newer LTS version of NodeJS (22) at least 1 year before 20 is end-of-life. This same policy applies to NodeJS 22 when it is end of life (2027-04-30).
    -   Running Fluid in a Node.js environment with the `--no-experimental-fetch` flag is not supported.
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
