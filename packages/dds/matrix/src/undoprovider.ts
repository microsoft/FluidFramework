/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	IMergeTreeDeltaCallbackArgs,
	ITrackingGroup,
	MergeTreeDeltaRevertible,
	MergeTreeDeltaType,
	MergeTreeRevertibleDriver,
	TrackingGroup,
	appendToMergeTreeDeltaRevertibles,
	discardMergeTreeDeltaRevertible,
	revertMergeTreeDeltaRevertibles,
} from "@fluidframework/merge-tree/internal";

import { Handle, isHandleValid } from "./handletable.js";
import { SharedMatrix } from "./matrix.js";
import { MatrixItem } from "./ops.js";
import { PermutationSegment, PermutationVector } from "./permutationvector.js";
import { IUndoConsumer } from "./types.js";

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

	public record(deltaArgs: IMergeTreeDeltaCallbackArgs): void {
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
				for (const d of deltaArgs.deltaSegments)
					d.segment.trackingCollection.link(trackingGroup);
			}

			switch (deltaArgs.operation) {
				case MergeTreeDeltaType.REMOVE:
				case MergeTreeDeltaType.INSERT: {
					if (this.currentOp !== deltaArgs.operation) {
						this.pushRevertible(revertibles, removeTrackingGroup);
					}
					break;
				}

				default: {
					throw new Error("operation type not revertible");
				}
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
	): {
		revert: () => void;
		discard: () => void;
	} {
		const reverter = {
			revert: (): void => {
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
			discard: (): void => {
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
			annotateRange(): void {
				throw new Error("not implemented");
			},
			insertFromSpec(pos, spec): void {
				matrix._undoRemoveRows(pos, spec);
			},
			removeRange(start, end): void {
				matrix.removeRows(start, end - start);
			},
		});
		cols.undo = new VectorUndoProvider(consumer, {
			annotateRange(): void {
				throw new Error("not implemented");
			},
			insertFromSpec(pos, spec): void {
				matrix._undoRemoveCols(pos, spec);
			},
			removeRange(start, end): void {
				matrix.removeCols(start, end - start);
			},
		});
	}

	cellSet(rowHandle: Handle, colHandle: Handle, oldValue: MatrixItem<T>): void {
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
