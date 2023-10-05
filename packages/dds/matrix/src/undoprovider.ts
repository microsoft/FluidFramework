/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	MergeTreeDeltaType,
	MergeTreeDeltaRevertible,
	IMergeTreeDeltaCallbackArgs,
	appendToMergeTreeDeltaRevertibles,
	revertMergeTreeDeltaRevertibles,
	MergeTreeRevertibleDriver,
	discardMergeTreeDeltaRevertible,
	TrackingGroup,
	ITrackingGroup,
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
	private currentRemoveTrackingGroup?: TrackingGroup;

	constructor(
		private readonly manager: IUndoConsumer,
		private readonly driver: MergeTreeRevertibleDriver,
	) {}

	public record(deltaArgs: IMergeTreeDeltaCallbackArgs) {
		if (deltaArgs.deltaSegments.length > 0) {
			// If we are in the process of reverting, the `IRevertible.revert()` will provide the tracking
			// group so that we can preserve the original segment ranges as a single op/group as we move
			// ops between the undo <-> redo stacks.
			const revertibles: MergeTreeDeltaRevertible[] = this.currentGroup ?? [];
			appendToMergeTreeDeltaRevertibles(deltaArgs, revertibles);

			// For SharedMatrix, each IRevertibles always holds a single row/col operation.
			// Therefore, 'currentOp' must either be undefined or equal to the current op.
			assert(
				this.currentOp === undefined || this.currentOp === deltaArgs.operation,
				0x02a /* "On vector undo, unexpected 'currentOp' type/state!" */,
			);
			let removeTrackingGroup: TrackingGroup | undefined;
			if (deltaArgs.operation === MergeTreeDeltaType.REMOVE) {
				// for removed segment we need a tracking group.
				// this is for a few reason:
				// 1. the handle for the row/column on the removed segment is still allocated,
				//		and needs to be in order to process unacked ops sent before the remove.
				// 2. handles are freed on unlink(zamboni), but that also clears the row/column data.
				//		which we don't want to happen, so we can re-insert the cells when the row/col comes back.
				//		the tracking group prevents unlink.
				// 3. when we re-insert we need to find the old segment and clear their handles
				//		so the new segment takes them over. there is no efficient look-up for this.
				//		the tracking group provides one.
				const trackingGroup = (removeTrackingGroup =
					this.currentRemoveTrackingGroup ?? new TrackingGroup());
				deltaArgs.deltaSegments.forEach((d) =>
					d.segment.trackingCollection.link(trackingGroup),
				);
			}

			switch (deltaArgs.operation) {
				case MergeTreeDeltaType.REMOVE:
				case MergeTreeDeltaType.INSERT:
					if (this.currentOp !== deltaArgs.operation) {
						this.pushRevertible(revertibles, removeTrackingGroup);
					}
					break;

				default:
					throw new Error("operation type not revertible");
			}

			// If we are in the process of reverting, set 'currentOp' to remind ourselves not to push
			// another revertible until `IRevertable.revert()` finishes the current op and clears this
			// field.
			if (this.currentGroup !== undefined) {
				this.currentOp ??= deltaArgs.operation;
				this.currentRemoveTrackingGroup ??= removeTrackingGroup;
			}
		}
	}

	private pushRevertible(
		revertibles: MergeTreeDeltaRevertible[],
		removedTrackingGroup: ITrackingGroup | undefined,
	) {
		const reverter = {
			revert: () => {
				assert(
					this.currentGroup === undefined && this.currentOp === undefined,
					0x02b /* "Must not nest calls to IRevertible.revert()" */,
				);

				this.currentGroup = [];

				try {
					if (removedTrackingGroup !== undefined) {
						while (removedTrackingGroup.size > 0) {
							const tracked = removedTrackingGroup.tracked[0];
							removedTrackingGroup.unlink(tracked);
							// if there are groups tracked, this in a revert of a remove.
							// this means we are about to re-insert the row/column
							// with the same handle. We reuse the handle so the row/columns cells
							// get re-inserted too.
							// since a new segment will have the handle, we need to
							// remove it from the  removed segment which was tracked
							(tracked as PermutationSegment).reset();
						}
					}
					revertMergeTreeDeltaRevertibles(this.driver, revertibles);
				} finally {
					this.currentOp = undefined;
					this.currentGroup = undefined;
					this.currentRemoveTrackingGroup = undefined;
				}
			},
			discard: () => {
				if (removedTrackingGroup !== undefined) {
					while (removedTrackingGroup.size > 0) {
						removedTrackingGroup.unlink(removedTrackingGroup.tracked[0]);
					}
				}
				discardMergeTreeDeltaRevertible(revertibles);
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
					if (row < this.matrix.rowCount && col < this.matrix.colCount) {
						this.matrix.setCell(row, col, oldValue);
					}
				},
				discard: () => {},
			});
		}
	}
}
