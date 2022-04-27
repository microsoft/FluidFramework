/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    IJSONSegment,
    ISegment,
    LocalReference,
    matchProperties,
    MergeTreeDeltaOperationType,
    MergeTreeDeltaType,
    PropertySet,
    ReferenceType,
    TrackingGroup,
} from "@fluidframework/merge-tree";
import { SequenceDeltaEvent, SharedSegmentSequence } from "@fluidframework/sequence";
import { IRevertible, UndoRedoStackManager } from "./undoRedoStackManager";

/**
 * A shared segment sequence undo redo handler that will add all local sequences changes to the provided
 * undo redo stack manager
 */
export class SharedSegmentSequenceUndoRedoHandler {
    // eslint-disable-next-line max-len
    private readonly sequences = new Map<SharedSegmentSequence<ISegment>, SharedSegmentSequenceRevertible | undefined>();

    constructor(private readonly stackManager: UndoRedoStackManager) {
        this.stackManager.on("changePushed", () => this.sequences.clear());
    }

    public attachSequence<T extends ISegment>(sequence: SharedSegmentSequence<T>) {
        sequence.on("sequenceDelta", this.sequenceDeltaHandler);
    }

    public detachSequence<T extends ISegment>(sequence: SharedSegmentSequence<T>) {
        sequence.removeListener("sequenceDelta", this.sequenceDeltaHandler);
    }

    private readonly sequenceDeltaHandler = (event: SequenceDeltaEvent, target: SharedSegmentSequence<ISegment>) => {
        if (event.isLocal) {
            let revertible = this.sequences.get(target);
            if (revertible === undefined) {
                revertible = new SharedSegmentSequenceRevertible(target);
                this.stackManager.pushToCurrentOperation(revertible);
                this.sequences.set(target, revertible);
            }
            revertible.add(event);
        }
    };
}

interface ITrackedSharedSegmentSequenceRevertible {
    trackingGroup: TrackingGroup;
    propertyDelta: PropertySet;
    operation: MergeTreeDeltaOperationType;
}

/**
 * Tracks a change on a shared segment sequence and allows reverting it
 */
export class SharedSegmentSequenceRevertible implements IRevertible {
    private readonly tracking: ITrackedSharedSegmentSequenceRevertible[];

    constructor(
        public readonly sequence: SharedSegmentSequence<ISegment>,
    ) {
        this.tracking = [];
    }

    public add(event: SequenceDeltaEvent) {
        if (event.ranges.length > 0) {
            let current = this.tracking.length > 0 ? this.tracking[this.tracking.length - 1] : undefined;
            for (const range of event.ranges) {
                let trackingGroup: TrackingGroup | undefined;
                if (current !== undefined
                    && current.operation === event.deltaOperation
                    && matchProperties(current.propertyDelta, range.propertyDeltas)) {
                    trackingGroup = current.trackingGroup;
                } else {
                    trackingGroup = new TrackingGroup();
                    current = {
                        trackingGroup,
                        propertyDelta: range.propertyDeltas,
                        operation: event.deltaOperation,
                    };
                    this.tracking.push(current);
                }
                let reference: LocalReference | undefined;
                if (event.deltaOperation === MergeTreeDeltaType.REMOVE) {
                    reference = this.sequence.createPositionReference(range.segment, 0, ReferenceType.SlideOnRemove);
                }
                trackingGroup.link(range.segment, reference);
            }
        }
    }

    public revert() {
        while (this.tracking.length > 0) {
            const tracked = this.tracking.pop();
            if (tracked !== undefined) {
                while (tracked.trackingGroup.size > 0) {
                    const segRef = tracked.trackingGroup.segmentAndReferences[0];
                    const sg = segRef.segment;
                    sg.trackingCollection.unlink(tracked.trackingGroup);
                    switch (tracked.operation) {
                        case MergeTreeDeltaType.INSERT:
                            if (sg.removedSeq === undefined) {
                                const start = this.sequence.getPosition(sg);
                                this.sequence.removeRange(start, start + sg.cachedLength);
                            }
                            break;

                        case MergeTreeDeltaType.REMOVE:
                            const insertSegment = this.sequence.segmentFromSpec(sg.toJSONObject() as IJSONSegment);
                            assert(!!segRef.reference, "Reference must be defined");
                            this.sequence.insertAtReferencePosition(segRef.reference, insertSegment);
                            this.sequence.removeLocalReference(segRef.reference);
                            sg.trackingCollection.trackingGroups.forEach((tg) => {
                                tg.link(insertSegment);
                                tg.unlink(sg);
                            });
                            break;

                        case MergeTreeDeltaType.ANNOTATE:
                            if (sg.removedSeq === undefined) {
                                const start = this.sequence.getPosition(sg);
                                this.sequence.annotateRange(
                                    start,
                                    start + sg.cachedLength,
                                    tracked.propertyDelta,
                                    undefined);
                            }
                            break;
                        default:
                            throw new Error("operation type not revertible");
                    }
                }
            }
        }
    }

    public discard() {
        while (this.tracking.length > 0) {
            const tracked = this.tracking.pop();
            if (tracked !== undefined) {
                while (tracked.trackingGroup.size > 0) {
                    tracked.trackingGroup.unlink(tracked.trackingGroup.segments[0]);
                }
            }
        }
    }
}
