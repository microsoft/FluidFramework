/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { ChildLogger, fromBase64ToUtf8 } from "@microsoft/fluid-core-utils";
import * as MergeTree from "@microsoft/fluid-merge-tree";
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    ITreeEntry,
    TreeEntry,
} from "@microsoft/fluid-protocol-definitions";
import {
    IComponentRuntime,
    IObjectStorageService,
    Jsonable,
    JsonablePrimitive,
} from "@microsoft/fluid-runtime-definitions";
import { RunSegment, SharedNumberSequenceFactory } from "@microsoft/fluid-sequence";
import { makeHandlesSerializable, parseHandles, SharedObject } from "@microsoft/fluid-shared-object-base";
import { strict as assert } from "assert";
import { SharedMatrixFactory } from ".";
import { debug } from "./debug";
import { HandleTable } from "./handletable";
import { pointToKey } from "./keys";
import { IMatrixCellMsg, MatrixOp } from "./ops";

const unallocated = -1 as const;

const enum SnapshotPath {
    rows = "rows",
    cols = "cols",
    cells = "cells",
}

class ContentObjectStorage implements IObjectStorageService {
    constructor(private readonly storage: IObjectStorageService, private readonly path: SnapshotPath) { }

    public async read(path: string): Promise<string> {
        return this.storage.read(`${this.path}/${path}`);
    }
}

export class SharedMatrix<T extends Jsonable<JsonablePrimitive | IComponentHandle>> extends SharedObject {

    public get numRows() { return this.rows.getLength(); }
    public get numCols() { return this.cols.getLength(); }
    public static getFactory() { return new SharedMatrixFactory(); }

    private readonly rows: MergeTree.Client;                    // Map logical row to physical storage index (if any)
    private readonly rowTable = new HandleTable<number>();      // Tracks available storage indices for rows.

    private readonly cols: MergeTree.Client;                    // Map logical col to physical storage index (if any)
    private readonly colTable = new HandleTable<number>();      // Tracks available storage indices for cols.

    private cellKeyToValue = new Map<number, T>();              // Map of populated cell values.
    private cellKeyToPendingCliSeq = new Map<number, number>(); // Map 'cliSeq' of pending cell write (if any).

    constructor(
        runtime: IComponentRuntime,
        public id: string,
    ) {
        super(id, runtime, SharedMatrixFactory.Attributes);

        this.rows = new MergeTree.Client(
            SharedNumberSequenceFactory.segmentFromSpec,
            ChildLogger.create(this.logger, "Matrix.Rows.MergeTreeClient"),
            { ...runtime.options, newMergeTreeSnapshotFormat: true });
        this.cols = new MergeTree.Client(
            SharedNumberSequenceFactory.segmentFromSpec,
            ChildLogger.create(this.logger, "Matrix.Cols.MergeTreeClient"),
            { ...runtime.options, newMergeTreeSnapshotFormat: true });
    }

    public getCell(row: number, col: number) {
        // Map the logical (row, col) to physical storage indices.
        // tslint:disable-next-line:no-parameter-reassignment
        ([row, col] = this.swizzle(row, col, /* alloc: */ false));

        // If either the row or col storage is unallocated, the cell is empty.
        if (row === unallocated || col === unallocated) {
            return undefined;
        }

        // Otherwise, combine the storage indices into a key and retrieve the value from the map.
        return this.cellKeyToValue.get(pointToKey(row, col));
    }

    public setCell(row: number, col: number, value: T) {
        // Write or clear the value in physical storage.
        const key = this.storeCell(row, col, value);

        // And queue a 'set' op.
        this.submitCellMessage(key, {
            type: MatrixOp.set,
            row,
            col,
            value,
        });
    }

    public insertCols(start: number, count: number) {
        this.insert(this.cols, "cols", start, count);
    }

    public insertRows(start: number, count: number) {
        this.insert(this.rows, "rows", start, count);
    }

    public submitCellMessage(key: number, message: IMatrixCellMsg) {
        const clientSequenceNumber = this.submitLocalMessage(message);
        if (clientSequenceNumber !== -1) {
            this.cellKeyToPendingCliSeq.set(key, clientSequenceNumber);
        }
    }

    public snapshot(): ITree {
        return {
            entries: [{
                mode: FileMode.Directory,
                path: SnapshotPath.rows,
                type: TreeEntry[TreeEntry.Tree],
                value: this.rows.snapshot(this.runtime, this.handle, []),
            }, {
                mode: FileMode.Directory,
                path: SnapshotPath.cols,
                type: TreeEntry[TreeEntry.Tree],
                value: this.cols.snapshot(this.runtime, this.handle, []),
            }, this.snapshotCells()],
            id: null,
        };
    }

    protected submitLocalMessage(message: any) {
        return super.submitLocalMessage(
            makeHandlesSerializable(
                message,
                this.runtime.IComponentSerializer,
                this.runtime.IComponentHandleContext,
                this.handle));
    }

    protected onConnect(pending: any[]) {
        assert.equal(
            this.rows.getCollabWindow().collaborating,
            this.cols.getCollabWindow().collaborating,
        );

        // Update merge tree collaboration information with new client ID and then resend pending ops
        if (this.rows.getCollabWindow().collaborating) {
            this.rows.updateCollaboration(this.runtime.clientId);
            this.cols.updateCollaboration(this.runtime.clientId);
        }

        // TODO: Resend pending ops on reconnect
        assert(!this.rows.resetPendingSegmentsToOp());
        assert(!this.cols.resetPendingSegmentsToOp());
    }

    protected onDisconnect() {
        debug(`${this.id} is now disconnected`);
    }

