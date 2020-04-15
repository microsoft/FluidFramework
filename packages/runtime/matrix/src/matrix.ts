/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
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
    Serializable,
    IChannelAttributes,
} from "@microsoft/fluid-runtime-definitions";
import { makeHandlesSerializable, parseHandles, SharedObject } from "@microsoft/fluid-shared-object-base";
import { fromBase64ToUtf8 } from "@microsoft/fluid-common-utils";
import { ObjectStoragePartition } from "@microsoft/fluid-runtime-utils";
import { IMatrixProducer, IMatrixConsumer, IMatrixReader } from "@tiny-calc/nano";
import { debug } from "./debug";
import { pointToKey } from "./keys";
import { IMatrixCellMsg, MatrixOp } from "./ops";
import { PermutationVector } from "./permutationvector";
import { SparseArray2D } from "./sparsearray2d";
import { SharedMatrixFactory } from "./runtime";
import { Handle } from "./handletable";

export const enum SnapshotPath {
    rows = "rows",
    cols = "cols",
    cells = "cells"
}

export class SharedMatrix<T extends Serializable = Serializable> extends SharedObject
    implements IMatrixProducer<T | undefined | null>, IMatrixReader<T | undefined | null>
{
    private readonly consumers = new Set<IMatrixConsumer<T | undefined | null>>();

    public static getFactory() { return new SharedMatrixFactory(); }

    private readonly rows: PermutationVector;   // Map logical row to storage handle (if any)
    private readonly cols: PermutationVector;   // Map logical col to storage handle (if any)

    private cells = new SparseArray2D<T>();     // Stores cell values.

    // Map 'cliSeq' of pending cell write (if any).
    private cellKeyToPendingCliSeq = new Map<number | undefined, number>();

    constructor(runtime: IComponentRuntime, public id: string, attributes: IChannelAttributes) {
        super(id, runtime, attributes);

        this.rows = new PermutationVector(SnapshotPath.rows, this.logger, runtime.options, this.onRowDelta);
        this.cols = new PermutationVector(SnapshotPath.cols, this.logger, runtime.options, this.onColDelta);
    }

    public static create(runtime: IComponentRuntime, id?: string) {
        return runtime.createChannel(id, SharedMatrixFactory.Type) as SharedMatrix;
    }

    // #region IMatrixProducer

    removeMatrixConsumer(consumer: IMatrixConsumer<T | undefined | null>): void {
        this.consumers.delete(consumer);
    }

    openMatrix(consumer: IMatrixConsumer<T | undefined | null>): IMatrixReader<T | undefined | null> {
        this.consumers.add(consumer);
        return this;
    }

    // #endregion IMatrixProducer

    // #region IMatrixReader

    public get numRows() { return this.rows.getLength(); }
    public get numCols() { return this.cols.getLength(); }

    public read(row: number, col: number): T | undefined | null {
        // Map the logical (row, col) to associated storage handles.
        const rowHandle = this.rows.toHandle(row, /* alloc: */ false);
        if (rowHandle === Handle.unallocated) {
            return undefined;
        }

        const colHandle = this.cols.toHandle(col, /* alloc: */ false);
        if (colHandle === Handle.unallocated) {
            return undefined;
        }

        return this.cells.read(rowHandle, colHandle);
    }

    // #endregion IMatrixReader

    public setCell(row: number, col: number, value: T) {
        // Write or clear the value in storage.
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
        this.insert(this.cols, SnapshotPath.cols, start, count);
    }

    public insertRows(start: number, count: number) {
        this.insert(this.rows, SnapshotPath.rows, start, count);
    }

    public snapshot(): ITree {
        return {
            entries: [
                {
                    mode: FileMode.Directory,
                    path: SnapshotPath.rows,
                    type: TreeEntry[TreeEntry.Tree],
                    value: this.rows.snapshot(this.runtime, this.handle, []),
                },
                {
                    mode: FileMode.Directory,
                    path: SnapshotPath.cols,
                    type: TreeEntry[TreeEntry.Tree],
                    value: this.cols.snapshot(this.runtime, this.handle, []),
                },
                this.snapshotCells(),
            ],
            id: null,   // eslint-disable-line no-null/no-null
        };
    }

    protected submitLocalMessage(message: any) {
        return super.submitLocalMessage(
            makeHandlesSerializable(
                message,
                this.runtime.IComponentSerializer,
                this.runtime.IComponentHandleContext,
                this.handle,
            ),
        );
    }

    protected onConnect(pending: any[]) {
        assert.equal(this.rows.getCollabWindow().collaborating, this.cols.getCollabWindow().collaborating);

        // Update merge tree collaboration information with new client ID and then resend pending ops
        this.rows.startOrUpdateCollaboration(this.runtime.clientId as string);
        this.cols.startOrUpdateCollaboration(this.runtime.clientId as string);

        // TODO: Resend pending ops on reconnect
        assert(this.rows.resetPendingSegmentsToOp() === undefined);
        assert(this.cols.resetPendingSegmentsToOp() === undefined);
    }

    protected onDisconnect() {
        debug(`${this.id} is now disconnected`);
    }

    protected async loadCore(branchId: string, storage: IObjectStorageService) {
        try {
            await this.rows.load(this.runtime, new ObjectStoragePartition(storage, SnapshotPath.rows), branchId);
            await this.cols.load(this.runtime, new ObjectStoragePartition(storage, SnapshotPath.cols), branchId);
            this.loadCells(await storage.read(SnapshotPath.cells));
        } catch (error) {
            this.logger.sendErrorEvent({ eventName: "MatrixLoadFailed" }, error);
        }
    }

    protected processCore(rawMessage: ISequencedDocumentMessage, local: boolean) {
        const msg = parseHandles(rawMessage, this.runtime.IComponentSerializer, this.runtime.IComponentHandleContext);

        const contents = msg.contents;

        switch (contents.target) {
            case SnapshotPath.cols:
                this.cols.applyMsg(msg);
                break;
            case SnapshotPath.rows:
                this.rows.applyMsg(msg);
                break;
            default: {
                assert(contents.type === MatrixOp.set);

                const rowHandle = this.rows.toHandle(contents.row, /* alloc: */ true);
                const colHandle = this.cols.toHandle(contents.col, /* alloc: */ true);
                const key = pointToKey(rowHandle, colHandle);
                const pendingCliSeq = this.cellKeyToPendingCliSeq.get(key);

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
        this.rows.startOrUpdateCollaboration(this.runtime.clientId, 0);
        this.cols.startOrUpdateCollaboration(this.runtime.clientId, 0);
    }

    private insert(
        vector: PermutationVector,
        dimension: SnapshotPath.rows | SnapshotPath.cols,
        start: number,
        count: number,
    ) {
        // Construct a new MergeTree op to insert a new segment with the appropriate number of unallocated rows/cols.
        // Note that serialized RunSegment will continue to contain unallocated items, even if the RunSegment in
        // the MergeTree is modified prior to the op being transmitted.
        const op = vector.insert(start, count);

        // Note whether this `op` targets rows or cols.  (See dispatch in `processCore()`)
        (op as any).target = dimension;

        this.submitLocalMessage(op);
    }

    private storeCell(row: number, col: number, value: T | undefined) {
        const clear = value === undefined;

        // TODO: `toHandle()` should take the refSeq and client to produce the current handle from
        //       past positions.

        // Map the logical row/col to the allocated storage handles (if any).
        // If clearing and either the row and/or col is unallocated, no further work is necessary.
        const rowHandle = this.rows.toHandle(row, /* alloc: */ true);
        if (clear && rowHandle === Handle.unallocated) {
            return;
        }

        const colHandle = this.cols.toHandle(col, /* alloc: */ true);
        if (clear && colHandle === Handle.unallocated) {
            return;
        }

        this.cells.setCell(rowHandle, colHandle, value);
        const key = pointToKey(rowHandle, colHandle);

        // TODO: row/col position should be tardised to the current seq# before notification.
        // TODO: Pretty lame to alloc an array to send a single value.  Probably warrants a
        //       singular `cellChanged` API.
        for (const consumer of this.consumers.values()) {
            consumer.cellsChanged(row, col, 1, 1, [value], this);
        }

        return key;
    }

    private submitCellMessage(key: number | undefined, message: IMatrixCellMsg) {
        const clientSequenceNumber = this.submitLocalMessage(message);
        if (clientSequenceNumber !== -1) {
            this.cellKeyToPendingCliSeq.set(key, clientSequenceNumber);
        }
    }

    // Constructs an ITreeEntry for the cell data.
    private snapshotCells(): ITreeEntry {
        const chunk = [this.cells.snapshot(), Array.from(this.cellKeyToPendingCliSeq.entries())];

        const serializer = this.runtime.IComponentSerializer;
        return {
            mode: FileMode.File,
            path: SnapshotPath.cells,
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: serializer !== undefined
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
        const cellData = serializer !== undefined
            ? serializer.parse(utf8, this.runtime.IComponentHandleContext)
            : JSON.parse(utf8);

        this.cells = SparseArray2D.load(cellData[0]);
        this.cellKeyToPendingCliSeq = new Map(cellData[1]);
    }

    // Invoked by PermutationVector to notify IMatrixConsumers of row insertion/deletions.
    private readonly onRowDelta = (position: number, numRemoved: number, numInserted: number) => {
        for (const consumer of this.consumers) {
            consumer.rowsChanged(position, numRemoved, numInserted, this);
        }
    };

    // Invoked by PermutationVector to notify IMatrixConsumers of col insertion/deletions.
    private readonly onColDelta = (position: number, numRemoved: number, numInserted: number) => {
        for (const consumer of this.consumers) {
            consumer.colsChanged(position, numRemoved, numInserted, this);
        }
    };
}
