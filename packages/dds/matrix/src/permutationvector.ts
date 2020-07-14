/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { IComponentRuntime, IObjectStorageService } from "@fluidframework/component-runtime-definitions";
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
import { IFluidHandle } from "@fluidframework/component-core-interfaces";
import { FileMode, TreeEntry, ITree } from "@fluidframework/protocol-definitions";
import { ObjectStoragePartition } from "@fluidframework/runtime-utils";
import { HandleTable, Handle } from "./handletable";
import { serializeBlob, deserializeBlob } from "./serialization";

const enum SnapshotPath {
    segments = "segments",
    handles = "handles",
    handleTable = "handleTable",
}

export class PermutationSegment extends BaseSegment {
    public static readonly typeString: string = "PermutationSegment";

    public static fromJSONObject(spec: any) {
        return new PermutationSegment(spec);
    }

    public readonly type = PermutationSegment.typeString;

    constructor(length: number) {
        super();
        this.cachedLength = length;
    }

    public toJSONObject() {
        return this.cachedLength;
    }

    public clone(start = 0, end = this.cachedLength) {
        const b = new PermutationSegment(end - start);
        this.cloneInto(b);
        return b;
    }

    public canAppend(segment: ISegment) { return true; }

    public append(segment: ISegment) {
        // Note: Must call 'appendLocalRefs' before modifying this segment's length as
        //       'this.cachedLength' is used to adjust the offsets of the local refs.
        LocalReferenceCollection.append(this, segment);

        this.cachedLength += segment.cachedLength;
    }

    // TODO: retain removed items for undo
    // returns true if entire run removed
    public removeRange(start: number, end: number) {
        this.cachedLength -= (end - start);
        return this.cachedLength === 0;
    }

    protected createSplitSegmentAt(pos: number) {
        assert(0 < pos && pos < this.cachedLength);

        const leafSegment = new PermutationSegment(this.cachedLength - pos);
        this.cachedLength = pos;

        return leafSegment;
    }

    public toString() {
        return `<${this.cachedLength} handles>`;
    }
}

export class PermutationVector extends Client {
    private handleTable = new HandleTable<never>(); // Tracks available storage handles for rows.
    public handles: number[] = [];

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

    public getAllocatedHandle(pos: number): Handle {
        let handle = this.handles[pos];

        if (handle === Handle.unallocated) {
            handle = this.handles[pos] = this.handleTable.allocate();
        }

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
        const currentPosition = this.handles.indexOf(handle);

        // SharedMatrix must verify that 'localSeq' used to originally submit this op is still the
        // most recently pending write to the row/col handle before calling 'getPositionForResubmit'
        // to ensure the handle has not been removed or recycled (See comments in `resubmitCore()`).
        assert(currentPosition >= 0,
            "Caller must ensure 'handle' has not been removed/recycled.");

        // Once we know the current position of the handle, we can use the MergeTree to get the segment
        // containing this position and use 'findReconnectionPosition' to adjust for the local ops that
        // have not yet been submitted.
        const { segment, offset } = this.getContainingSegment(currentPosition);
        return this.findReconnectionPostition(segment, localSeq) + offset;
    }

    // Constructs an ITreeEntry for the cell data.
    public snapshot(runtime: IComponentRuntime, handle: IFluidHandle): ITree {
        return {
            entries: [
                {
                    mode: FileMode.Directory,
                    path: SnapshotPath.segments,
                    type: TreeEntry[TreeEntry.Tree],
                    value: super.snapshot(runtime, handle, /* catchUpMsgs: */[]),
                },
                serializeBlob(runtime, handle, SnapshotPath.handleTable, this.handleTable.snapshot()),
                serializeBlob(runtime, handle, SnapshotPath.handles, this.handles),
            ],
            id: null,   // eslint-disable-line no-null/no-null
        };
    }

    public async load(runtime: IComponentRuntime, storage: IObjectStorageService, branchId?: string) {
        const [handleTableData, handles] = await Promise.all([
            await deserializeBlob(runtime, storage, SnapshotPath.handleTable),
            await deserializeBlob(runtime, storage, SnapshotPath.handles),
        ]);

        this.handleTable = HandleTable.load<never>(handleTableData);
        this.handles = handles;

        return super.load(runtime, new ObjectStoragePartition(storage, SnapshotPath.segments), branchId);
    }

    private readonly onDelta = (
        opArgs: IMergeTreeDeltaOpArgs,
        { operation, deltaSegments }: IMergeTreeDeltaCallbackArgs,
    ) => {
        // Apply deltas in descending order to prevent positions from shifting.
        const ranges = deltaSegments
            .map(({ segment }) => ({
                position: this.getPosition(segment),
                length: segment.cachedLength,
            }))
            .sort((left, right) => left.position - right.position);

        switch (operation) {
            case MergeTreeDeltaType.INSERT:
                for (const { position, length } of ranges) {
                    // Note: Using the spread operator with `.splice()` can exhaust the stack.
                    this.handles = this.handles.slice(0, position)
                        .concat(new Array(length).fill(Handle.unallocated))
                        .concat(this.handles.slice(position));
                }

                // Notify the matrix of inserted positions.  The matrix in turn notifies any IMatrixConsumers.
                for (const { position, length } of ranges) {
                    this.deltaCallback(position, /* numRemoved: */ 0, /* numInserted: */ length);
                }
                break;

            case MergeTreeDeltaType.REMOVE: {
                let freed: number[] = [];

                for (const { position, length } of ranges) {
                    const removed = this.handles.splice(position, /* deleteCount: */ length);

                    // Note: Using the spread operator with `.splice()` can exhaust the stack.
                    freed = freed.concat(removed.filter((handle) => handle !== Handle.unallocated));
                }

                // Notify matrix that handles are about to be freed.  The matrix is responsible for clearing
                // the rows/cols prior to free to ensure recycled row/cols are initially empty.
                this.handlesRecycledCallback(freed);

                // Now that the physical storage has been cleared, add the recycled handles back to the free pool.
                for (const handle of freed) {
                    this.handleTable.free(handle);
                }

                // Notify the matrix of removed positions.  The matrix in turn notifies any IMatrixConsumers.
                for (const { position, length } of ranges) {
                    this.deltaCallback(position, /* numRemoved: */ length, /* numInsert: */ 0);
                }
                break;
            }

            default:
                assert.fail();
        }
    };

    public toString() {
        return this.handles.map((handle, index) => `${index}:${handle}`).join(" ");
    }
}