    protected async loadCore(branchId: string, storage: IObjectStorageService) {
        try {
            await this.rows.load(branchId, this.runtime, new ContentObjectStorage(storage, SnapshotPath.rows));
            await this.cols.load(branchId, this.runtime, new ContentObjectStorage(storage, SnapshotPath.cols));
            await this.loadCells(await storage.read(SnapshotPath.cells));
        } catch (error) {
            this.logger.sendErrorEvent({eventName: "MatrixLoadFailed" }, error);
        }
    }

    protected processCore(rawMessage: ISequencedDocumentMessage, local: boolean) {
        const msg = parseHandles(
            rawMessage,
            this.runtime.IComponentSerializer,
            this.runtime.IComponentHandleContext);

        const contents = msg.contents;

        switch (contents.target) {
            case "cols":
                this.cols.applyMsg(msg);
                break;
            case "rows":
                this.rows.applyMsg(msg);
                break;
            default: {
                assert(contents.type === MatrixOp.set);

                const [row, col] = this.swizzle(contents.row, contents.col, /* alloc */ false);
                const pendingCliSeq = this.cellKeyToPendingCliSeq.get(pointToKey(row, col));

                // If there is a local set op pending for this cell position...
                if (pendingCliSeq !== undefined) {
                    // The incoming set operation either:
                    //  a) precedes our pending set operation, or...
                    //  b) is the ACK for our pending set operation
                    //
                    // In either case, we keep the current cell value.

                    // If this is the ACK for our pending set op, remove our pending cliSeq # so later
                    // operations will resume updating the cell.
                    if (local && pendingCliSeq === rawMessage.clientSequenceNumber) {
                        // Then our pending write has been ACKed.  Remove it from the pending map.
                        this.cellKeyToPendingCliSeq.delete(contents.key);
                    }
                    return;
                } else {
                    this.storeCell(contents.row, contents.col, contents.value);
                }
            }
        }
    }

    protected registerCore() {
        this.rows.startCollaboration(this.runtime.clientId, 0);
        this.cols.startCollaboration(this.runtime.clientId, 0);
    }

    private insert(dimClient: MergeTree.Client, dimTarget: "rows" | "cols", start: number, count: number) {
        // Construct a new MergeTree op to insert a new segment with the appropriate number of unallocated rows/cols.
        // Note that serialized RunSegment will continue to contain unallocated items, even if the RunSegment in
        // the MergeTree is modified prior to the op being transmitted.
        const op = dimClient.insertSegmentLocal(start, new RunSegment(new Array(count).fill(unallocated)));

        // Note whether this `op` targets rows or cols.  (See dispatch in `processCore()`)
        (op as any).target = dimTarget;

        this.submitLocalMessage(op);
    }

    private storeCell(row: number, col: number, value: T) {
        const clear = value === undefined;

        // Map the logical row/col to the allocated storage indicise (if any).
        // tslint:disable-next-line:no-parameter-reassignment
        ([row, col] = this.swizzle(row, col, /* alloc: */ !clear));

        // If clearing and either the row and/or col is unallocated, no further work is necessary.
        if (clear && row === unallocated || col === unallocated) {
            return;
        }

        // Otherwise convert the storage indices into a map key and set or delete as appropriate.
        const key = pointToKey(row, col);
        if (clear) {
            this.cellKeyToValue.delete(key);

            // TODO: If we kept track of non-empty cells per row/col, we could unallocate and reuse the
            //       storage index when the count reaches zero.
        } else {
            this.cellKeyToValue.set(key, value);
        }

        return key;
    }

    // Maps the given row/col pair to their corresponding storage indices.  If `alloc` is true, storage
    // indices will be allocated if needed.  Otherwise, returns `unallocated` (i.e., -1) for unallocated
    // rows/cols.
    private swizzle(row: number, col: number, alloc: boolean) {
        return [
            this.swizzle1(this.rows, this.rowTable, row, alloc),
            this.swizzle1(this.cols, this.colTable, col, alloc),
        ];
    }

    // Helper for `swizzle()` that handles the logical row/col mapping to physical storage in one dimension.
    private swizzle1(client: MergeTree.Client, table: HandleTable<number>, pos: number, alloc: boolean): number {
        const segmentAndOffset = client.getContainingSegment(pos);
        assert(segmentAndOffset);
        const run = segmentAndOffset.segment as RunSegment;
        let p = run.items[segmentAndOffset.offset] as number;
        if (p === unallocated && alloc) {
            p = table.allocate() - 1;
            run.items[segmentAndOffset.offset] = p;
        }
        return p;
    }

    // Constructs an ITreeEntry for the cell data.
    private snapshotCells(): ITreeEntry {
        const chunk = [
            Array.from(this.cellKeyToValue.entries()),
            Array.from(this.cellKeyToPendingCliSeq.entries()),
        ];

        const serializer = this.runtime.IComponentSerializer;
        return {
            mode: FileMode.File,
            path: SnapshotPath.cells,
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: serializer
                    ? serializer.stringify(chunk, this.runtime.IComponentHandleContext, this.handle)
                    : JSON.stringify(chunk),
                encoding: "utf-8",
            },
        };
    }

    // Loads cell data from the given Base64 encoded chunk.
    private loadCells(chunk: string) {
        const utf8 = fromBase64ToUtf8(chunk);

        const serializer = this.runtime.IComponentSerializer;
        const cellData = serializer
            ? serializer.parse(utf8, this.runtime.IComponentHandleContext)
            : JSON.parse(utf8);

        this.cellKeyToValue = new Map(cellData[0]);
        this.cellKeyToPendingCliSeq = new Map(cellData[1]);
    }
}
