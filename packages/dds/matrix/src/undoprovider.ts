/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	MergeTreeDeltaType,
	MergeTreeDeltaRevertible,
	IMergeTreeDeltaCallbackArgs,
	appendToMergeTreeDeltaRevertibles,
	revertMergeTreeDeltaRevertibles,
	MergeTreeRevertibleDriver,
	discardMergeTreeDeltaRevertible,
	TrackingGroup,
} from "@fluidframework/merge-tree";
import { MatrixItem, SharedMatrix } from "./matrix";
import { Handle, isHandleValid } from "./handletable";
import { PermutationSegment, PermutationVector } from "./permutationvector";
import { IUndoConsumer } from "./types";

export class VectorUndoProvider {
	// 'currentGroup' and 'currentOp' are used while applying an IRevertable.revert() to coalesce
	// the recorded into a single IRevertable / tracking group as they move between the undo <->
	// redo stacks.
	private currentGroup?: MergeTreeDeltaRevertible[];
	private currentOp?: MergeTreeDeltaType;

	constructor(
		private readonly manager: IUndoConsumer,
		private readonly driver: MergeTreeRevertibleDriver,
	) {}

	public record(deltaArgs: IMergeTreeDeltaCallbackArgs) {
		if (deltaArgs.deltaSegments.length > 0) {
			// If we are in the process of reverting, the `IRevertible.revert()` will provide the tracking
			// group so that we can preserve the original segment ranges as a single op/group as we move
			// ops between the undo <-> redo stacks.f
			const revertibles: MergeTreeDeltaRevertible[] = this.currentGroup ?? [];
			appendToMergeTreeDeltaRevertibles(deltaArgs, revertibles);

			// For SharedMatrix, each IRevertibles always holds a single row/col operation.
			// Therefore, 'currentOp' must either be undefined or equal to the current op.
			assert(
				this.currentOp === undefined || this.currentOp === deltaArgs.operation,
				0x02a /* "On vector undo, unexpected 'currentOp' type/state!" */,
			);

			switch (deltaArgs.operation) {
				case MergeTreeDeltaType.REMOVE:
					if (this.currentOp !== deltaArgs.operation) {
						const trackingGroup = new TrackingGroup();
						deltaArgs.deltaSegments.forEach((d) =>
							d.segment.trackingCollection.link(trackingGroup),
						);
						this.pushRevertible(revertibles, trackingGroup);
					}
					break;
				case MergeTreeDeltaType.INSERT:
					if (this.currentOp !== deltaArgs.operation) {
						this.pushRevertible(revertibles);
					}
					break;

				default:
					throw new Error("operation type not revertible");
			}

			// If we are in the process of reverting, set 'currentOp' to remind ourselves not to push
			// another revertible until `IRevertable.revert()` finishes the current op and clears this
			// field.
			if (this.currentGroup !== undefined) {
				this.currentOp = deltaArgs.operation;
			}
		}
	}

	private pushRevertible(
		revertibles: MergeTreeDeltaRevertible[],
		removedTrackingGroup?: TrackingGroup,
	) {
		const reverter = {
			revert: () => {
				assert(
					this.currentGroup === undefined && this.currentOp === undefined,
					0x02b /* "Must not nest calls to IRevertible.revert()" */,
				);

				this.currentGroup = [];

				try {
					removedTrackingGroup?.tracked.forEach((t) => {
						t.trackingCollection.unlink(removedTrackingGroup);
						assert(t.isLeaf(), "foo");
						(t as PermutationSegment).reset();
					});
					revertMergeTreeDeltaRevertibles(this.driver, revertibles);
				} finally {
					this.currentOp = undefined;
					this.currentGroup = undefined;
				}
			},
			discard: () => {
				discardMergeTreeDeltaRevertible(revertibles);
				removedTrackingGroup?.tracked.forEach((t) =>
					t.trackingCollection.unlink(removedTrackingGroup),
				);
			},
		};

		this.manager.pushToCurrentOperation(reverter);

		return reverter;
	}
}

export class MatrixUndoProvider<T> {
	constructor(
		private readonly consumer: IUndoConsumer,
		private readonly matrix: SharedMatrix<T>,
		private readonly rows: PermutationVector,
		private readonly cols: PermutationVector,
	) {
		rows.undo = new VectorUndoProvider(consumer, {
			annotateRange() {
				throw new Error("not implemented");
			},
			insertFromSpec(pos, spec) {
				matrix._undoRemoveRows(pos, spec);
			},
			removeRange(start, end) {
				matrix.removeRows(start, end - start);
			},
		});
		cols.undo = new VectorUndoProvider(consumer, {
			annotateRange() {
				throw new Error("not implemented");
			},
			insertFromSpec(pos, spec) {
				matrix._undoRemoveCols(pos, spec);
			},
			removeRange(start, end) {
				matrix.removeCols(start, end - start);
			},
		});
	}

	cellSet(rowHandle: Handle, colHandle: Handle, oldValue: MatrixItem<T>) {
		assert(
			isHandleValid(rowHandle) && isHandleValid(colHandle),
			0x02c /* "On cellSet(), invalid row and/or column handles!" */,
		);

		if (this.consumer !== undefined) {
			this.consumer.pushToCurrentOperation({
				revert: () => {
					const row = this.rows.handleToPosition(rowHandle);
					const col = this.cols.handleToPosition(colHandle);
					// if the row/column no longer exists, we cannot set the cell
					if (
						row !== undefined &&
						row < this.matrix.rowCount &&
						col !== undefined &&
						col < this.matrix.colCount
					) {
						this.matrix.setCell(row, col, oldValue);
					}
				},
				discard: () => {},
			});
		}
	}
}
