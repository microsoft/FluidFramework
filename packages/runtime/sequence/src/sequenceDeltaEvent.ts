/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    Client,
    IMergeTreeDeltaCallbackArgs,
    IMergeTreeDeltaOpArgs,
    IMergeTreeMaintenanceCallbackArgs,
    ISegment,
    MergeTreeDeltaOperationType,
    MergeTreeMaintenanceType,
    PropertySet,
    SortedSegmentSet,
} from "@microsoft/fluid-merge-tree";

/**
 * Base class for SequenceDeltaEvent and SequenceMaintenanceEvent.
 *
 * The properties of this object and its sub-objects represent a point in time state
 * at the time the operation was applied. They will not take into any future modifications
 * performed to the underlying sequence and merge tree.
 */
export class SequenceEvent {
    public readonly isEmpty: boolean;
    public readonly deltaOperation: MergeTreeDeltaOperationType | MergeTreeMaintenanceType;
    private readonly sortedRanges: Lazy<SortedSegmentSet<ISequenceDeltaRange>>;
    private readonly pFirst: Lazy<ISequenceDeltaRange>;
    private readonly pLast: Lazy<ISequenceDeltaRange>;

    constructor(
        public readonly deltaArgs: IMergeTreeDeltaCallbackArgs | IMergeTreeMaintenanceCallbackArgs,
        private readonly mergeTreeClient: Client,
    ) {
        this.isEmpty = deltaArgs.deltaSegments.length === 0;
        this.deltaOperation = deltaArgs.operation;

        this.sortedRanges = new Lazy<SortedSegmentSet<ISequenceDeltaRange>>(
            () => {
                const set = new SortedSegmentSet<ISequenceDeltaRange>();
                this.deltaArgs.deltaSegments.forEach((delta) => {
                    const newRange: ISequenceDeltaRange = {
                        operation: this.deltaArgs.operation,
                        position: this.mergeTreeClient.getPosition(delta.segment),
                        propertyDeltas: delta.propertyDeltas,
                        segment: delta.segment,
                    };
                    set.addOrUpdate(newRange);
                });
                return set;
            });

        this.pFirst = new Lazy<ISequenceDeltaRange>(
            () => {
                if (this.isEmpty) {
                    return undefined;
                }
                return this.sortedRanges.value.items[0];
            });

        this.pLast = new Lazy<ISequenceDeltaRange>(
            () => {
                if (this.isEmpty) {
                    return undefined;
                }
                return this.sortedRanges.value.items[this.sortedRanges.value.size - 1];
            });
    }

    /**
     * The in-order ranges affected by this delta.
     * These may not be continous.
     */
    public get ranges(): ReadonlyArray<Readonly<ISequenceDeltaRange>> {
        return this.sortedRanges.value.items;
    }

    /**
     * The client id of the client that made the change which caused the delta event
     */
    public get clientId(): string {
        return this.mergeTreeClient.longClientId;
    }

    public get first(): ISequenceDeltaRange {
        return this.pFirst.value;
    }

    public get last(): ISequenceDeltaRange {
        return this.pLast.value;
    }
}

/**
 * The event object returned on sequenceDelta events.
 *
 * The properties of this object and its sub-objects represent a point in time state
 * at the time the operation was applied. They will not take into any future modifications
 * performed to the underlying sequence and merge tree.
 *
 * For group ops, each op will get it's own event, and the group op property will be set on the op args.
 *
 * Ops may get multiple events. For instance, as insert-replace will get a remove then an insert event.
 */
export class SequenceDeltaEvent extends SequenceEvent {
    public readonly isLocal: boolean;

    constructor(
        public readonly opArgs: IMergeTreeDeltaOpArgs,
        deltaArgs: IMergeTreeDeltaCallbackArgs,
        mergeTreeClient: Client,
    ) {
        super(deltaArgs, mergeTreeClient);
        this.isLocal = opArgs.sequencedMessage === undefined;
    }
}

/**
 * The event object returned on maintenance events.
 *
 * The properties of this object and its sub-objects represent a point in time state
 * at the time the operation was applied. They will not take into any future modifications
 * performed to the underlying sequence and merge tree.
 */
export class SequenceMaintenanceEvent extends SequenceEvent {
    constructor(
        deltaArgs: IMergeTreeMaintenanceCallbackArgs,
        mergeTreeClient: Client,
    ) {
        super(deltaArgs, mergeTreeClient);
    }
}

export interface ISequenceDeltaRange {
    operation: MergeTreeDeltaOperationType | MergeTreeMaintenanceType;
    position: number;
    segment: ISegment;
    propertyDeltas: PropertySet;
 }

class Lazy<T> {
    private pValue: T;
    private pEvaluated: boolean;
    constructor(private readonly valueGenerator: () => T) {
        this.pEvaluated = false;
    }

    public get evaluated(): boolean {
        return this.pEvaluated;
    }

    public get value(): T {
        if (!this.pEvaluated) {
            this.pEvaluated = true;
            this.pValue = this.valueGenerator();
        }
        return this.pValue;
    }
}
