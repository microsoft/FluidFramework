/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { IComponentRuntime, IChannelStorageService } from "@fluidframework/component-runtime-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import {
    BaseSegment,
    ISegment,
    LocalReferenceCollection,
    Client,
    IMergeTreeDeltaOpArgs,
    IMergeTreeDeltaCallbackArgs,
    MergeTreeDeltaType,
} from "@fluidframework/merge-tree";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { FileMode, TreeEntry, ITree } from "@fluidframework/protocol-definitions";
import { ObjectStoragePartition } from "@fluidframework/runtime-utils";
import { HandleTable, Handle } from "./handletable";
import { serializeBlob, deserializeBlob } from "./serialization";

const enum SnapshotPath {
    segments = "segments",
    handles = "handles",
    handleTable = "handleTable",
}

type PermutationSegmentSpec = [number, number];

export class PermutationSegment extends BaseSegment {
    public static readonly typeString: string = "PermutationSegment";
    private _start = Handle.unallocated;

    public static fromJSONObject(spec: any) {
        const [length, start] = spec as PermutationSegmentSpec;
        return new PermutationSegment(length, start);
    }

    public readonly type = PermutationSegment.typeString;

    constructor(length: number, start = Handle.unallocated) {
        super();
        this._start = start;
        this.cachedLength = length;
    }

    public get start() { return this._start; }
    public set start(value: Handle) {
        assert.equal(this._start, Handle.unallocated);
        assert(value >= Handle.valid);

        this._start = value;
    }

    public reset() {
        this._start = Handle.unallocated;
    }

    public toJSONObject() {
        return [this.cachedLength, this.start];
    }

    public clone(start = 0, end = this.cachedLength) {
        const b = new PermutationSegment(
            /* length: */ end - start,
            /* start: */ this.start + start);
        this.cloneInto(b);
        return b;
    }

    public canAppend(segment: ISegment) {
        const asPerm = segment as PermutationSegment;

        return this.start === Handle.unallocated
            ? asPerm.start === Handle.unallocated
            : asPerm.start === this.start + this.cachedLength;
    }

    public append(segment: ISegment) {
        // Note: Must call 'LocalReferenceCollection.append(..)' before modifying this segment's length as
        //       'this.cachedLength' is used to adjust the offsets of the local refs.
        LocalReferenceCollection.append(this, segment);

        this.cachedLength += segment.cachedLength;
    }

    protected createSplitSegmentAt(pos: number) {
        assert(0 < pos && pos < this.cachedLength);

        const leafSegment = new PermutationSegment(
            /* length: */ this.cachedLength - pos,
            /* start: */ this.start === Handle.unallocated
                ? Handle.unallocated
                : this.start + pos);

        this.cachedLength = pos;

        return leafSegment;
    }

    public toString() {
        return this.start === Handle.unallocated
            ? `<${this.cachedLength} empty>`
            : `<${this.cachedLength}: ${this.start}..${this.start + this.cachedLength - 1}>`;
    }
}

export class PermutationVector extends Client {
    private handleTable = new HandleTable<never>(); // Tracks available storage handles for rows.

    constructor(
        path: string,
        logger: ITelemetryBaseLogger,
        runtime: IComponentRuntime,
        private readonly deltaCallback: (position: number, numRemoved: number, numInserted: number) => void,
        private readonly handlesRecycledCallback: (handles: Handle[]) => void,
    ) {
        super(
            PermutationSegment.fromJSONObject,
            ChildLogger.create(logger, `Matrix.${path}.MergeTreeClient`), {
                ...runtime.options,
                newMergeTreeSnapshotFormat: true,   // Temporarily force new snapshot format until it is the default.
            },                                      // (See https://github.com/microsoft/FluidFramework/issues/84)
        );

        this.mergeTreeDeltaCallback = this.onDelta;
    }

    public insert(start: number, length: number) {
        return this.insertSegmentLocal(
            start,
            new PermutationSegment(length));
    }

    public remove(start: number, length: number) {
        return this.removeRangeLocal(start, start + length);
    }

    public getMaybeHandle(pos: number): Handle {
        assert(0 <= pos && pos < this.getLength());

        const { segment, offset } = this.getContainingSegment(pos);
        const asPerm = segment as PermutationSegment;

        return asPerm.start !== Handle.unallocated
            ? asPerm.start + offset
            : Handle.unallocated;
    }

    public getAllocatedHandle(pos: number): Handle {
        let handle = this.getMaybeHandle(pos);
        if (handle !== Handle.unallocated) {
            return handle;
        }

        this.walkSegments(
            (segment) => {
                const asPerm = segment as PermutationSegment;
                assert.equal(asPerm.start, Handle.unallocated);
                asPerm.start = handle = this.handleTable.allocate();
                return true;
            },
            pos,
            pos + 1,
            /* accum: */ undefined,
            /* splitRange: */ true);

        return handle;
    }

    public adjustPosition(pos: number, fromSeq: number, clientId: number) {
        const { segment, offset } = this.mergeTree.getContainingSegment(pos, fromSeq, clientId);

        // Note that until the MergeTree GCs, the segment is still reachable via `getContainingSegment()` with
        // a `refSeq` in the past.  Prevent remote ops from accidentally allocating or using recycled handles
        // by checking for the presence of 'removedSeq'.
        if (segment === undefined || segment.removedSeq !== undefined) {
            return undefined;
        }

        return this.getPosition(segment) + offset;
    }

