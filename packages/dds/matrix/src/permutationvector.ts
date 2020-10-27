/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { IFluidDataStoreRuntime, IChannelStorageService } from "@fluidframework/datastore-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import {
    BaseSegment,
    ISegment,
    LocalReferenceCollection,
    Client,
    IMergeTreeDeltaOpArgs,
    IMergeTreeDeltaCallbackArgs,
    MergeTreeDeltaType,
    IMergeTreeMaintenanceCallbackArgs,
    MergeTreeMaintenanceType,
} from "@fluidframework/merge-tree";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { FileMode, TreeEntry, ITree } from "@fluidframework/protocol-definitions";
import { ObjectStoragePartition } from "@fluidframework/runtime-utils";
import { HandleTable, Handle, isHandleValid } from "./handletable";
import { serializeBlob, deserializeBlob } from "./serialization";
import { HandleCache } from "./handlecache";
import { VectorUndoProvider } from "./undoprovider";

const enum SnapshotPath {
    segments = "segments",
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
        assert(isHandleValid(value));

        this._start = value;
    }

    /**
     * Transfers ownership of the associated row/col handles to the given 'destination' segment.
     * The original segment's handle allocation is reset.  Used by 'undoRow/ColRemove' when
     * copying cells to restore row/col segments.)
     */
    public transferHandlesTo(destination: PermutationSegment) {
        destination._start = this._start;
        this.reset();
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
    public readonly handleCache = new HandleCache(this);
    public undo: VectorUndoProvider | undefined;

    constructor(
        path: string,
        logger: ITelemetryBaseLogger,
        runtime: IFluidDataStoreRuntime,
        private readonly deltaCallback: (position: number, numRemoved: number, numInserted: number) => void,
        private readonly handlesRecycledCallback: (handles: Handle[]) => void,
    ) {
        super(
            PermutationSegment.fromJSONObject,
            ChildLogger.create(logger, `Matrix.${path}.MergeTreeClient`), {
            ...runtime.options,
            newMergeTreeSnapshotFormat: true,   // Temporarily force new snapshot format until it is the default.
        });                                     // (See https://github.com/microsoft/FluidFramework/issues/84)

        this.mergeTreeDeltaCallback = this.onDelta;
        this.mergeTreeMaintenanceCallback = this.onMaintenance;
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

        return this.handleCache.getHandle(pos);
    }

    public getAllocatedHandle(pos: number): Handle {
        let handle = this.getMaybeHandle(pos);
        if (isHandleValid(handle)) {
            return handle;
        }

        this.walkSegments(
            (segment) => {
                const asPerm = segment as PermutationSegment;
                asPerm.start = handle = this.handleTable.allocate();
                return true;
            },
            pos,
            pos + 1,
            /* accum: */ undefined,
            /* splitRange: */ true);

        this.handleCache.addHandle(pos, handle);

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

    public handleToPosition(handle: Handle, localSeq = this.mergeTree.collabWindow.localSeq) {
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
        let containingSegment!: PermutationSegment;
        let containingOffset: number;

        this.mergeTree.walkAllSegments(
            this.mergeTree.root,
            (segment) => {
                const { start, cachedLength } = segment as PermutationSegment;

                // If the segment is unallocated, skip it.
                if (!isHandleValid(start)) {
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

        // We are guaranteed to find the handle in the PermutationVector, even if the corresponding
        // row/col has been removed, because handles are not recycled until the containing segment
        // is unlinked from the MergeTree.
        //
        // Therefore, either a row/col removal has been ACKed, in which case there will be no pending
        // ops that reference the stale handle, or the removal is unACKed, in which case the handle
        // has not yet been recycled.

        assert(isHandleValid(containingSegment.start));

        // Once we know the current position of the handle, we can use the MergeTree to get the segment
        // containing this position and use 'findReconnectionPosition' to adjust for the local ops that
        // have not yet been submitted.

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.findReconnectionPostition(containingSegment, localSeq) + containingOffset!;
    }

    // Constructs an ITreeEntry for the cell data.
    public snapshot(runtime: IFluidDataStoreRuntime, handle: IFluidHandle): ITree {
        return {
            entries: [
                {
                    mode: FileMode.Directory,
                    path: SnapshotPath.segments,
                    type: TreeEntry.Tree,
                    value: super.snapshot(runtime, handle, /* catchUpMsgs: */[]),
                },
                serializeBlob(runtime, handle, SnapshotPath.handleTable, this.handleTable.snapshot()),
            ],
            id: null,   // eslint-disable-line no-null/no-null
        };
    }

    public async load(runtime: IFluidDataStoreRuntime, storage: IChannelStorageService, branchId?: string) {
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

        // Notify the undo provider, if any is attached.
        if (this.undo !== undefined) {
            this.undo.record(operation, ranges);
        }

        switch (operation) {
            case MergeTreeDeltaType.INSERT:
                // Pass 1: Perform any internal maintenance first to avoid reentrancy.
                for (const { segment, position } of ranges) {
                    // HACK: We need to include the allocated handle in the segment's JSON reperesntation
                    //       for snapshots, but need to ignore the remote client's handle allocations when
                    //       processing remote ops.
                    segment.reset();

                    this.handleCache.itemsChanged(
                        position,
                        /* deleteCount: */ 0,
                        /* insertCount: */ segment.cachedLength);
                }

                // Pass 2: Notify the 'deltaCallback', which may involve callbacks into user code.
                for (const { segment, position } of ranges) {
                    this.deltaCallback(position, /* numRemoved: */ 0, /* numInserted: */ segment.cachedLength);
                }
                break;

            case MergeTreeDeltaType.REMOVE: {
                // Pass 1: Perform any internal maintenance first to avoid reentrancy.
                for (const { segment, position } of ranges) {
                    this.handleCache.itemsChanged(
                        position, /* deleteCount: */
                        segment.cachedLength,
                        /* insertCount: */ 0);
                }

                // Pass 2: Notify the 'deltaCallback', which may involve callbacks into user code.
                for (const { segment, position } of ranges) {
                    this.deltaCallback(position, /* numRemoved: */ segment.cachedLength, /* numInsert: */ 0);
                }
                break;
            }

            default:
                assert.fail();
        }
    };

    private readonly onMaintenance = (args: IMergeTreeMaintenanceCallbackArgs) => {
        if (args.operation === MergeTreeMaintenanceType.UNLINK) {
            let freed: number[] = [];

            for (const { segment } of args.deltaSegments) {
                const asPerm = segment as PermutationSegment;
                if (isHandleValid(asPerm.start)) {
                    // Note: Using the spread operator with `.splice()` can exhaust the stack.
                    freed = freed.concat(
                        new Array(asPerm.cachedLength)
                            .fill(0)
                            .map((value, index) => index + asPerm.start),
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
