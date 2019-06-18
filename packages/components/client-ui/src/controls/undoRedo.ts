/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap, IValueChanged, SharedMap } from "@prague/map";
import {
    createGroupOp,
    IMergeTreeOp,
    ISegment,
    matchProperties,
    MergeTreeDeltaType,
    PropertySet,
    Stack,
    TrackingGroup,
} from "@prague/merge-tree";
import { SequenceDeltaEvent, SharedSegmentSequence} from "@prague/sequence";

enum UndoRedoMode {None, Redo, Undo}

export class UndoRedoStackManager {

    private static revert(
        revertStack: Stack<Stack<IRevertable>>,
        pushStack: Stack<Stack<IRevertable>>,
    ) {
        // close the pushStack, as it could get  new ops
        // from the revert, and we don't want those combined
        // with any existing operation
        this.closeCurrentOperationIfInProgress(pushStack);

        // search the revert stack for the first defined operation stack
        while (!revertStack.empty() && !revertStack.top()) {
            revertStack.pop();
        }

        // if there is a defined operation stack, revert it
        if (revertStack.top()) {
            const operationStack = revertStack.pop();
            while (!operationStack.empty()) {
                operationStack.pop().revert();
            }
        }

        // make sure both stacks have any open operations
        // closed, since we won't want anything added to those
        //
        this.closeCurrentOperationIfInProgress(revertStack);
        this.closeCurrentOperationIfInProgress(pushStack);
    }

    private static closeCurrentOperationIfInProgress(stack: Stack<Stack<IRevertable>>) {
        if (stack.top()) {
            stack.push(undefined);
        }
    }

    private readonly undoStack = new Stack<Stack<IRevertable>>();
    private readonly redoStack = new Stack<Stack<IRevertable>>();
    private mode: UndoRedoMode = UndoRedoMode.None;

    public attachSequence<T extends ISegment>(sequence: SharedSegmentSequence<T>) {
        sequence.on("sequenceDelta", this.sequenceDeltaHandler);
        this.attachMap(sequence);
    }

    public detachSequence<T extends ISegment>(sequence: SharedSegmentSequence<T>) {
        sequence.removeListener("sequenceDelta", this.sequenceDeltaHandler);
        this.detachMap(sequence);
    }

    public attachMap(map: ISharedMap) {
        map.on("valueChanged", this.mapDeltaHandler);
    }
    public detachMap(map: ISharedMap) {
        map.removeListener("valueChanged", this.mapDeltaHandler);
    }

    public closeCurrentOperation() {
        if (this.mode === UndoRedoMode.None) {
            UndoRedoStackManager.closeCurrentOperationIfInProgress(this.undoStack);
        }
    }

    public undo() {
        this.mode = UndoRedoMode.Undo;
        UndoRedoStackManager.revert(
            this.undoStack,
            this.redoStack);
        this.mode = UndoRedoMode.None;
    }

    public redo() {
        this.mode = UndoRedoMode.Redo;
        UndoRedoStackManager.revert(
            this.redoStack,
            this.undoStack);
        this.mode = UndoRedoMode.None;
    }

    private readonly sequenceDeltaHandler = (event: SequenceDeltaEvent, target: SharedSegmentSequence<ISegment>) => {
        if (event.isLocal) {
            if (event.opArgs.groupOp
                && event.opArgs.op === event.opArgs.groupOp.ops[0]) {
                this.closeCurrentOperation();
            }
            this.handleLocalRevertableOperation(new SequenceUndoRedo(event, target));
            if (event.opArgs.groupOp
                && event.opArgs.op === event.opArgs.groupOp.ops[event.opArgs.groupOp.ops.length - 1]) {
                this.closeCurrentOperation();
            }
        }
    }

    private readonly mapDeltaHandler = (changed: IValueChanged, local: boolean, target: SharedMap) => {
        if (local) {
            this.handleLocalRevertableOperation(new MapUndoRedo(changed, target));
        }
    }

