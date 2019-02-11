import {
    Client,
    IMergeTreeDeltaCallbackArgs,
    IMergeTreeDeltaOpCallbackArgs,
    ISegment,
    MergeTreeDeltaOperationType,
    MergeTreeDeltaType,
    SegmentType,
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

    private readonly sortedRanges: Lazy<Array<Lazy<{start: number; segment: ISegment}>>>;
    private readonly pStart: Lazy<number>;
    private readonly pEnd: Lazy<number>;
    private readonly pClientId: Lazy<string>;
    private readonly pRanges: Lazy<ISequenceDeltaRange[]>;

    constructor(
        public readonly opArgs: IMergeTreeDeltaOpCallbackArgs,
        public readonly mergeTreeClient: Client,
        public readonly deltaArgs: IMergeTreeDeltaCallbackArgs,
    ) {
        this.isLocal =
            this.deltaArgs.mergeTreeClientId ===
            this.deltaArgs.mergeTree.collabWindow.clientId;
        this.isEmpty = deltaArgs.segments.length === 0;
        this.deltaOperation = deltaArgs.operation;

        this.sortedRanges = new Lazy<Array<Lazy<{start: number; segment: ISegment}>>>(
            () => this.deltaArgs.segments.sort(
                    (a, b) => a.ordinal < b.ordinal ? -1 : (a.ordinal > b.ordinal ? 1 : 0))
                .map((segment) => new Lazy<{start: number; segment: ISegment}>(
                    () => {
                        const start = this.deltaArgs.mergeTree.getOffset(
                            segment,
                            this.deltaArgs.mergeTree.collabWindow.currentSeq,
                            this.deltaArgs.mergeTree.collabWindow.clientId);
                        return {
                            segment,
                            start,
                        };
                    })));

        this.pStart = new Lazy<number>(
            () => {
                if (this.isEmpty) {
                    return undefined;
                }
                return this.sortedRanges.value[0].value.start;
            });

        this.pEnd = new Lazy<number>(
            () => {
                if (this.isEmpty) {
                    return undefined;
                }
                const lastRange =
                    this.sortedRanges.value[this.sortedRanges.value.length - 1].value;

                return lastRange.start + lastRange.segment.cachedLength;
            });

        this.pClientId = new Lazy<string>(
            () => this.mergeTreeClient.getLongClientId(this.deltaArgs.mergeTreeClientId));

        this.pRanges = new Lazy<ISequenceDeltaRange[]>(
            () => {
                const ranges: ISequenceDeltaRange[] = [];
                if (this.isEmpty) {
                    return ranges;
                }

                let segments: ISegment[];
                let start: number;
                let length: number;
                let type: SegmentType;
                for (const segment of this.sortedRanges.value) {
                    const nextStart = segment.value.start;
                    const nextLength = segment.value.segment.cachedLength;
                    const nextType = segment.value.segment.getType();

                    let currentPosition = start;
                    // for remove don't add the length, since getOffset won't include it
                    if (this.deltaArgs.operation !== MergeTreeDeltaType.REMOVE) {
                        currentPosition += length;
                    }
                    if (type !== nextType || currentPosition !== nextStart) {
                        // don't push if the first segment
                        if (segments) {
                            ranges.push({
                                length,
                                segments,
                                start,
                                type,
                            });
                        }

                        segments = [segment.value.segment];
                        start = nextStart;
                        length = nextLength;
                        type = nextType;
                    } else {
                        segments.push(segment.value.segment);
                        length += nextLength;
                    }
                }

                ranges.push({
                    length,
                    segments,
                    start,
                    type,
                });

                return ranges;
            });
    }
    public get start(): number {
        return this.pStart.value;
    }

    public get end(): number {
        return this.pEnd.value;
    }

    public get clientId(): string {
        return this.pClientId.value;
    }

    public get ranges(): ISequenceDeltaRange[] {
        return this.pRanges.value;
    }
}

export interface ISequenceDeltaRange {
    readonly length: number;
    readonly segments: ISegment[];
    readonly start: number;
    readonly type: SegmentType;
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
