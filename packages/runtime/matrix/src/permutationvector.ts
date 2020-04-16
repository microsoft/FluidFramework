/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ChildLogger } from "@microsoft/fluid-common-utils";
import { IComponentRuntime, IObjectStorageService } from "@microsoft/fluid-runtime-definitions";
import { ITelemetryBaseLogger } from "@microsoft/fluid-common-definitions";
import {
    BaseSegment,
    ISegment,
    LocalReferenceCollection,
    Client,
    IMergeTreeDeltaOpArgs,
    IMergeTreeDeltaCallbackArgs,
    MergeTreeDeltaType,
    IMergeTreeSegmentDelta,
} from "@microsoft/fluid-merge-tree";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { FileMode, TreeEntry, ITree } from "@microsoft/fluid-protocol-definitions";
import { ObjectStoragePartition } from "@microsoft/fluid-runtime-utils";
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
                newMergeTreeSnapshotFormat: true,
            },
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

        const toPos = this.getPosition(segment);
        return toPos + offset;
    }

    // Constructs an ITreeEntry for the cell data.
    public snapshot(runtime: IComponentRuntime, handle: IComponentHandle): ITree {
        return {
            entries: [
                {
                    mode: FileMode.Directory,
                    path: SnapshotPath.segments,
                    type: TreeEntry[TreeEntry.Tree],
                    value: super.snapshot(runtime, handle, /* tardisMsgs: */ []),
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
        switch (operation) {
            case MergeTreeDeltaType.INSERT:
                this.enumerateDeltaRanges(deltaSegments, (position, length) => {
                    this.handles.splice(position, 0, ...new Array(length).fill(Handle.unallocated));
                });

                // Notify the matrix of inserted positions.  The matrix in turn notifies any IMatrixConsumers.
                this.enumerateDeltaRanges(deltaSegments, (position, length) => {
                    this.deltaCallback(position, /* numRemoved: */ 0, /* numInserted: */ length);
                });
                break;

            case MergeTreeDeltaType.REMOVE: {
                const freed: number[] = [];

                this.enumerateDeltaRanges(deltaSegments, (position, length) => {
                    freed.concat(this.handles.splice(position, length)
                        .filter((handle) => handle !== Handle.unallocated));
                });

                // Notify matrix that handles are about to be freed.  The matrix is responsible for clearing
                // the rows/cols prior to free to ensure recycled row/cols are initially empty.
                this.handlesRecycledCallback(freed);

                // Now that the physical storage has been cleared, add the recycled handles back to the free pool.
                for (const handle of freed) {
                    this.handleTable.free(handle);
                }

                // Notify the matrix of removed positions.  The matrix in turn notifies any IMatrixConsumers.
                this.enumerateDeltaRanges(deltaSegments, (position, length) => {
                    this.deltaCallback(position, /* numRemoved: */ length, /* numInsert: */ 0);
                });
                break;
            }

            default:
                assert.fail();
        }
    };

    private enumerateDeltaRanges(deltas: IMergeTreeSegmentDelta[], callback: (position, length) => void) {
        if (deltas.length > 0) {
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

    public toString() {
        return this.handles.map((handle, index) => `${index}:${handle}`).join(" ");
    }
}
