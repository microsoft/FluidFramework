/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IJSONSegment,
    ISegment,
    matchProperties,
    MergeTreeDeltaType,
    PropertySet,
    ReferenceType,
    TrackingGroup,
} from "@microsoft/fluid-merge-tree";
import { SequenceDeltaEvent, SharedSegmentSequence } from "@microsoft/fluid-sequence";
import { IRevertable, UndoRedoStackManager } from "./undoRedoStackManager";

/**
 * A shared sequence undo redo handler that will add sequences changes to the provided
 * undo redo stack manager
 */
export class SharedSequenceUndoRedoHandler {

    constructor(private readonly stackManager: UndoRedoStackManager) {
     }

    public attachSequence<T extends ISegment>(sequence: SharedSegmentSequence<T>) {
        sequence.on("sequenceDelta", this.sequenceDeltaHandler);
    }

    public detachSequence<T extends ISegment>(sequence: SharedSegmentSequence<T>) {
        sequence.removeListener("sequenceDelta", this.sequenceDeltaHandler);
    }

    private readonly sequenceDeltaHandler = (event: SequenceDeltaEvent, target: SharedSegmentSequence<ISegment>) => {
        if (event.isLocal) {
            this.stackManager.push(new SharedSequenceRevertable(event, target));
        }
    }
}

/**
 * Tracks a change on a shared sequence and allows reverting it
 */
export class SharedSequenceRevertable implements IRevertable {

    private readonly tracking: { trackingGroup: TrackingGroup, propertyDelta: PropertySet }[];

    constructor(
        public readonly event: SequenceDeltaEvent,
        public readonly sequence: SharedSegmentSequence<ISegment>,
    ) {
        const tracking: { trackingGroup: TrackingGroup, propertyDelta: PropertySet }[] = [];
        if (event.ranges.length > 0) {
            let current = { trackingGroup: new TrackingGroup(), propertyDelta: event.ranges[0].propertyDeltas };
            tracking.push(current);
            current.trackingGroup.link(event.ranges[0].segment);
            for (let i = 1; i < event.ranges.length; i++) {
                if (matchProperties(current.propertyDelta, event.ranges[i].propertyDeltas)) {
                    current.trackingGroup.link(event.ranges[i].segment);
                } else {
                    const tg = new TrackingGroup();
                    tg.link(event.ranges[i].segment);
                    current = { trackingGroup: tg, propertyDelta: event.ranges[i].propertyDeltas };
                    tracking.push(current);
                }
            }
        }
        this.tracking = tracking;
    }

    public revert() {
        const sequence = this.sequence;

        this.tracking.forEach((tracked) => {
            while (tracked.trackingGroup.size > 0) {
                const sg = tracked.trackingGroup.segments[0];
                sg.trackingCollection.unlink(tracked.trackingGroup);
                switch (this.event.deltaOperation) {
                    case MergeTreeDeltaType.INSERT:
                        if (sg.removedSeq === undefined) {
                            const start = sequence.getPosition(sg);
                            this.sequence.removeRange(start, start + sg.cachedLength);
                        }
                        break;

                    case MergeTreeDeltaType.REMOVE:
                        const insertSegment = this.sequence.segmentFromSpec(sg.toJSONObject() as IJSONSegment);
                        this.sequence.insertAtReferencePosition(
                                this.sequence.createPositionReference(sg, 0, ReferenceType.Transient),
                                insertSegment);
                        sg.trackingCollection.trackingGroups.forEach((tg) => {
                            tg.link(insertSegment);
                            tg.unlink(sg);
                        });
                        break;

                    case MergeTreeDeltaType.ANNOTATE:
                        if (sg.removedSeq === undefined) {
                            const start = sequence.getPosition(sg);
                            this.sequence.annotateRange(
                                    start,
                                    start + sg.cachedLength,
                                    tracked.propertyDelta,
                                    undefined);
                        }
                    default:
                        throw new Error("operationt type not revertable");
                }
            }
        });
    }

    public disgard() {
        this.tracking.forEach((tracked) => tracked.trackingGroup.segments.forEach(
            (sg) => sg.trackingCollection.unlink(tracked.trackingGroup)));
    }
}