    private handleLocalRevertableOperation<T extends IRevertable>(revetable: T) {

        let currentStack: Stack<Stack<IRevertable>>;

        switch (this.mode) {
            case UndoRedoMode.None:
                currentStack = this.undoStack;
                this.clearRedoStack();
                break;

            case UndoRedoMode.Redo:
                currentStack = this.undoStack;
                break;

            case UndoRedoMode.Undo:
                currentStack = this.redoStack;
                break;
        }
        if (!currentStack.top()) {
            currentStack.push(new Stack<IRevertable>());
        }
        currentStack.top().push(revetable);
    }

    private clearRedoStack() {
        while (!this.redoStack.empty()) {
            const redoOpertion = this.redoStack.pop();
            while (redoOpertion && !redoOpertion.empty()) {
                redoOpertion.pop().disgard();
            }
        }
    }
}

interface IRevertable {
    revert();
    disgard();
}

class SequenceUndoRedo implements IRevertable {

    private readonly tracking: Array<{ trackingGroup: TrackingGroup, propertyDelta: PropertySet }>;

    constructor(
        public readonly event: SequenceDeltaEvent,
        public readonly sequence: SharedSegmentSequence<ISegment>,
    ) {
        const tracking: Array<{ trackingGroup: TrackingGroup, propertyDelta: PropertySet }> = [];
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
        const mergeTree = this.sequence.client.mergeTree;
        const ops: IMergeTreeOp[] = [];

        this.tracking.forEach((tracked) => {
            while (tracked.trackingGroup.size > 0) {
                const sg = tracked.trackingGroup.segments[0];
                sg.trackingCollection.unlink(tracked.trackingGroup);
                switch (this.event.deltaOperation) {
                    case MergeTreeDeltaType.INSERT:
                        if (!sg.removedSeq) {
                            const start =
                                mergeTree.getOffset(
                                    sg,
                                    mergeTree.collabWindow.currentSeq,
                                    mergeTree.collabWindow.clientId);
                            const removeOp = this.sequence.client.removeRangeLocal(
                                start,
                                start + sg.cachedLength);
                            if (removeOp) {
                                ops.push(removeOp);
                            }
                        }
                        break;

                    case MergeTreeDeltaType.REMOVE:
                        const insertSegment = this.sequence.segmentFromSpec(sg.toJSONObject());
                        const insertOp = this.sequence.client.insertSiblingSegment(sg, insertSegment);
                        if (insertOp) {
                            ops.push(insertOp);
                        }
                        sg.trackingCollection.trackingGroups.forEach((tg) => {
                            tg.link(insertSegment);
                            tg.unlink(sg);
                        });
                        break;

                    case MergeTreeDeltaType.ANNOTATE:
                        if (!sg.removedSeq) {
                            const start =
                                mergeTree.getOffset(
                                    sg,
                                    mergeTree.collabWindow.currentSeq,
                                    mergeTree.collabWindow.clientId);
                            const annnotateOp =
                                this.sequence.client.annotateRangeLocal(
                                    start,
                                    start + sg.cachedLength,
                                    tracked.propertyDelta,
                                    undefined);
                            if (annnotateOp) {
                                ops.push(annnotateOp);
                            }
                        }
                        break;
                }
            }
        });

        if (ops.length > 0) {
            this.sequence.submitSequenceMessage(createGroupOp(...ops));
        }
    }

    public disgard() {
        this.tracking.forEach((tracked) => tracked.trackingGroup.segments.forEach(
            (sg) => sg.trackingCollection.unlink(tracked.trackingGroup)));
    }
}

class MapUndoRedo implements IRevertable {

    constructor(
        private readonly changed: IValueChanged,
        private readonly map: SharedMap,
    ) { }

    public revert() {
        this.map.set(this.changed.key, this.changed.previousValue);
    }

    public disgard() {
        return;
     }
}
