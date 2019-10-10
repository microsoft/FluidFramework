/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IJSONSegment,
    ISegment,
    matchProperties,
    MergeTreeDeltaOperationType,
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

    private readonly sequences =
        new Map<SharedSegmentSequence<ISegment>, SharedSequenceRevertable | undefined>();

    constructor(private readonly stackManager: UndoRedoStackManager) {
        this.stackManager.on("operationClosed", () => this.sequences.clear());
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
            let revertable = this.sequences.get(target);
            if (revertable === undefined) {
                revertable = new SharedSequenceRevertable(target);
                this.stackManager.push(revertable);
                this.sequences.set(target, revertable);
            }
            revertable.add(event);
        }
    }
}

interface ITrackedSharedSequenceRevertable {
    trackingGroup: TrackingGroup;
    propertyDelta: PropertySet;
    operation: MergeTreeDeltaOperationType;
}

/**
 * Tracks a changes on a shared sequence and allows reverting them
 */
export class SharedSequenceRevertable implements IRevertable {

    private readonly tracking: ITrackedSharedSequenceRevertable[];

    constructor(
        public readonly sequence: SharedSegmentSequence<ISegment>,
    ) {
        this.tracking = [];
    }

    public add(event: SequenceDeltaEvent) {
        if (event.ranges.length > 0) {
            let current = this.tracking.length > 0 ? this.tracking[this.tracking.length - 1] : undefined;
            for (const range of event.ranges) {
                if (current !== undefined
                    && current.operation === event.deltaOperation
                    && matchProperties(current.propertyDelta, range.propertyDeltas)) {
                    current.trackingGroup.link(range.segment);
                } else {
                    const tg = new TrackingGroup();
                    tg.link(range.segment);
                    current = {
                            trackingGroup: tg,
                            propertyDelta: range.propertyDeltas,
                            operation: event.deltaOperation as MergeTreeDeltaOperationType,
                        };
                    this.tracking.push(current);
                }
            }
        }
    }

    public revert() {
        this.tracking.forEach((tracked) => {
            switch (tracked.operation) {
                case MergeTreeDeltaType.INSERT:
                    this.revertInsert(tracked);
                    break;

                case MergeTreeDeltaType.REMOVE:
                    this.revertRemove(tracked);
                    break;

                case MergeTreeDeltaType.ANNOTATE:
                    this.revertAnnotate(tracked);
                    break;

                default:
                    throw new Error("operation type not revertable");
            }
        });
    }

    public disgard() {
        this.tracking.forEach((tracked) => tracked.trackingGroup.segments.forEach(
            (sg) => sg.trackingCollection.unlink(tracked.trackingGroup)));
    }

    private revertInsert(tracked: ITrackedSharedSequenceRevertable) {
        this.coalesceTrackingGroupToRangesAndRevert(
            tracked.trackingGroup,
            (start, end) => this.sequence.removeRange(start, end));
    }

    private revertRemove(tracked: ITrackedSharedSequenceRevertable) {
        tracked.trackingGroup.segments.forEach((sg) => {
            sg.trackingCollection.unlink(tracked.trackingGroup);
            const insertSegment = this.sequence.segmentFromSpec(sg.toJSONObject() as IJSONSegment);
            this.sequence.insertAtReferencePosition(
                this.sequence.createPositionReference(sg, 0, ReferenceType.Transient),
                insertSegment);
            sg.trackingCollection.trackingGroups.forEach((tg) => {
                tg.link(insertSegment);
                tg.unlink(sg);
            });
        });
    }

    private revertAnnotate(tracked: ITrackedSharedSequenceRevertable) {
        this.coalesceTrackingGroupToRangesAndRevert(
            tracked.trackingGroup,
            (start, end) => this.sequence.annotateRange(
                start,
                end,
                tracked.propertyDelta,
                undefined));
    }

    private coalesceTrackingGroupToRangesAndRevert(
        trackingGroup: TrackingGroup,
        revertAction: (start: number, end: number) => void,
    ) {
        if (trackingGroup.size > 0) {
            let start = this.sequence.getPosition(trackingGroup.segments[0]);
            let end = start + trackingGroup.segments[0].cachedLength;
            trackingGroup.unlink(trackingGroup.segments[0]);
            while (trackingGroup.size > 0) {
                const segment = trackingGroup.segments[0];
                trackingGroup.unlink(segment);
                if (segment.removedSeq === undefined) {
                    const segStart = this.sequence.getPosition(segment);
                    const segEnd = segStart + segment.cachedLength;
                    if (end === segStart) {
                        end = segEnd;
                    } else {
                        revertAction(start, end);
                        start = segStart;
                        end = segEnd;
                    }
                }
            }
            revertAction(start, end);
        }
    }
}
