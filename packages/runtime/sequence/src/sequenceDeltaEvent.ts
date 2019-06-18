/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    Client,
    IMergeTreeDeltaCallbackArgs,
    IMergeTreeDeltaOpArgs,
    ISegment,
    MergeTreeDeltaOperationType,
    PropertySet,
    SortedSegmentSet,
} from "@prague/merge-tree";

/**
 * The event object returned on sequenceDelta events.
 *
 * The properties of this object and it's sub-objects represent a point in time state
 * at the time the operation was applied. They will not take into any future modifications
 *  performed to the undlying sequence and merge tree.
 *
 * For group ops, each op will get it's own event, and the group op property will be set on the op args.
 *
 * Ops may get multiple events. For instance, as insert-replace will get a remove then an insert event.
 */
export class SequenceDeltaEvent {

    public readonly isLocal: boolean;
    public readonly isEmpty: boolean;
    public readonly deltaOperation: MergeTreeDeltaOperationType;
    private readonly pStart: Lazy<number>;
    private readonly pEnd: Lazy<number>;
    private readonly sortedRanges: Lazy<SortedSegmentSet<ISequenceDeltaRange>>;

    constructor(
        public readonly opArgs: IMergeTreeDeltaOpArgs,
        public readonly deltaArgs: IMergeTreeDeltaCallbackArgs,
        private readonly mergeTreeClient: Client,
    ) {
        this.isLocal =
            this.deltaArgs.mergeTreeClientId ===
            this.deltaArgs.mergeTree.collabWindow.clientId;
        this.isEmpty = deltaArgs.deltaSegments.length === 0;
        this.deltaOperation = deltaArgs.operation;

        this.sortedRanges = new Lazy<SortedSegmentSet<ISequenceDeltaRange>>(
            () => {
                const set = new SortedSegmentSet<ISequenceDeltaRange>();
                this.deltaArgs.deltaSegments.forEach((delta) => {
                    const newRange: ISequenceDeltaRange = {
                        offset: this.mergeTreeClient.getOffset(delta.segment),
                        operation: this.deltaArgs.operation,
                        propertyDeltas: delta.propertyDeltas,
                        segment: delta.segment,
                    };
                    set.addOrUpdate(newRange);
                });
                return set;
            });

        this.pStart = new Lazy<number>(
            () => {
                if (this.isEmpty) {
                    return undefined;
                }
                return this.sortedRanges.value.items[0].offset;
            });

        this.pEnd = new Lazy<number>(
            () => {
                if (this.isEmpty) {
                    return undefined;
                }
                const lastRange =
                    this.sortedRanges.value.items[this.sortedRanges.value.size - 1];

                return lastRange.offset + lastRange.segment.cachedLength;
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

    public get start(): number {
        return this.pStart.value;
    }

    public get end(): number {
        return this.pEnd.value;
    }
}

export interface ISequenceDeltaRange {
    operation: MergeTreeDeltaOperationType;
    offset: number;
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
