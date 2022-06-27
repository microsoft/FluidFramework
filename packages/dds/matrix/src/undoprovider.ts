/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { TrackingGroup, MergeTreeDeltaOperationType, MergeTreeDeltaType } from "@fluidframework/merge-tree";
import { MatrixItem, SharedMatrix } from "./matrix";
import { Handle, isHandleValid } from "./handletable";
import { PermutationSegment, PermutationVector } from "./permutationvector";
import { IUndoConsumer } from "./types";

export class VectorUndoProvider {
    // 'currentGroup' and 'currentOp' are used while applying an IRevertable.revert() to coalesce
    // the recorded into a single IRevertable / tracking group as they move between the undo <->
    // redo stacks.
    private currentGroup?: TrackingGroup;
    private currentOp?: MergeTreeDeltaType;

    constructor(
        private readonly manager: IUndoConsumer,
        private readonly undoInsert: (segment: PermutationSegment) => void,
        private readonly undoRemove: (segment: PermutationSegment) => void,
    ) { }

    public record(operation: MergeTreeDeltaOperationType, ranges: { segment: PermutationSegment; }[]) {
        if (ranges.length > 0) {
            // Link each segment to a new TrackingGroup.  A TrackingGroup keeps track of the original
            // set of linked segments, including any fragmentatiton that occurs due to future splitting.
            //
            // A TrackingGroup also prevents removed segments from being unlinked from the tree during
            // Zamboni and guarantees segments will not be merged/coalesced with segments outside of the
            // current tracking group.
            //
            // These properties allow us to rely on MergeTree.getPosition() to find the locations/lengths
            // of all content contained within the tracking group in the future.

            // If we are in the process of reverting, the `IRevertible.revert()` will provide the tracking
            // group so that we can preserve the original segment ranges as a single op/group as we move
            // ops between the undo <-> redo stacks.
            const trackingGroup = this.currentGroup ?? new TrackingGroup();
            for (const range of ranges) {
                trackingGroup.link(range.segment);
            }

            // For SharedMatrix, each IRevertibles always holds a single row/col operation.
            // Therefore, 'currentOp' must either be undefined or equal to the current op.
            assert(this.currentOp === undefined || this.currentOp === operation,
                0x02a /* "On vector undo, unexpected 'currentOp' type/state!" */);

            switch (operation) {
                case MergeTreeDeltaType.INSERT:
                    if (this.currentOp !== MergeTreeDeltaType.INSERT) {
                        this.pushRevertible(trackingGroup, this.undoInsert);
                    }
                    break;

                case MergeTreeDeltaType.REMOVE: {
                    if (this.currentOp !== MergeTreeDeltaType.REMOVE) {
                        this.pushRevertible(trackingGroup, this.undoRemove);
                    }
                    break;
                }

                default:
                    throw new Error("operation type not revertible");
            }

            // If we are in the process of reverting, set 'currentOp' to remind ourselves not to push
            // another revertible until `IRevertable.revert()` finishes the current op and clears this
            // field.
            if (this.currentGroup !== undefined) {
                this.currentOp = operation;
            }
        }
    }

    private pushRevertible(trackingGroup: TrackingGroup, callback: (segment: PermutationSegment) => void) {
        const revertible = {
            revert: () => {
                assert(this.currentGroup === undefined && this.currentOp === undefined,
                    0x02b /* "Must not nest calls to IRevertible.revert()" */);

                this.currentGroup = new TrackingGroup();

                try {
                    while (trackingGroup.size > 0) {
                        const segment = trackingGroup.segments[0] as PermutationSegment;

                        // Unlink 'segment' from the current tracking group before invoking the callback
                        // to exclude the current undo/redo segment from those copied to the replacement
                        // segment (if any). (See 'PermutationSegment.transferToReplacement()')
                        segment.trackingCollection.unlink(trackingGroup);

                        callback(segment);
                    }
                } finally {
                    this.currentOp = undefined;
                    this.currentGroup = undefined;
                }
            },
            discard: () => {
                while (trackingGroup.size > 0) {
                    trackingGroup.unlink(trackingGroup.segments[0]);
                }
            },
        };

        this.manager.pushToCurrentOperation(revertible);

        return revertible;
    }
}

export class MatrixUndoProvider<T> {
    constructor(
        private readonly consumer: IUndoConsumer,
        private readonly matrix: SharedMatrix<T>,
        private readonly rows: PermutationVector,
        private readonly cols: PermutationVector,
    ) {
        rows.undo = new VectorUndoProvider(
            consumer,
            /* undoInsert: */ (segment: PermutationSegment) => {
                const start = this.rows.getPosition(segment);
                this.matrix.removeRows(start, segment.cachedLength);
            },
            /* undoRemove: */ (segment: PermutationSegment) => {
                this.matrix._undoRemoveRows(segment);
            },
        );
        cols.undo = new VectorUndoProvider(
            consumer,
            /* undoInsert: */ (segment: PermutationSegment) => {
                const start = this.cols.getPosition(segment);
                this.matrix.removeCols(start, segment.cachedLength);
            },
            /* undoRemove: */ (segment: PermutationSegment) => {
                this.matrix._undoRemoveCols(segment);
            },
        );
    }

    cellSet(rowHandle: Handle, colHandle: Handle, oldValue: MatrixItem<T>) {
        assert(isHandleValid(rowHandle) && isHandleValid(colHandle),
            0x02c /* "On cellSet(), invalid row and/or column handles!" */);

        if (this.consumer !== undefined) {
            this.consumer.pushToCurrentOperation({
                revert: () => {
                    this.matrix.setCell(
                        this.rows.handleToPosition(rowHandle),
                        this.cols.handleToPosition(colHandle),
                        oldValue);
                },
                discard: () => {},
            });
        }
    }
}
