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
