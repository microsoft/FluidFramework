/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ChildLogger } from "@microsoft/fluid-core-utils";
import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { ITelemetryBaseLogger } from "@microsoft/fluid-common-definitions";
import {
    BaseSegment,
    ISegment,
    IJSONSegment,
    IMergeTreeInsertMsg,
    createGroupOp,
    LocalReferenceCollection,
    Client,
    IMergeTreeDeltaOpArgs,
    IMergeTreeDeltaCallbackArgs,
    MergeTreeDeltaType,
    IMergeTreeSegmentDelta,
} from "@microsoft/fluid-merge-tree";
import { HandleTable } from "./handletable";
import { SnapshotPath } from "./matrix";

const unallocated = -1 as const;

type PermutationSegmentSpec = [number, number];

class PermutationSegment extends BaseSegment {
    public static readonly typeString = "PermutationSegment";

    public static fromJSONObject(spec: IJSONSegment) {
        const [start, length] = spec as PermutationSegmentSpec;
        return new PermutationSegment(start, length);
    }

    public readonly type = PermutationSegment.typeString;

    constructor(public readonly start: number, length: number) {
        super();
        this.cachedLength = length;
    }

    public toJSONObject() {
        return [ this.start, this.cachedLength ];
    }

    public clone() {
        const b = new PermutationSegment(unallocated, this.cachedLength);
        this.cloneInto(b);
        return b;
    }

    public canAppend(segment: ISegment) {
        return (segment as PermutationSegment).start === this.start + this.cachedLength;
    }

    public toString() {
        return `[Permutation: ${this.cachedLength}]`;
    }

    public append(segment: ISegment) {
        // Note: Must call 'LocalReferenceCollection.append(..)' before modifying this segment's length as
        //       'this.cachedLength' is used to adjust the offsets of the local refs.
        LocalReferenceCollection.append(this, segment);

        this.cachedLength += segment.cachedLength;
    }

    // returns true if entire run removed
    public removeRange(start: number, end: number) {
        assert(start === 0 || end === this.cachedLength);
        this.cachedLength -= (end - start);
        return this.cachedLength === 0;
    }

    protected createSplitSegmentAt(pos: number) {
        const leftLength = pos;
        const rightLength = this.cachedLength - pos;

        this.cachedLength = leftLength;
        return new PermutationSegment(this.start + leftLength, rightLength);
    }
}

export class PermutationVector extends Client {
    private readonly handleTable = new HandleTable<number>(); // Tracks available storage handles for rows.
    private cacheStart = 0;
    private cacheEnd = 0;
    private cacheHandle = 0;

    constructor(
        path: SnapshotPath,
        logger: ITelemetryBaseLogger,
        runtime: IComponentRuntime,
        private readonly deltaCallback: (position: number, numRemoved: number, numInserted: number) => void,
    ) {
        super(
            PermutationSegment.fromJSONObject,
            ChildLogger.create(logger, `Matrix.${path}.MergeTreeClient`), {
                ...runtime.options,
                newMergeTreeSnapshotFormat: true,
            },
        );

        this.mergeTreeDeltaCallback = this.onDelta;
    }

    public insert(start: number, length: number) {
        // Allocate the number of requested handles and sort them to encourage contiguous runs.
        const handles = this.handleTable.allocateMany(length).sort();

        // For each contiguous run of handles, insert a PermunationSegment.
        let prev = handles[0];
        let startHandle = prev;
        const ops: IMergeTreeInsertMsg[] = [];

        let runLength = 1;
        for (let i = 1; i < handles.length; i++) {
            const next = handles[i];

            // If the next handle is not contiguous, insert the previous PermutationSegment.
            if (next !== prev + 1) {
                ops.push(this.insertSegmentLocal(start, new PermutationSegment(startHandle, runLength)));
                length -= i;                    // eslint-disable-line no-param-reassign
                startHandle = handles[i];
                runLength = 0;
            }
            prev = next;
            runLength++;
        }

        // When we exit the above loop, there will always be at least one handle remaining.
        ops.push(this.insertSegmentLocal(start, new PermutationSegment(startHandle, runLength)));

        return ops.length === 1
            ? ops[0]
            : createGroupOp(...ops);
    }

    public toHandle(pos: number, alloc: boolean): number {
        {
            const start = this.cacheStart;
            if (start <= pos && pos < this.cacheEnd) {
                return this.cacheHandle + (pos - start);
            }
        }

        const { segment, offset } = this.getContainingSegment<PermutationSegment>(pos);
        this.cacheStart = pos - offset;
        this.cacheEnd = this.cacheStart + segment.cachedLength;
        this.cacheHandle = segment.start;

        return segment.start + offset;
    }

    private readonly onDelta = (
        opArgs: IMergeTreeDeltaOpArgs,
        { operation, deltaSegments }: IMergeTreeDeltaCallbackArgs
    ) => {
        this.cacheEnd = 0;

        switch (operation) {
            case MergeTreeDeltaType.INSERT:
                this.enumerateDeltaRanges(deltaSegments, (position, length) => {
                    this.deltaCallback(position, /* numRemoved: */ 0, /* numInserted: */ length);
                });
                break;
            case MergeTreeDeltaType.REMOVE:
                this.enumerateDeltaRanges(deltaSegments, (position, length) => {
                    this.deltaCallback(position, /* numRemoved: */ length, /* numInsert: */ 0);
                });
                break;
            default:
                assert.fail();
        }
    };

    private enumerateDeltaRanges(deltas: IMergeTreeSegmentDelta[], callback: (position, length) => void) {
        const segment0 = deltas[0].segment;
        let rangeStart = this.getPosition(segment0);
        let rangeLength = segment0.cachedLength;

        for (let i = 1; i < deltas.length; i++) {
            const segment = deltas[i].segment;
            const segStart = this.getPosition(segment);

            if (segStart === rangeLength) {
                rangeLength += segment.cachedLength;
            } else {
                callback(rangeStart, rangeLength);
                rangeStart = segStart;
                rangeLength = segment.cachedLength;
            }
        }

        callback(rangeStart, rangeLength);
    }
}
