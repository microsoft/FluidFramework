/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ChildLogger, fromBase64ToUtf8 } from "@microsoft/fluid-common-utils";
import { IComponentRuntime, IObjectStorageService } from "@microsoft/fluid-runtime-definitions";
import { ITelemetryBaseLogger } from "@microsoft/fluid-common-definitions";
import {
    BaseSegment,
    ISegment,
    IJSONSegment,
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

const enum SnapshotPath {
    segments = "segments",
    handleTable = "handleTable",
}

export class PermutationSegment extends BaseSegment {
    public static readonly typeString: string = "PermutationSegment";

    public static fromJSONObject(spec: any) {
        const segment = new PermutationSegment(spec.handles);
        if (spec.props !== undefined) {
            segment.addProperties(spec.props);
        }
        return segment;
    }

    public readonly type = PermutationSegment.typeString;

    constructor(public handles: Handle[]) {
        super();
        this.cachedLength = handles.length;
    }

    public toJSONObject() {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const obj = { handles: this.handles } as IJSONSegment;
        super.addSerializedProps(obj);
        return obj;
    }

    public clone(start = 0, end?: number) {
        const clonedItems = this.handles.slice(start, end);
        const b = new PermutationSegment(clonedItems);
        this.cloneInto(b);
        return b;
    }

    public canAppend(segment: ISegment) { return true; }

    public toString() {
        return this.handles.toString();
    }

    public append(segment: ISegment) {
        // Note: Must call 'appendLocalRefs' before modifying this segment's length as
        //       'this.cachedLength' is used to adjust the offsets of the local refs.
        LocalReferenceCollection.append(this, segment);

        const asPermutationSegment = segment as PermutationSegment;

        this.handles = this.handles.concat(asPermutationSegment.handles);
        this.cachedLength = this.handles.length;
    }

    // TODO: retain removed items for undo
    // returns true if entire run removed
    public removeRange(start: number, end: number) {
        let remnantItems: Handle[] = [];
        const len = this.handles.length;
        if (start > 0) {
            remnantItems = remnantItems.concat(this.handles.slice(0, start));
        }
        if (end < len) {
            remnantItems = remnantItems.concat(this.handles.slice(end));
        }
        this.handles = remnantItems;
        this.cachedLength = this.handles.length;
        return (this.handles.length === 0);
    }

    protected createSplitSegmentAt(pos: number) {
        assert(0 < pos && pos < this.handles.length);

        const remainingItems = this.handles.slice(pos);
        this.handles = this.handles.slice(0, pos);
        this.cachedLength = this.handles.length;
        const leafSegment = new PermutationSegment(remainingItems);

        return leafSegment;
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
                newMergeTreeSnapshotFormat: true,
            },
        );

        this.mergeTreeDeltaCallback = this.onDelta;
    }

    public insert(start: number, length: number) {
        return this.insertSegmentLocal(
            start,
            new PermutationSegment(new Array(length).fill(Handle.unallocated)));
    }

    public remove(start: number, length: number) {
        return this.removeRangeLocal(start, start + length);
    }

    public toHandle(pos: number, refSeq: number, clientId: number, alloc: boolean): Handle {
        const { segment, offset } = this.mergeTree.getContainingSegment<PermutationSegment>(pos, refSeq, clientId);

        // Note that until the MergeTree GCs, the segment is still reachable via `getContainingSegment()` with
        // a `refSeq` in the past.  Prevent remote ops from accidentally allocating or using recycled handles
        // by checking for the presence of 'removedSeq'.
        if (segment === undefined || segment.removedSeq !== undefined) {
            return Handle.deleted;
        }

        let handle = segment.handles[offset];
        if (alloc && handle === Handle.unallocated) {
            handle = segment.handles[offset] = this.handleTable.allocate();
        }

        return handle;
    }

    public adjustPosition(pos: number, fromSeq: number, clientId: number) {
        const { segment, offset } = this.mergeTree.getContainingSegment(pos, fromSeq, clientId);
        if (segment === undefined) {
            return undefined;
        }

        const toPos = this.getPosition(segment);
        return toPos + offset;
    }

    // Constructs an ITreeEntry for the cell data.
    public snapshot(runtime: IComponentRuntime, handle: IComponentHandle): ITree {
        const serializer = runtime.IComponentSerializer;
        const handleTableChunk = this.handleTable.snapshot();

        return {
            entries: [
                {
                    mode: FileMode.Directory,
                    path: SnapshotPath.segments,
                    type: TreeEntry[TreeEntry.Tree],
                    value: super.snapshot(runtime, handle, /* tardisMsgs: */ []),
                },
                {
                    mode: FileMode.File,
                    path: SnapshotPath.handleTable,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: serializer !== undefined
                            ? serializer.stringify(handleTableChunk, runtime.IComponentHandleContext, handle)
                            : JSON.stringify(handleTableChunk),
                        encoding: "utf-8",
                    },
                },
            ],
            id: null,   // eslint-disable-line no-null/no-null
        };
    }

    public async load(runtime: IComponentRuntime, storage: IObjectStorageService, branchId?: string) {
        const handleTableChunk = await storage.read(SnapshotPath.handleTable);
        const utf8 = fromBase64ToUtf8(handleTableChunk);

        const serializer = runtime.IComponentSerializer;
        const handleTableData = serializer !== undefined
            ? serializer.parse(utf8, runtime.IComponentHandleContext)
            : JSON.parse(utf8);

        this.handleTable = HandleTable.load<never>(handleTableData);

        return super.load(runtime, new ObjectStoragePartition(storage, SnapshotPath.segments), branchId);
    }

    private readonly onDelta = (
        opArgs: IMergeTreeDeltaOpArgs,
        { operation, deltaSegments }: IMergeTreeDeltaCallbackArgs,
    ) => {
        switch (operation) {
            case MergeTreeDeltaType.INSERT:
                // Notify the matrix of inserted positions.  The matrix in turn notifies any IMatrixConsumers.
                this.enumerateDeltaRanges(deltaSegments, (position, length) => {
                    this.deltaCallback(position, /* numRemoved: */ 0, /* numInserted: */ length);
                });
                break;

            case MergeTreeDeltaType.REMOVE: {
                // Build a list of non-null handles referenced by the segment.
                const freed: Handle[] = [];
                for (const delta of deltaSegments) {
                    const segment = delta.segment as PermutationSegment;
                    freed.splice(freed.length, 0, ...segment.handles.filter((handle) => handle !== Handle.unallocated));
                }

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
        let s = "";

        const collab = this.getCollabWindow();

        for (let i = 0; i < this.getLength(); i++) {
            s += `${i}:${this.toHandle(i, collab.currentSeq, collab.clientId, /* alloc: */ false)} `;
        }

        return s;
    }
}
