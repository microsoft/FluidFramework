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
    MergeTreeDeltaOperationTypes,
    MergeTreeMaintenanceType,
    PropertySet,
    SortedSegmentSet,
} from "@fluidframework/merge-tree";

/**
 * Base class for SequenceDeltaEvent and SequenceMaintenanceEvent.
 *
 * The properties of this object and its sub-objects represent a point in time state
 * at the time the operation was applied. They will not take into any future modifications
 * performed to the underlying sequence and merge tree.
 */
export abstract class SequenceEvent<TOperation extends MergeTreeDeltaOperationTypes = MergeTreeDeltaOperationTypes> {
    public readonly isEmpty: boolean;
    public readonly deltaOperation: TOperation;
    private readonly sortedRanges: Lazy<SortedSegmentSet<ISequenceDeltaRange<TOperation>>>;
    private readonly pFirst: Lazy<ISequenceDeltaRange<TOperation>>;
    private readonly pLast: Lazy<ISequenceDeltaRange<TOperation>>;

    constructor(
        public readonly deltaArgs: IMergeTreeDeltaCallbackArgs<TOperation>,
        private readonly mergeTreeClient: Client,
    ) {
        this.isEmpty = deltaArgs.deltaSegments.length === 0;
        this.deltaOperation = deltaArgs.operation;

        this.sortedRanges = new Lazy<SortedSegmentSet<ISequenceDeltaRange<TOperation>>>(
            () => {
                const set = new SortedSegmentSet<ISequenceDeltaRange<TOperation>>();
                this.deltaArgs.deltaSegments.forEach((delta) => {
                    const newRange: ISequenceDeltaRange<TOperation> = {
                        operation: this.deltaArgs.operation,
                        position: this.mergeTreeClient.getPosition(delta.segment),
                        propertyDeltas: delta.propertyDeltas,
                        segment: delta.segment,
                    };
                    set.addOrUpdate(newRange);
                });
                return set;
            });

        this.pFirst = new Lazy<ISequenceDeltaRange<TOperation>>(
            () => {
                if (this.isEmpty) {
                    return undefined;
                }
                return this.sortedRanges.value.items[0];
            });

        this.pLast = new Lazy<ISequenceDeltaRange<TOperation>>(
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
    public get ranges(): readonly Readonly<ISequenceDeltaRange<TOperation>>[] {
        return this.sortedRanges.value.items;
    }

    /**
     * The client id of the client that made the change which caused the delta event
     */
    public get clientId(): string {
        return this.mergeTreeClient.longClientId;
    }

    public get first(): Readonly<ISequenceDeltaRange<TOperation>> {
        return this.pFirst.value;
    }

    public get last(): Readonly<ISequenceDeltaRange<TOperation>> {
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
 * Ops may get multiple events. For instance, an insert-replace will get a remove then an insert event.
 */
export class SequenceDeltaEvent extends SequenceEvent<MergeTreeDeltaOperationType> {
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
export class SequenceMaintenanceEvent extends SequenceEvent<MergeTreeMaintenanceType> {
    constructor(
        public readonly opArgs: IMergeTreeDeltaOpArgs | undefined,
        deltaArgs: IMergeTreeMaintenanceCallbackArgs,
        mergeTreeClient: Client,
    ) {
        super(deltaArgs, mergeTreeClient);
    }
}

export interface ISequenceDeltaRange<TOperation extends MergeTreeDeltaOperationTypes = MergeTreeDeltaOperationTypes> {
    operation: TOperation;
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
