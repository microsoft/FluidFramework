import {
    Client,
    IMergeTreeDeltaCallbackArgs,
    IMergeTreeDeltaOpArgs,
    IMergeTreeSegmentPropertyDelta,
    ISegment,
    MergeTreeDeltaOperationType,
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
    private readonly sortedRanges: Lazy<ReadonlyArray<ISequenceDeltaRange>>;

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

        const findInsertionPoint =
            (ranges: ISequenceDeltaRange[], segment: ISegment, start?: number, end?: number): number => {
                if (ranges.length === 0) {
                    return 0;
                }
                if (start === undefined || end === undefined) {
                    return findInsertionPoint(ranges, segment, 0, ranges.length - 1);
                }
                const insertPoint = start + Math.floor((end - start) / 2);
                if (ranges[insertPoint].segment.ordinal > segment.ordinal) {
                    if (start === insertPoint) {
                        return insertPoint;
                    }
                    return findInsertionPoint(ranges, segment, start, insertPoint - 1);
                } else if (ranges[insertPoint].segment.ordinal < segment.ordinal) {
                    if (insertPoint === end) {
                        return insertPoint + 1;
                    }
                    return findInsertionPoint(ranges, segment, insertPoint + 1, end);
                }
                return insertPoint;
            };

        this.sortedRanges = new Lazy<ReadonlyArray<ISequenceDeltaRange>>(
            () => this.deltaArgs
                .deltaSegments
                .reduce<ISequenceDeltaRange[]>((pv, cv) => {
                    if (cv) {
                        const insertionPoint = findInsertionPoint(pv, cv.segment);
                        // see if the segment is new
                        const existing: ISequenceDeltaRange = pv[insertionPoint];
                        if (existing && existing.segment === cv.segment) {
                            existing.propertyDeltas.push(...cv.propertyDeltas);
                        } else {
                            const offset = this.mergeTreeClient.getOffset(cv.segment);
                            const newRange: ISequenceDeltaRange = {
                                offset,
                                operation: this.deltaArgs.operation,
                                propertyDeltas: cv.propertyDeltas,
                                segment: cv.segment,
                            };
                            pv.splice(insertionPoint, 0, newRange);
                        }
                    }
                    return pv;
                },
                    []));

        this.pStart = new Lazy<number>(
            () => {
                if (this.isEmpty) {
                    return undefined;
                }
                return this.sortedRanges.value[0].offset;
            });

        this.pEnd = new Lazy<number>(
            () => {
                if (this.isEmpty) {
                    return undefined;
                }
                const lastRange =
                    this.sortedRanges.value[this.sortedRanges.value.length - 1];

                return lastRange.offset + lastRange.segment.cachedLength;
            });
    }

    /**
     * The in-order ranges affected by this delta.
     * These may not be continous.
     */
    public get ranges(): ReadonlyArray<Readonly<ISequenceDeltaRange>> {
        return this.sortedRanges.value;
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
    propertyDeltas: IMergeTreeSegmentPropertyDelta[];
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
