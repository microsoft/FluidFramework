/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    TreeEntry,
} from "@fluidframework/protocol-definitions";
import {
    IComponentRuntime,
    IObjectStorageService,
    Serializable,
    IChannelAttributes,
} from "@fluidframework/component-runtime-definitions";
import { makeHandlesSerializable, parseHandles, SharedObject } from "@fluidframework/shared-object-base";
import { ObjectStoragePartition } from "@fluidframework/runtime-utils";
import { IMatrixProducer, IMatrixConsumer, IMatrixReader } from "@tiny-calc/nano";
import { debug } from "./debug";
import { MatrixOp } from "./ops";
import { PermutationVector } from "./permutationvector";
import { SparseArray2D } from "./sparsearray2d";
import { SharedMatrixFactory } from "./runtime";
import { Handle } from "./handletable";
import { deserializeBlob, serializeBlob } from "./serialization";

const enum SnapshotPath {
    rows = "rows",
    cols = "cols",
    cells = "cells",
}

export class SharedMatrix<T extends Serializable = Serializable> extends SharedObject
    implements IMatrixProducer<T | undefined | null>, IMatrixReader<T | undefined | null>
{
    private readonly consumers = new Set<IMatrixConsumer<T | undefined | null>>();

    public static getFactory() { return new SharedMatrixFactory(); }

    private readonly rows: PermutationVector;   // Map logical row to storage handle (if any)
    private readonly cols: PermutationVector;   // Map logical col to storage handle (if any)

    private cells = new SparseArray2D<T>();                    // Stores cell values.
    private pendingCliSeqs = new SparseArray2D<number>();      // Tracks pending writes.
    private readonly pendingQueue: { cliSeq: number, rowHandle: number, colHandle: number }[] = [];

    constructor(runtime: IComponentRuntime, public id: string, attributes: IChannelAttributes) {
        super(id, runtime, attributes);

        this.rows = new PermutationVector(
            SnapshotPath.rows,
            this.logger,
            runtime.options,
            this.onRowDelta,
            this.onRowHandlesRecycled);

        this.cols = new PermutationVector(
            SnapshotPath.cols,
            this.logger,
            runtime.options,
            this.onColDelta,
            this.onColHandlesRecycled);
    }

    public static create<T extends Serializable = Serializable>(runtime: IComponentRuntime, id?: string) {
        return runtime.createChannel(id, SharedMatrixFactory.Type) as SharedMatrix<T>;
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
        const rowHandle = this.rows.handles[row];

        // Perf: Leverage the JavaScript behavior of returning `undefined` for out of bounds
        //       array access to detect bad coordinates. (~4% faster vs. an unconditional
        //       assert with range check on node v12 x64)
        if (!(rowHandle >= Handle.valid)) {
            assert(rowHandle === Handle.unallocated, "'row' out of range.");
            assert(0 <= col && col < this.numCols, "'col' out of range.");
            return undefined;
        }

        const colHandle = this.cols.handles[col];

        // Perf: Leverage the JavaScript behavior of returning `undefined` for out of bounds
        //       array access to detect bad coordinates. (~4% faster vs. an unconditional
        //       assert with range check on node v12 x64)
        if (!(colHandle >= Handle.valid)) {
            assert(colHandle === Handle.unallocated, "'col' out of range.");
            return undefined;
        }

        return this.cells.read(rowHandle, colHandle);
    }

    // #endregion IMatrixReader

    public setCell(row: number, col: number, value: T) {
        assert(0 <= row && row < this.numRows
            && 0 <= col && col < this.numCols);

        this.setCellCore(row, col, value);

        // Avoid reentrancy by raising change notifications after the op is queued.
        for (const consumer of this.consumers.values()) {
            // TODO: Pretty lame to alloc an array to send a single value.  Probably warrants a
            //       singular `cellChanged` API.
            consumer.cellsChanged(row, col, 1, 1, [value], this);
        }
    }

    public setCells(row: number, col: number, numCols: number, values: readonly T[]) {
        const numRows = Math.ceil(values.length / numCols);

        assert((0 <= row && row < this.numRows)
            && (0 <= col && col < this.numCols)
            && (1 <= numCols && numCols <= (this.numCols - col))
            && (numRows <= (this.numRows - row)));

        const endCol = col + numCols;
        let r = row;
        let c = col;

        for (const value of values) {
            this.setCellCore(r, c, value);

            if (++c === endCol) {
                c = col;
                r++;
            }
        }

        // Avoid reentrancy by raising change notifications after the op is queued.
        for (const consumer of this.consumers.values()) {
            consumer.cellsChanged(row, col, numRows, numCols, values, this);
        }
    }

    private setCellCore(
        row: number,
        col: number,
        value: T,
    ) {
        const rowHandle = this.rows.getAllocatedHandle(row);
        const colHandle = this.cols.getAllocatedHandle(col);

        this.cells.setCell(rowHandle, colHandle, value);
        const cliSeq = this.submitLocalMessage({
            type: MatrixOp.set,
            row,
            col,
            value,
        });

        if (cliSeq !== -1) {
            this.pendingCliSeqs.setCell(rowHandle, colHandle, cliSeq);
            this.pendingQueue.push({ cliSeq, rowHandle, colHandle });
        }
    }

    public insertCols(startCol: number, count: number) {
        this.insert(this.cols, SnapshotPath.cols, startCol, count);
    }

    public removeCols(startCol: number, count: number) {
        this.remove(this.cols, SnapshotPath.cols, startCol, count);
    }

    public insertRows(startRow: number, count: number) {
        this.insert(this.rows, SnapshotPath.rows, startRow, count);
    }

    public removeRows(startRow: number, count: number) {
        this.remove(this.rows, SnapshotPath.rows, startRow, count);
    }

    public snapshot(): ITree {
        return {
            entries: [
                {
                    mode: FileMode.Directory,
                    path: SnapshotPath.rows,
                    type: TreeEntry[TreeEntry.Tree],
                    value: this.rows.snapshot(this.runtime, this.handle),
                },
                {
                    mode: FileMode.Directory,
                    path: SnapshotPath.cols,
                    type: TreeEntry[TreeEntry.Tree],
                    value: this.cols.snapshot(this.runtime, this.handle),
                },
                serializeBlob(this.runtime, this.handle, SnapshotPath.cells, [
                    this.cells.snapshot(),
                    this.pendingCliSeqs.snapshot(),
                ]),
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

    protected onConnect() {
        assert.equal(this.rows.getCollabWindow().collaborating, this.cols.getCollabWindow().collaborating);

        // Update merge tree collaboration information with new client ID and then resend pending ops
        this.rows.startOrUpdateCollaboration(this.runtime.clientId as string);
        this.cols.startOrUpdateCollaboration(this.runtime.clientId as string);

        // TODO: Resend pending ops on reconnect
        assert(this.rows.resetPendingSegmentsToOp() === undefined);
        assert(this.cols.resetPendingSegmentsToOp() === undefined);
    }

    protected OnReSubmit(content: any, metadata: unknown) {}

    protected onDisconnect() {
        debug(`${this.id} is now disconnected`);
    }

    protected async loadCore(branchId: string, storage: IObjectStorageService) {
        try {
            await this.rows.load(this.runtime, new ObjectStoragePartition(storage, SnapshotPath.rows), branchId);
            await this.cols.load(this.runtime, new ObjectStoragePartition(storage, SnapshotPath.cols), branchId);
            const [cellData, pendingCliSeqData] = await deserializeBlob(this.runtime, storage, SnapshotPath.cells);

            this.cells = SparseArray2D.load(cellData);
            this.pendingCliSeqs = SparseArray2D.load(pendingCliSeqData);
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

                const { referenceSequenceNumber: refSeq, clientId } = rawMessage;
                const { row, col } = contents;

                if (local) {
                    // We are receiving the ACK for a local pending set operation.

                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    const { cliSeq, rowHandle, colHandle } = this.pendingQueue.shift()!;

                    assert.equal(rawMessage.clientSequenceNumber, cliSeq);

                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    const actualCliSeq = this.pendingCliSeqs.read(rowHandle, colHandle)!;

                    // Note while we're awaiting the local set, it's possible for the row/col to be locally
                    // removed and the row/col handles recycled.  If this happens, the actualCliSeq will be
                    // 'undefined' or > 'cliSeq'.
                    assert(!(actualCliSeq < cliSeq));

                    // If this is the most recent write to the cell by the local client, remove our
                    // entry from 'pendingCliSeqs' to resume allowing remote writes.
                    if (actualCliSeq === cliSeq) {
                        this.pendingCliSeqs.setCell(rowHandle, colHandle, undefined);
                    }
                } else {
                    const rowClientId = this.rows.getOrAddShortClientId(clientId);
                    const adjustedRow = this.rows.adjustPosition(row, refSeq, rowClientId);

                    if (adjustedRow !== undefined) {
                        const colClientId = this.cols.getOrAddShortClientId(clientId);
                        const adjustedCol = this.cols.adjustPosition(col, refSeq, colClientId);

                        if (adjustedCol !== undefined) {
                            const rowHandle = this.rows.getAllocatedHandle(adjustedRow);
                            const colHandle = this.cols.getAllocatedHandle(adjustedCol);

                            assert(rowHandle >= Handle.valid
                                && colHandle >= Handle.valid);

                            if (this.pendingCliSeqs.read(rowHandle, colHandle) === undefined) {
                                const { value } = contents;
                                this.cells.setCell(rowHandle, colHandle, value);

                                for (const consumer of this.consumers.values()) {
                                    consumer.cellsChanged(adjustedRow, adjustedCol, 1, 1, [value], this);
                                }
                            }
                        }
                    }
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

    private remove(
        vector: PermutationVector,
        dimension: SnapshotPath.rows | SnapshotPath.cols,
        start: number,
        count: number,
    ) {
        const op = vector.remove(start, count);

        // Note whether this `op` targets rows or cols.  (See dispatch in `processCore()`)
        (op as any).target = dimension;

        this.submitLocalMessage(op);
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

    private readonly onRowHandlesRecycled = (rowHandles: Handle[]) => {
        for (let col = 0; col < this.numCols; col++) {
            const colHandle = this.cols.handles[col];
            if (colHandle !== Handle.unallocated) {
                for (const rowHandle of rowHandles) {
                    this.cells.setCell(rowHandle, colHandle, undefined);
                    this.pendingCliSeqs.setCell(rowHandle, colHandle, undefined);
                }
            }
        }
    };

    private readonly onColHandlesRecycled = (colHandles: Handle[]) => {
        for (let row = 0; row < this.numRows; row++) {
            const rowHandle = this.rows.handles[row];
            if (rowHandle !== Handle.unallocated) {
                for (const colHandle of colHandles) {
                    this.cells.setCell(rowHandle, colHandle, undefined);
                    this.pendingCliSeqs.setCell(rowHandle, colHandle, undefined);
                }
            }
        }
    };

    public toString() {
        let s = `client:${this.runtime.clientId}\nrows: ${this.rows.toString()}\ncols: ${this.cols.toString()}\n\n`;

        for (let r = 0; r < this.numRows; r++) {
            s += `  [`;
            for (let c = 0; c < this.numCols; c++) {
                if (c > 0) {
                    s += ", ";
                }

                s += `${JSON.stringify(this.read(r, c))}`;
            }
            s += "]\n";
        }

        return `${s}\n`;
    }
}
