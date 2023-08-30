# @fluidframework/matrix

SharedMatrix is a rectangular 2D array of values. Matrix values are a superset of JSON serializable types that includes embedded IFluidHandle references to Fluid object.

<!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE) -->

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