    public getPositionForResubmit(handle: Handle, localSeq: number) {
        assert(localSeq <= this.mergeTree.collabWindow.localSeq,
            "'localSeq' for op being resubmitted must be <= the 'localSeq' of the last submitted op.");

        // TODO: In theory, the MergeTree should be able to map the (position, refSeq, localSeq) from
        //       the original operation to the current position for resubmitting.  This is probably the
        //       ideal solution, as we would no longer need to store row/col handles in the op metadata.
        //
        //       Failing that, we could avoid the O(n) search below by building a temporary map in the
        //       opposite direction from the handle to either it's current position or segment + offset
        //       and reuse it for the duration of resubmission.  (Ideally, we would know when resubmission
        //       ended so we could discard this map.)
        //
        //       If we find that we frequently need a reverse handle -> position lookup, we could maintain
        //       one using the Tiny-Calc adjust tree.
        let containingSegment: PermutationSegment;
        let containingOffset: number;

        this.walkSegments((segment) => {
            const { start, cachedLength } = segment as PermutationSegment;

            // If the segment is unallocated, skip it.
            if (start < Handle.valid) {
                return true;
            }

            const end = start + cachedLength;

            if (start <= handle && handle < end) {
                containingSegment = segment as PermutationSegment;
                containingOffset = handle - start;
                return false;
            }

            return true;
        });

        // SharedMatrix must verify that 'localSeq' used to originally submit this op is still the
        // most recently pending write to the row/col handle before calling 'getPositionForResubmit'
        // to ensure the handle has not been removed or recycled (See comments in `resubmitCore()`).

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        assert(containingSegment! !== undefined && containingSegment.start >= Handle.valid,
            "Caller must ensure 'handle' has not been removed/recycled.");

        // Once we know the current position of the handle, we can use the MergeTree to get the segment
        // containing this position and use 'findReconnectionPosition' to adjust for the local ops that
        // have not yet been submitted.

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.findReconnectionPostition(containingSegment, localSeq) + containingOffset!;
    }

    // Constructs an ITreeEntry for the cell data.
    public snapshot(runtime: IComponentRuntime, handle: IComponentHandle): ITree {
        return {
            entries: [
                {
                    mode: FileMode.Directory,
                    path: SnapshotPath.segments,
                    type: TreeEntry[TreeEntry.Tree],
                    value: super.snapshot(runtime, handle, /* catchUpMsgs: */[]),
                },
                serializeBlob(runtime, handle, SnapshotPath.handleTable, this.handleTable.snapshot()),
            ],
            id: null,   // eslint-disable-line no-null/no-null
        };
    }

    public async load(runtime: IComponentRuntime, storage: IChannelStorageService, branchId?: string) {
        const handleTableData = await deserializeBlob(runtime, storage, SnapshotPath.handleTable);

        this.handleTable = HandleTable.load<never>(handleTableData);

        return super.load(runtime, new ObjectStoragePartition(storage, SnapshotPath.segments), branchId);
    }

    private readonly onDelta = (
        opArgs: IMergeTreeDeltaOpArgs,
        { operation, deltaSegments }: IMergeTreeDeltaCallbackArgs,
    ) => {
        // Apply deltas in descending order to prevent positions from shifting.
        const ranges = deltaSegments
            .map(({ segment }) => ({
                segment: segment as PermutationSegment,
                position: this.getPosition(segment),
            }))
            .sort((left, right) => left.position - right.position);

        switch (operation) {
            case MergeTreeDeltaType.INSERT:
                // Notify the matrix of inserted positions.  The matrix in turn notifies any IMatrixConsumers.
                for (const { segment, position } of ranges) {
                    // HACK: We need to include the allocated handle in the segment's JSON reperesntation
                    //       for snapshots, but need to ignore the remote client's handle allocations when
                    //       processing remote ops.
                    segment.reset();

                    this.deltaCallback(position, /* numRemoved: */ 0, /* numInserted: */ segment.cachedLength);
                }
                break;

            case MergeTreeDeltaType.REMOVE: {
                let freed: number[] = [];

                for (const { segment } of ranges) {
                    if (segment.start !== Handle.unallocated) {
                        // Note: Using the spread operator with `.splice()` can exhaust the stack.
                        freed = freed.concat(
                            new Array(segment.cachedLength)
                                .fill(0)
                                .map((value, index) => index + segment.start),
                        );
                    }
                }

                // Notify matrix that handles are about to be freed.  The matrix is responsible for clearing
                // the rows/cols prior to free to ensure recycled row/cols are initially empty.
                this.handlesRecycledCallback(freed);

                // Now that the physical storage has been cleared, add the recycled handles back to the free pool.
                for (const handle of freed) {
                    this.handleTable.free(handle);
                }

                // Notify the matrix of removed positions.  The matrix in turn notifies any IMatrixConsumers.
                for (const { segment, position } of ranges) {
                    this.deltaCallback(position, /* numRemoved: */ segment.cachedLength, /* numInsert: */ 0);
                }
                break;
            }

            default:
                assert.fail();
        }
    };

    public toString() {
        const s: string[] = [];

        this.walkSegments((segment) => {
            s.push(`${segment}`);
            return true;
        });

        return s.join("");
    }
}
