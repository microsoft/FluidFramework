/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Serializable } from "@fluidframework/datastore-definitions";
import { TrackingGroup, MergeTreeDeltaOperationType, MergeTreeDeltaType } from "@fluidframework/merge-tree";
import { SharedMatrix } from "./matrix";
import { Handle, isHandleValid } from "./handletable";
import { PermutationSegment, PermutationVector } from "./permutationvector";
import { IUndoConsumer } from "./types";

export class VectorUndoProvider {
    constructor (
        private readonly manager: IUndoConsumer,
        private readonly undoInsert: (segment: PermutationSegment) => void,
        private readonly undoRemove: (segment: PermutationSegment) => void,
    ) { }

    public record(operation: MergeTreeDeltaOperationType, ranges: { segment: PermutationSegment, position: number }[]) {
        if (ranges.length > 0) {
            const trackingGroup = new TrackingGroup();
            for (const range of ranges) {
                trackingGroup.link(range.segment);
            }

            switch (operation) {
                case MergeTreeDeltaType.INSERT:
                    this.pushRevertible(trackingGroup, this.undoInsert);
                    break;

                case MergeTreeDeltaType.REMOVE: {
                    this.pushRevertible(trackingGroup, this.undoRemove);
                    break;
                }

                default:
                    assert.fail("operation type not revertible");
            }
        }
    }

    private pushRevertible(trackingGroup: TrackingGroup, callback: (segment: PermutationSegment) => void) {
        this.manager.pushToCurrentOperation({
            revert: () => {
                while (trackingGroup.size > 0) {
                    const sg = trackingGroup.segments[0] as PermutationSegment;
                    callback(sg);
                    sg.trackingCollection.unlink(trackingGroup);
                }
            },
            disgard: () => {
                while (trackingGroup.size > 0) {
                    trackingGroup.unlink(trackingGroup.segments[0]);
                }
            },
        });
    }
}

export class MatrixUndoProvider<T extends Serializable = Serializable> {
    constructor (
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

    cellSet(rowHandle: Handle, colHandle: Handle, oldValue: T) {
        assert(isHandleValid(rowHandle) && isHandleValid(colHandle));

        if (this.consumer !== undefined) {
            this.consumer.pushToCurrentOperation({
                revert: () => {
                    this.matrix.setCell(
                        this.rows.handleToPosition(rowHandle),
                        this.cols.handleToPosition(colHandle),
                        oldValue);
                },
                disgard: () => {},  // [sic]
            });
        }
    }
}
