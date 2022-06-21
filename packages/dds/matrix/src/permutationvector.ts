/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
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
    ReferenceType,
} from "@fluidframework/merge-tree";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidSerializer } from "@fluidframework/shared-object-base";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { ObjectStoragePartition, SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { HandleTable, Handle, isHandleValid } from "./handletable";
import { deserializeBlob } from "./serialization";
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
        assert(this._start === Handle.unallocated, 0x024 /* "Start of PermutationSegment already allocated!" */);
        assert(isHandleValid(value), 0x025 /* "Trying to set start of PermutationSegment to invalid handle!" */);

        this._start = value;
    }

    /**
     * Invoked by '_undoRow/ColRemove' to prepare the newly inserted destination
     * segment to serve as the replacement for this removed segment.  This moves handle
     * allocations from this segment to the replacement as well as maintains tracking
     * groups for the undo/redo stack.
     */
    public transferToReplacement(destination: PermutationSegment) {
        // When this segment was removed, it may have been split from a larger original
        // segment.  In this case, it will have been added to an undo/redo tracking group
        // that associates all of the fragments from the original insertion.
        //
        // Move this association from the this removed segment to its replacement so that
        // it is included if the undo stack continues to unwind to the original insertion.
        //
        // Out of paranoia we link and unlink in separate loops to avoid mutating the underlying
        // set during enumeration.  In practice, this is unlikely to matter since there should be
        // exactly 0 or 1 items in the enumeration.
        for (const group of this.trackingCollection.trackingGroups) {
            group.link(destination);
        }
        for (const group of this.trackingCollection.trackingGroups) {
            group.unlink(this);
        }

        // Move handle allocations from this segment to its replacement.
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
        assert(0 < pos && pos < this.cachedLength, 0x026 /* "Trying to split segment at out-of-bounds position!" */);

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

    public insertRelative(segment: ISegment, length: number) {
        const inserted = new PermutationSegment(length);

        return {
            op: this.insertAtReferencePositionLocal(
                    this.createLocalReferencePosition(segment, 0, ReferenceType.Transient, undefined),
                    inserted),
            inserted,
        };
    }

    public remove(start: number, length: number) {
        return this.removeRangeLocal(start, start + length);
    }

    public getMaybeHandle(pos: number): Handle {
        assert(0 <= pos && pos < this.getLength(), 0x027 /* "Trying to get handle of out-of-bounds position!" */);

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

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.getPosition(segment) + offset!;
    }

    public handleToPosition(handle: Handle, localSeq = this.mergeTree.collabWindow.localSeq) {
        assert(localSeq <= this.mergeTree.collabWindow.localSeq,
            0x028 /* "'localSeq' for op being resubmitted must be <= the 'localSeq' of the last submitted op." */);

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

        assert(isHandleValid(containingSegment.start), 0x029 /* "Invalid handle at start of containing segment!" */);

        // Once we know the current position of the handle, we can use the MergeTree to get the segment
        // containing this position and use 'findReconnectionPosition' to adjust for the local ops that
        // have not yet been submitted.

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.findReconnectionPosition(containingSegment, localSeq) + containingOffset!;
    }

    // Constructs an ISummaryTreeWithStats for the cell data.
    public summarize(runtime: IFluidDataStoreRuntime, handle: IFluidHandle, serializer: IFluidSerializer):
        ISummaryTreeWithStats {
        const builder = new SummaryTreeBuilder();
        builder.addWithStats(SnapshotPath.segments, super.summarize(runtime, handle, serializer, /* catchUpMsgs: */[]));
        builder.addBlob(SnapshotPath.handleTable, serializer.stringify(this.handleTable.getSummaryContent(), handle));
        return builder.getSummaryTree();
    }

    public async load(
        runtime: IFluidDataStoreRuntime,
        storage: IChannelStorageService,
        serializer: IFluidSerializer,
    ) {
        const handleTableData = await deserializeBlob(storage, SnapshotPath.handleTable, serializer);

        this.handleTable = HandleTable.load<never>(handleTableData);

        return super.load(runtime, new ObjectStoragePartition(storage, SnapshotPath.segments), serializer);
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

        const isLocal = opArgs.sequencedMessage === undefined;

        // Notify the undo provider, if any is attached.
        if (this.undo !== undefined && isLocal) {
            this.undo.record(operation, ranges);
        }

        switch (operation) {
            case MergeTreeDeltaType.INSERT:
                // Pass 1: Perform any internal maintenance first to avoid reentrancy.
                for (const { segment, position } of ranges) {
                    // HACK: We need to include the allocated handle in the segment's JSON representation
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
                throw new Error("Unhandled MergeTreeDeltaType");
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
